/**
 * Connectors - Type Definitions
 * Defines marketplace connector interface
 */

import type {
  OrderEvent,
  StockState,
  AdsDaily,
  PriceState,
} from "@/src/pricing/types";

export type MarketplaceId = "wb" | "ozon" | "uzum" | "ym";

/**
 * Marketplace credentials
 */
export interface WBCredentials {
  token: string;
}

export interface OzonCredentials {
  clientId: string;
  apiKey: string;
}

export interface UzumCredentials {
  token: string;
}

export interface YMCredentials {
  apiKey: string;
}

export type MarketplaceCredentials =
  | WBCredentials
  | OzonCredentials
  | UzumCredentials
  | YMCredentials;

/**
 * Test connection result
 */
export interface TestConnectionResult {
  ok: boolean;
  accountLabel?: string;
  error?: string;
  warning?: string;
}

export type ConnectionCapabilityTestKey = "core" | "ads" | "premium";

/**
 * Date range for fetching
 */
export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

/**
 * Marketplace connector interface
 */
export interface MarketplaceConnector {
  /**
   * Test connection with credentials
   */
  testConnection(creds: any): Promise<TestConnectionResult>;

  /**
   * Test a marketplace-specific capability, if supported.
   */
  testCapability?(
    capability: ConnectionCapabilityTestKey,
    creds: any
  ): Promise<TestConnectionResult>;

  /**
   * Fetch orders
   */
  fetchOrders(creds: any, range?: DateRange): Promise<OrderEvent[]>;

  /**
   * Fetch stocks
   */
  fetchStocks(creds: any): Promise<StockState[]>;

  /**
   * Fetch ads data
   */
  fetchAds(creds: any, range?: DateRange): Promise<AdsDaily[]>;

  /**
   * Fetch prices
   */
  fetchPrices(creds: any): Promise<PriceState[]>;
}

/**
 * Enabled data types
 */
export interface EnabledData {
  orders: boolean;
  stocks: boolean;
  ads: boolean;
  prices: boolean;
}

/**
 * Integration status
 */
export interface IntegrationStatus {
  marketplace: MarketplaceId;
  connected: boolean;
  lastTestAt?: string; // ISO
  lastSyncAt?: string; // ISO
  lastError?: string;
  enabledData: EnabledData;
  accountLabel?: string;
}

/**
 * Stored credentials
 */
export interface StoredCredentials {
  wb?: { enabled: boolean; token: string };
  ozon?: { enabled: boolean; clientId: string; apiKey: string };
  uzum?: { enabled: boolean; token: string };
  ym?: { enabled: boolean; apiKey: string };
}
