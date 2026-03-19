/**
 * Pricing Engine - Type Definitions
 * Canonical data models for marketplace-agnostic pricing
 */

export type Marketplace = "wb" | "ozon" | "uzum" | "ym";
export type Currency = "UZS" | "RUB";
export type DraftStatus = "DRAFT" | "APPROVED" | "APPLIED" | "CANCELLED";
export type RiskLevel = "NONE" | "LOW" | "MED" | "HIGH" | "CRITICAL";

export interface PriceIndexPair {
  ownPrice: number;
  marketPrice: number;
  orders?: number;
  source?: string;
}

/**
 * Normalized order event from any marketplace
 */
export interface OrderEvent {
  date: string; // YYYY-MM-DD
  sku: string;
  qty: number;
  revenue?: number;
  price?: number;
  sourceStatus?: string;
  marketplace?: string;
  connectionId?: string;
}

/**
 * Current stock state for a SKU
 */
export interface StockState {
  sku: string;
  onHand: number;
  inbound?: number;
  updatedAt: string;
  marketplace?: string;
  connectionId?: string;
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
  revenueFromAds?: number;
  impressions?: number;
  marketplace?: string;
  connectionId?: string;
}

/**
 * Current price state per SKU per marketplace
 */
export interface PriceState {
  sku: string;
  marketplace: Marketplace;
  price: number;
  discountPct?: number; // 0..100
  promoPrice?: number;
  status?: string;
  visibility?: string;
  onSale?: boolean;
  priceIndexPairs?: PriceIndexPair[];
  updatedAt: string; // ISO
  connectionId?: string; // Optional connection ID for multi-shop support
}

/**
 * Cost of goods per SKU
 */
export interface CogsState {
  sku: string;
  cogs: number; // cost per unit
  currency: Currency;
  updatedAt: string;
}

/**
 * Marketplace fees configuration
 */
export interface FeesConfig {
  marketplace: Marketplace;
  commissionPct: number; // e.g. 12 (%)
  logisticsPerUnit: number; // e.g. 8000
  storagePerUnit?: number;
  paymentFeePct?: number;
}

/**
 * Price change draft item
 */
export interface PriceDraftItem {
  sku: string;
  marketplace: Marketplace;
  newPrice?: number;
  newDiscountPct?: number;
  reason?: string;
}

/**
 * Price change draft
 */
export interface PriceDraft {
  id: string; // uuid
  createdAt: string; // ISO
  updatedAt: string; // ISO
  status: DraftStatus;
  items: PriceDraftItem[];
}

/**
 * Guardrails for a price change
 */
export interface PriceGuardrails {
  minPrice: number; // break-even (>=0 margin)
  targetPrice: number; // target margin price
  marginPerUnit: number; // on current
  marginPct: number; // on current
  recommendedMarginPct: number; // on recommended
  warnings: string[];
  blocked: boolean; // cannot apply without override
}

/**
 * Marketplace-specific pricing row
 */
export interface MarketplacePricing {
  marketplace: Marketplace;
  current: {
    price: number;
    discountPct?: number;
    promoPrice?: number;
  };
  listing?: {
    status?: string;
    visibility?: string;
    onSale?: boolean;
  };
  priceIndexPairs?: PriceIndexPair[];
  recommended: {
    price: number;
    discountPct: number;
  };
  guardrails: PriceGuardrails;
}

/**
 * Complete pricing row for a SKU
 */
export interface PricingRow {
  sku: string;
  marketplaces: MarketplacePricing[];
  stock: {
    availableUnits: number;
    riskLevel: RiskLevel;
    stockoutInDays: number | null;
  };
  forecast: {
    daily: number;
    horizonDays: number;
  };
  loss: {
    possibleLossMoney: number;
    possibleLostUnits: number;
  };
  ads?: {
    spend: number;
    roas: number;
    acos: number;
  };
  notes: string[];
}

/**
 * Dashboard summary statistics
 */
export interface PricingSummary {
  totalSkus: number;
  blockedCount: number;
  lowMarginCount: number;
  highRiskCount: number;
}

export interface PricingEmptyState {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface PricingRules {
  indexThresholds: {
    badMaxMarginPct: number;
    moderateMaxMarginPct: number;
    goodMaxMarginPct: number;
  };
  guardrails: {
    lowMarginBlockPct: number;
  };
}

/**
 * Complete pricing dashboard response
 */
export interface PricingDashboardResponse {
  mode: "live";
  warnings: string[];
  fees: FeesConfig[];
  rules: Record<Marketplace, PricingRules>;
  rows: PricingRow[];
  summary: PricingSummary | null;
  emptyState?: PricingEmptyState;
}

/**
 * Apply draft request
 */
export interface ApplyDraftRequest {
  draftId: string;
  overrideBlocked?: boolean;
}

/**
 * Planned marketplace write
 */
export interface PlannedWrite {
  sku: string;
  marketplace: Marketplace;
  oldPrice: number;
  newPrice: number;
  oldDiscount?: number;
  newDiscount?: number;
}

/**
 * Apply draft response
 */
export interface ApplyDraftResponse {
  ok: boolean;
  message?: string;
  plannedWrites?: PlannedWrite[];
  blockedItems?: PriceDraftItem[];
}
