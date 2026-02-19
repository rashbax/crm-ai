/**
 * Analytics Engine - Main Orchestrator
 * Combines forecasting, risk assessment, and reorder logic
 */

import type {
  OrderEvent,
  StockState,
  AdsDaily,
  Config,
  AnalyticsResult,
  PriceInfo,
} from "./types";
import { buildDailySalesSeries, calculateAveragePrice } from "./utils";
import { forecastDailyUnits, buildForecastSeries } from "./forecast";
import { computeRiskAndLoss } from "./risk";

/**
 * Main analytics function
 * Processes all SKUs and returns complete analytics results
 */
export function runAnalytics(
  orders: OrderEvent[],
  stocks: StockState[],
  ads: AdsDaily[],
  config: Config
): AnalyticsResult[] {
  const results: AnalyticsResult[] = [];

  // Get unique SKUs from stocks (these are the products we're tracking)
  const skus = [...new Set(stocks.map((s) => s.sku))];

  for (const sku of skus) {
    try {
      const result = analyzeSKU(sku, orders, stocks, ads, config);
      results.push(result);
    } catch (error) {
      // Log error but continue with other SKUs
      console.error(`Error analyzing SKU ${sku}:`, error);
      
      // Return minimal result for failed SKU
      const stockState = stocks.find((s) => s.sku === sku);
      results.push({
        sku,
        dailyForecast: 0,
        forecastSeries: [],
        availableUnits: stockState?.onHand || 0,
        daysOfCover: 0,
        stockoutInDays: null,
        riskLevel: "NONE",
        reorderPoint: config.safetyStockMin,
        recommendedReorderQty: 0,
        possibleLostUnits: 0,
        possibleLossMoney: 0,
        notes: [`Error processing SKU: ${error instanceof Error ? error.message : "Unknown error"}`],
      });
    }
  }

  // Sort by risk level (CRITICAL first)
  const riskOrder = { CRITICAL: 0, HIGH: 1, MED: 2, LOW: 3, NONE: 4 };
  results.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);

  return results;
}

/**
 * Analyze a single SKU
 */
function analyzeSKU(
  sku: string,
  orders: OrderEvent[],
  stocks: StockState[],
  ads: AdsDaily[],
  config: Config
): AnalyticsResult {
  const notes: string[] = [];
  notes.push(`Analyzing SKU: ${sku}`);

  // Get stock state
  const stockState = stocks.find((s) => s.sku === sku);
  if (!stockState) {
    throw new Error(`Stock state not found for SKU: ${sku}`);
  }

  // Build historical sales series
  const salesSeries = buildDailySalesSeries(orders, sku, config.reviewWindowDays);
  notes.push(`Historical data: ${salesSeries.length} days (${config.reviewWindowDays} day window)`);

  // Get ads data for this SKU
  const skuAds = ads.filter((a) => a.sku === sku);

  // Forecast daily sales
  const forecastCalc = forecastDailyUnits(salesSeries, config, skuAds);
  const dailyForecast = forecastCalc.final;
  
  notes.push(
    `Forecast: ${dailyForecast.toFixed(2)} units/day (baseline: ${forecastCalc.baseline.toFixed(2)}, ` +
    `ads lift: ${forecastCalc.adsLift.toFixed(2)}, confidence: ${forecastCalc.confidence})`
  );

  // Build forecast series
  const forecastSeries = buildForecastSeries(
    dailyForecast,
    config.forecastHorizonDays,
    config,
    salesSeries
  );

  // Calculate price info
  const avgPrice = calculateAveragePrice(orders, sku);
  const priceInfo: PriceInfo = {
    avgPrice,
    profitPerUnit: config.profitPerUnitBySku?.[sku],
  };
  
  if (avgPrice > 0) {
    notes.push(`Average price: ₽${avgPrice.toFixed(2)}`);
  }

  // Compute risk and loss
  const riskResult = computeRiskAndLoss(stockState, dailyForecast, priceInfo, config);

  // Combine all notes
  const allNotes = [...notes, ...riskResult.notes];

  return {
    sku,
    dailyForecast,
    forecastSeries,
    availableUnits: riskResult.availableUnits,
    daysOfCover: riskResult.daysOfCover,
    stockoutInDays: riskResult.stockoutInDays,
    riskLevel: riskResult.riskLevel,
    reorderPoint: riskResult.reorderPoint,
    recommendedReorderQty: riskResult.recommendedReorderQty,
    possibleLostUnits: riskResult.possibleLostUnits,
    possibleLossMoney: riskResult.possibleLossMoney,
    notes: allNotes,
  };
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): Config {
  return {
    leadTimeDays: 7,
    reviewWindowDays: 28,
    forecastHorizonDays: 14,
    safetyStockMin: 100,
    targetCoverDays: 21,
    adsLiftWeight: 0.5,
    useDayOfWeekSeasonality: true,
    moneyMetric: "revenue",
  };
}
