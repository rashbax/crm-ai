/**
 * Analytics Engine - Type Definitions
 * Canonical data models for marketplace-agnostic analytics
 */

/**
 * Normalized order event from any marketplace
 */
export interface OrderEvent {
  date: string; // YYYY-MM-DD
  sku: string;
  qty: number;
  revenue?: number;
  price?: number;
  marketplace?: string; // Marketplace ID
  connectionId?: string; // Connection ID for multi-shop support
}

/**
 * Current stock state for a SKU
 */
export interface StockState {
  sku: string;
  onHand: number;
  inbound?: number;
  updatedAt: string;
  marketplace?: string; // Marketplace ID
  connectionId?: string; // Connection ID for multi-shop support
}

/**
 * Daily advertising data
 */
export interface AdsDaily {
  date: string; // YYYY-MM-DD
  sku: string;
  spend: number;
  clicks?: number;
  ordersFromAds?: number;
  marketplace?: string; // Marketplace ID
  connectionId?: string; // Connection ID for multi-shop support
}

/**
 * Configuration for analytics engine
 */
export interface Config {
  leadTimeDays: number; // Supplier lead time (e.g., 7)
  reviewWindowDays: number; // Historical data window (e.g., 28)
  forecastHorizonDays: number; // Forecast future days (e.g., 14)
  safetyStockMin: number; // Minimum safety stock units (e.g., 100)
  targetCoverDays: number; // Target days of inventory (e.g., 21)
  adsLiftWeight: number; // Weight for ads lift effect (0..1, e.g., 0.5)
  useDayOfWeekSeasonality: boolean; // Apply weekday patterns
  moneyMetric: "profit" | "revenue"; // Loss calculation metric
  profitPerUnitBySku?: Record<string, number>; // SKU-specific profit margins
}

/**
 * Risk level classification
 */
export type RiskLevel = "NONE" | "LOW" | "MED" | "HIGH" | "CRITICAL";

/**
 * Daily forecast point
 */
export interface ForecastPoint {
  date: string; // YYYY-MM-DD
  units: number;
}

/**
 * Complete analytics result for a SKU
 */
export interface AnalyticsResult {
  sku: string;
  dailyForecast: number; // Average units/day
  forecastSeries: ForecastPoint[]; // Next N days forecast
  availableUnits: number; // onHand + inbound
  daysOfCover: number; // How many days current stock will last
  stockoutInDays: number | null; // Days until stockout (null if forecast=0)
  riskLevel: RiskLevel; // Risk classification
  reorderPoint: number; // ROP threshold
  recommendedReorderQty: number; // Suggested reorder quantity
  possibleLostUnits: number; // Units lost during stockout
  possibleLossMoney: number; // Money lost (profit or revenue)
  notes: string[]; // Explanatory notes
}

/**
 * Daily sales aggregation
 */
export interface DailySales {
  date: string;
  units: number;
  revenue: number;
  orders: number;
}

/**
 * Weekday seasonality pattern
 */
export interface SeasonalityPattern {
  [weekday: number]: number; // 0=Sunday...6=Saturday, multiplier value
}

/**
 * Price information for a SKU
 */
export interface PriceInfo {
  avgPrice: number;
  profitPerUnit?: number;
}

/**
 * Intermediate forecast calculation result
 */
export interface ForecastCalculation {
  baseline: number;
  adsLift: number;
  final: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  dataPoints: number;
}
