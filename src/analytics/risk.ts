/**
 * Analytics Engine - Risk Assessment & Loss Calculation
 */

import type { Config, StockState, PriceInfo, RiskLevel } from "./types";
import { validatePositive } from "./utils";

/**
 * Result of risk and loss computation
 */
export interface RiskAndLossResult {
  availableUnits: number;
  daysOfCover: number;
  stockoutInDays: number | null;
  riskLevel: RiskLevel;
  reorderPoint: number;
  recommendedReorderQty: number;
  possibleLostUnits: number;
  possibleLossMoney: number;
  notes: string[];
}

/**
 * Compute risk level, possible loss, and reorder recommendations
 */
export function computeRiskAndLoss(
  stock: StockState,
  dailyForecast: number,
  priceInfo: PriceInfo,
  config: Config
): RiskAndLossResult {
  const notes: string[] = [];

  // Calculate available units
  const availableUnits = validatePositive(stock.onHand + (stock.inbound || 0));
  notes.push(`Available: ${stock.onHand} on hand + ${stock.inbound || 0} inbound = ${availableUnits}`);

  // Handle zero or near-zero forecast
  if (dailyForecast <= 0.01) {
    notes.push("Forecast is zero or near-zero. No risk detected.");
    return {
      availableUnits,
      daysOfCover: Infinity,
      stockoutInDays: null,
      riskLevel: "NONE",
      reorderPoint: config.safetyStockMin,
      recommendedReorderQty: 0,
      possibleLostUnits: 0,
      possibleLossMoney: 0,
      notes,
    };
  }

  // Calculate days of cover
  const daysOfCover = availableUnits / dailyForecast;
  const stockoutInDays = Math.floor(daysOfCover);
  notes.push(`Days of cover: ${daysOfCover.toFixed(1)} (forecast: ${dailyForecast.toFixed(1)} units/day)`);

  // Assess risk level
  const riskLevel = assessRiskLevel(stockoutInDays, config.leadTimeDays);
  notes.push(`Risk level: ${riskLevel} (stockout in ${stockoutInDays} days, lead time: ${config.leadTimeDays} days)`);

  // Calculate possible loss during stockout
  // lostDays = time between stockout and when reorder arrives
  const lostDays = Math.max(0, config.leadTimeDays - daysOfCover);
  const possibleLostUnits = validatePositive(lostDays * dailyForecast);

  let possibleLossMoney = 0;
  if (possibleLostUnits > 0) {
    if (config.moneyMetric === "profit" && priceInfo.profitPerUnit !== undefined) {
      // Use profit metric
      possibleLossMoney = possibleLostUnits * priceInfo.profitPerUnit;
      notes.push(
        `Possible loss: ${possibleLostUnits.toFixed(0)} units × ₽${priceInfo.profitPerUnit.toFixed(0)} profit = ₽${possibleLossMoney.toFixed(0)}`
      );
    } else {
      // Use revenue approximation
      possibleLossMoney = possibleLostUnits * priceInfo.avgPrice;
      notes.push(
        `Possible loss: ${possibleLostUnits.toFixed(0)} units × ₽${priceInfo.avgPrice.toFixed(0)} revenue = ₽${possibleLossMoney.toFixed(0)}`
      );
    }
  }

  // Calculate reorder recommendations
  const safetyStock = Math.max(config.safetyStockMin, dailyForecast * 2);
  const reorderPoint = dailyForecast * config.leadTimeDays + safetyStock;
  notes.push(`ROP: ${dailyForecast.toFixed(1)} × ${config.leadTimeDays} + ${safetyStock.toFixed(0)} = ${reorderPoint.toFixed(0)}`);

  // Calculate recommended reorder quantity
  const targetCover = config.targetCoverDays * dailyForecast;
  const recommendedReorderQty = Math.max(0, Math.ceil(targetCover - availableUnits));
  
  if (recommendedReorderQty > 0) {
    notes.push(
      `Recommended reorder: ${recommendedReorderQty} units (target ${config.targetCoverDays} days cover)`
    );
  }

  return {
    availableUnits,
    daysOfCover,
    stockoutInDays,
    riskLevel,
    reorderPoint,
    recommendedReorderQty,
    possibleLostUnits,
    possibleLossMoney: validatePositive(possibleLossMoney),
    notes,
  };
}

/**
 * Assess risk level based on stockout timing and lead time
 */
function assessRiskLevel(stockoutInDays: number, leadTimeDays: number): RiskLevel {
  if (stockoutInDays < 3) {
    return "CRITICAL"; // Stockout imminent
  }
  if (stockoutInDays < leadTimeDays) {
    return "HIGH"; // Won't arrive in time if ordered now
  }
  if (stockoutInDays < leadTimeDays + 7) {
    return "MED"; // Need to order soon
  }
  if (stockoutInDays < leadTimeDays + 14) {
    return "LOW"; // Should plan order
  }
  return "NONE"; // Plenty of time
}
