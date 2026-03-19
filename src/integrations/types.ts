/**
 * Integrations Types - Connection-based Architecture
 * Professional CRM pattern: Catalog (developer) + Connections (user)
 */

/**
 * User-managed Connection
 * Represents a single connected marketplace instance (e.g., "WB Main Shop")
 */
export interface Connection {
  id: string; // UUID
  marketplaceId: string; // References MarketplaceDefinition.id from catalog
  name: string; // User-friendly name (e.g., "WB Main Shop", "Ozon Secondary")
  enabled: boolean; // If false, stopped sync and hidden from other pages
  enabledData: {
    orders: boolean;
    stocks: boolean;
    ads: boolean;
    prices: boolean;
  };
  creds: Record<string, string> | string; // Stored credentials (encrypted in production)
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  lastTestAt?: string; // Last test connection attempt
  lastSyncAt?: string; // Last successful sync
  lastError?: string; // Last error message
  accountLabel?: string; // From connector test (e.g., "WB Account 12345")
  capabilities?: Partial<Record<ConnectionCapabilityKey, ConnectionCapability>>;
}

export type ConnectionCapabilityKey = "core" | "ads" | "premium";

export interface ConnectionCapability {
  enabled: boolean;
  creds?: Record<string, string> | string;
  enabledData?: Partial<{
    orders: boolean;
    stocks: boolean;
    ads: boolean;
    prices: boolean;
  }>;
  lastTestAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  accountLabel?: string;
}

/**
 * Connections storage format
 */
export interface ConnectionsStore {
  connections: Connection[];
}

/**
 * Enabled connection info (lightweight)
 * Used for filtering data across all pages
 */
export interface EnabledConnection {
  id: string; // Connection ID
  marketplaceId: string;
  name: string;
  enabledData?: {
    orders: boolean;
    stocks: boolean;
    ads: boolean;
    prices: boolean;
  };
  capabilities?: Partial<Record<ConnectionCapabilityKey, { enabled: boolean }>>;
}

/**
 * Connection summary for API responses
 */
export interface ConnectionSummary {
  id: string;
  marketplaceId: string;
  name: string;
  enabled: boolean;
  enabledData: {
    orders: boolean;
    stocks: boolean;
    ads: boolean;
    prices: boolean;
  };
  lastTestAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  accountLabel?: string;
  createdAt: string;
  updatedAt: string;
  capabilities?: Partial<Record<ConnectionCapabilityKey, Omit<ConnectionCapability, "creds">>>;
}
