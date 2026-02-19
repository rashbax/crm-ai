/**
 * Integration Demo Data
 * Used when in demo mode or when credentials are missing
 */

import type { OrderEvent, StockState, AdsDaily, PriceState } from "@/src/pricing/types";

export const demoOrders: OrderEvent[] = [
  { date: "2024-02-07", sku: "RJ-001-BLK-M", qty: 5, revenue: 6450, price: 1290, marketplace: "wb" },
  { date: "2024-02-07", sku: "RJ-002-WHT-L", qty: 3, revenue: 7470, price: 2490, marketplace: "ozon" },
  { date: "2024-02-06", sku: "RJ-001-BLK-M", qty: 8, revenue: 10320, price: 1290, marketplace: "wb" },
  { date: "2024-02-06", sku: "RJ-003-GRY-M", qty: 4, revenue: 7560, price: 1890, marketplace: "uzum" },
  { date: "2024-02-05", sku: "RJ-004-BLK-OS", qty: 2, revenue: 6400, price: 3200, marketplace: "ym" },
];

export const demoStocks: StockState[] = [
  { sku: "RJ-001-BLK-M", onHand: 150, inbound: 0, updatedAt: new Date().toISOString(), marketplace: "wb" },
  { sku: "RJ-002-WHT-L", onHand: 350, inbound: 100, updatedAt: new Date().toISOString(), marketplace: "ozon" },
  { sku: "RJ-003-GRY-M", onHand: 750, inbound: 0, updatedAt: new Date().toISOString(), marketplace: "uzum" },
  { sku: "RJ-004-BLK-OS", onHand: 1200, inbound: 200, updatedAt: new Date().toISOString(), marketplace: "ym" },
  { sku: "RJ-005-WHT-42", onHand: 280, inbound: 0, updatedAt: new Date().toISOString(), marketplace: "wb" },
];

export const demoAds: AdsDaily[] = [
  {
    date: "2024-02-07",
    sku: "RJ-001-BLK-M",
    spend: 500,
    impressions: 12500,
    clicks: 625,
    ordersFromAds: 10,
    revenueFromAds: 12900,
    marketplace: "wb",
  },
  {
    date: "2024-02-07",
    sku: "RJ-002-WHT-L",
    spend: 600,
    impressions: 15000,
    clicks: 750,
    ordersFromAds: 12,
    revenueFromAds: 29880,
    marketplace: "ozon",
  },
];

export const demoPrices: PriceState[] = [
  { sku: "RJ-001-BLK-M", marketplace: "wb", price: 1290, discountPct: 10, updatedAt: new Date().toISOString() },
  { sku: "RJ-001-BLK-M", marketplace: "ozon", price: 1350, discountPct: 5, updatedAt: new Date().toISOString() },
  { sku: "RJ-002-WHT-L", marketplace: "wb", price: 2490, discountPct: 15, updatedAt: new Date().toISOString() },
  { sku: "RJ-002-WHT-L", marketplace: "ozon", price: 2590, discountPct: 10, updatedAt: new Date().toISOString() },
  { sku: "RJ-003-GRY-M", marketplace: "uzum", price: 1890, discountPct: 0, updatedAt: new Date().toISOString() },
];
