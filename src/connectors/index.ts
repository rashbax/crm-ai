/**
 * Connector Plugin Loader
 * Dynamically loads marketplace connectors
 */

import type { MarketplaceConnector } from "./types";
import { wbConnector } from "./wb";
import { ozonConnector } from "./ozon";
import { uzumConnector } from "./uzum";
import { ymConnector } from "./ym";

// Connector registry
const connectors: Record<string, MarketplaceConnector> = {
  wb: wbConnector,
  ozon: ozonConnector,
  uzum: uzumConnector,
  ym: ymConnector,
};

/**
 * Get connector by ID
 * @param id Connector ID (usually same as marketplace ID)
 * @returns Connector instance or null if not found
 */
export function getConnector(id: string): MarketplaceConnector | null {
  return connectors[id] || null;
}

/**
 * Check if connector exists
 */
export function hasConnector(id: string): boolean {
  return id in connectors;
}

/**
 * List all available connector IDs
 */
export function listConnectorIds(): string[] {
  return Object.keys(connectors);
}
