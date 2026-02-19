/**
 * Pricing Engine - Demo Data
 * Used when canonical data files are missing
 */

import type { PriceState, CogsState, FeesConfig } from "./types";

export const demoPrices: PriceState[] = [
  { sku: "RJ-001-BLK-M", marketplace: "wb", price: 1290, discountPct: 10, updatedAt: new Date().toISOString() },
  { sku: "RJ-001-BLK-M", marketplace: "ozon", price: 1350, discountPct: 5, updatedAt: new Date().toISOString() },
  { sku: "RJ-002-WHT-L", marketplace: "wb", price: 2490, discountPct: 15, updatedAt: new Date().toISOString() },
  { sku: "RJ-002-WHT-L", marketplace: "ozon", price: 2590, discountPct: 10, updatedAt: new Date().toISOString() },
  { sku: "RJ-003-GRY-M", marketplace: "wb", price: 1890, discountPct: 0, updatedAt: new Date().toISOString() },
  { sku: "RJ-003-GRY-M", marketplace: "ozon", price: 1990, discountPct: 5, updatedAt: new Date().toISOString() },
  { sku: "RJ-004-BLK-OS", marketplace: "wb", price: 3200, discountPct: 20, updatedAt: new Date().toISOString() },
  { sku: "RJ-004-BLK-OS", marketplace: "ozon", price: 3400, discountPct: 15, updatedAt: new Date().toISOString() },
  { sku: "RJ-005-WHT-42", marketplace: "wb", price: 2890, discountPct: 5, updatedAt: new Date().toISOString() },
  { sku: "RJ-005-WHT-42", marketplace: "ozon", price: 2990, discountPct: 10, updatedAt: new Date().toISOString() },
];

export const demoCogs: CogsState[] = [
  { sku: "RJ-001-BLK-M", cogs: 600, currency: "RUB", updatedAt: new Date().toISOString() },
  { sku: "RJ-002-WHT-L", cogs: 1200, currency: "RUB", updatedAt: new Date().toISOString() },
  { sku: "RJ-003-GRY-M", cogs: 900, currency: "RUB", updatedAt: new Date().toISOString() },
  { sku: "RJ-004-BLK-OS", cogs: 1500, currency: "RUB", updatedAt: new Date().toISOString() },
  { sku: "RJ-005-WHT-42", cogs: 1300, currency: "RUB", updatedAt: new Date().toISOString() },
];

export const demoFees: FeesConfig[] = [
  {
    marketplace: "wb",
    commissionPct: 12,
    logisticsPerUnit: 150,
    storagePerUnit: 20,
    paymentFeePct: 2,
  },
  {
    marketplace: "ozon",
    commissionPct: 15,
    logisticsPerUnit: 180,
    storagePerUnit: 25,
    paymentFeePct: 2.5,
  },
  {
    marketplace: "uzum",
    commissionPct: 10,
    logisticsPerUnit: 100,
    storagePerUnit: 15,
    paymentFeePct: 1.5,
  },
  {
    marketplace: "ym",
    commissionPct: 13,
    logisticsPerUnit: 160,
    storagePerUnit: 22,
    paymentFeePct: 2,
  },
];
