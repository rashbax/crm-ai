/**
 * Marketplace Types and Schemas
 * Defines structure for marketplace definitions
 */

export interface FieldSchema {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  required: boolean;
  minLength?: number;
  pattern?: string;
  helpText?: string;
}

export interface Capabilities {
  orders: boolean;
  stocks: boolean;
  ads: boolean;
  prices: boolean;
}

export interface MarketplaceDefinition {
  id: string;
  title: string;
  description: string;
  logoText: string;
  docsUrl?: string;
  credentialSchema: FieldSchema[];
  capabilities: Capabilities;
  connectorId: string;
  hints?: string[];
}

/**
 * Dynamic connection storage format
 */
export interface ConnectionData {
  enabled: boolean;
  creds: Record<string, any>;
  enabledData: Capabilities;
  updatedAt: string;
}

export interface ConnectionsStore {
  connections: Record<string, ConnectionData>;
}

/**
 * Dynamic status storage format
 */
export interface StatusData {
  connected: boolean;
  lastTestAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  accountLabel?: string;
}

export interface StatusStore {
  status: Record<string, StatusData>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}
