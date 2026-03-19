/**
 * Wildberries Connector
 * Real API integration with WB Seller APIs
 */

import type {
  MarketplaceConnector,
  TestConnectionResult,
  DateRange,
  WBCredentials,
} from "./types";
import type { OrderEvent, StockState, AdsDaily, PriceState } from "@/src/pricing/types";

const REAL_API = process.env.REAL_API === "1";
const DRY_RUN = process.env.DRY_RUN === "1";

const WB_CONTENT_API = "https://content-api.wildberries.ru";
const WB_MARKETPLACE_API = "https://marketplace-api.wildberries.ru";
const WB_STATISTICS_API = "https://statistics-api.wildberries.ru";
const WB_PRICES_API = "https://discounts-prices-api.wildberries.ru";

const DEFAULT_LOOKBACK_DAYS = 365;

function assertToken(creds: WBCredentials): void {
  if (!creds?.token) {
    throw new Error("WB API token is required");
  }
}

function parseNumber(input: unknown): number {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    const num = Number(input.replace(",", ".").trim());
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

function dateToISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function wbGet<T>(token: string, baseUrl: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, baseUrl);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
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
    const details = body?.message || body?.error || body?.errorText || text || `HTTP ${response.status}`;
    throw new Error(`WB API ${path} failed: ${details}`);
  }

  return (body ?? {}) as T;
}

async function wbPost<T>(token: string, baseUrl: string, path: string, payload: unknown): Promise<T> {
  const url = new URL(path, baseUrl);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
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
    const details = body?.message || body?.error || body?.errorText || text || `HTTP ${response.status}`;
    throw new Error(`WB API ${path} failed: ${details}`);
  }

  return (body ?? {}) as T;
}

/**
 * Fetch all WB warehouses (needed for stocks)
 */
async function fetchWarehouses(token: string): Promise<Array<{ id: number; name: string }>> {
  try {
    const data = await wbGet<any[]>(token, WB_MARKETPLACE_API, "/api/v3/warehouses");
    if (!Array.isArray(data)) return [];
    return data
      .filter((w: any) => w?.id)
      .map((w: any) => ({ id: Number(w.id), name: String(w.name || "") }));
  } catch {
    return [];
  }
}

/**
 * Fetch cards (products) from content API - paginated
 */
async function fetchAllCards(token: string): Promise<any[]> {
  const allCards: any[] = [];
  let cursor = { updatedAt: "", nmID: 0 };

  for (let page = 0; page < 50; page++) {
    const payload: any = {
      settings: {
        cursor: {
          limit: 100,
          ...(cursor.nmID > 0 ? { updatedAt: cursor.updatedAt, nmID: cursor.nmID } : {}),
        },
        filter: { withPhoto: -1 },
      },
    };

    let resp: any;
    try {
      resp = await wbPost<any>(token, WB_CONTENT_API, "/content/v2/get/cards/list", payload);
    } catch {
      break;
    }

    const cards = Array.isArray(resp?.cards) ? resp.cards : [];
    if (cards.length === 0) break;

    allCards.push(...cards);

    const nextCursor = resp?.cursor;
    if (!nextCursor?.nmID || nextCursor.nmID === cursor.nmID) break;
    cursor = { updatedAt: nextCursor.updatedAt || "", nmID: nextCursor.nmID };
  }

  return allCards;
}

export const wbConnector: MarketplaceConnector = {
  async testConnection(creds: WBCredentials): Promise<TestConnectionResult> {
    if (!creds || !creds.token) {
      return { ok: false, error: "Token is required" };
    }

    if (DRY_RUN) {
      return { ok: true, accountLabel: "Demo WB Account" };
    }

    if (!REAL_API) {
      return {
        ok: true,
        accountLabel: `WB Account (${creds.token.substring(0, 8)}...)`,
      };
    }

    try {
      // Test with warehouses endpoint - lightweight and always available
      const warehouses = await wbGet<any>(creds.token, WB_MARKETPLACE_API, "/api/v3/warehouses");
      const count = Array.isArray(warehouses) ? warehouses.length : 0;
      return {
        ok: true,
        accountLabel: `Wildberries (${count} склад${count === 1 ? "" : count > 1 && count < 5 ? "а" : "ов"})`,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Connection failed",
      };
    }
  },

  async fetchOrders(creds: WBCredentials, range?: DateRange): Promise<OrderEvent[]> {
    if (!REAL_API) return [];
    assertToken(creds);

    // Cap lookback at 90 days for Statistics API (retention-safe)
    const now = new Date();
    const maxLookbackMs = 90 * 24 * 60 * 60 * 1000;
    const startDate = range?.startDate
      ? new Date(`${range.startDate}T00:00:00.000Z`)
      : new Date(now.getTime() - maxLookbackMs);

    // Ensure we don't go beyond 90 days (Statistics API retention limit)
    const earliest = new Date(now.getTime() - maxLookbackMs);
    const effectiveStart = startDate < earliest ? earliest : startDate;
    const dateFrom = dateToISO(effectiveStart);

    const aggregated = new Map<string, OrderEvent>();

    // 1) Primary: Statistics API /api/v1/supplier/orders (most complete order data)
    try {
      const data = await wbGet<any[]>(
        creds.token,
        WB_STATISTICS_API,
        "/api/v1/supplier/orders",
        { dateFrom }
      );

      if (Array.isArray(data)) {
        for (const order of data) {
          const sku = String(
            order?.supplierArticle || order?.sa_name || order?.barcode || order?.nmId || ""
          ).trim();
          if (!sku) continue;

          const dateRaw = order?.lastChangeDate || order?.date || order?.createdAt;
          const date = normalizeDateTime(dateRaw);
          const qty = Math.max(1, Math.floor(parseNumber(order?.quantity || 1)));
          const price = parseNumber(order?.totalPrice || order?.priceWithDisc || 0);
          const isCancel = String(order?.isCancel || "").toLowerCase() === "true" || order?.isCancel === true;

          const dayKey = date.slice(0, 10);
          const key = `${dayKey}|${sku}`;
          const existing = aggregated.get(key);
          if (existing) {
            existing.qty += qty;
            if (price > 0) {
              existing.revenue = (existing.revenue ?? 0) + price * qty;
              existing.price = existing.qty > 0 ? (existing.revenue ?? 0) / existing.qty : existing.price;
            }
          } else {
            aggregated.set(key, {
              date,
              sku,
              qty,
              revenue: price > 0 ? price * qty : undefined,
              price: price > 0 ? price : undefined,
              sourceStatus: isCancel ? "cancelled" : "ordered",
            });
          }
        }
      }
    } catch {
      // Statistics orders may be unavailable
    }

    // 2) Enrich with Statistics API /api/v1/supplier/sales (has finishedPrice / forPay revenue, marks as sold)
    try {
      const data = await wbGet<any[]>(
        creds.token,
        WB_STATISTICS_API,
        "/api/v1/supplier/sales",
        { dateFrom }
      );

      if (Array.isArray(data)) {
        for (const sale of data) {
          const sku = String(
            sale?.supplierArticle || sale?.sa_name || sale?.barcode || sale?.nmId || ""
          ).trim();
          if (!sku) continue;

          const dateRaw = sale?.lastChangeDate || sale?.date || sale?.saleDate;
          const date = normalizeDateTime(dateRaw);
          const dayKey = date.slice(0, 10);
          const key = `${dayKey}|${sku}`;

          const existing = aggregated.get(key);
          const revenue = parseNumber(sale?.finishedPrice || sale?.forPay || sale?.priceWithDisc || 0);

          if (existing) {
            // Update revenue with more accurate sales data
            if (revenue > 0 && (!existing.revenue || existing.revenue === 0)) {
              existing.revenue = revenue * existing.qty;
              existing.price = revenue;
            }
            // Mark as sold (upgraded from "ordered")
            if (existing.sourceStatus === "ordered" || !existing.sourceStatus) {
              existing.sourceStatus = "sold";
            }
          } else {
            // Sale not in orders — add it
            const qty = Math.max(1, Math.floor(parseNumber(sale?.quantity || 1)));
            const price = revenue > 0 && qty > 0 ? revenue / qty : parseNumber(sale?.priceWithDisc || 0);
            aggregated.set(key, {
              date,
              sku,
              qty,
              revenue: revenue > 0 ? revenue : undefined,
              price: price > 0 ? price : undefined,
              sourceStatus: "sold",
            });
          }
        }
      }
    } catch {
      // Statistics sales may be unavailable
    }

    return Array.from(aggregated.values());
  },

  async fetchStocks(creds: WBCredentials): Promise<StockState[]> {
    if (!REAL_API) return [];
    assertToken(creds);

    const updatedAt = new Date().toISOString();
    const collected = new Map<string, StockState>();

    // Try Statistics API stocks endpoint first (most complete)
    try {
      const dateFrom = dateToISO(new Date(Date.now() - 24 * 60 * 60 * 1000));
      const data = await wbGet<any[]>(
        creds.token,
        WB_STATISTICS_API,
        "/api/v1/supplier/stocks",
        { dateFrom }
      );

      if (Array.isArray(data)) {
        for (const item of data) {
          const sku = String(
            item?.supplierArticle ||
            item?.sa_name ||
            item?.barcode ||
            item?.nmId ||
            ""
          ).trim();
          if (!sku) continue;

          const existing = collected.get(sku);
          const quantity = parseNumber(item?.quantity || item?.quantityFull || 0);
          const inTransit = parseNumber(item?.inWayToClient || item?.inWayFromClient || 0);

          if (existing) {
            existing.onHand += Math.max(0, Math.floor(quantity));
            existing.inbound = (existing.inbound || 0) + Math.max(0, Math.floor(inTransit));
          } else {
            collected.set(sku, {
              sku,
              onHand: Math.max(0, Math.floor(quantity)),
              inbound: Math.max(0, Math.floor(inTransit)),
              updatedAt,
            });
          }
        }
      }
    } catch {
      // Statistics stocks may fail, try marketplace API
    }

    // If statistics didn't work, try marketplace warehouse stocks
    if (collected.size === 0) {
      const warehouses = await fetchWarehouses(creds.token);

      for (const wh of warehouses) {
        try {
          const resp = await wbPost<any>(
            creds.token,
            WB_MARKETPLACE_API,
            `/api/v3/stocks/${wh.id}`,
            { skus: [] }
          );

          const stocks = Array.isArray(resp?.stocks) ? resp.stocks : [];
          for (const s of stocks) {
            const sku = String(s?.sku || s?.barcode || "").trim();
            if (!sku) continue;

            const amount = parseNumber(s?.amount || 0);
            const existing = collected.get(sku);
            if (existing) {
              existing.onHand += Math.max(0, Math.floor(amount));
            } else {
              collected.set(sku, {
                sku,
                onHand: Math.max(0, Math.floor(amount)),
                inbound: 0,
                updatedAt,
              });
            }
          }
        } catch {
          // Skip warehouse on error
        }
      }
    }

    return Array.from(collected.values());
  },

  async fetchAds(creds: WBCredentials, range?: DateRange): Promise<AdsDaily[]> {
    if (!REAL_API) return [];
    // WB ads API requires separate integration; return empty for now
    return [];
  },

  async fetchPrices(creds: WBCredentials): Promise<PriceState[]> {
    if (!REAL_API) return [];
    assertToken(creds);

    const updatedAt = new Date().toISOString();
    const allPrices: PriceState[] = [];

    // Fetch prices from discounts-prices API with pagination
    let offset = 0;
    const limit = 1000;

    for (let page = 0; page < 50; page++) {
      let resp: any;
      try {
        resp = await wbGet<any>(
          creds.token,
          WB_PRICES_API,
          "/api/v2/list/goods/filter",
          { limit: String(limit), offset: String(offset) }
        );
      } catch {
        break;
      }

      const goods = Array.isArray(resp?.data?.listGoods)
        ? resp.data.listGoods
        : Array.isArray(resp?.listGoods)
          ? resp.listGoods
          : Array.isArray(resp?.data)
            ? resp.data
            : [];

      if (goods.length === 0) break;

      for (const item of goods) {
        const nmId = item?.nmID || item?.nmId;
        const vendorCode = item?.vendorCode || item?.supplierArticle || "";
        const sku = String(vendorCode || nmId || "").trim();
        if (!sku) continue;

        // WB prices: sizes array contains the actual prices
        const sizes = Array.isArray(item?.sizes) ? item.sizes : [];

        if (sizes.length > 0) {
          // Use the first size's price as the main price
          for (const size of sizes) {
            const sizesku = size?.techSize && size.techSize !== "0"
              ? `${sku}-${size.techSize}`
              : sku;

            const price = parseNumber(size?.discountedPrice || size?.price || item?.price || 0);
            if (price <= 0) continue;

            const oldPrice = parseNumber(size?.price || item?.price || 0);
            let discountPct: number | undefined;
            if (item?.discount !== undefined) {
              discountPct = parseNumber(item.discount);
            } else if (oldPrice > 0 && oldPrice > price) {
              discountPct = Math.round(((oldPrice - price) / oldPrice) * 100);
            }

            allPrices.push({
              sku: sizesku,
              marketplace: "wb",
              price,
              discountPct: discountPct && discountPct > 0 ? discountPct : undefined,
              updatedAt,
            });

            // Only take first size for simpler display
            break;
          }
        } else {
          // No sizes - use item-level price
          const price = parseNumber(item?.price || item?.discountedPrice || 0);
          if (price <= 0) continue;

          const discount = parseNumber(item?.discount || 0);

          allPrices.push({
            sku,
            marketplace: "wb",
            price,
            discountPct: discount > 0 ? discount : undefined,
            updatedAt,
          });
        }
      }

      // Check if there are more pages
      const total = parseNumber(resp?.data?.total || resp?.total || 0);
      offset += limit;
      if (offset >= total || goods.length < limit) break;
    }

    // If discounts-prices API returned nothing, try content API cards as fallback
    if (allPrices.length === 0) {
      const cards = await fetchAllCards(creds.token);
      for (const card of cards) {
        const sku = String(
          card?.vendorCode ||
          card?.supplierArticle ||
          card?.nmID ||
          ""
        ).trim();
        if (!sku) continue;

        const sizes = Array.isArray(card?.sizes) ? card.sizes : [];
        for (const size of sizes) {
          const price = parseNumber(size?.price || size?.discountedPrice || 0);
          if (price <= 0) continue;

          allPrices.push({
            sku,
            marketplace: "wb",
            price: price / 100, // Content API returns prices in kopecks
            updatedAt,
          });
          break;
        }
      }
    }

    return allPrices;
  },
};
