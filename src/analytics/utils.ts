/**
 * Analytics Engine - Utility Functions
 */

import type { OrderEvent, DailySales, SeasonalityPattern } from "./types";

/**
 * Parse date string to Date object
 */
export function parseDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z");
}

/**
 * Format Date to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Add days to a date
 */
export function addDays(dateStr: string, days: number): string {
  const date = parseDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

/**
 * Get day of week (0=Sunday, 6=Saturday)
 */
export function getDayOfWeek(dateStr: string): number {
  return parseDate(dateStr).getUTCDay();
}

/**
 * Calculate date difference in days
 */
export function daysDiff(date1: string, date2: string): number {
  const d1 = parseDate(date1);
  const d2 = parseDate(date2);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get date N days ago from today
 */
export function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return formatDate(date);
}

/**
 * Get today's date
 */
export function today(): string {
  return formatDate(new Date());
}

/**
 * Build daily sales series from order events
 * Aggregates orders by date for a specific SKU
 */
export function buildDailySalesSeries(
  orders: OrderEvent[],
  sku: string,
  windowDays: number
): DailySales[] {
  const endDate = today();
  const startDate = daysAgo(windowDays);

  // Filter orders for this SKU within window
  const relevantOrders = orders.filter(
    (o) => o.sku === sku && o.date >= startDate && o.date <= endDate
  );

  // Aggregate by date
  const dailyMap = new Map<string, DailySales>();

  for (const order of relevantOrders) {
    const existing = dailyMap.get(order.date);
    if (existing) {
      existing.units += order.qty;
      existing.revenue += order.revenue || order.price || 0;
      existing.orders += 1;
    } else {
      dailyMap.set(order.date, {
        date: order.date,
        units: order.qty,
        revenue: order.revenue || order.price || 0,
        orders: 1,
      });
    }
  }

  // Fill in missing days with zeros
  const series: DailySales[] = [];
  let currentDate = startDate;

  while (currentDate <= endDate) {
    const existing = dailyMap.get(currentDate);
    series.push(
      existing || {
        date: currentDate,
        units: 0,
        revenue: 0,
        orders: 0,
      }
    );
    currentDate = addDays(currentDate, 1);
  }

  return series;
}

/**
 * Calculate weighted moving average
 * More recent values get higher weight
 */
export function weightedMovingAverage(values: number[]): number {
  if (values.length === 0) return 0;

  // Weights increase linearly: 1, 2, 3, ..., n
  let sumWeightedValues = 0;
  let sumWeights = 0;

  for (let i = 0; i < values.length; i++) {
    const weight = i + 1; // Recent values get higher weight
    sumWeightedValues += values[i] * weight;
    sumWeights += weight;
  }

  return sumWeights > 0 ? sumWeightedValues / sumWeights : 0;
}

/**
 * Calculate simple average
 */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate weekday seasonality multipliers
 * Returns multiplier for each day of week based on historical patterns
 */
export function calculateSeasonality(series: DailySales[]): SeasonalityPattern {
  const pattern: SeasonalityPattern = {};

  // Group sales by weekday
  const weekdayGroups: { [key: number]: number[] } = {};

  for (const day of series) {
    const weekday = getDayOfWeek(day.date);
    if (!weekdayGroups[weekday]) {
      weekdayGroups[weekday] = [];
    }
    weekdayGroups[weekday].push(day.units);
  }

  // Calculate average for each weekday
  const weekdayAvgs: { [key: number]: number } = {};
  for (const [weekday, values] of Object.entries(weekdayGroups)) {
    weekdayAvgs[Number(weekday)] = average(values);
  }

  // Calculate overall average
  const overallAvg = average(Object.values(weekdayAvgs));

  // Calculate multipliers (ratio to overall average)
  if (overallAvg > 0) {
    for (const weekday of Object.keys(weekdayAvgs)) {
      const avg = weekdayAvgs[Number(weekday)];
      pattern[Number(weekday)] = avg / overallAvg;
    }
  } else {
    // No data, use neutral multipliers
    for (let i = 0; i < 7; i++) {
      pattern[i] = 1.0;
    }
  }

  return pattern;
}

/**
 * Validate and sanitize input
 */
export function validatePositive(value: number, defaultValue: number = 0): number {
  return isFinite(value) && value >= 0 ? value : defaultValue;
}

/**
 * Calculate average price from order events
 */
export function calculateAveragePrice(orders: OrderEvent[], sku: string): number {
  const relevantOrders = orders.filter((o) => o.sku === sku);

  let totalRevenue = 0;
  let totalQty = 0;

  for (const order of relevantOrders) {
    if (order.revenue) {
      totalRevenue += order.revenue;
      totalQty += order.qty;
    } else if (order.price) {
      totalRevenue += order.price * order.qty;
      totalQty += order.qty;
    }
  }

  return totalQty > 0 ? totalRevenue / totalQty : 0;
}
