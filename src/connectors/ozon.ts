/**
 * Ozon Connector
 */

import type {
  MarketplaceConnector,
  TestConnectionResult,
  DateRange,
  OzonCredentials,
} from "./types";
import type { OrderEvent, StockState, AdsDaily, PriceState } from "@/src/pricing/types";

const REAL_API = process.env.REAL_API === "1";
const DRY_RUN = process.env.DRY_RUN === "1";
const OZON_API_BASE = "https://api-seller.ozon.ru";
const DEFAULT_ORDERS_LOOKBACK_DAYS = 365;
const ORDERS_PAGE_LIMIT = 100;
const MAX_ORDER_PAGES = 100;

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

        const state: PriceState = {
          sku,
          marketplace: "ozon",
          price,
          discountPct,
          updatedAt,
        };
        return state;
      })
      .filter((item): item is PriceState => Boolean(item));
  },
};
