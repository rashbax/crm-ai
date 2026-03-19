import { requireAuth } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import path from "path";
import { readJsonFile } from "@/src/integrations/storage";
import { getEnabledConnections, filterByEnabledConnections } from "@/src/integrations/enabled";
import { runAnalytics, getDefaultConfig } from "@/src/analytics";
import type { OrderEvent, StockState } from "@/src/analytics";

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

interface CanonicalStock {
  sku: string;
  onHand: number;
  inbound?: number;
  updatedAt: string;
  marketplace?: string;
  connectionId?: string;
}

const ORDERS_FILE = path.join(process.cwd(), "data", "canonical", "orders.json");
const STOCKS_FILE = path.join(process.cwd(), "data", "canonical", "stocks.json");

function toMarketplaceLabel(marketplace?: string): "Ozon" | "Wildberries" {
  if (marketplace === "ozon") return "Ozon";
  return "Wildberries";
}

function isNotCancelled(sourceStatus?: string): boolean {
  if (!sourceStatus) return true;
  const s = sourceStatus.toLowerCase();
  return !(
    s.includes("cancel") ||
    s.includes("отмен") ||
    s.includes("return") ||
    s.includes("возврат")
  );
}

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30", 10);

    const enabledConnections = await getEnabledConnections();
    if (enabledConnections.length === 0) {
      return NextResponse.json({
        kpi: { totalRevenue: 0, totalOrders: 0, avgCheck: 0, cancelledOrders: 0, cancelRate: 0 },
        kpiPrev: { totalRevenue: 0, totalOrders: 0, avgCheck: 0 },
        chartData: [],
        topProducts: [],
        marketplaceStats: [],
        analyticsResults: [],
      });
    }

    const [rawOrders, rawStocks] = await Promise.all([
      readJsonFile<CanonicalOrder[]>(ORDERS_FILE, []),
      readJsonFile<CanonicalStock[]>(STOCKS_FILE, []),
    ]);

    const orders = filterByEnabledConnections(rawOrders, enabledConnections);
    const stocks = filterByEnabledConnections(rawStocks, enabledConnections);

    // Date boundaries
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - days);
    const prevPeriodStart = new Date(periodStart);
    prevPeriodStart.setDate(prevPeriodStart.getDate() - days);

    // Filter orders by period
    const periodOrders = orders.filter((o) => {
      const d = new Date(o.date);
      return d >= periodStart && d <= now;
    });
    const prevPeriodOrders = orders.filter((o) => {
      const d = new Date(o.date);
      return d >= prevPeriodStart && d < periodStart;
    });

    // Active (non-cancelled) orders for revenue calculations
    const activeOrders = periodOrders.filter((o) => isNotCancelled(o.sourceStatus));
    const prevActiveOrders = prevPeriodOrders.filter((o) => isNotCancelled(o.sourceStatus));
    const cancelledOrders = periodOrders.filter((o) => !isNotCancelled(o.sourceStatus));

    // KPI - current period
    const totalRevenue = activeOrders.reduce((sum, o) => {
      const rev = typeof o.revenue === "number" ? o.revenue : (o.price || 0) * (o.qty || 0);
      return sum + rev;
    }, 0);
    const totalOrders = activeOrders.length;
    const avgCheck = totalOrders > 0 ? Math.floor(totalRevenue / totalOrders) : 0;
    const cancelRate = periodOrders.length > 0
      ? parseFloat(((cancelledOrders.length / periodOrders.length) * 100).toFixed(1))
      : 0;

    // KPI - previous period
    const prevRevenue = prevActiveOrders.reduce((sum, o) => {
      const rev = typeof o.revenue === "number" ? o.revenue : (o.price || 0) * (o.qty || 0);
      return sum + rev;
    }, 0);
    const prevTotalOrders = prevActiveOrders.length;
    const prevAvgCheck = prevTotalOrders > 0 ? Math.floor(prevRevenue / prevTotalOrders) : 0;

    // Chart data - daily aggregation (qty sold per day)
    const dailyMap = new Map<string, { revenue: number; orders: number }>();
    for (const o of activeOrders) {
      const dayKey = o.date.substring(0, 10); // YYYY-MM-DD
      const existing = dailyMap.get(dayKey) || { revenue: 0, orders: 0 };
      const rev = typeof o.revenue === "number" ? o.revenue : (o.price || 0) * (o.qty || 0);
      existing.revenue += rev;
      existing.orders += o.qty || 1;
      dailyMap.set(dayKey, existing);
    }

    const chartData = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        revenue: Math.round(data.revenue),
        orders: data.orders,
      }));

    // Top products by revenue, split by marketplace
    const productKey = (sku: string, marketplace?: string) => `${sku}::${marketplace || "unknown"}`;
    const productMap = new Map<string, { sku: string; marketplace: string; revenue: number; quantity: number; prices: number[] }>();
    for (const o of activeOrders) {
      const key = productKey(o.sku, o.marketplace);
      const existing = productMap.get(key) || { sku: o.sku, marketplace: toMarketplaceLabel(o.marketplace), revenue: 0, quantity: 0, prices: [] };
      const rev = typeof o.revenue === "number" ? o.revenue : (o.price || 0) * (o.qty || 0);
      existing.revenue += rev;
      existing.quantity += o.qty || 0;
      if (o.price) existing.prices.push(o.price);
      productMap.set(key, existing);
    }

    const topProducts = Array.from(productMap.values())
      .map((data) => ({
        name: data.sku,
        sku: data.sku,
        marketplace: data.marketplace,
        revenue: Math.round(data.revenue),
        quantity: data.quantity,
        avgPrice: data.prices.length > 0
          ? Math.round(data.prices.reduce((s, p) => s + p, 0) / data.prices.length)
          : data.quantity > 0 ? Math.round(data.revenue / data.quantity) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Marketplace stats
    const mpMap = new Map<string, { revenue: number; orders: number }>();
    for (const o of activeOrders) {
      const label = toMarketplaceLabel(o.marketplace);
      const existing = mpMap.get(label) || { revenue: 0, orders: 0 };
      const rev = typeof o.revenue === "number" ? o.revenue : (o.price || 0) * (o.qty || 0);
      existing.revenue += rev;
      existing.orders += 1;
      mpMap.set(label, existing);
    }

    const marketplaceStats = Array.from(mpMap.entries()).map(([name, data]) => ({
      name,
      revenue: Math.round(data.revenue),
      orders: data.orders,
      avgCheck: data.orders > 0 ? Math.floor(data.revenue / data.orders) : 0,
      share: totalRevenue > 0 ? parseFloat(((data.revenue / totalRevenue) * 100).toFixed(1)) : 0,
    }));

    // Analytics engine - use real data
    const orderEvents: OrderEvent[] = orders.filter((o) => isNotCancelled(o.sourceStatus)).map((o) => ({
      date: o.date.substring(0, 10),
      sku: o.sku,
      qty: o.qty || 0,
      revenue: typeof o.revenue === "number" ? o.revenue : (o.price || 0) * (o.qty || 0),
      price: o.price,
      marketplace: o.marketplace,
      connectionId: o.connectionId,
    }));

    const stockStates: StockState[] = stocks.map((s) => ({
      sku: s.sku,
      onHand: s.onHand,
      inbound: s.inbound,
      updatedAt: s.updatedAt,
      marketplace: s.marketplace,
      connectionId: s.connectionId,
    }));

    const config = getDefaultConfig();
    config.moneyMetric = "revenue";
    config.useDayOfWeekSeasonality = true;

    let analyticsResults: any[] = [];
    try {
      analyticsResults = runAnalytics(orderEvents, stockStates, [], config);
    } catch (e) {
      console.error("Analytics engine error:", e);
    }

    return NextResponse.json({
      kpi: {
        totalRevenue: Math.round(totalRevenue),
        totalOrders,
        avgCheck,
        cancelledOrders: cancelledOrders.length,
        cancelRate,
      },
      kpiPrev: {
        totalRevenue: Math.round(prevRevenue),
        totalOrders: prevTotalOrders,
        avgCheck: prevAvgCheck,
      },
      chartData,
      topProducts,
      marketplaceStats,
      analyticsResults,
    });
  } catch (err) {
    console.error("Error in analytics API:", err);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
