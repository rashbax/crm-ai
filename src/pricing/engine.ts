/**
 * Pricing Engine - Main Orchestrator
 * Combines pricing calculations with analytics data
 */

import type {
  PriceState,
  CogsState,
  FeesConfig,
  PricingRow,
  MarketplacePricing,
  PricingDashboardResponse,
  PricingSummary,
  Marketplace,
  RiskLevel,
} from "./types";
import { getPricingRules, getPricingRulesMap } from "./config";
import {
  calculateMinPrice,
  calculateTargetPrice,
  calculateGuardrails,
  calculateRecommendation,
  determineTargetMargin,
  calculateMarginPct,
} from "./calculator";

// Import analytics if available
let analyticsAvailable = false;
try {
  require("@/src/analytics");
  analyticsAvailable = true;
} catch {
  // Analytics not available, use simplified logic
}

/**
 * Forecast settings tuned for real API order streams.
 */
const FORECAST_WINDOW_DAYS = 28;
const TREND_WINDOW_DAYS = 14;

function toUtcDayKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseOrderDay(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function normalizeQty(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

function getSkuDailySeries(orders: any[], sku: string, days: number): { daily: number[]; daysSinceLastSale: number | null } {
  const today = new Date();
  const endDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const byDay = new Map<string, number>();
  let latestSaleTime: number | null = null;

  for (const order of orders) {
    if (order?.sku !== sku) continue;
    const qty = normalizeQty(order?.qty);
    if (qty <= 0) continue;

    const day = parseOrderDay(order?.date);
    if (!day) continue;
    const key = toUtcDayKey(day);
    byDay.set(key, (byDay.get(key) || 0) + qty);

    const ts = day.getTime();
    if (latestSaleTime == null || ts > latestSaleTime) latestSaleTime = ts;
  }

  const daily: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(endDay.getTime() - i * 24 * 60 * 60 * 1000);
    const key = toUtcDayKey(day);
    daily.push(byDay.get(key) || 0);
  }

  const daysSinceLastSale =
    latestSaleTime == null
      ? null
      : Math.floor((endDay.getTime() - latestSaleTime) / (24 * 60 * 60 * 1000));

  return { daily, daysSinceLastSale };
}

/**
 * Real-data sales forecast from daily demand history.
 * Uses 28-day baseline + 7-day recency, including zero-sale days.
 */
function simpleForecast(orders: any[], sku: string): number {
  const { daily, daysSinceLastSale } = getSkuDailySeries(orders, sku, FORECAST_WINDOW_DAYS);
  const total28 = daily.reduce((sum, q) => sum + q, 0);
  if (total28 <= 0) return 0;

  const recent7 = daily.slice(-7);
  const avg28 = total28 / FORECAST_WINDOW_DAYS;
  const avg7 = recent7.reduce((sum, q) => sum + q, 0) / 7;
  let forecast = avg7 * 0.65 + avg28 * 0.35;

  // If there were no sales for a long time, dampen forecast.
  if (daysSinceLastSale != null && daysSinceLastSale > 14) {
    forecast *= 0.5;
  }
  if (daysSinceLastSale != null && daysSinceLastSale > 30) {
    forecast = 0;
  }

  return Math.max(0, forecast);
}

/**
 * Simple stock risk calculation (fallback)
 */
function simpleStockRisk(
  availableUnits: number,
  dailyForecast: number,
  leadTimeDays: number = 7
): { riskLevel: RiskLevel; stockoutInDays: number | null } {
  if (dailyForecast <= 0.01) {
    return { riskLevel: "NONE", stockoutInDays: null };
  }

  const daysOfCover = availableUnits / dailyForecast;
  const stockoutInDays = Math.floor(daysOfCover);

  let riskLevel: RiskLevel = "NONE";
  if (stockoutInDays < 3) {
    riskLevel = "CRITICAL";
  } else if (stockoutInDays < leadTimeDays) {
    riskLevel = "HIGH";
  } else if (stockoutInDays < leadTimeDays + 7) {
    riskLevel = "MED";
  } else if (stockoutInDays < leadTimeDays + 14) {
    riskLevel = "LOW";
  }

  return { riskLevel, stockoutInDays };
}

/**
 * Simple loss calculation (fallback)
 */
function simpleLoss(
  dailyForecast: number,
  daysOfCover: number,
  leadTimeDays: number,
  avgPrice: number
): { possibleLostUnits: number; possibleLossMoney: number } {
  const lostDays = Math.max(0, leadTimeDays - daysOfCover);
  const possibleLostUnits = lostDays * dailyForecast;
  const possibleLossMoney = possibleLostUnits * avgPrice;

  return { possibleLostUnits, possibleLossMoney };
}

/**
 * Detect sales trend from order history
 */
function detectSalesTrend(orders: any[], sku: string): "falling" | "stable" | "rising" {
  const { daily } = getSkuDailySeries(orders, sku, TREND_WINDOW_DAYS);
  if (daily.length < TREND_WINDOW_DAYS) return "stable";

  const previous7 = daily.slice(0, 7);
  const recent7 = daily.slice(7, 14);
  const recentQty = recent7.reduce((sum, q) => sum + q, 0);
  const previousQty = previous7.reduce((sum, q) => sum + q, 0);
  if (recentQty === 0 && previousQty === 0) return "stable";
  if (previousQty === 0 && recentQty > 0) return "rising";

  const change = previousQty > 0 ? (recentQty - previousQty) / previousQty : 0;

  if (change < -0.15) return "falling"; // -15%
  if (change > 0.15) return "rising"; // +15%
  return "stable";
}

/**
 * Build pricing row for a single SKU
 */
export function buildPricingRow(
  sku: string,
  prices: PriceState[],
  cogs: CogsState | undefined,
  fees: FeesConfig[],
  orders: any[],
  stocks: any[],
  ads: any[]
): PricingRow | null {
  // Get cost data
  const cogsData = cogs;
  if (!cogsData) {
    return null; // Skip SKUs without cost data
  }

  // Get stock data
  const stockData = stocks.find((s) => s.sku === sku);
  const availableUnits = stockData
    ? stockData.onHand + (stockData.inbound || 0)
    : 0;

  // Calculate forecast
  const dailyForecast = simpleForecast(orders, sku);

  // Calculate stock risk
  const { riskLevel, stockoutInDays } = simpleStockRisk(
    availableUnits,
    dailyForecast
  );

  const daysOfCover = dailyForecast > 0 ? availableUnits / dailyForecast : Infinity;

  // Get average price for loss calculation
  const skuPrices = prices.filter((p) => p.sku === sku);
  const avgPrice = skuPrices.length > 0
    ? skuPrices.reduce((sum, p) => sum + p.price, 0) / skuPrices.length
    : cogsData.cogs * 2;

  // Calculate loss
  const loss = simpleLoss(dailyForecast, daysOfCover, 7, avgPrice);

  // Get ads data
  const skuAds = ads.filter((a) => a.sku === sku);
  let adsData: PricingRow["ads"] | undefined;
  if (skuAds.length > 0) {
    const totalSpend = skuAds.reduce((sum, a) => sum + a.spend, 0);
    const totalOrders = skuAds.reduce((sum, a) => sum + (a.ordersFromAds || 0), 0);
    const revenue = totalOrders * avgPrice;
    const roas = totalSpend > 0 ? revenue / totalSpend : 0;
    const acos = revenue > 0 ? totalSpend / revenue : 0;

    adsData = { spend: totalSpend, roas, acos };
  }

  // Detect sales trend
  const salesTrend = detectSalesTrend(orders, sku);

  // Build marketplace-specific pricing
  const marketplaces: MarketplacePricing[] = [];
  const notes: string[] = [];

  for (const priceState of prices.filter((p) => p.sku === sku)) {
    const rules = getPricingRules(priceState.marketplace);
    const feeConfig = fees.find((f) => f.marketplace === priceState.marketplace);
    if (!feeConfig) continue;

    const currentPrice = priceState.price;
    const currentDiscount = priceState.discountPct || 0;

    // Calculate pricing
    const minPrice = calculateMinPrice(cogsData.cogs, feeConfig);
    const targetMarginPct = determineTargetMargin(
      riskLevel,
      availableUnits,
      daysOfCover
    );
    const targetPrice = calculateTargetPrice(
      cogsData.cogs,
      feeConfig,
      targetMarginPct
    );

    // Get recommendation
    const recommended = calculateRecommendation(
      currentPrice,
      currentDiscount,
      minPrice,
      targetPrice,
      riskLevel,
      availableUnits,
      salesTrend
    );

    // Calculate guardrails
    const guardrails = calculateGuardrails(
      currentPrice,
      currentDiscount,
      recommended.price,
      recommended.discountPct,
      cogsData.cogs,
      feeConfig,
      riskLevel,
      adsData?.acos,
      {
        lowMarginBlockPct: rules.guardrails.lowMarginBlockPct,
      }
    );

    marketplaces.push({
      marketplace: priceState.marketplace,
      current: {
        price: currentPrice,
        discountPct: currentDiscount,
        promoPrice: priceState.promoPrice,
      },
      listing: {
        status: priceState.status,
        visibility: priceState.visibility,
        onSale: priceState.onSale,
      },
      priceIndexPairs: priceState.priceIndexPairs,
      recommended: {
        price: recommended.price,
        discountPct: recommended.discountPct,
      },
      guardrails,
    });
  }

  // Add general notes
  if (riskLevel === "CRITICAL" || riskLevel === "HIGH") {
    notes.push(`Stock risk ${riskLevel}: consider reducing discounts`);
  }

  if (salesTrend === "falling") {
    notes.push("Sales declining: test price adjustment or promotion");
  }

  if (adsData && adsData.acos > 0.5) {
    notes.push("High ad costs: review targeting or reduce spend");
  }

  return {
    sku,
    marketplaces,
    stock: { availableUnits, riskLevel, stockoutInDays },
    forecast: { daily: dailyForecast, horizonDays: 14 },
    loss,
    ads: adsData,
    notes,
  };
}

/**
 * Build complete pricing dashboard
 */
export function buildPricingDashboard(
  prices: PriceState[],
  cogs: CogsState[],
  fees: FeesConfig[],
  orders: any[],
  stocks: any[],
  ads: any[],
  mode: string = "demo"
): PricingDashboardResponse {
  const warnings: string[] = [];
  const rulesMap = getPricingRulesMap();

  if (mode === "demo") {
    warnings.push("Running in DEMO mode with sample data");
  }

  // Get unique SKUs
  const skus = Array.from(new Set(prices.map((p) => p.sku)));

  // Build rows
  const rows: PricingRow[] = [];
  for (const sku of skus) {
    const cogsData = cogs.find((c) => c.sku === sku);
    const row = buildPricingRow(sku, prices, cogsData, fees, orders, stocks, ads);
    if (row) {
      rows.push(row);
    }
  }

  // Calculate summary
  const summary: PricingSummary = {
    totalSkus: rows.length,
    blockedCount: rows.filter((r) =>
      r.marketplaces.some((m) => m.guardrails.blocked)
    ).length,
    lowMarginCount: rows.filter((r) =>
      r.marketplaces.some((m) => {
        const rules = rulesMap[m.marketplace];
        return m.guardrails.marginPct < rules.indexThresholds.moderateMaxMarginPct;
      })
    ).length,
    highRiskCount: rows.filter(
      (r) => r.stock.riskLevel === "HIGH" || r.stock.riskLevel === "CRITICAL"
    ).length,
  };

  return {
    mode,
    warnings,
    fees,
    rules: rulesMap,
    rows,
    summary,
  };
}
