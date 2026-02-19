/**
 * Pricing Engine - Calculator
 * Core pricing formulas and guardrails
 */

import type {
  FeesConfig,
  PriceGuardrails,
  RiskLevel,
} from "./types";

/**
 * Calculate fees for a given price
 */
export function calculateFees(
  price: number,
  fees: FeesConfig
): number {
  const commissionFee = price * (fees.commissionPct / 100);
  const paymentFee = price * ((fees.paymentFeePct || 0) / 100);
  const logistics = fees.logisticsPerUnit;
  const storage = fees.storagePerUnit || 0;

  return commissionFee + paymentFee + logistics + storage;
}

/**
 * Calculate net profit per unit
 */
export function calculateNetProfit(
  price: number,
  cogs: number,
  fees: FeesConfig
): number {
  const feesMoney = calculateFees(price, fees);
  return price - cogs - feesMoney;
}

/**
 * Calculate margin percentage
 */
export function calculateMarginPct(
  price: number,
  cogs: number,
  fees: FeesConfig
): number {
  if (price <= 0) return 0;
  const netProfit = calculateNetProfit(price, cogs, fees);
  return netProfit / price;
}

/**
 * Calculate break-even minimum price
 * Solve for price where netProfit = 0
 */
export function calculateMinPrice(
  cogs: number,
  fees: FeesConfig
): number {
  const fixedFees = fees.logisticsPerUnit + (fees.storagePerUnit || 0);
  const variableFeesPct =
    (fees.commissionPct / 100) + ((fees.paymentFeePct || 0) / 100);

  // Prevent division by zero or negative
  if (variableFeesPct >= 1) {
    return Infinity; // Fees too high, impossible to break even
  }

  const minPrice = (cogs + fixedFees) / (1 - variableFeesPct);
  return Math.max(0, minPrice);
}

/**
 * Calculate target price for a given target margin
 */
export function calculateTargetPrice(
  cogs: number,
  fees: FeesConfig,
  targetMarginPct: number
): number {
  const fixedFees = fees.logisticsPerUnit + (fees.storagePerUnit || 0);
  const variableFeesPct =
    (fees.commissionPct / 100) + ((fees.paymentFeePct || 0) / 100);

  const denominator = 1 - variableFeesPct - targetMarginPct;

  // Prevent division by zero or negative
  if (denominator <= 0) {
    return Infinity; // Target margin too high
  }

  const targetPrice = (cogs + fixedFees) / denominator;
  return Math.max(0, targetPrice);
}

/**
 * Determine target margin based on stock risk and availability
 */
export function determineTargetMargin(
  riskLevel: RiskLevel,
  availableUnits: number,
  daysOfCover: number
): number {
  // High risk: protect margin (slower sales)
  if (riskLevel === "HIGH" || riskLevel === "CRITICAL") {
    return 0.25; // 25%
  }

  // Very high stock: move inventory
  if (availableUnits > 2000 || daysOfCover > 30) {
    return 0.15; // 15%
  }

  // Default target margin
  return 0.20; // 20%
}

/**
 * Calculate recommended price and discount
 */
export function calculateRecommendation(
  currentPrice: number,
  currentDiscount: number,
  minPrice: number,
  targetPrice: number,
  riskLevel: RiskLevel,
  availableUnits: number,
  salesTrend: "falling" | "stable" | "rising"
): { price: number; discountPct: number } {
  // If current price below min, must raise
  if (currentPrice < minPrice) {
    return {
      price: Math.max(targetPrice, minPrice),
      discountPct: 0,
    };
  }

  // High risk stock: reduce discount, raise or maintain price
  if (riskLevel === "HIGH" || riskLevel === "CRITICAL") {
    return {
      price: Math.max(currentPrice, targetPrice),
      discountPct: Math.max(0, currentDiscount - 5),
    };
  }

  // Very high stock + falling sales: test price drop or increase discount
  if ((availableUnits > 2000 || availableUnits > 1000) && salesTrend === "falling") {
    const candidatePrice = currentPrice * 0.97; // -3%
    const recommendedPrice = Math.max(candidatePrice, minPrice);
    const recommendedDiscount = Math.min(20, currentDiscount + 5);

    return {
      price: recommendedPrice,
      discountPct: recommendedDiscount,
    };
  }

  // Stable: move toward target price gradually (max 5% change)
  const priceDiff = targetPrice - currentPrice;
  const maxChange = currentPrice * 0.05;
  let recommendedPrice = currentPrice;

  if (Math.abs(priceDiff) > 1) {
    if (priceDiff > 0) {
      recommendedPrice = Math.min(currentPrice + maxChange, targetPrice);
    } else {
      recommendedPrice = Math.max(currentPrice - maxChange, targetPrice);
    }
  }

  return {
    price: Math.round(recommendedPrice),
    discountPct: currentDiscount,
  };
}

/**
 * Generate guardrails and warnings
 */
export function calculateGuardrails(
  currentPrice: number,
  currentDiscount: number,
  recommendedPrice: number,
  recommendedDiscount: number,
  cogs: number,
  fees: FeesConfig,
  riskLevel: RiskLevel,
  acos?: number
): PriceGuardrails {
  const minPrice = calculateMinPrice(cogs, fees);
  const targetMarginPct = determineTargetMargin(riskLevel, 0, 0);
  const targetPrice = calculateTargetPrice(cogs, fees, targetMarginPct);

  const currentMarginPerUnit = calculateNetProfit(currentPrice, cogs, fees);
  const currentMarginPct = calculateMarginPct(currentPrice, cogs, fees);
  const recommendedMarginPct = calculateMarginPct(recommendedPrice, cogs, fees);

  const warnings: string[] = [];
  let blocked = false;

  // Check if price below minimum
  if (currentPrice < minPrice) {
    warnings.push(`Current price below break-even (₽${minPrice.toFixed(0)})`);
    blocked = true;
  }

  if (recommendedPrice < minPrice) {
    warnings.push(`Recommended price below break-even`);
    blocked = true;
  }

  // Check low margin
  if (currentMarginPct < 0.05) {
    warnings.push("Margin dangerously low (<5%)");
    blocked = true;
  }

  // Check high discount
  if (currentDiscount > 30) {
    warnings.push("Discount very high (>30%)");
  }

  // Check high risk + increasing discount
  if ((riskLevel === "HIGH" || riskLevel === "CRITICAL") && 
      recommendedDiscount > currentDiscount) {
    warnings.push("High stock risk: avoid increasing discount");
  }

  // Check bad ads performance + low margin
  if (acos !== undefined && acos > 0.5 && currentMarginPct < 0.15) {
    warnings.push("High ad costs (ACoS>50%) + low margin");
  }

  // Check if fees too high
  if (minPrice === Infinity) {
    warnings.push("Marketplace fees too high - cannot break even");
    blocked = true;
  }

  return {
    minPrice,
    targetPrice,
    marginPerUnit: currentMarginPerUnit,
    marginPct: currentMarginPct,
    recommendedMarginPct,
    warnings,
    blocked,
  };
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Validate price change
 */
export function validatePriceChange(
  newPrice: number,
  minPrice: number,
  cogs: number,
  fees: FeesConfig
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let valid = true;

  if (newPrice < minPrice) {
    warnings.push(`Price below break-even (min: ₽${minPrice.toFixed(0)})`);
    valid = false;
  }

  if (newPrice < cogs) {
    warnings.push("Price below cost");
    valid = false;
  }

  const margin = calculateMarginPct(newPrice, cogs, fees);
  if (margin < 0.05) {
    warnings.push("Margin too low (<5%)");
  }

  return { valid, warnings };
}
