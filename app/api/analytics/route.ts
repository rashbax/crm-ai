import { requireAuth } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import path from "path";
import { readJsonFile } from "@/src/integrations/storage";
import { getEnabledConnectionsForMarketplace, filterByEnabledConnections } from "@/src/integrations/enabled";
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
    const mp = searchParams.get("marketplace") || "all";

    const enabledConnections = await getEnabledConnectionsForMarketplace(mp);
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
    // Sum qty across records — WB aggregates same-SKU same-day orders into one record
    const totalOrders = activeOrders.reduce((sum, o) => sum + Math.max(1, o.qty || 1), 0);
    const avgCheck = totalOrders > 0 ? Math.floor(totalRevenue / totalOrders) : 0;
    const cancelRate = periodOrders.length > 0
      ? parseFloat(((cancelledOrders.length / periodOrders.length) * 100).toFixed(1))
      : 0;

    // KPI - previous period
    const prevRevenue = prevActiveOrders.reduce((sum, o) => {
      const rev = typeof o.revenue === "number" ? o.revenue : (o.price || 0) * (o.qty || 0);
      return sum + rev;
    }, 0);
    const prevTotalOrders = prevActiveOrders.reduce((sum, o) => sum + Math.max(1, o.qty || 1), 0);
    const prevAvgCheck = prevTotalOrders > 0 ? Math.floor(prevRevenue / prevTotalOrders) : 0;
    const prevCancelledOrders = prevPeriodOrders.filter((o) => !isNotCancelled(o.sourceStatus));
    const prevCancelRate = prevPeriodOrders.length > 0
      ? parseFloat(((prevCancelledOrders.length / prevPeriodOrders.length) * 100).toFixed(1))
      : 0;

    // Estimated profit: revenue × (1 - 0.15 marketplace fee)
    const MP_FEE_RATE = 0.15;
    const estimatedProfit = Math.round(totalRevenue * (1 - MP_FEE_RATE));
    const prevEstimatedProfit = Math.round(prevRevenue * (1 - MP_FEE_RATE));

    // Chart data - daily aggregation (ordered + delivered per day)
    const dailyMap = new Map<string, { revenue: number; orders: number; delivered: number; deliveredRevenue: number }>();
    for (const o of activeOrders) {
      const dayKey = o.date.substring(0, 10); // YYYY-MM-DD
      const existing = dailyMap.get(dayKey) || { revenue: 0, orders: 0, delivered: 0, deliveredRevenue: 0 };
      const rev = typeof o.revenue === "number" ? o.revenue : (o.price || 0) * (o.qty || 0);
      existing.revenue += rev;
      existing.orders += o.qty || 1;
      const status = (o.sourceStatus || "").toLowerCase();
      if (status === "delivered" || status.includes("доставлен")) {
        existing.delivered += o.qty || 1;
        existing.deliveredRevenue += rev;
      }
      dailyMap.set(dayKey, existing);
    }

    // Build full day-by-day arrays (including zero-order days)
    const periodStartDate = periodStart.toISOString().substring(0, 10);
    const periodEndDate = now.toISOString().substring(0, 10);
    const prevPeriodStartDate = prevPeriodStart.toISOString().substring(0, 10);
    const prevPeriodEndDate = periodStart.toISOString().substring(0, 10);

    // Previous period daily map
    const prevDailyMap = new Map<string, { revenue: number; orders: number; delivered: number; deliveredRevenue: number }>();
    for (const o of prevActiveOrders) {
      const dayKey = o.date.substring(0, 10);
      const existing = prevDailyMap.get(dayKey) || { revenue: 0, orders: 0, delivered: 0, deliveredRevenue: 0 };
      const rev = typeof o.revenue === "number" ? o.revenue : (o.price || 0) * (o.qty || 0);
      existing.revenue += rev;
      existing.orders += o.qty || 1;
      const status = (o.sourceStatus || "").toLowerCase();
      if (status === "delivered" || status.includes("доставлен")) {
        existing.delivered += o.qty || 1;
        existing.deliveredRevenue += rev;
      }
      prevDailyMap.set(dayKey, existing);
    }

    // Generate all days for current period
    const allDays: string[] = [];
    const cursor = new Date(periodStart);
    while (cursor <= now) {
      allDays.push(cursor.toISOString().substring(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }

    // Generate all days for previous period
    const allPrevDays: string[] = [];
    const prevCursor = new Date(prevPeriodStart);
    while (prevCursor < periodStart) {
      allPrevDays.push(prevCursor.toISOString().substring(0, 10));
      prevCursor.setDate(prevCursor.getDate() + 1);
    }

    const emptyDay = { revenue: 0, orders: 0, delivered: 0, deliveredRevenue: 0 };

    const chartData = allDays.map((date) => {
      const data = dailyMap.get(date) || emptyDay;
      return {
        date,
        revenue: Math.round(data.revenue),
        orders: data.orders,
        delivered: data.delivered,
        deliveredRevenue: Math.round(data.deliveredRevenue),
      };
    });

    const prevChartData = allPrevDays.map((date) => {
      const data = prevDailyMap.get(date) || emptyDay;
      return {
        date,
        revenue: Math.round(data.revenue),
        orders: data.orders,
        delivered: data.delivered,
        deliveredRevenue: Math.round(data.deliveredRevenue),
      };
    });

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

    const allProducts = Array.from(productMap.values())
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
      .sort((a, b) => b.revenue - a.revenue);

    const topProducts = allProducts.slice(0, 10);
    const bottomProducts = allProducts.length > 10
      ? allProducts.slice(-10).reverse()
      : [];

    // Per-SKU prev period revenue for decline detection
    const prevProductMap = new Map<string, { revenue: number; cancelCount: number; totalCount: number }>();
    for (const o of prevPeriodOrders) {
      const key = `${o.sku}::${o.marketplace || ""}`;
      const existing = prevProductMap.get(key) || { revenue: 0, cancelCount: 0, totalCount: 0 };
      const rev = typeof o.revenue === "number" ? o.revenue : (o.price || 0) * (o.qty || 0);
      if (isNotCancelled(o.sourceStatus)) existing.revenue += rev;
      else existing.cancelCount++;
      existing.totalCount++;
      prevProductMap.set(key, existing);
    }

    // Per-SKU cancel counts in current period
    const skuCancelMap = new Map<string, { cancelCount: number; totalCount: number }>();
    for (const o of periodOrders) {
      const key = `${o.sku}::${o.marketplace || ""}`;
      const existing = skuCancelMap.get(key) || { cancelCount: 0, totalCount: 0 };
      if (!isNotCancelled(o.sourceStatus)) existing.cancelCount++;
      existing.totalCount++;
      skuCancelMap.set(key, existing);
    }

    // Declining revenue SKUs: current revenue < prev * 0.8 (>20% drop)
    const decliningRevenueSKUs: { sku: string; currentRevenue: number; prevRevenue: number; dropPct: number }[] = [];
    for (const p of allProducts) {
      const key = `${p.sku}::${p.marketplace === "Ozon" ? "ozon" : "wb"}`;
      const prev = prevProductMap.get(key);
      if (prev && prev.revenue > 1000 && p.revenue < prev.revenue * 0.8) {
        const dropPct = Math.round(((prev.revenue - p.revenue) / prev.revenue) * 100);
        decliningRevenueSKUs.push({ sku: p.sku, currentRevenue: p.revenue, prevRevenue: Math.round(prev.revenue), dropPct });
      }
    }
    decliningRevenueSKUs.sort((a, b) => b.dropPct - a.dropPct);

    // Rising cancel SKUs: cancel rate > 20% and at least 5 orders
    const risingCancelSKUs: { sku: string; cancelRate: number; cancelCount: number }[] = [];
    for (const [key, counts] of skuCancelMap) {
      const sku = key.split("::")[0];
      if (counts.totalCount >= 5) {
        const rate = parseFloat(((counts.cancelCount / counts.totalCount) * 100).toFixed(1));
        if (rate > 20) risingCancelSKUs.push({ sku, cancelRate: rate, cancelCount: counts.cancelCount });
      }
    }
    risingCancelSKUs.sort((a, b) => b.cancelRate - a.cancelRate);

    // Trend direction: compare first half vs second half of current period revenue
    let trendDirection: "up" | "down" | "stable" = "stable";
    if (chartData.length >= 4) {
      const half = Math.floor(chartData.length / 2);
      // Need to compute after chartData is built — use dailyMap instead
      const days = allDays;
      const firstHalfRevenue = days.slice(0, half).reduce((s, d) => s + (dailyMap.get(d)?.revenue || 0), 0) / half;
      const secondHalfRevenue = days.slice(half).reduce((s, d) => s + (dailyMap.get(d)?.revenue || 0), 0) / (days.length - half);
      if (firstHalfRevenue > 0) {
        const changePct = (secondHalfRevenue - firstHalfRevenue) / firstHalfRevenue;
        if (changePct > 0.1) trendDirection = "up";
        else if (changePct < -0.1) trendDirection = "down";
      }
    }

    // Avg check trend
    const avgCheckTrend: "up" | "down" | "stable" = avgCheck > prevAvgCheck * 1.05
      ? "up" : avgCheck < prevAvgCheck * 0.95 ? "down" : "stable";

    const signals = {
      decliningRevenueSKUs: decliningRevenueSKUs.slice(0, 5),
      decliningRevenueSKUCount: decliningRevenueSKUs.length,
      risingCancelSKUs: risingCancelSKUs.slice(0, 5),
      risingCancelSKUCount: risingCancelSKUs.length,
      avgCheckTrend,
      trendDirection,
      bottomSKUCount: bottomProducts.length,
    };

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
        cancelRate: prevCancelRate,
      },
      estimatedProfit,
      prevEstimatedProfit,
      chartData,
      prevChartData,
      periodLabels: {
        current: { start: periodStartDate, end: periodEndDate },
        previous: { start: prevPeriodStartDate, end: prevPeriodEndDate },
      },
      topProducts,
      bottomProducts,
      signals,
      marketplaceStats,
      analyticsResults,
    });
  } catch (err) {
    console.error("Error in analytics API:", err);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
