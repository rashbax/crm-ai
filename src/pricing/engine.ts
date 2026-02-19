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
 * Simple moving average forecast (fallback when analytics unavailable)
 */
function simpleForecast(orders: any[], sku: string): number {
  const skuOrders = orders.filter((o) => o.sku === sku);
  if (skuOrders.length === 0) return 0;

  const last7Days = skuOrders.slice(-7);
  const totalQty = last7Days.reduce((sum, o) => sum + o.qty, 0);
  return totalQty / Math.max(1, last7Days.length);
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
  const skuOrders = orders.filter((o) => o.sku === sku);
  if (skuOrders.length < 14) return "stable";

  const recent7 = skuOrders.slice(-7);
  const previous7 = skuOrders.slice(-14, -7);

  const recentQty = recent7.reduce((sum, o) => sum + o.qty, 0);
  const previousQty = previous7.reduce((sum, o) => sum + o.qty, 0);

  if (previousQty === 0) return "stable";

  const change = (recentQty - previousQty) / previousQty;

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
      adsData?.acos
    );

    marketplaces.push({
      marketplace: priceState.marketplace,
      current: {
        price: currentPrice,
        discountPct: currentDiscount,
        promoPrice: priceState.promoPrice,
      },
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
  mode: "live" | "demo" = "demo"
): PricingDashboardResponse {
  const warnings: string[] = [];

  if (mode === "demo") {
    warnings.push("Running in DEMO mode with sample data");
  }

  // Get unique SKUs
  const skus = [...new Set(prices.map((p) => p.sku))];

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
      r.marketplaces.some((m) => m.guardrails.marginPct < 0.1)
    ).length,
    highRiskCount: rows.filter(
      (r) => r.stock.riskLevel === "HIGH" || r.stock.riskLevel === "CRITICAL"
    ).length,
  };

  return {
    mode,
    warnings,
    fees,
    rows,
    summary,
  };
}
