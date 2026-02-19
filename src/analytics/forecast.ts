/**
 * Analytics Engine - Forecasting Logic
 * Implements weighted moving average with optional seasonality and ads lift
 */

import type {
  Config,
  DailySales,
  AdsDaily,
  ForecastPoint,
  ForecastCalculation,
  SeasonalityPattern,
} from "./types";
import {
  addDays,
  today,
  getDayOfWeek,
  weightedMovingAverage,
  average,
  calculateSeasonality,
  validatePositive,
} from "./utils";

/**
 * Forecast daily units using weighted moving average
 * Handles sparse data with fallback logic
 */
export function forecastDailyUnits(
  series: DailySales[],
  config: Config,
  adsSeries?: AdsDaily[]
): ForecastCalculation {
  // Extract unit values from series (most recent last)
  const units = series.map((s) => s.units);

  if (units.length === 0) {
    return {
      baseline: 0,
      adsLift: 0,
      final: 0,
      confidence: "LOW",
      dataPoints: 0,
    };
  }

  // Calculate baseline using weighted moving average
  // Prefer recent data: last 7 days, fallback to 14, then 28
  let baseline = 0;
  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  let dataPoints = 0;

  if (units.length >= 7) {
    // Use last 7 days
    const recent7 = units.slice(-7);
    baseline = weightedMovingAverage(recent7);
    dataPoints = 7;
    confidence = "HIGH";
  } else if (units.length >= 14) {
    // Use last 14 days
    const recent14 = units.slice(-14);
    baseline = weightedMovingAverage(recent14);
    dataPoints = 14;
    confidence = "MEDIUM";
  } else {
    // Use all available data
    baseline = weightedMovingAverage(units);
    dataPoints = units.length;
    confidence = "LOW";
  }

  baseline = validatePositive(baseline);

  // Calculate ads lift if ads data provided
  let adsLift = 0;

  if (adsSeries && adsSeries.length > 0 && config.adsLiftWeight > 0) {
    adsLift = calculateAdsLift(series, adsSeries, config);
  }

  // Final forecast = baseline + weighted ads lift
  const final = baseline + config.adsLiftWeight * adsLift;

  return {
    baseline,
    adsLift,
    final: validatePositive(final),
    confidence,
    dataPoints,
  };
}

/**
 * Calculate ads lift effect
 * Compares sales on days with ads vs days without ads
 */
function calculateAdsLift(
  salesSeries: DailySales[],
  adsSeries: AdsDaily[],
  config: Config
): number {
  // Create set of dates with ad spend
  const adsDates = new Set(adsSeries.filter((a) => a.spend > 0).map((a) => a.date));

  // Separate sales into ads days vs non-ads days
  const salesWithAds: number[] = [];
  const salesWithoutAds: number[] = [];

  for (const day of salesSeries) {
    if (adsDates.has(day.date)) {
      salesWithAds.push(day.units);
    } else {
      salesWithoutAds.push(day.units);
    }
  }

  // Need sufficient data for comparison
  if (salesWithAds.length < 2 || salesWithoutAds.length < 2) {
    return 0;
  }

  const avgWithAds = average(salesWithAds);
  const avgWithoutAds = average(salesWithoutAds);

  // Lift is the positive difference
  const lift = Math.max(0, avgWithAds - avgWithoutAds);

  return validatePositive(lift);
}

/**
 * Build forecast series for next N days
 * Applies weekday seasonality if enabled
 */
export function buildForecastSeries(
  dailyForecast: number,
  horizonDays: number,
  config: Config,
  historicalSeries?: DailySales[]
): ForecastPoint[] {
  const series: ForecastPoint[] = [];
  let seasonalityPattern: SeasonalityPattern | null = null;

  // Calculate seasonality if enabled and we have historical data
  if (config.useDayOfWeekSeasonality && historicalSeries && historicalSeries.length >= 14) {
    seasonalityPattern = calculateSeasonality(historicalSeries);
  }

  // Generate forecast for next N days
  const startDate = addDays(today(), 1); // Start tomorrow

  for (let i = 0; i < horizonDays; i++) {
    const forecastDate = addDays(startDate, i);
    let forecastUnits = dailyForecast;

    // Apply seasonality multiplier if available
    if (seasonalityPattern) {
      const weekday = getDayOfWeek(forecastDate);
      const multiplier = seasonalityPattern[weekday] || 1.0;
      forecastUnits = dailyForecast * multiplier;
    }

    series.push({
      date: forecastDate,
      units: validatePositive(forecastUnits),
    });
  }

  return series;
}
