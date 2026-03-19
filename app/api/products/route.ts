import { requireAuth } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import path from "path";
import { readJsonFile } from "@/src/integrations/storage";
import { filterByEnabledConnections, getEnabledConnections } from "@/src/integrations/enabled";
import type { OrderEvent, PriceState, StockState } from "@/src/pricing/types";

type ProductStatus = "active" | "draft" | "blocked";
type StockHealth = "critical" | "low" | "normal" | "good";

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  marketplace: string;
  marketplaces: string[];
  connectionIds: string[];
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  onHand: number;
  inbound: number;
  stockKnown: boolean;
  soldLast30d: number;
  status: ProductStatus;
  stockHealth: StockHealth;
  firstSeenAt: string;
  updatedAt: string;
}

const PRICES_FILE = path.join(process.cwd(), "data", "canonical", "prices.json");
const STOCKS_FILE = path.join(process.cwd(), "data", "canonical", "stocks.json");
const ORDERS_FILE = path.join(process.cwd(), "data", "canonical", "orders.json");

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickNameFromRecord(record: Record<string, unknown> | null | undefined): string | null {
  if (!record) return null;
  return (
    asNonEmptyString(record.name) ||
    asNonEmptyString(record.title) ||
    asNonEmptyString(record.productName) ||
    asNonEmptyString(record.product_name) ||
    asNonEmptyString(record.offerName) ||
    asNonEmptyString(record.offer_name) ||
    asNonEmptyString(record.itemName) ||
    asNonEmptyString(record.item_name) ||
    null
  );
}

function getStockHealth(onHand: number, soldLast30d: number): StockHealth {
  const dailyAvgSold = Math.max(0, soldLast30d) / 30;
  const leadTimeDays = 7;
  const leadTimeDemand = dailyAvgSold * leadTimeDays;
  const projectedStockAtReplenishment = onHand - leadTimeDemand;

  // Reorder point: current stock won't cover expected demand during replenishment lead time.
  if (projectedStockAtReplenishment < 0) return "critical";

  if (onHand <= 0) return "critical";
  if (onHand < 200) return "critical";
  if (onHand < 500) return "low";
  if (onHand < 1000) return "normal";
  return "good";
}

function getStatus(params: {
  pricesCount: number;
  onHand: number;
  inbound: number;
  stockKnown: boolean;
  soldLast30d: number;
}): ProductStatus {
  const { pricesCount, onHand, inbound, stockKnown, soldLast30d } = params;

  // If we have real stock and it's zero, treat as out of stock.
  if (stockKnown && onHand <= 0 && inbound <= 0) return "blocked";

  // Selling signal from recent orders.
  if (soldLast30d > 0) return "active";

  // Listed with price but no recent sales => ready for sale.
  if (pricesCount > 0) return "draft";

  // Fallback.
  return stockKnown && (onHand > 0 || inbound > 0) ? "active" : "draft";
}

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const enabledConnections = await getEnabledConnections();
    if (enabledConnections.length === 0) {
      return NextResponse.json({ products: [] });
    }

    const pricesRaw = await readJsonFile<PriceState[]>(PRICES_FILE, []);
    const stocksRaw = await readJsonFile<StockState[]>(STOCKS_FILE, []);
    const ordersRaw = await readJsonFile<OrderEvent[]>(ORDERS_FILE, []);

    const prices = filterByEnabledConnections(pricesRaw, enabledConnections);
    const stocks = filterByEnabledConnections(stocksRaw, enabledConnections);
    const orders = filterByEnabledConnections(ordersRaw, enabledConnections);

    const bySkuMarketplace = new Map<string, {
      sku: string;
      name: string;
      marketplace: string;
      marketplaces: Set<string>;
      connectionIds: Set<string>;
      prices: number[];
      onHand: number;
      inbound: number;
      stockKnown: boolean;
      soldLast30d: number;
      firstSeenTs: number;
      updatedAtTs: number;
    }>();

    const buildKey = (sku: string, marketplace: string) => `${sku}::${marketplace}`;

    const ensure = (sku: string, marketplace: string) => {
      const key = buildKey(sku, marketplace);
      const existing = bySkuMarketplace.get(key);
      if (existing) return existing;
      const created = {
        sku,
        name: sku,
        marketplace,
        marketplaces: new Set<string>([marketplace]),
        connectionIds: new Set<string>(),
        prices: [],
        onHand: 0,
        inbound: 0,
        stockKnown: false,
        soldLast30d: 0,
        firstSeenTs: 0,
        updatedAtTs: 0,
      };
      bySkuMarketplace.set(key, created);
      return created;
    };

    for (const p of prices) {
      const item = ensure(p.sku, p.marketplace);
      const name = pickNameFromRecord(p as unknown as Record<string, unknown>);
      if (name) item.name = name;
      item.marketplaces.add(p.marketplace);
      if (p.connectionId) item.connectionIds.add(p.connectionId);
      if (Number.isFinite(p.price)) item.prices.push(p.price);
      const ts = new Date(p.updatedAt).getTime();
      if (Number.isFinite(ts) && ts > item.updatedAtTs) item.updatedAtTs = ts;
      if (Number.isFinite(ts) && ts > 0 && (item.firstSeenTs === 0 || ts < item.firstSeenTs)) item.firstSeenTs = ts;
    }

    for (const s of stocks) {
      if (!s.marketplace) continue;
      const item = ensure(s.sku, s.marketplace);
      const name = pickNameFromRecord(s as unknown as Record<string, unknown>);
      if (name) item.name = name;
      if (s.marketplace) item.marketplaces.add(s.marketplace);
      if (s.connectionId) item.connectionIds.add(s.connectionId);
      item.stockKnown = true;
      item.onHand += Math.max(0, Math.floor(s.onHand || 0));
      item.inbound += Math.max(0, Math.floor(s.inbound || 0));
      const ts = new Date(s.updatedAt).getTime();
      if (Number.isFinite(ts) && ts > item.updatedAtTs) item.updatedAtTs = ts;
      if (Number.isFinite(ts) && ts > 0 && (item.firstSeenTs === 0 || ts < item.firstSeenTs)) item.firstSeenTs = ts;
    }

    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    for (const o of orders) {
      if (!o.marketplace) continue;
      const item = ensure(o.sku, o.marketplace);
      const name = pickNameFromRecord(o as unknown as Record<string, unknown>);
      if (name) item.name = name;
      if (o.marketplace) item.marketplaces.add(o.marketplace);
      if (o.connectionId) item.connectionIds.add(o.connectionId);
      const ts = new Date(o.date).getTime();
      if (Number.isFinite(ts) && ts > item.updatedAtTs) item.updatedAtTs = ts;
      if (Number.isFinite(ts) && ts > 0 && (item.firstSeenTs === 0 || ts < item.firstSeenTs)) item.firstSeenTs = ts;
      if (Number.isFinite(ts) && now - ts <= THIRTY_DAYS_MS) {
        item.soldLast30d += Math.max(0, Math.floor(o.qty || 0));
      }
    }

    const products: ProductRow[] = Array.from(bySkuMarketplace.values()).map((item, idx) => {
      const pricesSorted = item.prices.slice().sort((a, b) => a - b);
      const pricesCount = pricesSorted.length;
      const avgPrice = pricesCount > 0 ? item.prices.reduce((a, b) => a + b, 0) / pricesCount : 0;
      const minPrice = pricesCount > 0 ? pricesSorted[0] : 0;
      const maxPrice = pricesCount > 0 ? pricesSorted[pricesCount - 1] : 0;

      const status = getStatus({
        pricesCount,
        onHand: item.onHand,
        inbound: item.inbound,
        stockKnown: item.stockKnown,
        soldLast30d: item.soldLast30d,
      });
      const stockHealth = getStockHealth(item.onHand, item.soldLast30d);
      const updatedAt = item.updatedAtTs > 0 ? new Date(item.updatedAtTs).toISOString() : new Date(0).toISOString();
      const firstSeenAt = item.firstSeenTs > 0 ? new Date(item.firstSeenTs).toISOString() : updatedAt;

      return {
        id: `PRD-${idx + 1}`,
        name: item.name || item.sku,
        sku: item.sku,
        marketplace: item.marketplace,
        marketplaces: Array.from(item.marketplaces.values()).sort(),
        connectionIds: Array.from(item.connectionIds.values()).sort(),
        avgPrice,
        minPrice,
        maxPrice,
        onHand: item.onHand,
        inbound: item.inbound,
        stockKnown: item.stockKnown,
        soldLast30d: item.soldLast30d,
        status,
        stockHealth,
        firstSeenAt,
        updatedAt,
      };
    }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return NextResponse.json({ products });
  } catch (err) {
    console.error("Error in products API:", err);
    return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
  }
}
