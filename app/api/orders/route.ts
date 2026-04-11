import { requireAuth } from "@/lib/auth-guard";
import { getBusinessIsoDay } from "@/lib/date";
import { NextResponse } from "next/server";
import path from "path";
import { readJsonFile } from "@/src/integrations/storage";
import { getEnabledConnectionsForMarketplace, filterByEnabledConnections } from "@/src/integrations/enabled";

type OrderStatus = "processing" | "shipped" | "in_transit" | "delivered" | "returned" | "cancelled";

interface CanonicalOrder {
  date: string;
  sku: string;
  qty: number;
  revenue?: number;
  price?: number;
  sourceStatus?: string;
  marketplace?: string;
  connectionId?: string;
}

const ORDERS_FILE = path.join(process.cwd(), "data", "canonical", "orders.json");

function toMarketplaceLabel(marketplace?: string): "Ozon" | "Wildberries" {
  if (marketplace === "ozon") return "Ozon";
  return "Wildberries";
}

function mapSourceStatusToUi(status?: string): OrderStatus | null {
  if (!status) return null;
  const s = status.toLowerCase();

  // Returned — must check before cancelled
  if (
    s.includes("return") ||
    s.includes("возврат") ||
    s.includes("refund") ||
    s === "returned"
  ) {
    return "returned";
  }

  if (
    s.includes("cancel") ||
    s.includes("canceled") ||
    s.includes("cancelled") ||
    s.includes("отмен")
  ) {
    return "cancelled";
  }

  // Delivered — received by customer
  // "sold" = WB Sales API record, meaning the transaction is finalised (item delivered, WB settles)
  if (
    s.includes("delivered") ||
    s.includes("received") ||
    s.includes("получен") ||
    s.includes("достав") ||
    s === "delivered" ||
    s === "sold"
  ) {
    return "delivered";
  }

  // In transit — last-mile delivery (Доставляются)
  if (
    s === "delivering" ||
    s === "in_transit" ||
    s.includes("в пути")
  ) {
    return "in_transit";
  }

  // Shipped — dispatched from warehouse
  if (
    s.includes("shipped") ||
    s.includes("awaiting_deliver") ||
    s.includes("sold") ||
    s.includes("complete") ||
    s === "shipped"
  ) {
    return "shipped";
  }

  if (
    s.includes("processing") ||
    s.includes("pack") ||
    s.includes("assemble") ||
    s.includes("accept") ||
    s.includes("awaiting") ||
    s.includes("pending") ||
    s.includes("ordered") ||
    s.includes("ожида") ||
    s.includes("сборк")
  ) {
    return "processing";
  }

  return null;
}

function deriveStatus(dateStr: string, sourceStatus?: string): OrderStatus {
  const mapped = mapSourceStatusToUi(sourceStatus);
  if (mapped) return mapped;

  const now = new Date();
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "processing";

  const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  if (diffHours <= 72) return "processing";
  if (diffHours <= 168) return "shipped";    // ≤7 days
  if (diffHours <= 336) return "in_transit"; // ≤14 days
  return "delivered";
}

function parseOrderDate(input: string): number {
  if (!input) return 0;
  const normalized = input.includes("T") ? input : `${input}T00:00:00.000Z`;
  const ts = new Date(normalized).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const mp = new URL(request.url).searchParams.get("marketplace") || "all";
    const enabledConnections = await getEnabledConnectionsForMarketplace(mp);
    if (enabledConnections.length === 0) {
      return NextResponse.json({ orders: [] });
    }

    const canonical = await readJsonFile<CanonicalOrder[]>(ORDERS_FILE, []);
    const filtered = filterByEnabledConnections(canonical, enabledConnections);

    const sorted = filtered.slice().sort((a, b) => parseOrderDate(b.date) - parseOrderDate(a.date));

    const orders = sorted.map((order, index) => {
      const sourceDate = order.date;
      const normalizedDate = order.date.includes("T")
        ? order.date
        : `${getBusinessIsoDay(order.date)}T00:00:00.000Z`;
      const qty = Number.isFinite(order.qty) ? order.qty : 0;
      const revenue = typeof order.revenue === "number" ? order.revenue : (order.price || 0) * qty;
      // Prefer stored unit price; fall back to revenue/qty; never return 0 if price field exists
      const unitPrice = order.price || (qty > 0 && revenue > 0 ? revenue / qty : 0);

      return {
        id: `#${100000 - index}`,
        sourceDate,
        marketplace: toMarketplaceLabel(order.marketplace),
        connectionId: order.connectionId || null,
        sku: order.sku,
        qty,
        unitPrice,
        revenue,
        sourceStatus: order.sourceStatus || null,
        status: deriveStatus(normalizedDate, order.sourceStatus),
      };
    });

    return NextResponse.json({ orders });
  } catch (err) {
    console.error("Error in orders API:", err);
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }
}
