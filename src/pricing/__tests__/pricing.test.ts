/**
 * Pricing Engine - Comprehensive Unit Tests
 * Tests all pricing formulas, guardrails, and business logic
 */

import { describe, test, expect } from '@jest/globals';
import {
  calculateMinPrice,
  calculateTargetPrice,
  calculateMarginPct,
  calculateNetProfit,
  calculateGuardrails,
  calculateRecommendation,
  determineTargetMargin,
  validatePriceChange,
} from '../calculator';
import { buildPricingRow, buildPricingDashboard } from '../engine';
import type { FeesConfig, PriceState, CogsState } from '../types';

describe('Pricing Calculator', () => {
  const wbFees: FeesConfig = {
    marketplace: 'wb',
    commissionPct: 12,
    logisticsPerUnit: 150,
    storagePerUnit: 20,
    paymentFeePct: 2,
  };

  const ozonFees: FeesConfig = {
    marketplace: 'ozon',
    commissionPct: 15,
    logisticsPerUnit: 180,
    storagePerUnit: 25,
    paymentFeePct: 2.5,
  };

  const cogs = 600;

  // Test 1: Min price calculation is correct
  test('calculates minimum price (break-even) correctly', () => {
    const minPrice = calculateMinPrice(cogs, wbFees);
    
    // Min price = (600 + 150 + 20) / (1 - 0.12 - 0.02)
    // = 770 / 0.86 = 895.35
    expect(minPrice).toBeCloseTo(895.35, 1);
    
    // Verify at this price, profit = 0
    const profit = calculateNetProfit(minPrice, cogs, wbFees);
    expect(profit).toBeCloseTo(0, 0);
  });

  // Test 2: Target price changes with risk level
  test('target price adjusts based on risk level', () => {
    const targetMarginLow = determineTargetMargin('LOW', 500, 20);
    const targetMarginHigh = determineTargetMargin('HIGH', 500, 20);
    const targetMarginVeryHighStock = determineTargetMargin('NONE', 2500, 35);

    expect(targetMarginLow).toBe(0.20); // Default 20%
    expect(targetMarginHigh).toBe(0.25); // High risk = 25%
    expect(targetMarginVeryHighStock).toBe(0.15); // Move inventory = 15%

    const targetPriceLow = calculateTargetPrice(cogs, wbFees, targetMarginLow);
    const targetPriceHigh = calculateTargetPrice(cogs, wbFees, targetMarginHigh);

    expect(targetPriceHigh).toBeGreaterThan(targetPriceLow);
  });

  // Test 3: Blocked when current price below min
  test('blocks price changes below minimum', () => {
    const currentPrice = 800; // Below min
    const minPrice = calculateMinPrice(cogs, wbFees);

    expect(currentPrice).toBeLessThan(minPrice);

    const guardrails = calculateGuardrails(
      currentPrice,
      10,
      minPrice,
      0,
      cogs,
      wbFees,
      'NONE'
    );

    expect(guardrails.blocked).toBe(true);
    expect(guardrails.warnings.length).toBeGreaterThan(0);
    expect(guardrails.warnings.some(w => w.includes('break-even'))).toBe(true);
  });

  // Test 4: Recommended price never below min
  test('recommendation respects minimum price floor', () => {
    const minPrice = calculateMinPrice(cogs, wbFees);
    const targetPrice = calculateTargetPrice(cogs, wbFees, 0.20);

    const recommendation = calculateRecommendation(
      800, // Current below min
      10,
      minPrice,
      targetPrice,
      'NONE',
      500,
      'stable'
    );

    expect(recommendation.price).toBeGreaterThanOrEqual(minPrice);
    expect(recommendation.discountPct).toBe(0); // Should remove discount
  });

  // Test 5: Warning when discount > 30%
  test('warns on excessive discount', () => {
    const guardrails = calculateGuardrails(
      1290,
      35, // 35% discount
      895,
      0,
      cogs,
      wbFees,
      'NONE'
    );

    expect(guardrails.warnings.some(w => w.includes('very high'))).toBe(true);
  });

  // Test 6: Bulk price change respects min price
  test('bulk -3% price change respects minimum', () => {
    const currentPrice = 1000;
    const minPrice = calculateMinPrice(cogs, wbFees); // ~895

    // Apply -3%
    const newPrice = currentPrice * 0.97; // 970
    
    // Should be above min
    expect(newPrice).toBeGreaterThan(minPrice);

    const validation = validatePriceChange(newPrice, minPrice, cogs, wbFees);
    expect(validation.valid).toBe(true);

    // But if we're close to min
    const lowPrice = 920;
    const newLowPrice = lowPrice * 0.97; // 892.4
    
    // This falls below min
    expect(newLowPrice).toBeLessThan(minPrice);

    const validation2 = validatePriceChange(newLowPrice, minPrice, cogs, wbFees);
    expect(validation2.valid).toBe(false);
  });

  // Test 7: Sales falling triggers price drop when stock high
  test('falling sales + high stock triggers price drop recommendation', () => {
    const minPrice = calculateMinPrice(cogs, wbFees);
    const targetPrice = calculateTargetPrice(cogs, wbFees, 0.20);

    const recommendation = calculateRecommendation(
      1290,
      10,
      minPrice,
      targetPrice,
      'NONE',
      2500, // Very high stock
      'falling' // Sales declining
    );

    // Should recommend price drop or discount increase
    expect(
      recommendation.price < 1290 || recommendation.discountPct > 10
    ).toBe(true);

    // But never below min
    expect(recommendation.price).toBeGreaterThanOrEqual(minPrice);
  });

  // Test 8: Risk HIGH reduces discount
  test('high risk stock reduces discount recommendation', () => {
    const minPrice = calculateMinPrice(cogs, wbFees);
    const targetPrice = calculateTargetPrice(cogs, wbFees, 0.25);

    const recommendation = calculateRecommendation(
      1290,
      15, // Current discount 15%
      minPrice,
      targetPrice,
      'HIGH', // High risk
      200,
      'stable'
    );

    // Should reduce discount
    expect(recommendation.discountPct).toBeLessThan(15);
    expect(recommendation.discountPct).toBe(10); // -5%
  });

  // Test 9: Ads warning when ACoS high + low margin
  test('warns when high ad costs + low margin', () => {
    const guardrails = calculateGuardrails(
      1000,
      0,
      895,
      0,
      cogs,
      wbFees,
      'NONE',
      0.6 // ACoS 60%
    );

    const marginPct = calculateMarginPct(1000, cogs, wbFees);
    
    if (marginPct < 0.15) {
      expect(guardrails.warnings.some(w => w.includes('ad costs'))).toBe(true);
    }
  });

  // Test 10: Margin calculation accuracy
  test('calculates margin percentage correctly', () => {
    const price = 1290;
    
    // Fees: 1290 * 0.14 + 170 = 180.6 + 170 = 350.6
    // Profit: 1290 - 600 - 350.6 = 339.4
    // Margin: 339.4 / 1290 = 26.3%
    
    const marginPct = calculateMarginPct(price, cogs, wbFees);
    expect(marginPct).toBeCloseTo(0.263, 2);
  });

  // Test 11: Different marketplace fees affect pricing
  test('different marketplace fees produce different min prices', () => {
    const minWB = calculateMinPrice(cogs, wbFees);
    const minOzon = calculateMinPrice(cogs, ozonFees);

    // Ozon has higher fees (15% vs 12% commission)
    expect(minOzon).toBeGreaterThan(minWB);
  });

  // Test 12: Fees too high scenario
  test('handles impossible pricing when fees too high', () => {
    const impossibleFees: FeesConfig = {
      marketplace: 'wb',
      commissionPct: 95, // 95% commission!
      logisticsPerUnit: 1000,
      storagePerUnit: 100,
      paymentFeePct: 5,
    };

    const minPrice = calculateMinPrice(cogs, impossibleFees);
    
    // Should return Infinity or very high number
    expect(minPrice).toBeGreaterThan(100000);
    
    const guardrails = calculateGuardrails(
      1290,
      0,
      minPrice,
      0,
      cogs,
      impossibleFees,
      'NONE'
    );

    expect(guardrails.blocked).toBe(true);
    expect(guardrails.warnings.some(w => w.includes('fees too high'))).toBe(true);
  });
});

describe('Pricing Engine', () => {
  // Test 13: Engine builds complete pricing rows
  test('builds complete pricing row with multiple marketplaces', () => {
    const prices: PriceState[] = [
      {
        sku: 'TEST-001',
        marketplace: 'wb',
        price: 1290,
        discountPct: 10,
        updatedAt: new Date().toISOString(),
      },
      {
        sku: 'TEST-001',
        marketplace: 'ozon',
        price: 1350,
        discountPct: 5,
        updatedAt: new Date().toISOString(),
      },
    ];

    const cogs: CogsState = {
      sku: 'TEST-001',
      cogs: 600,
      currency: 'RUB',
      updatedAt: new Date().toISOString(),
    };

    const fees: FeesConfig[] = [
      {
        marketplace: 'wb',
        commissionPct: 12,
        logisticsPerUnit: 150,
        storagePerUnit: 20,
        paymentFeePct: 2,
      },
      {
        marketplace: 'ozon',
        commissionPct: 15,
        logisticsPerUnit: 180,
        storagePerUnit: 25,
        paymentFeePct: 2.5,
      },
    ];

    const orders = [
      { date: '2024-02-01', sku: 'TEST-001', qty: 10 },
      { date: '2024-02-02', sku: 'TEST-001', qty: 12 },
      { date: '2024-02-03', sku: 'TEST-001', qty: 11 },
    ];

    const stocks = [
      { sku: 'TEST-001', onHand: 150, inbound: 0 },
    ];

    const row = buildPricingRow('TEST-001', prices, cogs, fees, orders, stocks, []);

    expect(row).not.toBeNull();
    expect(row!.sku).toBe('TEST-001');
    expect(row!.marketplaces).toHaveLength(2);
    expect(row!.marketplaces[0].marketplace).toBe('wb');
    expect(row!.marketplaces[1].marketplace).toBe('ozon');
    expect(row!.stock.availableUnits).toBe(150);
    expect(row!.forecast.daily).toBeGreaterThan(0);
  });

  // Test 14: Dashboard summary calculations
  test('calculates dashboard summary correctly', () => {
    const prices: PriceState[] = [
      { sku: 'SKU-1', marketplace: 'wb', price: 800, discountPct: 10, updatedAt: '' }, // Below min
      { sku: 'SKU-2', marketplace: 'wb', price: 1290, discountPct: 10, updatedAt: '' }, // OK
      { sku: 'SKU-3', marketplace: 'wb', price: 950, discountPct: 10, updatedAt: '' }, // Low margin
    ];

    const cogs: CogsState[] = [
      { sku: 'SKU-1', cogs: 600, currency: 'RUB', updatedAt: '' },
      { sku: 'SKU-2', cogs: 600, currency: 'RUB', updatedAt: '' },
      { sku: 'SKU-3', cogs: 600, currency: 'RUB', updatedAt: '' },
    ];

    const fees: FeesConfig[] = [{
      marketplace: 'wb',
      commissionPct: 12,
      logisticsPerUnit: 150,
      storagePerUnit: 20,
      paymentFeePct: 2,
    }];

    const orders = [
      { date: '2024-02-01', sku: 'SKU-1', qty: 30 },
      { date: '2024-02-01', sku: 'SKU-2', qty: 25 },
      { date: '2024-02-01', sku: 'SKU-3', qty: 15 },
    ];

    const stocks = [
      { sku: 'SKU-1', onHand: 100, inbound: 0 }, // High risk
      { sku: 'SKU-2', onHand: 500, inbound: 0 }, // OK
      { sku: 'SKU-3', onHand: 300, inbound: 0 }, // OK
    ];

    const dashboard = buildPricingDashboard(prices, cogs, fees, orders, stocks, [], 'demo');

    expect(dashboard.summary.totalSkus).toBe(3);
    expect(dashboard.summary.blockedCount).toBeGreaterThan(0); // SKU-1 blocked
    expect(dashboard.summary.lowMarginCount).toBeGreaterThan(0);
    expect(dashboard.mode).toBe('demo');
    expect(dashboard.warnings.length).toBeGreaterThan(0);
  });
});
