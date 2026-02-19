/**
 * Enabled Connections - Source of Truth
 * All pages filter data by enabled connections
 */

import path from "path";
import { readJsonFile } from "./storage";
import type { Connection, ConnectionsStore, EnabledConnection } from "./types";

const CONNECTIONS_FILE = path.join(process.cwd(), "data", "secure", "connections.json");

/**
 * Get all enabled connections
 * This is the single source of truth for what data should appear across all pages
 */
export async function getEnabledConnections(): Promise<EnabledConnection[]> {
  const store = await readJsonFile<ConnectionsStore>(CONNECTIONS_FILE, { connections: [] });
  
  return store.connections
    .filter((conn) => conn.enabled)
    .map((conn) => ({
      id: conn.id,
      marketplaceId: conn.marketplaceId,
      name: conn.name,
    }));
}

/**
 * Get all connections (enabled and disabled)
 */
export async function getAllConnections(): Promise<Connection[]> {
  const store = await readJsonFile<ConnectionsStore>(CONNECTIONS_FILE, { connections: [] });
  return store.connections;
}

/**
 * Filter data items by enabled connections
 * Removes items that don't belong to any enabled connection
 * 
 * @param items Array of canonical data items (orders, stocks, ads, prices, etc.)
 * @param enabledConnections List of enabled connections
 * @returns Filtered items
 */
export function filterByEnabledConnections<
  T extends { connectionId?: string; marketplace?: string }
>(items: T[], enabledConnections: EnabledConnection[]): T[] {
  if (enabledConnections.length === 0) {
    return []; // No enabled connections = no data
  }

  // Create sets for fast lookup
  const enabledConnectionIds = new Set(enabledConnections.map((c) => c.id));
  const enabledMarketplaceIds = new Set(enabledConnections.map((c) => c.marketplaceId));

  return items.filter((item) => {
    // Prefer connectionId matching (more specific)
    if (item.connectionId) {
      return enabledConnectionIds.has(item.connectionId);
    }

    // Fallback to marketplace matching (for legacy/demo data)
    if (item.marketplace) {
      return enabledMarketplaceIds.has(item.marketplace);
    }

    // If no connection or marketplace info, exclude (safer)
    return false;
  });
}

/**
 * Check if any connections are enabled
 */
export async function hasEnabledConnections(): Promise<boolean> {
  const enabled = await getEnabledConnections();
  return enabled.length > 0;
}
