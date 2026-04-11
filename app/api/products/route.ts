import { requireAuth } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import path from "path";
import { readdirSync, readFileSync } from "fs";
import { readJsonFile } from "@/src/integrations/storage";
import { filterByEnabledConnections, getEnabledConnectionsForMarketplace } from "@/src/integrations/enabled";
import type { OrderEvent, PriceState, StockState } from "@/src/pricing/types";
import { getFounderTasks, getIncidents, getResponsibilities, getSystemUsers, getAuditLogs } from "@/lib/founder-store";
import type { PriceChangeEntry } from "@/src/pricing/types";

const PRICE_HISTORY_FILE = path.join(process.cwd(), "data", "canonical", "priceHistory.json");

const CACHE_DIR = path.join(process.cwd(), "data", "cache");

/** Build offerId → numeric Ozon article map from identity cache files */
function buildOzonArticulMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const files = readdirSync(CACHE_DIR).filter((f) => f.startsWith("ozon-product-identity-") && f.endsWith(".json"));
    for (const file of files) {
      const raw = JSON.parse(readFileSync(path.join(CACHE_DIR, file), "utf-8"));
      for (const item of raw?.items ?? []) {
        if (!item?.offerId) continue;
        // Find first purely numeric string with ≥8 digits — that's the Ozon product_id
        const numericId = (item.identifiers ?? []).find(
          (s: string) => typeof s === "string" && /^\d{8,}$/.test(s)
        );
        if (numericId) map.set(item.offerId, numericId);
      }
    }
  } catch { /* cache may not exist */ }
  return map;
}

type ProductStatus = "active" | "draft" | "blocked";
type StockHealth = "critical" | "low" | "normal" | "good";
type RiskLevel = "NONE" | "LOW" | "MED" | "HIGH" | "CRITICAL";

interface ProductRow {
  id: string;
  sku: string;
  articul?: string;
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
  riskLevel: RiskLevel;
  ownerName: string | null;
  ownerId: string | null;
  openTasksCount: number;
  openIncidentsCount: number;
  tasks: { id: string; title: string; status: string; priority: string }[];
  incidents: { id: string; title: string; severity: string; status: string }[];
  priceHistory: { id: string; oldPrice: number; newPrice: number; reason: string; changedBy: string; changedAt: string }[];
  recentChanges: { id: string; entityType: string; fieldName: string; oldValue: string; newValue: string; changedBy: string; changedAt: string }[];
  firstSeenAt: string;
  updatedAt: string;
}

const PRICES_FILE = path.join(process.cwd(), "data", "canonical", "prices.json");
const STOCKS_FILE = path.join(process.cwd(), "data", "canonical", "stocks.json");
const ORDERS_FILE = path.join(process.cwd(), "data", "canonical", "orders.json");

function getStockHealth(onHand: number, soldLast30d: number): StockHealth {
  const dailyAvgSold = Math.max(0, soldLast30d) / 30;
  const leadTimeDays = 7;
  const projectedStockAtReplenishment = onHand - dailyAvgSold * leadTimeDays;
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
  onSale?: boolean;
}): ProductStatus {
  const { pricesCount, onHand, inbound, stockKnown, soldLast30d, onSale } = params;
  if (onSale === false) return "blocked";
  if (onSale === true) return "active";
  if (stockKnown && onHand <= 0 && inbound <= 0) return "blocked";
  if (soldLast30d > 0) return "active";
  if (pricesCount > 0) return "draft";
  return stockKnown && (onHand > 0 || inbound > 0) ? "active" : "draft";
}

function calcRisk(
  stockHealth: StockHealth,
  soldLast30d: number,
  openIncidentsCount: number,
  openTasksCount: number,
  hasHighIncident: boolean
): RiskLevel {
  if (hasHighIncident) return "CRITICAL";
  if (stockHealth === "critical" && soldLast30d > 0) return "CRITICAL";
  if (stockHealth === "critical" || openIncidentsCount > 0) return "HIGH";
  if (stockHealth === "low" && soldLast30d > 0) return "HIGH";
  if (stockHealth === "low" || openTasksCount > 3) return "MED";
  if (openTasksCount > 0) return "LOW";
  return "NONE";
}

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const mp = new URL(request.url).searchParams.get("marketplace") || "all";
    const enabledConnections = await getEnabledConnectionsForMarketplace(mp);
    if (enabledConnections.length === 0) {
      return NextResponse.json({ products: [] });
    }

    const pricesRaw = await readJsonFile<PriceState[]>(PRICES_FILE, []);
    const stocksRaw = await readJsonFile<StockState[]>(STOCKS_FILE, []);
    const ordersRaw = await readJsonFile<OrderEvent[]>(ORDERS_FILE, []);

    const prices = filterByEnabledConnections(pricesRaw, enabledConnections);
    const stocks = filterByEnabledConnections(stocksRaw, enabledConnections);
    const orders = filterByEnabledConnections(ordersRaw, enabledConnections);

    // Load founder data
    const ozonArticulMap = buildOzonArticulMap();
    const allTasks = getFounderTasks();
    const allAuditLogs = getAuditLogs();
    const allPriceHistory = await readJsonFile<PriceChangeEntry[]>(PRICE_HISTORY_FILE, []);
    const allIncidents = getIncidents();
    const responsibilities = getResponsibilities();
    const users = getSystemUsers();

    const bySkuMarketplace = new Map<string, {
      sku: string;
      marketplace: string;
      marketplaces: Set<string>;
      connectionIds: Set<string>;
      prices: number[];
      onHand: number;
      inbound: number;
      stockKnown: boolean;
      soldLast30d: number;
      onSale?: boolean;
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
        marketplace,
        marketplaces: new Set<string>([marketplace]),
        connectionIds: new Set<string>(),
        prices: [] as number[],
        onHand: 0,
        inbound: 0,
        stockKnown: false,
        soldLast30d: 0,
        onSale: undefined as boolean | undefined,
        firstSeenTs: 0,
        updatedAtTs: 0,
      };
      bySkuMarketplace.set(key, created);
      return created;
    };

    for (const p of prices) {
      const item = ensure(p.sku, p.marketplace);
      item.marketplaces.add(p.marketplace);
      if (p.connectionId) item.connectionIds.add(p.connectionId);
      if (Number.isFinite(p.price)) item.prices.push(p.price);
      if ((p as any).onSale === true || (p as any).onSale === false) {
        item.onSale = (p as any).onSale;
      }
      const ts = new Date(p.updatedAt).getTime();
      if (Number.isFinite(ts) && ts > item.updatedAtTs) item.updatedAtTs = ts;
      if (Number.isFinite(ts) && ts > 0 && (item.firstSeenTs === 0 || ts < item.firstSeenTs)) item.firstSeenTs = ts;
    }

    for (const s of stocks) {
      if (!s.marketplace) continue;
      const item = ensure(s.sku, s.marketplace);
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
      if (o.marketplace) item.marketplaces.add(o.marketplace);
      if (o.connectionId) item.connectionIds.add(o.connectionId);
      const ts = new Date(o.date).getTime();
      if (Number.isFinite(ts) && ts > item.updatedAtTs) item.updatedAtTs = ts;
      if (Number.isFinite(ts) && ts > 0 && (item.firstSeenTs === 0 || ts < item.firstSeenTs)) item.firstSeenTs = ts;
      if (Number.isFinite(ts) && now - ts <= THIRTY_DAYS_MS) {
        const isCancelled = /cancel|отмен|return|возврат/i.test(o.sourceStatus || "");
        if (!isCancelled) item.soldLast30d += Math.max(0, Math.floor(o.qty || 0));
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
        onSale: item.onSale,
      });
      const stockHealth = getStockHealth(item.onHand, item.soldLast30d);
      const updatedAt = item.updatedAtTs > 0 ? new Date(item.updatedAtTs).toISOString() : new Date(0).toISOString();
      const firstSeenAt = item.firstSeenTs > 0 ? new Date(item.firstSeenTs).toISOString() : updatedAt;

      // Responsibilities — match skuId to sku, marketplace normalized
      const mpNorm = item.marketplace.toLowerCase();
      const resp = responsibilities.find(
        (r) => r.skuId === item.sku && r.marketplace.toLowerCase() === mpNorm && r.active
      );
      const ownerUser = resp ? users.find((u) => u.id === resp.marketplaceOwnerId) : null;

      // Tasks — open = not done/cancelled
      const CLOSED_TASK = new Set(["done"]);
      const skuTasks = allTasks.filter(
        (t) => t.skuId === item.sku && !CLOSED_TASK.has(t.status)
      );

      // Incidents — open = open/in_progress/escalated
      const OPEN_INCIDENT = new Set(["open", "in_progress", "escalated"]);
      const skuIncidents = allIncidents.filter(
        (i) => i.skuId === item.sku && OPEN_INCIDENT.has(i.status)
      );

      const hasHighIncident = skuIncidents.some(
        (i) => i.severity === "critical" || i.severity === "high"
      );

      // Price history for this SKU
      const skuPriceHistory = allPriceHistory
        .filter((h) => h.sku === item.sku && h.marketplace === item.marketplace)
        .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
        .slice(0, 5)
        .map((h) => ({ id: h.id, oldPrice: h.oldPrice, newPrice: h.newPrice, reason: h.reason || "", changedBy: h.changedBy || "", changedAt: h.changedAt }));

      // Audit log: entries for tasks/incidents linked to this SKU
      const linkedIds = new Set([
        ...skuTasks.map((t) => t.id),
        ...skuIncidents.map((i) => i.id),
        item.sku, // also direct SKU-level entries if any
      ]);
      const skuAuditLogs = allAuditLogs
        .filter((l) => linkedIds.has(l.entityId))
        .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
        .slice(0, 8)
        .map((l) => ({ id: l.id, entityType: l.entityType, fieldName: l.fieldName, oldValue: l.oldValue, newValue: l.newValue, changedBy: l.changedBy, changedAt: l.changedAt }));

      const riskLevel = calcRisk(
        stockHealth,
        item.soldLast30d,
        skuIncidents.length,
        skuTasks.length,
        hasHighIncident
      );

      const articul = item.marketplace === "ozon"
        ? ozonArticulMap.get(item.sku)
        : undefined;

      return {
        id: `PRD-${idx + 1}`,
        sku: item.sku,
        articul,
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
        riskLevel,
        ownerName: ownerUser?.name ?? null,
        ownerId: ownerUser?.id ?? null,
        openTasksCount: skuTasks.length,
        openIncidentsCount: skuIncidents.length,
        tasks: skuTasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })),
        incidents: skuIncidents.map((i) => ({ id: i.id, title: i.title, severity: i.severity, status: i.status })),
        priceHistory: skuPriceHistory,
        recentChanges: skuAuditLogs,
        firstSeenAt,
        updatedAt,
      };
    }).sort((a, b) => {
      // Sort by risk first, then by updatedAt
      const riskOrder: Record<RiskLevel, number> = { CRITICAL: 0, HIGH: 1, MED: 2, LOW: 3, NONE: 4 };
      const rd = riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
      if (rd !== 0) return rd;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return NextResponse.json({ products });
  } catch (err) {
    console.error("Error in products API:", err);
    return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
  }
}
