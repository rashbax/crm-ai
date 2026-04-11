import path from "path";
import { readJsonFile } from "@/src/integrations/storage";
import { filterByEnabledConnections, getEnabledConnections } from "@/src/integrations/enabled";
import type { AdsDaily, OrderEvent, StockState } from "@/src/pricing/types";
import type { AdCampaign, AdHealthStatus, SystemRecommendation, StockItem } from "@/types/automation";
import { getBusinessIsoDay } from "@/lib/date";
import { getResponsibilities, getSystemUsers, getAdDecisionOverrides } from "@/lib/founder-store";

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

function buildMarketplaceSkuKey(marketplace: UiMarketplace, sku: string): string {
  return `${marketplace}::${sku}`;
}

function buildCampaignDisplayName(params: {
  title?: string;
  resolvedSku?: string;
  fallbackSku: string;
  stockName?: string;
}): string {
  const title = (params.title || "").trim();
  const resolvedSku = (params.resolvedSku || "").trim();
  const stockName = (params.stockName || "").trim();

  if (title && resolvedSku && resolvedSku !== params.fallbackSku) {
    const normalizedTitle = title.toLowerCase();
    const normalizedResolved = resolvedSku.toLowerCase();
    if (!normalizedTitle.includes(normalizedResolved)) {
      return `${title} (${resolvedSku})`;
    }
  }

  if (title) return title;
  if (resolvedSku && resolvedSku !== params.fallbackSku) return resolvedSku;
  if (stockName) return stockName;
  return params.fallbackSku;
}

export interface AutomationSnapshot {
  stockItems: StockItem[];
  adCampaigns: AdCampaign[];
  meta: {
    stocks: number;
    campaigns: number;
    totalAdSpend7d: number;
    budgetSpikes: number;
    performanceDrops: number;
    staleAdAssignments: number;
    pendingAdApprovals: number;
  };
}

export async function loadAutomationSnapshot(): Promise<AutomationSnapshot> {
  const enabledConnections = await getEnabledConnections();
  if (enabledConnections.length === 0) {
    return {
      stockItems: [],
      adCampaigns: [],
      meta: { stocks: 0, campaigns: 0, totalAdSpend7d: 0, budgetSpikes: 0, performanceDrops: 0, staleAdAssignments: 0, pendingAdApprovals: 0 },
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
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

  const salesBySku = new Map<string, number>();
  for (const order of orders) {
    const marketplace = toUiMarketplace(order.marketplace);
    if (!marketplace) continue;
    const ts = new Date(order.date).getTime();
    if (!Number.isFinite(ts) || now - ts > THIRTY_DAYS_MS) continue;
    if (isCancelledStatus(order.sourceStatus)) continue;
    const qty = Math.max(0, Math.floor(order.qty || 0));
    const key = buildMarketplaceSkuKey(marketplace, order.sku);
    salesBySku.set(key, (salesBySku.get(key) || 0) + qty);
  }

  const stockBySku = new Map<string, { sku: string; marketplace: UiMarketplace; qty: number; inbound: number; updatedAt: string }>();
  for (const stock of stocks) {
    const marketplace = toUiMarketplace(stock.marketplace);
    if (!marketplace) continue;
    const key = buildMarketplaceSkuKey(marketplace, stock.sku);

    const existing = stockBySku.get(key);
    if (!existing) {
      stockBySku.set(key, {
        sku: stock.sku,
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
    .map(([, stock], idx) => {
      const soldLast30 = salesBySku.get(buildMarketplaceSkuKey(stock.marketplace, stock.sku)) || 0;
      const dailySales = soldLast30 > 0 ? Math.max(1, Math.round((soldLast30 / 30) * 10) / 10) : 0;
      const qty = stock.qty;
      const rop = Math.ceil(dailySales * 7 + 50);

      return {
        id: `STK-${idx + 1}`,
        sku: stock.sku,
        name: stock.sku,
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
    .sort((a, b) => `${a.marketplace}-${a.sku}`.localeCompare(`${b.marketplace}-${b.sku}`));

  const adBySku = new Map<
    string,
    {
      sku: string;
      resolvedSku: string;
      marketplace: UiMarketplace;
      title: string;
      spendToday: number;
      spend7d: number;
      spend14d: number;
      spendWeek1: number;
      spendWeek2: number;
      conversionsToday: number;
      conversions7d: number;
      conversions14d: number;
      convsWeek1: number;
      convsWeek2: number;
      clicks: number;
      impressions: number;
      revenueToday: number;
      revenue7d: number;
      revenue14d: number;
      lastDate: string;
      daysWithSpend: number;
      campaignState: string;
    }
  >();

  for (const ad of ads) {
    const marketplace = toUiMarketplace(ad.marketplace);
    if (!marketplace) continue;
    const ts = new Date(ad.date).getTime();
    if (!Number.isFinite(ts) || now - ts > FOURTEEN_DAYS_MS) continue;

    const dayKey = getBusinessIsoDay(ad.date);
    const isToday = dayKey === todayKey;
    const isWithin7d = now - ts <= SEVEN_DAYS_MS;
    const isWeek2 = !isWithin7d; // days 8-14
    const displaySku = String(ad.sku || "").trim();
    const resolvedSku = String(ad.resolvedSku || ad.sku || "").trim();
    if (!displaySku || !resolvedSku) continue;

    const spend = Math.max(0, ad.spend || 0);
    const clicks = Math.max(0, Math.floor(ad.clicks || 0));
    const conversions = Math.max(0, Math.floor(ad.ordersFromAds || 0));
    const impressions = Math.max(0, Math.floor(ad.impressions || 0));
    const revenue = Math.max(0, ad.revenueFromAds || 0);
    const adKey = buildMarketplaceSkuKey(marketplace, displaySku);

    const existing = adBySku.get(adKey);
    if (!existing) {
      adBySku.set(adKey, {
        sku: displaySku,
        resolvedSku,
        marketplace,
        title: ad.title || "",
        spendToday: isToday ? spend : 0,
        spend7d: isWithin7d ? spend : 0,
        spend14d: spend,
        spendWeek1: isWithin7d ? spend : 0,
        spendWeek2: isWeek2 ? spend : 0,
        conversionsToday: isToday ? conversions : 0,
        conversions7d: isWithin7d ? conversions : 0,
        conversions14d: conversions,
        convsWeek1: isWithin7d ? conversions : 0,
        convsWeek2: isWeek2 ? conversions : 0,
        clicks: isWithin7d ? clicks : 0,
        impressions: isWithin7d ? impressions : 0,
        revenueToday: isToday ? revenue : 0,
        revenue7d: isWithin7d ? revenue : 0,
        revenue14d: revenue,
        lastDate: ad.date,
        daysWithSpend: spend > 0 ? 1 : 0,
        campaignState: ad.campaignState || "UNKNOWN",
      });
      continue;
    }

    // Keep the first non-empty title
    if (!existing.title && ad.title) existing.title = ad.title;
    if (!existing.resolvedSku && resolvedSku) existing.resolvedSku = resolvedSku;
    existing.spend14d += spend;
    if (isWithin7d) existing.spend7d += spend;
    existing.spendWeek1 += isWithin7d ? spend : 0;
    existing.spendWeek2 += isWeek2 ? spend : 0;
    if (isToday) existing.spendToday += spend;
    existing.conversions14d += conversions;
    if (isWithin7d) existing.conversions7d += conversions;
    existing.convsWeek1 += isWithin7d ? conversions : 0;
    existing.convsWeek2 += isWeek2 ? conversions : 0;
    if (isToday) existing.conversionsToday += conversions;
    if (isWithin7d) existing.clicks += clicks;
    if (isWithin7d) existing.impressions += impressions;
    existing.revenue14d += revenue;
    if (isWithin7d) existing.revenue7d += revenue;
    if (isToday) existing.revenueToday += revenue;
    if (spend > 0) existing.daysWithSpend += 1;
    if (ts > new Date(existing.lastDate).getTime()) {
      existing.lastDate = ad.date;
      // Keep the most recent campaign state
      if (ad.campaignState && ad.campaignState !== "UNKNOWN") {
        existing.campaignState = ad.campaignState;
      }
    }
  }

  // Build stock lookup for cross-referencing with ads
  const stockLookup = new Map<string, StockItem>();
  for (const si of stockItems) {
    stockLookup.set(buildMarketplaceSkuKey(si.marketplace, si.sku), si);
  }

  // Build owner lookup from responsibility matrix
  let responsibilities: ReturnType<typeof getResponsibilities> = [];
  let userNameById = new Map<string, string>();
  try {
    responsibilities = getResponsibilities();
    const users = getSystemUsers();
    for (const u of users) {
      userNameById.set(u.id, u.name);
    }
  } catch {
    // data/secure may not exist (e.g. Vercel), skip silently
  }

  // Map: marketplace+sku → ads owner name
  const adsOwnerBySku = new Map<string, string>();
  for (const resp of responsibilities) {
    if (!resp.active || !resp.adsOwnerId) continue;
    const mp = toUiMarketplace(resp.marketplace);
    if (!mp) continue;
    const ownerName = userNameById.get(resp.adsOwnerId) || resp.adsOwnerId;
    adsOwnerBySku.set(buildMarketplaceSkuKey(mp, resp.skuId), ownerName);
  }

  // Load manual decision overrides
  let decisionOverrides = new Map<string, { actualDecision: string; decisionReason: string }>();
  try {
    const overrides = getAdDecisionOverrides();
    for (const o of overrides) {
      decisionOverrides.set(o.campaignKey, {
        actualDecision: o.actualDecision,
        decisionReason: o.decisionReason,
      });
    }
  } catch {
    // data/secure may not exist
  }

  const adCampaigns: AdCampaign[] = Array.from(adBySku.entries())
    .map(([, ad], idx) => {
      const estimatedBudget = Math.max(100, Math.round((ad.spend7d / 7) * 1.2));
      // Use real campaign state from API if available
      const apiState = (ad.campaignState || "").toUpperCase();
      const isRunning = apiState.includes("RUNNING") || apiState.includes("ACTIVE");
      const isStopped = apiState.includes("STOPPED") || apiState.includes("INACTIVE");
      const status: AdCampaign["status"] = isRunning ? "active" : isStopped ? "paused" : (ad.daysWithSpend > 0 ? "active" : "paused");
      const isActive = status === "active";

      // Cross-reference with stock
      const stock = stockLookup.get(buildMarketplaceSkuKey(ad.marketplace, ad.resolvedSku));
      const stockQty = stock?.qty ?? 0;
      const inferredDailySalesFromAds = ad.conversions7d > 0 ? Math.max(1, Math.round((ad.conversions7d / 7) * 10) / 10) : 0;
      const dailySales = stock?.dailySales && stock.dailySales > 0 ? stock.dailySales : inferredDailySalesFromAds;
      const daysOfStockLeft =
        dailySales > 0
          ? Math.max(1, Math.floor(stockQty / dailySales))
          : stockQty > 0
            ? (isActive ? stockQty : Infinity)
            : 0;

      // Stock conflict: ads running but stock is critically low
      const stockConflict = isActive && stockQty < 200;

      // Waste flag: spending without conversions
      const wasteFlag = isActive && ad.spend7d > 0 && ad.conversions7d === 0;

      // Health status per T3-08
      let healthStatus: AdHealthStatus = "active";
      if (wasteFlag) {
        healthStatus = "wasteful";
      } else if (stockConflict) {
        healthStatus = "risky";
      } else if (isActive && (ad.conversions7d < 3 || daysOfStockLeft < 14)) {
        healthStatus = "monitoring";
      }

      // System recommendation based on stock + performance
      let systemRecommendation: SystemRecommendation = "keep";
      if (stockQty < 200) {
        systemRecommendation = "pause";
      } else if (stockQty < 500) {
        systemRecommendation = "reduce";
      } else if (stockQty < 1000) {
        systemRecommendation = "no_scale";
      }
      // Override: waste always → reduce or pause
      if (wasteFlag) {
        if (systemRecommendation === "keep" || systemRecommendation === "no_scale") {
          systemRecommendation = "reduce";
        }
      }

      // Owner from responsibility matrix (match by resolvedSku = offer_id)
      const owner = adsOwnerBySku.get(buildMarketplaceSkuKey(ad.marketplace, ad.resolvedSku))
        || adsOwnerBySku.get(buildMarketplaceSkuKey(ad.marketplace, ad.sku));

      // Manual decision override
      const overrideKey = buildMarketplaceSkuKey(ad.marketplace, ad.sku);
      const override = decisionOverrides.get(overrideKey);
      const actualDecision = override?.actualDecision as SystemRecommendation | undefined;
      const decisionReason = override?.decisionReason;

      // Budget spike: today's spend > 2x the 7-day daily average
      const avgDailySpend7d = ad.spend7d > 0 ? ad.spend7d / 7 : 0;
      const budgetSpike = ad.spendToday > 0 && avgDailySpend7d > 0 && ad.spendToday > avgDailySpend7d * 2;

      // Performance drop: week1 (recent 7d) conversions dropped vs week2 (days 8-14)
      const performanceDrop = ad.convsWeek2 > 0 && ad.convsWeek1 < ad.convsWeek2 * 0.5;

      // Spend trend: compare week1 vs week2 spend
      const spendTrend: "up" | "down" | "stable" =
        ad.spendWeek2 > 0 && ad.spendWeek1 > ad.spendWeek2 * 1.3
          ? "up"
          : ad.spendWeek2 > 0 && ad.spendWeek1 < ad.spendWeek2 * 0.7
            ? "down"
            : "stable";

      return {
        id: `AD-${idx + 1}`,
        sku: ad.sku,
        resolvedSku: ad.resolvedSku,
        name: buildCampaignDisplayName({
          title: ad.title,
          resolvedSku: ad.resolvedSku,
          stockName: stock?.name,
          fallbackSku: ad.sku,
        }),
        platform: ad.marketplace,
        status,
        healthStatus,
        systemRecommendation,
        actualDecision,
        decisionReason,
        dailyBudget: estimatedBudget,
        currentBudget: estimatedBudget,
        spendToday: Math.round(ad.spendToday),
        attributedRevenueToday: Math.round(ad.revenueToday),
        targetAcos: 0.3,
        spend7d: Math.round(ad.spend7d),
        spend14d: Math.round(ad.spend14d),
        conversionsToday: ad.conversionsToday,
        conversions7d: ad.conversions7d,
        revenue7d: Math.round(ad.revenue7d),
        impressions: ad.impressions,
        clicks: ad.clicks,
        conversions: ad.conversions7d,
        lastUpdated: new Date(ad.lastDate).toISOString(),
        stockOnHand: stockQty,
        dailySales,
        daysOfStockLeft: daysOfStockLeft === Infinity ? 9999 : daysOfStockLeft,
        stockConflict,
        wasteFlag,
        budgetSpike,
        performanceDrop,
        spendTrend,
        owner,
      };
    })
    .sort((a, b) => `${a.platform}-${a.sku}`.localeCompare(`${b.platform}-${b.sku}`));

  // Stale ad assignments: campaigns with an owner where data is > 48h old
  const FORTY_EIGHT_H_MS = 48 * 60 * 60 * 1000;
  const staleAdAssignments = adCampaigns.filter((a) => {
    if (!a.owner) return false;
    const lastTs = new Date(a.lastUpdated).getTime();
    return Number.isFinite(lastTs) && now - lastTs > FORTY_EIGHT_H_MS;
  }).length;

  // Pending ad approvals count
  let pendingAdApprovals = 0;
  try {
    const { getApprovals } = await import("@/lib/founder-store");
    pendingAdApprovals = getApprovals().filter(
      (a) => a.entityType === "ads_budget" && a.status === "pending"
    ).length;
  } catch {
    // data/secure may not exist
  }

  return {
    stockItems,
    adCampaigns,
    meta: {
      stocks: stockItems.length,
      campaigns: adCampaigns.length,
      totalAdSpend7d: Math.round(sumNumber(adCampaigns.map((a) => a.spend7d))),
      budgetSpikes: adCampaigns.filter((a) => a.budgetSpike).length,
      performanceDrops: adCampaigns.filter((a) => a.performanceDrop).length,
      staleAdAssignments,
      pendingAdApprovals,
    },
  };
}
