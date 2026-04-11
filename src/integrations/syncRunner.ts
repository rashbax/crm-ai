/**
 * Sync Runner
 * Synchronizes data from marketplaces to canonical JSON files
 */

import path from "path";
import type { EnabledData } from "@/src/connectors/types";
import type { OrderEvent, StockState, AdsDaily, PriceState } from "@/src/pricing/types";
import { getConnector } from "@/src/connectors";
import { resolveOzonProductIdentities } from "@/src/connectors/ozon";
import { readJsonFile, writeJsonFile, withLock, getConnections, updateConnection } from "./storage";
import { decryptCredentials } from "@/lib/encryption";
import type { Connection } from "./types";
import { getCredentialsForDataType, getEffectiveEnabledData } from "./capabilities";
import { demoOrders, demoStocks, demoAds, demoPrices } from "./demoData";

const CONNECTIONS_FILE = path.join(process.cwd(), "data", "secure", "connections.json");
const ORDERS_FILE = path.join(process.cwd(), "data", "canonical", "orders.json");
const STOCKS_FILE = path.join(process.cwd(), "data", "canonical", "stocks.json");
const ADS_FILE = path.join(process.cwd(), "data", "canonical", "ads.json");
const PRICES_FILE = path.join(process.cwd(), "data", "canonical", "prices.json");

interface SyncResult {
  connectionId?: string;
  marketplace: string;
  ok: boolean;
  lastSyncAt?: string;
  error?: string;
  warnings: string[];
}

async function persistSyncState(
  connectionId: string,
  updates: { lastSyncAt?: string; lastError?: string | null }
): Promise<void> {
  await updateConnection(CONNECTIONS_FILE, connectionId, {
    ...(updates.lastSyncAt ? { lastSyncAt: updates.lastSyncAt } : {}),
    lastError: updates.lastError ?? undefined,
  });
}

function resolveCreds(raw: Record<string, string> | string | undefined): Record<string, string> | null {
  if (!raw) return null;
  if (typeof raw === "string") return decryptCredentials(raw);
  return raw;
}

/**
 * Merge new data into existing array, replacing entries with same marketplace
 */
function mergeByMarketplace<T extends { marketplace?: string; connectionId?: string }>(
  existing: T[],
  newData: T[],
  marketplaceId: string,
  connectionId: string,
  sortKey: (item: T) => string
): T[] {
  // Remove existing entries for this connection (fallback: same marketplace for old rows).
  const filtered = existing.filter((item) => {
    if (item.connectionId) return item.connectionId !== connectionId;
    return item.marketplace !== marketplaceId;
  });

  // Add new data
  const merged = [...filtered, ...newData];

  // Sort stably by sort key
  merged.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  return merged;
}

/**
 * Sync single marketplace
 */
export async function syncMarketplace(
  marketplaceId: string,
  enabledData: EnabledData,
  connectionId?: string
): Promise<SyncResult> {
  const warnings: string[] = [];

  try {
    // Load connection data (new architecture: connections array)
    const allConnections = await getConnections(CONNECTIONS_FILE);
    const connection = allConnections.find((c: any) => {
      if (!c?.enabled || c?.marketplaceId !== marketplaceId) return false;
      if (!connectionId) return true;
      return c.id === connectionId;
    }) as Connection | undefined;

    if (!connection || !connection.enabled) {
      return {
        marketplace: marketplaceId,
        ok: false,
        error: "Marketplace not connected",
        warnings,
      };
    }

    // Get connector
    const connector = getConnector(marketplaceId);
    if (!connector) {
      return {
        marketplace: marketplaceId,
        ok: false,
        error: "Connector not found",
        warnings,
      };
    }

    const isDryRun = process.env.DRY_RUN === "1";
    const effectiveEnabledData = getEffectiveEnabledData(connection);

    // Use demo data in dry run mode
    if (isDryRun) {
      warnings.push("Running in DEMO mode - using demo data");

      if (enabledData.orders && effectiveEnabledData.orders) {
        const demoOrdersForMarket = demoOrders.filter((o) => o.marketplace === marketplaceId);
        await withLock(ORDERS_FILE + ".lock", async () => {
          const existing = await readJsonFile<OrderEvent[]>(ORDERS_FILE, []);
          const merged = mergeByMarketplace(
            existing,
            demoOrdersForMarket,
            marketplaceId,
            connection.id,
            (o) => `${o.sku}-${o.date}`
          );
          await writeJsonFile(ORDERS_FILE, merged);
        });
      }

      if (enabledData.stocks && effectiveEnabledData.stocks) {
        const demoStocksForMarket = demoStocks.filter((s) => s.marketplace === marketplaceId);
        await withLock(STOCKS_FILE + ".lock", async () => {
          const existing = await readJsonFile<StockState[]>(STOCKS_FILE, []);
          const merged = mergeByMarketplace(
            existing,
            demoStocksForMarket,
            marketplaceId,
            connection.id,
            (s) => s.sku
          );
          await writeJsonFile(STOCKS_FILE, merged);
        });
      }

      if (enabledData.ads && effectiveEnabledData.ads) {
        const demoAdsForMarket = demoAds.filter((a) => a.marketplace === marketplaceId);
        await withLock(ADS_FILE + ".lock", async () => {
          const existing = await readJsonFile<AdsDaily[]>(ADS_FILE, []);
          const merged = mergeByMarketplace(
            existing,
            demoAdsForMarket,
            marketplaceId,
            connection.id,
            (a) => `${a.sku}-${a.date}`
          );
          await writeJsonFile(ADS_FILE, merged);
        });
      }

      if (enabledData.prices && effectiveEnabledData.prices) {
        const demoPricesForMarket = demoPrices.filter((p) => p.marketplace === marketplaceId);
        await withLock(PRICES_FILE + ".lock", async () => {
          const existing = await readJsonFile<PriceState[]>(PRICES_FILE, []);
          const merged = mergeByMarketplace(
            existing,
            demoPricesForMarket,
            marketplaceId,
            connection.id,
            (p) => `${p.sku}-${p.marketplace}`
          );
          await writeJsonFile(PRICES_FILE, merged);
        });
      }

      const lastSyncAt = new Date().toISOString();
      await persistSyncState(connection.id, { lastSyncAt, lastError: null });

      return {
        marketplace: marketplaceId,
        ok: true,
        lastSyncAt,
        warnings,
      };
    }

    // Real API sync
    if (enabledData.orders) {
      try {
        const marketplaceCreds = resolveCreds(getCredentialsForDataType(connection, "orders"));
        if (!marketplaceCreds) {
          warnings.push("Orders sync skipped: no connected capability credentials");
        } else {
        const now = new Date();
        // 30-day lookback on subsequent syncs, 90-day on first sync — avoids re-fetching full history every time
        const existingOrders = await readJsonFile<OrderEvent[]>(ORDERS_FILE, []);
        const hasExistingOrders = existingOrders.some(
          (o: any) => o.connectionId === connection.id || (!o.connectionId && o.marketplace === marketplaceId)
        );
        // 60-day window on subsequent syncs covers both the current 28-day period
        // and the previous 28-day comparison window (28+28=56 days needed).
        // 90-day on first sync to build full history.
        const lookbackDays = hasExistingOrders ? 60 : 90;
        const start = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
        const range = {
          startDate: start.toISOString().slice(0, 10),
          endDate: now.toISOString().slice(0, 10),
        };
        const orders = await connector.fetchOrders(marketplaceCreds, range);
        if (orders.length === 0) {
          warnings.push("No orders returned from API");
        }

        await withLock(ORDERS_FILE + ".lock", async () => {
          const existing = await readJsonFile<OrderEvent[]>(ORDERS_FILE, []);
          // Range-aware merge: only replace orders within the fetched window;
          // preserve older history so analytics period comparisons always have data.
          const filtered = existing.filter((item: any) => {
            const itemDate = (item.date || "").slice(0, 10);
            if (item.connectionId) {
              if (item.connectionId !== connection.id) return true;
              return itemDate < range.startDate;
            }
            if (item.marketplace !== marketplaceId) return true;
            return itemDate < range.startDate;
          });
          const merged = [
            ...filtered,
            ...orders.map((o) => ({ ...o, marketplace: marketplaceId, connectionId: connection.id })),
          ];
          merged.sort((a: any, b: any) =>
            (`${a.sku}-${a.date}`).localeCompare(`${b.sku}-${b.date}`)
          );
          await writeJsonFile(ORDERS_FILE, merged);
        });
        }
      } catch (error) {
        warnings.push(`Orders sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    if (enabledData.stocks) {
      try {
        const marketplaceCreds = resolveCreds(getCredentialsForDataType(connection, "stocks"));
        if (!marketplaceCreds) {
          warnings.push("Stocks sync skipped: no connected capability credentials");
        } else {
        const stocks = await connector.fetchStocks(marketplaceCreds);
        if (stocks.length === 0) {
          warnings.push("No stocks returned from API");
        }

        await withLock(STOCKS_FILE + ".lock", async () => {
          const existing = await readJsonFile<StockState[]>(STOCKS_FILE, []);
          const merged = mergeByMarketplace(
            existing,
            stocks.map((s) => ({
              ...s,
              marketplace: marketplaceId,
              connectionId: connection.id,
            })),
            marketplaceId,
            connection.id,
            (s) => s.sku
          );
          await writeJsonFile(STOCKS_FILE, merged);
        });
        }
      } catch (error) {
        warnings.push(`Stocks sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    if (enabledData.ads) {
      try {
        const marketplaceCreds = resolveCreds(getCredentialsForDataType(connection, "ads"));
        if (!marketplaceCreds) {
          warnings.push("Ads sync skipped: no connected ads capability credentials");
        } else {
        let ads = await connector.fetchAds(marketplaceCreds);
        if (ads.length === 0) {
          warnings.push("No ads data returned from API — keeping existing data");
        } else {
          // For Ozon: map numeric product SKUs to seller's offer_id (article)
          // so ads data can be joined reliably while keeping the raw numeric article for display
          if (marketplaceId === "ozon") {
            const coreCreds = resolveCreds(getCredentialsForDataType(connection, "orders"));
            if (coreCreds) {
              try {
                const uniqueSkus = Array.from(new Set(ads.map((a) => a.sku).filter(Boolean)));
                const {
                  offerIdByIdentifier,
                  titleByOfferId,
                  preferredDisplaySkuByOfferId,
                  unresolvedIdentifiers,
                } = await resolveOzonProductIdentities(
                  coreCreds as any,
                  uniqueSkus
                );

                ads = ads.map((a) => {
                  const rawSku = String(a.sku || "").trim();
                  const resolvedSku = offerIdByIdentifier.get(rawSku) || rawSku;
                  const preferredDisplaySku =
                    preferredDisplaySkuByOfferId.get(resolvedSku) ||
                    (/^\d{6,}$/.test(rawSku) ? rawSku : "");
                  return {
                    ...a,
                    sku: preferredDisplaySku || rawSku,
                    sourceSku: rawSku,
                    resolvedSku,
                    title: a.title || titleByOfferId.get(resolvedSku),
                  };
                });

                if (unresolvedIdentifiers.length > 0) {
                  warnings.push(`Ozon ads identity mapping unresolved for ${unresolvedIdentifiers.length} identifier(s)`);
                }
              } catch (mapError) {
                warnings.push(`Ads identity mapping partial: ${mapError instanceof Error ? mapError.message : "Unknown"}`);
              }
            }
          }

          await withLock(ADS_FILE + ".lock", async () => {
            const existing = await readJsonFile<AdsDaily[]>(ADS_FILE, []);
            const merged = mergeByMarketplace(
              existing,
              ads.map((a) => ({
                ...a,
                marketplace: marketplaceId,
                connectionId: connection.id,
              })),
              marketplaceId,
              connection.id,
              (a) => `${a.sku}-${a.date}-${(a as any).campaignId ?? ""}`
            );
            await writeJsonFile(ADS_FILE, merged);
          });
        }
        }
      } catch (error) {
        warnings.push(`Ads sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    if (enabledData.prices) {
      try {
        const marketplaceCreds = resolveCreds(getCredentialsForDataType(connection, "prices"));
        if (!marketplaceCreds) {
          warnings.push("Prices sync skipped: no connected capability credentials");
        } else {
        const prices = await connector.fetchPrices(marketplaceCreds);
        if (prices.length === 0) {
          warnings.push("No prices returned from API");
        }

        await withLock(PRICES_FILE + ".lock", async () => {
          const existing = await readJsonFile<PriceState[]>(PRICES_FILE, []);
          const merged = mergeByMarketplace(
            existing,
            prices.map((p) => ({ ...p, connectionId: connection.id })),
            marketplaceId,
            connection.id,
            (p) => `${p.sku}-${p.marketplace}`
          );
          await writeJsonFile(PRICES_FILE, merged);
        });
        }
      } catch (error) {
        warnings.push(`Prices sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    const lastSyncAt = new Date().toISOString();
    await persistSyncState(connection.id, { lastSyncAt, lastError: null });

    return {
      connectionId: connection.id,
      marketplace: marketplaceId,
      ok: true,
      lastSyncAt,
      warnings,
    };
  } catch (error) {
    if (connectionId) {
      await persistSyncState(connectionId, {
        lastError: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return {
      marketplace: marketplaceId,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
      warnings,
    };
  }
}

/**
 * Sync all enabled marketplaces
 */
export async function syncAll(options?: { excludeOzonAds?: boolean }): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const connections = await getConnections(CONNECTIONS_FILE);

  for (const connection of connections as Connection[]) {
    if (connection.enabled) {
      let effectiveData = getEffectiveEnabledData(connection) || {
        orders: true,
        stocks: true,
        ads: true,
        prices: true,
      };
      if (options?.excludeOzonAds && connection.marketplaceId === "ozon") {
        effectiveData = { ...effectiveData, ads: false };
      }
      const result = await syncMarketplace(
        connection.marketplaceId,
        effectiveData,
        connection.id
      );
      results.push(result);
    }
  }

  return results;
}
