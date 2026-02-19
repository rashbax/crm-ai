import { requireAuth } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import path from "path";
import { readJsonFile } from "@/src/integrations/storage";
import { getEnabledConnections, filterByEnabledConnections } from "@/src/integrations/enabled";

type OrderStatus = "new" | "processing" | "shipped" | "cancelled";

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

function toMarketplaceLabel(marketplace?: string): "Ozon" | "Wildberries" | "WB" {
  if (marketplace === "ozon") return "Ozon";
  if (marketplace === "wb") return "Wildberries";
  return "WB";
}

function mapOzonStatusToUi(status?: string): OrderStatus | null {
  if (!status) return null;
  const s = status.toLowerCase();

  if (
    s.includes("cancel") ||
    s.includes("canceled") ||
    s.includes("cancelled") ||
    s.includes("отмен")
  ) {
    return "cancelled";
  }

  if (
    s.includes("deliver") ||
    s.includes("delivered") ||
    s.includes("shipped") ||
    s.includes("awaiting_deliver") ||
    s.includes("в пути") ||
    s.includes("достав")
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
    s.includes("ожида")
  ) {
    return "processing";
  }

  if (s.includes("new") || s.includes("created")) {
    return "new";
  }

  return null;
}

function deriveStatus(dateStr: string, sourceStatus?: string): OrderStatus {
  const mapped = mapOzonStatusToUi(sourceStatus);
  if (mapped) return mapped;

  const now = new Date();
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "processing";

  const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  if (diffHours <= 24) return "new";
  if (diffHours <= 72) return "processing";
  return "shipped";
}

function parseOrderDate(input: string): number {
  if (!input) return 0;
  const normalized = input.includes("T") ? input : `${input}T00:00:00`;
  const ts = new Date(normalized).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const enabledConnections = await getEnabledConnections();
    if (enabledConnections.length === 0) {
      return NextResponse.json({ orders: [] });
    }

    const canonical = await readJsonFile<CanonicalOrder[]>(ORDERS_FILE, []);
    const filtered = filterByEnabledConnections(canonical, enabledConnections);

    const sorted = filtered.slice().sort((a, b) => parseOrderDate(b.date) - parseOrderDate(a.date));

    const orders = sorted.map((order, index) => {
      const sourceDate = order.date;
      const normalizedDate = order.date.includes("T") ? order.date : `${order.date}T00:00:00`;
      const qty = Number.isFinite(order.qty) ? order.qty : 0;
      const revenue = typeof order.revenue === "number" ? order.revenue : (order.price || 0) * qty;
      const unitPrice = qty > 0 ? revenue / qty : (order.price || 0);

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
