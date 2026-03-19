import path from "path";
import { readJsonFile } from "@/src/integrations/storage";
import { filterByEnabledConnections, getEnabledConnections } from "@/src/integrations/enabled";
import type { AdsDaily, OrderEvent, StockState } from "@/src/pricing/types";
import type { AdCampaign, StockItem } from "@/types/automation";
import { getBusinessIsoDay } from "@/lib/date";

const STOCKS_FILE = path.join(process.cwd(), "data", "canonical", "stocks.json");
const ADS_FILE = path.join(process.cwd(), "data", "canonical", "ads.json");
const ORDERS_FILE = path.join(process.cwd(), "data", "canonical", "orders.json");

type UiMarketplace = "Ozon" | "Wildberries";

function toUiMarketplace(raw?: string): UiMarketplace | null {
  if (!raw) return null;
  const value = raw.toLowerCase();
  if (value === "ozon") return "Ozon";
  if (value === "wb" || value === "wildberries") return "Wildberries";
  return null;
}

function isCancelledStatus(status?: string): boolean {
  if (!status) return false;
  const value = status.toLowerCase();
  return value.includes("cancel") || value.includes("cancelled") || value.includes("canceled") || value.includes("отмен");
}

function getStockStatus(qty: number): StockItem["status"] {
  if (qty <= 0) return "critical";
  if (qty < 200) return "critical";
  if (qty < 500) return "low";
  if (qty < 1000) return "normal";
  return "good";
}

function sumNumber(values: Array<number | undefined>): number {
  return values.reduce((acc, value) => acc + (Number.isFinite(value) ? Number(value) : 0), 0);
}

export interface AutomationSnapshot {
  stockItems: StockItem[];
  adCampaigns: AdCampaign[];
  meta: {
    stocks: number;
    campaigns: number;
    totalAdSpend7d: number;
  };
}

export async function loadAutomationSnapshot(): Promise<AutomationSnapshot> {
  const enabledConnections = await getEnabledConnections();
  if (enabledConnections.length === 0) {
    return {
      stockItems: [],
      adCampaigns: [],
      meta: { stocks: 0, campaigns: 0, totalAdSpend7d: 0 },
    };
  }

  const stocksRaw = await readJsonFile<StockState[]>(STOCKS_FILE, []);
  const adsRaw = await readJsonFile<AdsDaily[]>(ADS_FILE, []);
  const ordersRaw = await readJsonFile<OrderEvent[]>(ORDERS_FILE, []);

  const stocks = filterByEnabledConnections(stocksRaw, enabledConnections);
  const ads = filterByEnabledConnections(adsRaw, enabledConnections);
  const orders = filterByEnabledConnections(ordersRaw, enabledConnections);

  const now = Date.now();
  const todayKey = getBusinessIsoDay();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  const salesBySku = new Map<string, number>();
  for (const order of orders) {
    const ts = new Date(order.date).getTime();
    if (!Number.isFinite(ts) || now - ts > THIRTY_DAYS_MS) continue;
    if (isCancelledStatus(order.sourceStatus)) continue;
    const qty = Math.max(0, Math.floor(order.qty || 0));
    salesBySku.set(order.sku, (salesBySku.get(order.sku) || 0) + qty);
  }

  const stockBySku = new Map<string, { marketplace: UiMarketplace; qty: number; inbound: number; updatedAt: string }>();
  for (const stock of stocks) {
    const marketplace = toUiMarketplace(stock.marketplace);
    if (!marketplace) continue;

    const existing = stockBySku.get(stock.sku);
    if (!existing) {
      stockBySku.set(stock.sku, {
        marketplace,
        qty: Math.max(0, Math.floor(stock.onHand || 0)),
        inbound: Math.max(0, Math.floor(stock.inbound || 0)),
        updatedAt: stock.updatedAt,
      });
      continue;
    }

    existing.qty += Math.max(0, Math.floor(stock.onHand || 0));
    existing.inbound += Math.max(0, Math.floor(stock.inbound || 0));
    const existingTs = new Date(existing.updatedAt).getTime();
    const currentTs = new Date(stock.updatedAt).getTime();
    if (Number.isFinite(currentTs) && currentTs > existingTs) {
      existing.updatedAt = stock.updatedAt;
    }
  }

  const stockItems: StockItem[] = Array.from(stockBySku.entries())
    .map(([sku, stock], idx) => {
      const soldLast30 = salesBySku.get(sku) || 0;
      const dailySales = soldLast30 > 0 ? Math.max(1, Math.round((soldLast30 / 30) * 10) / 10) : 0;
      const qty = stock.qty;
      const rop = Math.ceil(dailySales * 7 + 50);

      return {
        id: `STK-${idx + 1}`,
        sku,
        name: sku,
        marketplace: stock.marketplace,
        qty,
        dailySales,
        rop,
        leadTime: 7,
        safetyStock: 50,
        lastUpdated: stock.updatedAt,
        status: getStockStatus(qty),
      };
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const adBySku = new Map<
    string,
    {
      marketplace: UiMarketplace;
      spendToday: number;
      spend7d: number;
      conversionsToday: number;
      conversions7d: number;
      clicks: number;
      impressions: number;
      revenueToday: number;
      revenue7d: number;
      lastDate: string;
      daysWithSpend: number;
    }
  >();

  for (const ad of ads) {
    const marketplace = toUiMarketplace(ad.marketplace);
    if (!marketplace) continue;
    const ts = new Date(ad.date).getTime();
    if (!Number.isFinite(ts) || now - ts > SEVEN_DAYS_MS) continue;

    const dayKey = getBusinessIsoDay(ad.date);
    const isToday = dayKey === todayKey;
    const spend = Math.max(0, ad.spend || 0);
    const clicks = Math.max(0, Math.floor(ad.clicks || 0));
    const conversions = Math.max(0, Math.floor(ad.ordersFromAds || 0));
    const impressions = Math.max(0, Math.floor(ad.impressions || 0));
    const revenue = Math.max(0, ad.revenueFromAds || 0);

    const existing = adBySku.get(ad.sku);
    if (!existing) {
      adBySku.set(ad.sku, {
        marketplace,
        spendToday: isToday ? spend : 0,
        spend7d: spend,
        conversionsToday: isToday ? conversions : 0,
        conversions7d: conversions,
        clicks,
        impressions,
        revenueToday: isToday ? revenue : 0,
        revenue7d: revenue,
        lastDate: ad.date,
        daysWithSpend: spend > 0 ? 1 : 0,
      });
      continue;
    }

    existing.spend7d += spend;
    if (isToday) existing.spendToday += spend;
    existing.conversions7d += conversions;
    if (isToday) existing.conversionsToday += conversions;
    existing.clicks += clicks;
    existing.impressions += impressions;
    existing.revenue7d += revenue;
    if (isToday) existing.revenueToday += revenue;
    if (spend > 0) existing.daysWithSpend += 1;
    if (ts > new Date(existing.lastDate).getTime()) existing.lastDate = ad.date;
  }

  const adCampaigns: AdCampaign[] = Array.from(adBySku.entries())
    .map(([sku, ad], idx) => {
      const estimatedBudget = Math.max(100, Math.round((ad.spend7d / 7) * 1.2));
      const status: AdCampaign["status"] = ad.daysWithSpend > 0 ? "active" : "paused";
      return {
        id: `AD-${idx + 1}`,
        sku,
        name: `${sku} Campaign`,
        platform: ad.marketplace,
        status,
        dailyBudget: estimatedBudget,
        currentBudget: estimatedBudget,
        spendToday: Math.round(ad.spendToday),
        attributedRevenueToday: Math.round(ad.revenueToday),
        targetAcos: 0.3,
        spend7d: Math.round(ad.spend7d),
        conversionsToday: ad.conversionsToday,
        conversions7d: ad.conversions7d,
        revenue7d: Math.round(ad.revenue7d),
        impressions: ad.impressions,
        clicks: ad.clicks,
        conversions: ad.conversions7d,
        lastUpdated: new Date(ad.lastDate).toISOString(),
      };
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));

  return {
    stockItems,
    adCampaigns,
    meta: {
      stocks: stockItems.length,
      campaigns: adCampaigns.length,
      totalAdSpend7d: Math.round(sumNumber(adCampaigns.map((a) => a.spend7d))),
    },
  };
}
