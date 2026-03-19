/**
 * Ozon Connector
 */

import type {
  MarketplaceConnector,
  ConnectionCapabilityTestKey,
  TestConnectionResult,
  DateRange,
  OzonCredentials,
} from "./types";
import type { OrderEvent, StockState, AdsDaily, PriceState, PriceIndexPair } from "@/src/pricing/types";

const REAL_API = process.env.REAL_API === "1";
const DRY_RUN = process.env.DRY_RUN === "1";
const OZON_API_BASE = "https://api-seller.ozon.ru";
const DEFAULT_ORDERS_LOOKBACK_DAYS = 365;
const ORDERS_PAGE_LIMIT = 100;
const MAX_ORDER_PAGES = 100;
const OZON_PERFORMANCE_API_BASE = "https://api-performance.ozon.ru";

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
    const normalized = input.replace(",", ".").trim();
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

function tryBuildPriceIndexPair(raw: any, fallbackOwnPrice: number): PriceIndexPair | null {
  if (!raw || typeof raw !== "object") return null;

  const ownPrice = parseNumber(
    raw.own_price ??
      raw.seller_price ??
      raw.your_price ??
      raw.my_price ??
      fallbackOwnPrice
  );
  const marketPrice = parseNumber(
    raw.market_price ??
      raw.external_price ??
      raw.competitor_price ??
      raw.index_price ??
      raw.reference_price
  );

  if (ownPrice <= 0 || marketPrice <= 0) return null;

  const ordersRaw =
    raw.orders ??
    raw.orders_count ??
    raw.sales ??
    raw.sales_count;
  const ordersParsed = parseNumber(ordersRaw);
  const source = normalizeString(raw.source ?? raw.type ?? raw.name);

  return {
    ownPrice,
    marketPrice,
    orders: ordersParsed > 0 ? Math.round(ordersParsed) : undefined,
    source,
  };
}

function collectPriceIndexPairs(input: any, fallbackOwnPrice: number, depth: number = 0): PriceIndexPair[] {
  if (!input || depth > 4) return [];

  const out: PriceIndexPair[] = [];
  const pushPair = (pair: PriceIndexPair | null) => {
    if (pair) out.push(pair);
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      out.push(...collectPriceIndexPairs(item, fallbackOwnPrice, depth + 1));
    }
    return out;
  }

  if (typeof input !== "object") return out;

  pushPair(tryBuildPriceIndexPair(input, fallbackOwnPrice));

  const nestedKeys = [
    "pairs",
    "items",
    "values",
    "data",
    "prices",
    "external_index_data",
    "price_indexes",
    "price_index",
  ];
  for (const key of nestedKeys) {
    if (key in input) {
      out.push(...collectPriceIndexPairs((input as any)[key], fallbackOwnPrice, depth + 1));
    }
  }

  return out;
}

function dedupePriceIndexPairs(pairs: PriceIndexPair[]): PriceIndexPair[] {
  const seen = new Set<string>();
  const out: PriceIndexPair[] = [];

  for (const pair of pairs) {
    const key = `${pair.ownPrice.toFixed(2)}-${pair.marketPrice.toFixed(2)}-${pair.source || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pair);
  }

  return out;
}

function extractOzonPriceIndexPairs(item: any, currentPrice: number): PriceIndexPair[] | undefined {
  const rawSources = [
    item?.price_index,
    item?.price_indexes,
    item?.price_index_data,
    item?.index_data,
    item?.price?.price_index,
    item?.price?.price_indexes,
    item?.price?.external_index_data,
  ];

  const collected = rawSources.flatMap((src) => collectPriceIndexPairs(src, currentPrice));
  const pairs = dedupePriceIndexPairs(collected)
    .filter((pair) => pair.ownPrice > 0 && pair.marketPrice > 0)
    .sort((a, b) => (b.orders || 0) - (a.orders || 0))
    .slice(0, 3);

  return pairs.length > 0 ? pairs : undefined;
}

function normalizeDateTime(input: unknown): string {
  if (typeof input !== "string" || !input) return new Date().toISOString();
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
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

async function ozonPerformanceProbe(creds: OzonCredentials): Promise<TestConnectionResult> {
  if (!creds?.clientId || !creds?.apiKey) {
    return { ok: false, error: "Client ID and API key are required" };
  }

  if (DRY_RUN) {
    return { ok: true, accountLabel: `Demo Ozon Ads (${creds.clientId})` };
  }

  if (!REAL_API) {
    return {
      ok: true,
      accountLabel: `Ozon Ads (${creds.clientId})`,
      warning: "Live Ads API verification is skipped because REAL_API is disabled.",
    };
  }

  try {
    const response = await fetch(`${OZON_PERFORMANCE_API_BASE}/api/client/campaign`, {
      method: "GET",
      headers: {
        "Client-Id": creds.clientId,
        "Api-Key": creds.apiKey,
      },
      cache: "no-store",
    });

    const text = await response.text();
    if (response.ok) {
      return { ok: true, accountLabel: `Ozon Ads (${creds.clientId})` };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        error: text || "Ads API credentials were rejected by Ozon Performance API.",
      };
    }

    return {
      ok: true,
      accountLabel: `Ozon Ads (${creds.clientId})`,
      warning: `Ads API responded with HTTP ${response.status}; credentials may be valid but account access still needs verification.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ads API connection failed",
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
    creds: OzonCredentials
  ): Promise<TestConnectionResult> {
    if (capability === "core") {
      return this.testConnection(creds);
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

  async fetchAds(creds: OzonCredentials, range?: DateRange): Promise<AdsDaily[]> {
    if (!REAL_API) {
      return [];
    }

    // Ozon ads statistics are on a separate API family and may require extra setup.
    // Return empty for now; sync runner will keep other real datasets working.
    return [];
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

    return items
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

        const state: PriceState = {
          sku,
          marketplace: "ozon",
          price,
          discountPct,
          status,
          visibility,
          onSale,
          priceIndexPairs,
          updatedAt,
        };
        return state;
      })
      .filter((item): item is PriceState => Boolean(item));
  },
};
