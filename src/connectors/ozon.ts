/**
 * Ozon Connector
 */

import path from "path";
import type {
  MarketplaceConnector,
  ConnectionCapabilityTestKey,
  TestConnectionResult,
  DateRange,
  OzonCredentials,
} from "./types";
import type { OrderEvent, StockState, AdsDaily, PriceState, PriceIndexPair, ReviewItem } from "@/src/pricing/types";
import { readJsonFile, withLock, writeJsonFile } from "@/src/integrations/storage";

const REAL_API = process.env.REAL_API === "1";
const DRY_RUN = process.env.DRY_RUN === "1";
const OZON_API_BASE = "https://api-seller.ozon.ru";
const DEFAULT_ORDERS_LOOKBACK_DAYS = 365;
const ORDERS_PAGE_LIMIT = 100;
const MAX_ORDER_PAGES = 500;
const OZON_PERFORMANCE_API_BASE = "https://api-performance.ozon.ru";
const OZON_PERFORMANCE_AUTH_URL = "https://api-performance.ozon.ru/api/client/token";
const OZON_IDENTITY_CACHE_DIR = path.join(process.cwd(), "data", "cache");
const OZON_IDENTITY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/* ── Performance API OAuth token cache ── */
interface PerformanceToken {
  accessToken: string;
  expiresAt: number; // ms timestamp
}
const performanceTokenCache = new Map<string, PerformanceToken>();

async function getPerformanceToken(clientId: string, clientSecret: string): Promise<string> {
  const cacheKey = `${clientId}:${clientSecret}`;
  const cached = performanceTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const response = await fetch(OZON_PERFORMANCE_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });

  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }

  if (!response.ok) {
    const detail = body?.error_description || body?.error || body?.message || text || `HTTP ${response.status}`;
    throw new Error(`Ozon Performance auth failed: ${detail}`);
  }

  const accessToken = body?.access_token;
  const expiresIn = body?.expires_in || 1800; // default 30 min
  if (!accessToken) {
    throw new Error("Ozon Performance auth: no access_token in response");
  }

  performanceTokenCache.set(cacheKey, {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return accessToken;
}

async function performanceGet<T>(token: string, endpoint: string): Promise<T> {
  const response = await fetch(`${OZON_PERFORMANCE_API_BASE}${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }

  if (!response.ok) {
    const detail = body?.message || body?.error || text || `HTTP ${response.status}`;
    throw new Error(`Ozon Performance GET ${endpoint}: ${detail}`);
  }
  return (body ?? {}) as T;
}

async function performancePost<T>(token: string, endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${OZON_PERFORMANCE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }

  if (!response.ok) {
    const detail = body?.message || body?.error || text || `HTTP ${response.status}`;
    throw new Error(`Ozon Performance POST ${endpoint}: ${detail}`);
  }
  return (body ?? {}) as T;
}

function assertCredentials(creds: OzonCredentials): void {
  if (!creds?.clientId || !creds?.apiKey) {
    throw new Error("Client ID and API key are required");
  }
}

function toIsoRange(range?: DateRange): { since: string; to: string } {
  const now = new Date();
  const start = range?.startDate
    ? new Date(`${range.startDate}T00:00:00.000Z`)
    : new Date(now.getTime() - DEFAULT_ORDERS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const end = range?.endDate ? new Date(`${range.endDate}T23:59:59.999Z`) : now;
  return { since: start.toISOString(), to: end.toISOString() };
}

function parseNumber(input: unknown): number {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    // Handle Russian number format: "1 870,00" → "1870.00"
    const normalized = input.replace(/\s/g, "").replace(",", ".").trim();
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

function normalizeString(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const value = input.trim();
  return value ? value : undefined;
}

function normalizeBoolean(input: unknown): boolean | undefined {
  if (typeof input === "boolean") return input;
  if (typeof input === "string") {
    const s = input.trim().toLowerCase();
    if (["true", "1", "yes", "active", "visible", "on_sale", "onsale"].includes(s)) return true;
    if (["false", "0", "no", "inactive", "hidden", "not_on_sale", "notsale"].includes(s)) return false;
  }
  return undefined;
}

function deriveOnSale(status?: string, visibility?: string): boolean | undefined {
  const s = (status || "").toLowerCase();
  const v = (visibility || "").toLowerCase();

  const visible =
    !v || v.includes("visible") || v.includes("in_sale") || v.includes("sale") || v.includes("published");
  const disabledByVisibility =
    v.includes("hidden") || v.includes("inactive") || v.includes("blocked") || v.includes("out_of_stock");
  const disabledByStatus =
    s.includes("archiv") || s.includes("disabled") || s.includes("blocked") || s.includes("not_for_sale");

  if (!status && !visibility) return undefined;
  if (disabledByVisibility || disabledByStatus) return false;
  return visible;
}

/**
 * Parse a real Ozon price_indexes sub-object (external_index_data, ozon_index_data, self_marketplaces_index_data).
 * Each has: { minimal_price, minimal_price_currency, price_index_value }
 * We derive marketPrice from minimal_price, and ownPrice = marketPrice * price_index_value.
 */
function parseOzonIndexDataEntry(
  entry: any,
  currentPrice: number,
  source: string
): PriceIndexPair | null {
  if (!entry || typeof entry !== "object") return null;

  const minPrice = parseNumber(entry.minimal_price ?? entry.min_price);
  const indexValue = parseNumber(entry.price_index_value);

  if (minPrice <= 0) return null;

  // ownPrice: if we have index_value, derive from it; otherwise use currentPrice
  const ownPrice = indexValue > 0 ? minPrice * indexValue : currentPrice;
  if (ownPrice <= 0) return null;

  return {
    ownPrice,
    marketPrice: minPrice,
    source,
  };
}

/**
 * Extract price index pairs from real Ozon API price_indexes structure:
 * {
 *   color_index: "GREEN" | "YELLOW" | "RED" | "WITHOUT_INDEX",
 *   external_index_data: { minimal_price, price_index_value, ... },
 *   ozon_index_data: { minimal_price, price_index_value, ... },
 *   self_marketplaces_index_data: { minimal_price, price_index_value, ... }
 * }
 */
function extractOzonPriceIndexPairs(item: any, currentPrice: number): PriceIndexPair[] | undefined {
  const pairs: PriceIndexPair[] = [];

  // Try real Ozon price_indexes structure (from /v4/product/info/prices or /v5)
  const indexes = item?.price_indexes ?? item?.price?.price_indexes ?? item?.price_index ?? item?.price?.price_index;

  if (indexes && typeof indexes === "object" && !Array.isArray(indexes)) {
    // Real Ozon structure with named sub-objects
    const external = parseOzonIndexDataEntry(
      indexes.external_index_data, currentPrice, "external"
    );
    const ozon = parseOzonIndexDataEntry(
      indexes.ozon_index_data, currentPrice, "ozon"
    );
    const selfMp = parseOzonIndexDataEntry(
      indexes.self_marketplaces_index_data ?? indexes.self_marketplace_index_data,
      currentPrice, "self_marketplace"
    );

    if (external) pairs.push(external);
    if (ozon) pairs.push(ozon);
    if (selfMp) pairs.push(selfMp);
  }

  // Dedupe
  const seen = new Set<string>();
  const deduped: PriceIndexPair[] = [];
  for (const pair of pairs) {
    const key = `${pair.ownPrice.toFixed(2)}-${pair.marketPrice.toFixed(2)}-${pair.source || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(pair);
  }

  return deduped.length > 0 ? deduped : undefined;
}

function normalizeDateTime(input: unknown): string {
  if (typeof input !== "string" || !input) return new Date().toISOString();
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

export interface OzonProductIdentityRecord {
  offerId: string;
  title?: string;
  identifiers: string[];
}

interface OzonProductIdentityCache {
  updatedAt: string;
  items: OzonProductIdentityRecord[];
}

function getOzonIdentityCachePath(clientId: string): string {
  const safeClientId = clientId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(OZON_IDENTITY_CACHE_DIR, `ozon-product-identity-${safeClientId}.json`);
}

function normalizeProductTitle(item: any): string | undefined {
  const value = normalizeString(
    item?.name ??
      item?.title ??
      item?.product_name ??
      item?.offer_name ??
      item?.display_name
  );
  return value || undefined;
}

function extractIdentityIdentifiers(item: any): string[] {
  const identifiers = new Set<string>();
  const push = (value: unknown) => {
    const normalized = String(value ?? "").trim();
    if (!normalized || normalized === "0" || normalized === "undefined" || normalized === "null") {
      return;
    }
    identifiers.add(normalized);
  };

  push(item?.offer_id);
  push(item?.sku);
  push(item?.fbo_sku);
  push(item?.fbs_sku);
  push(item?.product_id);
  push(item?.id);

  const nestedSources = [item?.sources, item?.stocks, item?.barcodes];
  for (const source of nestedSources) {
    if (!Array.isArray(source)) continue;
    for (const entry of source) {
      push(entry?.sku);
      push(entry?.fbo_sku);
      push(entry?.fbs_sku);
      push(entry?.offer_id);
      push(entry?.product_id);
      push(entry?.barcode);
      push(entry);
    }
  }

  return Array.from(identifiers);
}

function buildIdentityRecords(items: any[]): OzonProductIdentityRecord[] {
  const byOfferId = new Map<string, OzonProductIdentityRecord>();

  for (const item of items) {
    const offerId = String(item?.offer_id || "").trim();
    if (!offerId) continue;

    const identifiers = extractIdentityIdentifiers(item);
    const existing = byOfferId.get(offerId);
    const title = normalizeProductTitle(item) || existing?.title;

    if (existing) {
      const merged = new Set([...existing.identifiers, ...identifiers]);
      existing.identifiers = Array.from(merged);
      existing.title = title || existing.title;
      continue;
    }

    byOfferId.set(offerId, {
      offerId,
      title,
      identifiers,
    });
  }

  return Array.from(byOfferId.values());
}

export async function getOzonProductIdentityCache(
  sellerCreds: OzonCredentials,
  options?: { forceRefresh?: boolean; maxAgeMs?: number }
): Promise<OzonProductIdentityCache> {
  const cachePath = getOzonIdentityCachePath(sellerCreds.clientId);
  const cached = await readJsonFile<OzonProductIdentityCache | null>(cachePath, null);
  const maxAgeMs = options?.maxAgeMs ?? OZON_IDENTITY_CACHE_TTL_MS;

  if (!options?.forceRefresh && cached?.updatedAt) {
    const updatedAt = new Date(cached.updatedAt).getTime();
    if (Number.isFinite(updatedAt) && Date.now() - updatedAt <= maxAgeMs && Array.isArray(cached.items) && cached.items.length > 0) {
      return cached;
    }
  }

  if (!REAL_API) {
    return cached || { updatedAt: new Date(0).toISOString(), items: [] };
  }

  const { productIds, offerIds } = await fetchProductIdentifiers(sellerCreds);
  if (productIds.length === 0 && offerIds.length === 0) {
    throw new Error("Ozon product catalog is empty or unavailable for identity cache");
  }

  const items = await fetchProductInfoListItems(sellerCreds, productIds, offerIds);
  if (items.length === 0) {
    throw new Error("Ozon product info lookup returned no items for identity cache");
  }

  const nextCache: OzonProductIdentityCache = {
    updatedAt: new Date().toISOString(),
    items: buildIdentityRecords(items),
  };

  await withLock(`${cachePath}.lock`, async () => {
    await writeJsonFile(cachePath, nextCache);
  });

  return nextCache;
}

export async function resolveOzonProductIdentities(
  sellerCreds: OzonCredentials,
  identifiers: string[]
): Promise<{
  offerIdByIdentifier: Map<string, string>;
  titleByOfferId: Map<string, string>;
  preferredDisplaySkuByOfferId: Map<string, string>;
  unresolvedIdentifiers: string[];
}> {
  const normalizedIdentifiers = Array.from(
    new Set(
      identifiers
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  if (normalizedIdentifiers.length === 0) {
    return {
      offerIdByIdentifier: new Map(),
      titleByOfferId: new Map(),
      preferredDisplaySkuByOfferId: new Map(),
      unresolvedIdentifiers: [],
    };
  }

  const load = async (forceRefresh = false) =>
    getOzonProductIdentityCache(sellerCreds, { forceRefresh });

  let cache = await load(false);
  let offerIdByIdentifier = new Map<string, string>();
  let titleByOfferId = new Map<string, string>();
  let preferredDisplaySkuByOfferId = new Map<string, string>();

  const populateMaps = (source: OzonProductIdentityCache) => {
    offerIdByIdentifier = new Map<string, string>();
    titleByOfferId = new Map<string, string>();
    preferredDisplaySkuByOfferId = new Map<string, string>();

    for (const item of source.items || []) {
      if (!item?.offerId) continue;
      if (item.title) titleByOfferId.set(item.offerId, item.title);
      const preferredDisplaySku =
        item.identifiers.find((identifier) => /^\d{6,}$/.test(identifier)) ||
        item.identifiers.find((identifier) => /^OZN\d{6,}$/.test(identifier)) ||
        item.offerId;
      preferredDisplaySkuByOfferId.set(item.offerId, preferredDisplaySku);
      for (const identifier of item.identifiers || []) {
        if (!identifier) continue;
        if (!offerIdByIdentifier.has(identifier)) {
          offerIdByIdentifier.set(identifier, item.offerId);
        }
      }
    }
  };

  populateMaps(cache);

  let unresolvedIdentifiers = normalizedIdentifiers.filter((identifier) => !offerIdByIdentifier.has(identifier));
  if (REAL_API && unresolvedIdentifiers.length > 0) {
    cache = await load(true);
    populateMaps(cache);
    unresolvedIdentifiers = normalizedIdentifiers.filter((identifier) => !offerIdByIdentifier.has(identifier));
  }

  return {
    offerIdByIdentifier,
    titleByOfferId,
    preferredDisplaySkuByOfferId,
    unresolvedIdentifiers,
  };
}

async function ozonGet<T>(
  creds: OzonCredentials,
  endpoint: string
): Promise<T> {
  const response = await fetch(`${OZON_API_BASE}${endpoint}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Client-Id": creds.clientId,
      "Api-Key": creds.apiKey,
    },
    cache: "no-store",
  });

  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const details = body?.message || body?.error || text || `HTTP ${response.status}`;
    throw new Error(`Ozon API ${endpoint} failed: ${details}`);
  }

  return (body ?? {}) as T;
}

async function ozonPost<T>(
  creds: OzonCredentials,
  endpoint: string,
  payload: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${OZON_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Id": creds.clientId,
      "Api-Key": creds.apiKey,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const details = body?.message || body?.error || text || `HTTP ${response.status}`;
    throw new Error(`Ozon API ${endpoint} failed: ${details}`);
  }

  return (body ?? {}) as T;
}

async function ozonPerformanceProbe(creds: Record<string, string>): Promise<TestConnectionResult> {
  const perfClientId = creds?.clientId || creds?.client_id || "";
  const perfClientSecret = creds?.clientSecret || creds?.client_secret || creds?.apiKey || "";

  if (!perfClientId || !perfClientSecret) {
    return { ok: false, error: "Performance Client ID and Client Secret are required" };
  }

  if (DRY_RUN) {
    return { ok: true, accountLabel: `Demo Ozon Ads (${perfClientId})` };
  }

  if (!REAL_API) {
    return {
      ok: true,
      accountLabel: `Ozon Performance (${perfClientId})`,
      warning: "Live Ads API verification is skipped because REAL_API is disabled.",
    };
  }

  try {
    // Step 1: Get OAuth token
    const token = await getPerformanceToken(perfClientId, perfClientSecret);

    // Step 2: Verify by listing campaigns
    const campaigns: any = await performanceGet(token, "/api/client/campaign");
    const count = Array.isArray(campaigns?.list) ? campaigns.list.length : (Array.isArray(campaigns) ? campaigns.length : 0);

    return {
      ok: true,
      accountLabel: `Ozon Performance (${count} campaigns)`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ozon Performance API connection failed",
    };
  }
}

async function tryEndpoints<T>(
  creds: OzonCredentials,
  attempts: Array<{ endpoint: string; payload: Record<string, unknown> }>
): Promise<T> {
  let lastError: Error | null = null;

  for (const attempt of attempts) {
    try {
      return await ozonPost<T>(creds, attempt.endpoint, attempt.payload);
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw lastError ?? new Error("All Ozon API endpoint attempts failed");
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("404") || msg.includes("not found") || msg.includes("page not found");
}

function extractPostings(result: any): any[] {
  if (Array.isArray(result?.result?.postings)) return result.result.postings;
  if (Array.isArray(result?.postings)) return result.postings;
  if (Array.isArray(result?.result)) return result.result;
  return [];
}

function extractPostingStatus(posting: any): string {
  const candidate =
    posting?.status ||
    posting?.status_alias ||
    posting?.substatus ||
    posting?.order_status ||
    "";
  return String(candidate || "").trim().toLowerCase();
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function extractStockItems(response: any): any[] {
  if (Array.isArray(response?.result?.items)) return response.result.items;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.result)) return response.result;
  return [];
}

function normalizeStockItems(items: any[], updatedAt: string): StockState[] {
  return items
    .map((item) => {
      const stockObject = item?.stocks && !Array.isArray(item?.stocks) ? item.stocks : null;
      const sku = String(
        item?.offer_id ||
          item?.sku ||
          stockObject?.fbo?.sku ||
          stockObject?.fbs?.sku ||
          item?.product_id ||
          ""
      ).trim();
      if (!sku) return null;

      const stocks = Array.isArray(item?.stocks) ? item.stocks : [];
      let onHand = 0;
      let inbound = 0;

      for (const stock of stocks) {
        onHand += parseNumber(
          stock?.present ??
            stock?.free_to_sell_amount ??
            stock?.available ??
            stock?.amount ??
            0
        );
        inbound += parseNumber(
          stock?.coming ??
            stock?.inbound ??
            stock?.reserved ??
            0
        );
      }

      if (stocks.length === 0) {
        if (stockObject && typeof stockObject === "object") {
          const bucketValues = Object.values(stockObject);
          for (const bucket of bucketValues) {
            onHand += parseNumber(
              (bucket as any)?.present ??
                (bucket as any)?.free_to_sell_amount ??
                (bucket as any)?.available ??
                (bucket as any)?.amount ??
                0
            );
            inbound += parseNumber(
              (bucket as any)?.coming ??
                (bucket as any)?.inbound ??
                (bucket as any)?.reserved ??
                0
            );
          }
        }

        // Some endpoints return per-source stock arrays.
        if (Array.isArray(item?.sources)) {
          for (const src of item.sources) {
            onHand += parseNumber(
              src?.present ??
                src?.available ??
                src?.free_to_sell_amount ??
                0
            );
            inbound += parseNumber(src?.coming ?? src?.inbound ?? 0);
          }
        }

        onHand = parseNumber(
          onHand > 0
            ? onHand
            : item?.present ??
              item?.stock ??
              item?.on_hand ??
              item?.free_to_sell_amount ??
              item?.available ??
              0
        );
        inbound = parseNumber(
          inbound > 0
            ? inbound
            : item?.coming ??
              item?.inbound ??
              item?.reserved ??
              0
        );
      }

      const state: StockState = {
        sku,
        onHand: Math.max(0, Math.floor(onHand)),
        inbound: Math.max(0, Math.floor(inbound)),
        updatedAt,
      };
      return state;
    })
    .filter((item): item is StockState => Boolean(item));
}

async function fetchProductIdentifiers(creds: OzonCredentials): Promise<{ productIds: number[]; offerIds: string[] }> {
  const productIds = new Set<number>();
  const offerIds = new Set<string>();

  let lastId: string | number = "";
  for (let page = 0; page < 20; page++) {
    let response: any;
    try {
      response = await tryEndpoints<any>(creds, [
        {
          endpoint: "/v3/product/list",
          payload: {
            filter: { visibility: "ALL" },
            last_id: lastId,
            limit: 1000,
          },
        },
        {
          endpoint: "/v2/product/list",
          payload: {
            filter: { visibility: "ALL" },
            last_id: lastId,
            limit: 1000,
          },
        },
      ]);
    } catch (error) {
      if (isNotFoundError(error)) break;
      throw error;
    }

    const items: any[] =
      (Array.isArray(response?.result?.items) && response.result.items) ||
      (Array.isArray(response?.items) && response.items) ||
      [];
    if (items.length === 0) break;

    for (const item of items) {
      const idNum = Number(item?.product_id ?? item?.id);
      if (Number.isFinite(idNum) && idNum > 0) productIds.add(idNum);
      const offer = String(item?.offer_id ?? "").trim();
      if (offer) offerIds.add(offer);
    }

    const nextLastId =
      response?.result?.last_id ??
      response?.last_id ??
      "";
    if (!nextLastId || String(nextLastId) === String(lastId)) break;
    lastId = nextLastId;
  }

  return { productIds: Array.from(productIds.values()), offerIds: Array.from(offerIds.values()) };
}

async function fetchProductInfoListItems(
  creds: OzonCredentials,
  productIds: number[],
  offerIds: string[]
): Promise<any[]> {
  const items: any[] = [];
  const idChunks = chunkArray(productIds, 100);
  const offerChunks = chunkArray(offerIds, 100);

  for (const ids of idChunks) {
    if (ids.length === 0) continue;
    try {
      const resp = await tryEndpoints<any>(creds, [
        { endpoint: "/v3/product/info/list", payload: { product_id: ids } },
        { endpoint: "/v2/product/info/list", payload: { product_id: ids } },
        { endpoint: "/v1/product/info/list", payload: { product_id: ids } },
      ]);
      const list: any[] =
        (Array.isArray(resp?.result?.items) && resp.result.items) ||
        (Array.isArray(resp?.items) && resp.items) ||
        (Array.isArray(resp?.result) && resp.result) ||
        [];
      items.push(...list);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  for (const offers of offerChunks) {
    if (offers.length === 0) continue;
    try {
      const resp = await tryEndpoints<any>(creds, [
        { endpoint: "/v3/product/info/list", payload: { offer_id: offers } },
        { endpoint: "/v2/product/info/list", payload: { offer_id: offers } },
        { endpoint: "/v1/product/info/list", payload: { offer_id: offers } },
      ]);
      const list: any[] =
        (Array.isArray(resp?.result?.items) && resp.result.items) ||
        (Array.isArray(resp?.items) && resp.items) ||
        (Array.isArray(resp?.result) && resp.result) ||
        [];
      items.push(...list);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  return items;
}

/**
 * Maps numeric Ozon product SKUs (fbo_sku/fbs_sku from Performance API)
 * to seller's offer_id using the Seller API product catalog.
 * Returns a Map<numericSku, offerId>.
 */
export async function resolveOzonSkuToOfferId(
  sellerCreds: OzonCredentials,
  numericSkus: string[]
): Promise<{ mapping: Map<string, string>; unresolvedSkus: string[] }> {
  const { offerIdByIdentifier, unresolvedIdentifiers } = await resolveOzonProductIdentities(sellerCreds, numericSkus);
  return {
    mapping: offerIdByIdentifier,
    unresolvedSkus: unresolvedIdentifiers,
  };
}

export const ozonConnector: MarketplaceConnector = {
  async testConnection(creds: OzonCredentials): Promise<TestConnectionResult> {
    if (!creds || !creds.clientId || !creds.apiKey) {
      return { ok: false, error: "Client ID and API key are required" };
    }

    if (DRY_RUN) {
      return { ok: true, accountLabel: "Demo Ozon Account" };
    }

    if (!REAL_API) {
      return {
        ok: true,
        accountLabel: `Ozon Account (${creds.clientId})`,
      };
    }

    try {
      const data = await ozonPost<any>(creds, "/v1/seller/info", {});
      const label =
        data?.result?.name ||
        data?.result?.company_name ||
        data?.result?.id ||
        `Ozon Account (${creds.clientId})`;

      return { ok: true, accountLabel: String(label) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Connection failed",
      };
    }
  },

  async testCapability(
    capability: ConnectionCapabilityTestKey,
    creds: any
  ): Promise<TestConnectionResult> {
    if (capability === "core") {
      return this.testConnection(creds as OzonCredentials);
    }

    if (capability === "ads") {
      return ozonPerformanceProbe(creds);
    }

    if (!creds?.clientId || !creds?.apiKey) {
      return { ok: false, error: "Client ID and API key are required" };
    }

    if (DRY_RUN) {
      return { ok: true, accountLabel: `Demo Ozon Premium (${creds.clientId})` };
    }

    if (!REAL_API) {
      return {
        ok: true,
        accountLabel: `Ozon Premium (${creds.clientId})`,
        warning: "Premium capability was saved without live verification because REAL_API is disabled.",
      };
    }

    const priceResult = await this.fetchPrices(creds);
    return {
      ok: true,
      accountLabel: `Ozon Premium (${creds.clientId})`,
      warning:
        priceResult.length > 0
          ? "Base price data is reachable. Premium competitor access still requires a dedicated endpoint integration."
          : "Core API is reachable, but premium competitor access is not separately verified yet.",
    };
  },

  async fetchOrders(creds: OzonCredentials, range?: DateRange): Promise<OrderEvent[]> {
    if (!REAL_API) {
      return [];
    }
    assertCredentials(creds);

    const { since, to } = toIsoRange(range);
    const allPostings: any[] = [];

    for (const postingType of ["fbo", "fbs"] as const) {
      let offset = 0;
      const limit = ORDERS_PAGE_LIMIT;

      // Keep pagination bounded but large enough for high-volume shops.
      for (let page = 0; page < MAX_ORDER_PAGES; page++) {
        const payload = {
          dir: "DESC",
          limit,
          offset,
          filter: { since, to },
          with: {
            analytics_data: false,
            barcodes: false,
            financial_data: true,
            translit: false,
          },
        };

        const postingAttempts =
          postingType === "fbs"
            ? [
                { endpoint: `/v3/posting/${postingType}/list`, payload },
                { endpoint: `/v2/posting/${postingType}/list`, payload },
                { endpoint: `/v4/posting/${postingType}/list`, payload },
              ]
            : [
                { endpoint: `/v2/posting/${postingType}/list`, payload },
                { endpoint: `/v3/posting/${postingType}/list`, payload },
                { endpoint: `/v4/posting/${postingType}/list`, payload },
              ];

        let response: any;
        try {
          response = await tryEndpoints<any>(creds, postingAttempts);
        } catch (error) {
          if (isNotFoundError(error)) {
            // Endpoint/version not available for this account; skip this posting type.
            break;
          }
          throw error;
        }

        const postings = extractPostings(response);
        if (postings.length === 0) break;

        allPostings.push(...postings);
        if (postings.length < limit) break;
        offset += limit;
      }
    }

    const aggregated = new Map<string, OrderEvent>();

    for (const posting of allPostings) {
      const date = normalizeDateTime(
        posting?.created_at ||
          posting?.order_date ||
          posting?.in_process_at ||
          posting?.shipment_date ||
          posting?.delivering_date
      );
      const products = Array.isArray(posting?.products) ? posting.products : [];

      for (const product of products) {
        const sku = String(
          product?.offer_id ||
            product?.sku ||
            product?.product_id ||
            posting?.posting_number ||
            ""
        ).trim();
        if (!sku) continue;

        const qty = Math.max(1, Math.floor(parseNumber(product?.quantity || 1)));
        const unitPrice = parseNumber(
          product?.price ||
            product?.price_with_discount ||
            product?.final_price ||
            product?.payout
        );
        const revenue = unitPrice > 0 ? unitPrice * qty : undefined;
        const sourceStatus = extractPostingStatus(posting);
        const key = `${date}|${sku}`;
        const existing = aggregated.get(key);

        if (existing) {
          existing.qty += qty;
          if (!existing.sourceStatus && sourceStatus) {
            existing.sourceStatus = sourceStatus;
          }
          if (typeof revenue === "number") {
            existing.revenue = (existing.revenue ?? 0) + revenue;
            existing.price = existing.qty > 0 ? (existing.revenue ?? 0) / existing.qty : existing.price;
          }
        } else {
          aggregated.set(key, {
            date,
            sku,
            qty,
            revenue,
            price: unitPrice > 0 ? unitPrice : undefined,
            sourceStatus: sourceStatus || undefined,
          });
        }
      }
    }

    return Array.from(aggregated.values());
  },

  async fetchStocks(creds: OzonCredentials): Promise<StockState[]> {
    if (!REAL_API) {
      return [];
    }
    assertCredentials(creds);

    const updatedAt = new Date().toISOString();

    // Primary stock endpoints (broad filter).
    let response: any = null;
    try {
      response = await tryEndpoints<any>(creds, [
        {
          endpoint: "/v4/product/info/stocks",
          payload: {
            filter: { visibility: "ALL" },
            limit: 1000,
            last_id: "",
          },
        },
        {
          endpoint: "/v3/product/info/stocks",
          payload: {
            filter: { visibility: "ALL" },
            limit: 1000,
            last_id: "",
          },
        },
        {
          endpoint: "/v2/product/info/stocks",
          payload: {
            filter: { visibility: "ALL" },
            limit: 1000,
            last_id: "",
          },
        },
        {
          endpoint: "/v1/product/info/stocks",
          payload: {
            filter: { visibility: "ALL" },
            limit: 1000,
            offset: 0,
          },
        },
      ]);
    } catch (error) {
      if (isNotFoundError(error)) {
        response = null;
      } else {
        throw error;
      }
    }

    const primary = normalizeStockItems(extractStockItems(response), updatedAt);
    if (primary.length > 0) return primary;

    // Fallback: product list -> batched stock calls by product_id / offer_id.
    let identifiers: { productIds: number[]; offerIds: string[] };
    try {
      identifiers = await fetchProductIdentifiers(creds);
    } catch (error) {
      if (isNotFoundError(error)) return [];
      throw error;
    }

    const collected = new Map<string, StockState>();
    const productIdChunks = chunkArray(identifiers.productIds, 100);
    const offerIdChunks = chunkArray(identifiers.offerIds, 100);

    for (const ids of productIdChunks) {
      if (ids.length === 0) continue;
      let batchResp: any = null;
      try {
        batchResp = await tryEndpoints<any>(creds, [
          {
            endpoint: "/v4/product/info/stocks",
            payload: { filter: { product_id: ids, visibility: "ALL" }, limit: 1000, last_id: "" },
          },
          {
            endpoint: "/v3/product/info/stocks",
            payload: { filter: { product_id: ids, visibility: "ALL" }, limit: 1000, last_id: "" },
          },
          {
            endpoint: "/v2/product/info/stocks",
            payload: { filter: { product_id: ids, visibility: "ALL" }, limit: 1000, last_id: "" },
          },
          {
            endpoint: "/v1/product/info/stocks",
            payload: { product_id: ids, visibility: "ALL" },
          },
        ]);
      } catch (error) {
        if (isNotFoundError(error)) continue;
        throw error;
      }

      for (const row of normalizeStockItems(extractStockItems(batchResp), updatedAt)) {
        collected.set(row.sku, row);
      }
    }

    // Only query by offer_id if product_id-based queries returned nothing — avoids redundant double-fetch
    if (collected.size === 0) {
      for (const offers of offerIdChunks) {
        if (offers.length === 0) continue;
        let batchResp: any = null;
        try {
          batchResp = await tryEndpoints<any>(creds, [
            {
              endpoint: "/v4/product/info/stocks",
              payload: { filter: { offer_id: offers, visibility: "ALL" }, limit: 1000, last_id: "" },
            },
            {
              endpoint: "/v3/product/info/stocks",
              payload: { filter: { offer_id: offers, visibility: "ALL" }, limit: 1000, last_id: "" },
            },
            {
              endpoint: "/v2/product/info/stocks",
              payload: { filter: { offer_id: offers, visibility: "ALL" }, limit: 1000, last_id: "" },
            },
            {
              endpoint: "/v1/product/info/stocks",
              payload: { offer_id: offers, visibility: "ALL" },
            },
          ]);
        } catch (error) {
          if (isNotFoundError(error)) continue;
          throw error;
        }

        for (const row of normalizeStockItems(extractStockItems(batchResp), updatedAt)) {
          collected.set(row.sku, row);
        }
      }
    }

    if (collected.size === 0) {
      const infoItems = await fetchProductInfoListItems(
        creds,
        identifiers.productIds,
        identifiers.offerIds
      );
      for (const row of normalizeStockItems(infoItems, updatedAt)) {
        collected.set(row.sku, row);
      }
    }

    if (collected.size === 0) {
      throw new Error(
        "Stocks are unavailable for current API key/account: stock endpoints return 404 and product info methods require additional role"
      );
    }

    return Array.from(collected.values());
  },

  async fetchAds(creds: any, range?: DateRange): Promise<AdsDaily[]> {
    if (!REAL_API) {
      console.log("[fetchAds] REAL_API not set, returning empty");
      return [];
    }

    // Performance API uses separate OAuth credentials (clientId + clientSecret)
    const perfClientId = creds?.clientId || creds?.client_id || "";
    const perfClientSecret = creds?.clientSecret || creds?.client_secret || creds?.apiKey || "";

    if (!perfClientId || !perfClientSecret) {
      return [];
    }

    try {
      const token = await getPerformanceToken(perfClientId, perfClientSecret);

      // 1. Get campaign list
      const campaignsResp: any = await performanceGet(token, "/api/client/campaign");
      const campaigns: any[] = campaignsResp?.list || (Array.isArray(campaignsResp) ? campaignsResp : []);

      if (campaigns.length === 0) return [];

      // Build campaign state lookup: campaignId → state string
      const campaignStateMap = new Map<string, string>();
      for (const c of campaigns) {
        campaignStateMap.set(String(c.id), String(c.state || "UNKNOWN"));
      }

      // Filter active/running campaigns + recently active ones
      const activeCampaigns = campaigns.filter((c: any) => {
        const state = (c.state || "").toUpperCase();
        return state.includes("RUNNING") || state.includes("ACTIVE") || state.includes("STOPPED") || state.includes("INACTIVE");
      });

      if (activeCampaigns.length === 0) return [];

      // 2. Date range (default: last 30 days)
      const now = new Date();
      const dateFrom = range?.startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const dateTo = range?.endDate || now.toISOString().slice(0, 10);

      // 3. Build batches of 10 (API limit)
      const allAds: AdsDaily[] = [];
      const batchSize = 10;
      const batches: string[][] = [];
      for (let i = 0; i < activeCampaigns.length; i += batchSize) {
        batches.push(activeCampaigns.slice(i, i + batchSize).map((c: any) => String(c.id)));
      }

      // Helper: parse report data into AdsDaily rows
      const parseReportRows = (reportData: any, campaignIds: string[]): AdsDaily[] => {
        const result: AdsDaily[] = [];
        const allRows: { row: any; campaignId: string }[] = [];

        if (typeof reportData === "object" && !Array.isArray(reportData)) {
          const keys = Object.keys(reportData);
          if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
            for (const [campId, campData] of Object.entries(reportData)) {
              for (const row of ((campData as any)?.report?.rows || [])) {
                allRows.push({ row, campaignId: campId });
              }
            }
          } else {
            const rows = reportData?.rows || reportData?.result || reportData?.data || [];
            for (const row of (Array.isArray(rows) ? rows : [])) {
              allRows.push({ row, campaignId: campaignIds[0] || "" });
            }
          }
        } else if (Array.isArray(reportData)) {
          for (const row of reportData) allRows.push({ row, campaignId: campaignIds[0] || "" });
        }

        for (const { row, campaignId } of allRows) {
          const rawDate = row?.date || row?.Date || "";
          const sku = String(row?.sku || row?.SKU || row?.offer_id || row?.articleId || row?.product_id || "").trim();
          const spend = parseNumber(row?.moneySpent || row?.money_spent || row?.spend || row?.cost || 0);
          const clicks = parseNumber(row?.clicks || row?.Clicks || 0);
          const impressions = parseNumber(row?.views || row?.impressions || row?.Views || 0);
          const orders = parseNumber(row?.orders || row?.Orders || row?.ordersCount || 0);
          const revenue = parseNumber(row?.revenue || row?.Revenue || row?.ordersMoney || 0);
          const modelsMoney = parseNumber(row?.modelsMoney || 0);

          if (spend <= 0 && revenue <= 0 && modelsMoney <= 0) continue;

          let normalizedDate = rawDate;
          const ddmmyyyy = rawDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
          if (ddmmyyyy) {
            normalizedDate = `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
          } else if (rawDate.length >= 10) {
            normalizedDate = rawDate.slice(0, 10);
          }
          if (!normalizedDate || !sku) {
            if (!sku) console.warn("Ozon Performance stats row skipped because it has no product identifier");
            continue;
          }

          result.push({
            date: normalizedDate,
            sku,
            title: String(row?.title || row?.Title || row?.name || "").trim() || undefined,
            spend,
            clicks: clicks > 0 ? clicks : undefined,
            impressions: impressions > 0 ? impressions : undefined,
            ordersFromAds: orders > 0 ? orders : undefined,
            revenueFromAds: revenue > 0 ? revenue : modelsMoney > 0 ? modelsMoney : undefined,
            marketplace: "ozon",
            campaignId,
            campaignState: campaignStateMap.get(campaignId) || "UNKNOWN",
          });
        }
        return result;
      };

      // Phase 1: Submit all report requests concurrently
      const uuidResults = await Promise.allSettled(
        batches.map(async (campaignIds) => {
          const statsResp: any = await performancePost(token, "/api/client/statistics/json", {
            campaigns: campaignIds,
            dateFrom,
            dateTo,
            groupBy: "DATE",
          });
          const uuid = (statsResp?.UUID || statsResp?.uuid || statsResp?.id) as string | undefined;
          return { uuid, campaignIds };
        })
      );

      // Phase 2: Poll all UUIDs concurrently — exponential backoff: 500ms→1s→2s→4s (capped), max 20 attempts
      const batchAdsResults = await Promise.allSettled(
        uuidResults.map(async (r) => {
          if (r.status !== "fulfilled" || !r.value.uuid) return [];
          const { uuid, campaignIds } = r.value;
          for (let attempt = 0; attempt < 20; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(500 * Math.pow(2, attempt), 4000)));
            try {
              const statusResp: any = await performanceGet(token, `/api/client/statistics/${uuid}`);
              const state = (statusResp?.state || statusResp?.status || "").toUpperCase();
              if (state === "OK" || state === "DONE" || state === "READY") {
                const reportData = await performanceGet(token, `/api/client/statistics/report?UUID=${uuid}`);
                return parseReportRows(reportData, campaignIds);
              }
              if (state === "ERROR" || state === "FAILED") return [];
            } catch { /* polling error, retry */ }
          }
          return [];
        })
      );

      for (const r of batchAdsResults) {
        if (r.status === "fulfilled" && Array.isArray(r.value)) allAds.push(...r.value);
        else if (r.status === "rejected") console.warn("Ozon Performance stats batch failed:", r.reason instanceof Error ? r.reason.message : r.reason);
      }

      return allAds;
    } catch (error) {
      console.error("Ozon fetchAds failed:", error instanceof Error ? error.message : error);
      return [];
    }
  },

  async fetchPrices(creds: OzonCredentials): Promise<PriceState[]> {
    if (!REAL_API) {
      return [];
    }
    assertCredentials(creds);

    let response: any;
    try {
      response = await tryEndpoints<any>(creds, [
        {
          endpoint: "/v5/product/info/prices",
          payload: {
            filter: { visibility: "ALL" },
            limit: 1000,
          },
        },
        {
          endpoint: "/v4/product/info/prices",
          payload: {
            filter: { visibility: "ALL" },
            limit: 1000,
            offset: 0,
          },
        },
        {
          endpoint: "/v2/product/info/prices",
          payload: {
            filter: { visibility: "ALL" },
            limit: 1000,
            offset: 0,
          },
        },
      ]);
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }

    const items: any[] =
      (Array.isArray(response?.result?.items) && response.result.items) ||
      (Array.isArray(response?.items) && response.items) ||
      (Array.isArray(response?.result) && response.result) ||
      [];

    const updatedAt = new Date().toISOString();

    const priceStates = items
      .map((item) => {
        const sku = String(item?.offer_id || item?.sku || item?.product_id || "").trim();
        if (!sku) return null;

        const priceInfo = item?.price || item;
        const price = parseNumber(
          priceInfo?.price ||
            priceInfo?.marketing_price ||
            priceInfo?.base_price ||
            item?.price
        );
        if (price <= 0) return null;

        const oldPrice = parseNumber(
          priceInfo?.old_price || priceInfo?.list_price || item?.old_price
        );

        let discountPct: number | undefined;
        if (oldPrice > 0 && oldPrice > price) {
          discountPct = Math.round(((oldPrice - price) / oldPrice) * 100);
        } else if (typeof item?.discount_percent === "number") {
          discountPct = Math.round(item.discount_percent);
        }

        const status = normalizeString(
          item?.status ||
            item?.state ||
            item?.product_status ||
            item?.status_name ||
            item?.status_type
        );
        const visibility = normalizeString(
          item?.visibility ||
            item?.visible ||
            item?.visibility_state ||
            item?.offer_visibility
        );
        const explicitOnSale = normalizeBoolean(
          item?.on_sale ??
            item?.is_on_sale ??
            item?.selling ??
            item?.is_visible
        );
        const onSale = explicitOnSale ?? deriveOnSale(status, visibility);
        const priceIndexPairs = extractOzonPriceIndexPairs(item, price);

        // Extract real Ozon color_index (GREEN/YELLOW/RED/WITHOUT_INDEX)
        const rawIndexes = item?.price_indexes ?? item?.price?.price_indexes ?? item?.price_index ?? item?.price?.price_index;
        const ozonColorIndex = typeof rawIndexes?.color_index === "string" ? rawIndexes.color_index : undefined;

        const state: PriceState = {
          sku,
          marketplace: "ozon",
          price,
          discountPct,
          status,
          visibility,
          onSale,
          priceIndexPairs,
          ozonColorIndex,
          updatedAt,
        };
        return state;
      })
      .filter((item): item is PriceState => Boolean(item));

    // Fetch cost prices and merge
    try {
      const offerIds = priceStates.map((p) => p.sku).filter(Boolean);
      if (offerIds.length > 0) {
        const costResponse = await ozonPost<any>(creds, "/v1/product/get-cost-price", {
          offer_ids: offerIds,
        });
        const costItems: any[] = costResponse?.items || costResponse?.result?.items || [];
        const costMap = new Map<string, number>();
        for (const ci of costItems) {
          const sku = String(ci?.offer_id || "").trim();
          const cost = parseNumber(ci?.cost_price);
          if (sku && cost > 0) {
            costMap.set(sku, cost);
          }
        }
        for (const ps of priceStates) {
          const cost = costMap.get(ps.sku);
          if (cost !== undefined) {
            ps.costPrice = cost;
          }
        }
      }
    } catch {
      // Cost price fetch failed — non-critical, continue without it
    }

    // Fetch product visibility/on_sale status via /v2/product/info/list
    try {
      const offerIds = priceStates.map((p) => p.sku).filter(Boolean);
      if (offerIds.length > 0) {
        const infoResponse = await ozonPost<any>(creds, "/v2/product/info/list", {
          offer_id: offerIds,
        });
        const infoItems: any[] = infoResponse?.result?.items || infoResponse?.items || [];
        const visibilityMap = new Map<string, { onSale: boolean; status: string }>();
        for (const info of infoItems) {
          const sku = String(info?.offer_id || "").trim();
          if (!sku) continue;
          // item.visible = true means product is visible to buyers on Ozon (on sale)
          // status.state values: "price_sent" (on sale), "moderating", "not_sale", etc.
          const statusState = String(info?.status?.state || "").toLowerCase();
          const isVisible = info?.visible === true;
          const isOnSale = isVisible && statusState !== "not_sale" && statusState !== "failed_moderation" && statusState !== "disabled";
          visibilityMap.set(sku, { onSale: isOnSale, status: statusState });
        }
        for (const ps of priceStates) {
          const info = visibilityMap.get(ps.sku);
          if (info) {
            ps.onSale = info.onSale;
            if (!ps.status) ps.status = info.status;
            if (!ps.visibility) ps.visibility = info.onSale ? "visible" : "hidden";
          }
        }
      }
    } catch {
      // Product info fetch failed — non-critical, onSale stays undefined
    }

    // Fetch active promotions and mark participating products
    try {
      // Step 1: Get all active promotions via GET /v1/actions
      const actionsResponse = await ozonGet<any>(creds, "/v1/actions");

      // Ozon returns either { result: [...] } or { result: { actions: [...] } }
      let actions: any[] = [];
      if (Array.isArray(actionsResponse?.result)) {
        actions = actionsResponse.result;
      } else if (Array.isArray(actionsResponse?.result?.actions)) {
        actions = actionsResponse.result.actions;
      }

      // Filter to currently active promotions where we're participating
      const now = new Date();
      const activeActions = actions.filter((a: any) => {
        if (!a?.is_participating && !(a?.products_count > 0)) return false;
        const dateEnd = a?.date_end ? new Date(a.date_end) : null;
        return !dateEnd || dateEnd > now;
      });

      if (activeActions.length > 0) {
        // Build product_id → offer_id mapping from identity cache
        const identityCache = await getOzonProductIdentityCache(creds);
        const productIdToOfferId = new Map<string, string>();
        for (const record of identityCache.items) {
          for (const id of record.identifiers) {
            productIdToOfferId.set(id, record.offerId);
          }
        }

        // Step 2: For each active promo, get participating products with full details
        // sku → list of PromoItem
        const skuPromos = new Map<string, import("@/src/pricing/types").PromoItem[]>();

        for (const action of activeActions.slice(0, 20)) {
          const actionId = action.id || action.action_id;
          const title = String(action.title || action.name || "");
          const dateStart = action.date_start || undefined;
          const dateEnd = action.date_end || undefined;
          const actionType = action.action_type || undefined;

          try {
            const productsResponse = await ozonPost<any>(creds, "/v1/actions/products", {
              action_id: actionId,
              offset: 0,
              limit: 1000,
            });
            const products: any[] = productsResponse?.products || productsResponse?.result?.products || [];

            for (const p of products) {
              const productId = String(p?.product_id || p?.id || "");
              const offerId = productIdToOfferId.get(productId) || productId;
              if (!offerId) continue;

              const actionPrice = parseNumber(p?.action_price);
              const basePrice = parseNumber(p?.price);
              const discountPct = basePrice > 0 && actionPrice > 0
                ? Math.round(((basePrice - actionPrice) / basePrice) * 100)
                : undefined;

              const promoItem: import("@/src/pricing/types").PromoItem = {
                actionId,
                title,
                dateStart,
                dateEnd,
                actionType,
                actionPrice: actionPrice > 0 ? actionPrice : undefined,
                discountPct,
              };

              const existing = skuPromos.get(offerId) || [];
              existing.push(promoItem);
              skuPromos.set(offerId, existing);
            }
          } catch {
            // Single action fetch failed — continue with others
          }
        }

        // Step 3: Enrich PriceState with full promo data
        for (const ps of priceStates) {
          const promos = skuPromos.get(ps.sku);
          if (promos && promos.length > 0) {
            ps.promos = promos;
            ps.inPromo = true;
            ps.promoPrice = promos[0]?.actionPrice;
          }
        }
      }
    } catch {
      // Promo fetch failed — non-critical, promoStatus stays undefined
    }

    return priceStates;
  },

  /**
   * Fetch customer reviews and questions from Ozon
   * Uses /v1/review/list for reviews and /v1/product/questions for questions
   */
  async fetchReviews(creds: OzonCredentials, range?: DateRange): Promise<ReviewItem[]> {
    if (!REAL_API) {
      // Demo reviews
      return [
        {
          id: "ozon-review-demo-1",
          sku: "demo-sku-1",
          marketplace: "ozon",
          type: "review" as const,
          author: "Покупатель Ozon",
          text: "Отличное качество, рекомендую!",
          rating: 5,
          createdAt: new Date().toISOString(),
          status: "published",
        },
        {
          id: "ozon-review-demo-2",
          sku: "demo-sku-2",
          marketplace: "ozon",
          type: "review" as const,
          author: "Покупатель",
          text: "Размер не соответствует. Маломерит.",
          rating: 2,
          createdAt: new Date().toISOString(),
          status: "published",
        },
        {
          id: "ozon-question-demo-1",
          sku: "demo-sku-1",
          marketplace: "ozon",
          type: "question" as const,
          author: "Покупатель",
          text: "Когда будет размер XL?",
          createdAt: new Date().toISOString(),
          status: "unanswered",
        },
      ];
    }

    assertCredentials(creds);
    const reviews: ReviewItem[] = [];

    // Fetch reviews via /v1/review/list
    try {
      let hasNext = true;
      let lastId = "";
      let pageCount = 0;
      const MAX_PAGES = 20;

      while (hasNext && pageCount < MAX_PAGES) {
        const payload: Record<string, unknown> = {
          sort_dir: "DESC",
          limit: 100,
        };
        if (lastId) {
          payload.last_id = lastId;
        }

        const response = await ozonPost<any>(creds, "/v1/review/list", payload);
        const items: any[] = response?.reviews || response?.result || [];

        if (items.length === 0) break;

        for (const item of items) {
          const id = String(item?.id || item?.review_id || `ozon-r-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`);
          const text = String(item?.text || item?.comment || "").trim();
          if (!text) continue;

          reviews.push({
            id: `ozon-review-${id}`,
            sku: String(item?.sku || item?.offer_id || item?.product_id || ""),
            marketplace: "ozon",
            type: "review",
            author: String(item?.author?.name || item?.author_name || "Покупатель"),
            text,
            rating: typeof item?.rating === "number" ? item.rating : (item?.stars ? Number(item.stars) : undefined),
            createdAt: item?.created_at || item?.published_at || new Date().toISOString(),
            status: item?.status || "published",
            answer: item?.answer?.text || item?.reply?.text || undefined,
            answeredAt: item?.answer?.created_at || item?.reply?.created_at || undefined,
          });
        }

        hasNext = response?.has_next === true || items.length === 100;
        lastId = response?.last_id || items[items.length - 1]?.id || "";
        pageCount++;
      }
    } catch (err) {
      console.warn("Ozon review fetch failed (non-critical):", err instanceof Error ? err.message : err);
    }

    // Fetch questions via /v1/product/questions
    try {
      const payload: Record<string, unknown> = {
        limit: 100,
        sort_dir: "DESC",
      };

      const response = await ozonPost<any>(creds, "/v1/product/questions", payload);
      const items: any[] = response?.questions || response?.result || [];

      for (const item of items) {
        const id = String(item?.id || item?.question_id || `ozon-q-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`);
        const text = String(item?.text || item?.question || "").trim();
        if (!text) continue;

        reviews.push({
          id: `ozon-question-${id}`,
          sku: String(item?.sku || item?.offer_id || item?.product_id || ""),
          marketplace: "ozon",
          type: "question",
          author: String(item?.author?.name || item?.author_name || "Покупатель"),
          text,
          createdAt: item?.created_at || new Date().toISOString(),
          status: item?.is_answered ? "answered" : "unanswered",
          answer: item?.answer?.text || undefined,
          answeredAt: item?.answer?.created_at || undefined,
        });
      }
    } catch (err) {
      console.warn("Ozon questions fetch failed (non-critical):", err instanceof Error ? err.message : err);
    }

    return reviews;
  },
};
