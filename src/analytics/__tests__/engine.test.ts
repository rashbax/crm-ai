/**
 * Analytics Engine - Unit Tests
 * Tests all major functionality with edge cases
 */

import { describe, test, expect } from '@jest/globals';
import type { OrderEvent, StockState, AdsDaily, Config } from '../types';
import { runAnalytics, getDefaultConfig } from '../engine';
import { forecastDailyUnits } from '../forecast';
import { computeRiskAndLoss } from '../risk';
import { buildDailySalesSeries, calculateAveragePrice } from '../utils';

describe('Analytics Engine', () => {
  // Test 1: Sparse data fallback
  test('handles sparse data with fallback logic', () => {
    const config = getDefaultConfig();
    
    // Only 3 days of data (sparse)
    const orders: OrderEvent[] = [
      { date: '2024-02-01', sku: 'SKU-001', qty: 10, price: 100 },
      { date: '2024-02-02', sku: 'SKU-001', qty: 15, price: 100 },
      { date: '2024-02-03', sku: 'SKU-001', qty: 12, price: 100 },
    ];

    const salesSeries = buildDailySalesSeries(orders, 'SKU-001', 28);
    const forecast = forecastDailyUnits(salesSeries, config);

    expect(forecast.confidence).toBe('LOW'); // Not enough data for HIGH confidence
    expect(forecast.final).toBeGreaterThan(0);
    expect(forecast.dataPoints).toBeLessThan(7);
  });

  // Test 2: Forecast = 0 behavior
  test('handles zero forecast correctly', () => {
    const config = getDefaultConfig();
    
    // No sales data
    const orders: OrderEvent[] = [];
    
    const stocks: StockState[] = [
      { sku: 'SKU-001', onHand: 500, inbound: 0, updatedAt: '2024-02-07' },
    ];

    const ads: AdsDaily[] = [];

    const results = runAnalytics(orders, stocks, ads, config);

    expect(results).toHaveLength(1);
    expect(results[0].dailyForecast).toBe(0);
    expect(results[0].riskLevel).toBe('NONE');
    expect(results[0].stockoutInDays).toBeNull();
    expect(results[0].possibleLostUnits).toBe(0);
    expect(results[0].possibleLossMoney).toBe(0);
  });

  // Test 3: Ads lift application
  test('applies ads lift correctly', () => {
    const config: Config = {
      ...getDefaultConfig(),
      adsLiftWeight: 0.5,
    };

    // Sales with clear ads correlation
    const orders: OrderEvent[] = [
      // Days with ads: higher sales
      { date: '2024-02-01', sku: 'SKU-001', qty: 50, price: 100 },
      { date: '2024-02-02', sku: 'SKU-001', qty: 55, price: 100 },
      { date: '2024-02-03', sku: 'SKU-001', qty: 52, price: 100 },
      // Days without ads: lower sales
      { date: '2024-02-04', sku: 'SKU-001', qty: 30, price: 100 },
      { date: '2024-02-05', sku: 'SKU-001', qty: 28, price: 100 },
      { date: '2024-02-06', sku: 'SKU-001', qty: 32, price: 100 },
      { date: '2024-02-07', sku: 'SKU-001', qty: 31, price: 100 },
    ];

    const ads: AdsDaily[] = [
      { date: '2024-02-01', sku: 'SKU-001', spend: 500 },
      { date: '2024-02-02', sku: 'SKU-001', spend: 500 },
      { date: '2024-02-03', sku: 'SKU-001', spend: 500 },
    ];

    const salesSeries = buildDailySalesSeries(orders, 'SKU-001', 28);
    const forecast = forecastDailyUnits(salesSeries, config, ads);

    expect(forecast.adsLift).toBeGreaterThan(0);
    expect(forecast.final).toBeGreaterThan(forecast.baseline);
  });

  // Test 4: Risk thresholds
  test('classifies risk levels correctly', () => {
    const config = getDefaultConfig();
    config.leadTimeDays = 7;

    const orders: OrderEvent[] = [
      { date: '2024-02-01', sku: 'SKU-001', qty: 30, price: 100 },
      { date: '2024-02-02', sku: 'SKU-001', qty: 30, price: 100 },
      { date: '2024-02-03', sku: 'SKU-001', qty: 30, price: 100 },
      { date: '2024-02-04', sku: 'SKU-001', qty: 30, price: 100 },
      { date: '2024-02-05', sku: 'SKU-001', qty: 30, price: 100 },
      { date: '2024-02-06', sku: 'SKU-001', qty: 30, price: 100 },
      { date: '2024-02-07', sku: 'SKU-001', qty: 30, price: 100 },
    ];

    // Test CRITICAL: stockout in 2 days
    let stocks: StockState[] = [
      { sku: 'SKU-001', onHand: 60, inbound: 0, updatedAt: '2024-02-07' },
    ];
    let results = runAnalytics(orders, stocks, [], config);
    expect(results[0].riskLevel).toBe('CRITICAL');
    expect(results[0].stockoutInDays).toBeLessThan(3);

    // Test HIGH: stockout in 5 days (< leadTimeDays)
    stocks = [
      { sku: 'SKU-001', onHand: 150, inbound: 0, updatedAt: '2024-02-07' },
    ];
    results = runAnalytics(orders, stocks, [], config);
    expect(results[0].riskLevel).toBe('HIGH');
    expect(results[0].stockoutInDays).toBeLessThan(7);

    // Test MED: stockout in 10 days (< leadTimeDays + 7)
    stocks = [
      { sku: 'SKU-001', onHand: 300, inbound: 0, updatedAt: '2024-02-07' },
    ];
    results = runAnalytics(orders, stocks, [], config);
    expect(results[0].riskLevel).toBe('MED');

    // Test NONE: plenty of stock
    stocks = [
      { sku: 'SKU-001', onHand: 1000, inbound: 0, updatedAt: '2024-02-07' },
    ];
    results = runAnalytics(orders, stocks, [], config);
    expect(results[0].riskLevel).toBe('NONE');
  });

  // Test 5: Loss money calculation (profit vs revenue)
  test('calculates loss money correctly for profit and revenue metrics', () => {
    const orders: OrderEvent[] = [
      { date: '2024-02-01', sku: 'SKU-001', qty: 30, revenue: 3000 },
      { date: '2024-02-02', sku: 'SKU-001', qty: 30, revenue: 3000 },
      { date: '2024-02-03', sku: 'SKU-001', qty: 30, revenue: 3000 },
      { date: '2024-02-04', sku: 'SKU-001', qty: 30, revenue: 3000 },
      { date: '2024-02-05', sku: 'SKU-001', qty: 30, revenue: 3000 },
      { date: '2024-02-06', sku: 'SKU-001', qty: 30, revenue: 3000 },
      { date: '2024-02-07', sku: 'SKU-001', qty: 30, revenue: 3000 },
    ];

    const stocks: StockState[] = [
      { sku: 'SKU-001', onHand: 100, inbound: 0, updatedAt: '2024-02-07' },
    ];

    // Test with profit metric
    const configProfit: Config = {
      ...getDefaultConfig(),
      moneyMetric: 'profit',
      profitPerUnitBySku: {
        'SKU-001': 40, // 40₽ profit per unit
      },
    };

    let results = runAnalytics(orders, stocks, [], configProfit);
    expect(results[0].possibleLossMoney).toBeGreaterThan(0);
    
    // With daily forecast ~30 units/day, stockout in ~3.3 days
    // Lost days = max(0, 7 - 3.3) = 3.7 days
    // Lost units = 3.7 * 30 = ~111 units
    // Lost profit = 111 * 40 = ~4440₽
    expect(results[0].possibleLossMoney).toBeGreaterThan(4000);
    expect(results[0].possibleLostUnits).toBeGreaterThan(100);

    // Test with revenue metric
    const configRevenue: Config = {
      ...getDefaultConfig(),
      moneyMetric: 'revenue',
    };

    results = runAnalytics(orders, stocks, [], configRevenue);
    expect(results[0].possibleLossMoney).toBeGreaterThan(0);
    
    // Average price = 3000 / 30 = 100₽
    // Lost revenue = ~111 * 100 = ~11100₽
    expect(results[0].possibleLossMoney).toBeGreaterThan(10000);
  });

  // Test 6: Reorder quantity and ROP correctness
  test('calculates reorder point and quantity correctly', () => {
    const config = getDefaultConfig();
    config.leadTimeDays = 7;
    config.targetCoverDays = 21;
    config.safetyStockMin = 100;

    const orders: OrderEvent[] = [
      { date: '2024-02-01', sku: 'SKU-001', qty: 20, price: 100 },
      { date: '2024-02-02', sku: 'SKU-001', qty: 20, price: 100 },
      { date: '2024-02-03', sku: 'SKU-001', qty: 20, price: 100 },
      { date: '2024-02-04', sku: 'SKU-001', qty: 20, price: 100 },
      { date: '2024-02-05', sku: 'SKU-001', qty: 20, price: 100 },
      { date: '2024-02-06', sku: 'SKU-001', qty: 20, price: 100 },
      { date: '2024-02-07', sku: 'SKU-001', qty: 20, price: 100 },
    ];

    const stocks: StockState[] = [
      { sku: 'SKU-001', onHand: 200, inbound: 50, updatedAt: '2024-02-07' },
    ];

    const results = runAnalytics(orders, stocks, [], config);
    const result = results[0];

    // Daily forecast should be ~20 units/day
    expect(result.dailyForecast).toBeCloseTo(20, 0);

    // ROP = dailyForecast * leadTimeDays + safetyStock
    // safetyStock = max(100, 20 * 2) = 100
    // ROP = 20 * 7 + 100 = 240
    expect(result.reorderPoint).toBeCloseTo(240, 0);

    // Available = 200 + 50 = 250
    // Target cover = 21 * 20 = 420
    // Recommended reorder = max(0, ceil(420 - 250)) = 170
    expect(result.availableUnits).toBe(250);
    expect(result.recommendedReorderQty).toBeCloseTo(170, 0);
  });

  // Test 7: Multiple SKUs sorting by risk
  test('sorts results by risk level (CRITICAL first)', () => {
    const config = getDefaultConfig();
    config.leadTimeDays = 7;

    const orders: OrderEvent[] = [
      // SKU-001: High sales (critical risk)
      { date: '2024-02-06', sku: 'SKU-001', qty: 50, price: 100 },
      { date: '2024-02-07', sku: 'SKU-001', qty: 50, price: 100 },
      // SKU-002: Medium sales (no risk)
      { date: '2024-02-06', sku: 'SKU-002', qty: 10, price: 100 },
      { date: '2024-02-07', sku: 'SKU-002', qty: 10, price: 100 },
      // SKU-003: Low sales (low risk)
      { date: '2024-02-06', sku: 'SKU-003', qty: 5, price: 100 },
      { date: '2024-02-07', sku: 'SKU-003', qty: 5, price: 100 },
    ];

    const stocks: StockState[] = [
      { sku: 'SKU-001', onHand: 80, inbound: 0, updatedAt: '2024-02-07' }, // ~1.6 days
      { sku: 'SKU-002', onHand: 500, inbound: 0, updatedAt: '2024-02-07' }, // ~50 days
      { sku: 'SKU-003', onHand: 50, inbound: 0, updatedAt: '2024-02-07' }, // ~10 days
    ];

    const results = runAnalytics(orders, stocks, [], config);

    expect(results).toHaveLength(3);
    expect(results[0].sku).toBe('SKU-001');
    expect(results[0].riskLevel).toBe('CRITICAL');
    expect(results[2].sku).toBe('SKU-002');
    expect(results[2].riskLevel).toBe('NONE');
  });

  // Test 8: Price calculation edge cases
  test('handles missing price data gracefully', () => {
    const orders: OrderEvent[] = [
      { date: '2024-02-07', sku: 'SKU-001', qty: 30 }, // No price or revenue
    ];

    const avgPrice = calculateAveragePrice(orders, 'SKU-001');
    expect(avgPrice).toBe(0);

    const stocks: StockState[] = [
      { sku: 'SKU-001', onHand: 100, inbound: 0, updatedAt: '2024-02-07' },
    ];

    const config = getDefaultConfig();
    const results = runAnalytics(orders, stocks, [], config);

    // Should not crash, loss should be 0 due to no price data
    expect(results[0].possibleLossMoney).toBe(0);
  });
});
