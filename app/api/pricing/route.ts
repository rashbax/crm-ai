import { requireAuth } from '@/lib/auth-guard';
/**
 * API Route: GET /api/pricing
 * Returns pricing dashboard data with T3-09 signals
 */

import { NextResponse } from "next/server";
import path from "path";
import { buildPricingDashboard } from "@/src/pricing/engine";
import type { OwnerMap, ApprovalInfo } from "@/src/pricing/engine";
import { demoFees } from "@/src/pricing/demoData";
import { getPricingRulesMap } from "@/src/pricing/config";
import { getEnabledConnectionsForMarketplace, filterByEnabledConnections } from "@/src/integrations/enabled";
import { INTEGRATIONS_COPY } from "@/src/integrations/uiCopy";
import { readJsonFile } from "@/src/integrations/storage";
import { getResponsibilities, getApprovals, getSystemUsers } from "@/lib/founder-store";
import type { CogsState, FeesConfig, PriceState, PriceChangeEntry, PriceDraft } from "@/src/pricing/types";

const PRICES_FILE = path.join(process.cwd(), "data", "canonical", "prices.json");
const ORDERS_FILE = path.join(process.cwd(), "data", "canonical", "orders.json");
const STOCKS_FILE = path.join(process.cwd(), "data", "canonical", "stocks.json");
const ADS_FILE = path.join(process.cwd(), "data", "canonical", "ads.json");
const COGS_FILE = path.join(process.cwd(), "data", "canonical", "cogs.json");
const FEES_FILE = path.join(process.cwd(), "data", "canonical", "fees.json");

function inferCogsFromPrices(prices: PriceState[]): CogsState[] {
  const bySku = new Map<string, number>();

  for (const item of prices) {
    const current = bySku.get(item.sku);
    if (current === undefined || item.price < current) {
      bySku.set(item.sku, item.price);
    }
  }

  const now = new Date().toISOString();
  return Array.from(bySku.entries()).map(([sku, minObservedPrice]) => ({
    sku,
    cogs: Math.max(1, Math.round(minObservedPrice * 0.6)),
    currency: "RUB",
    updatedAt: now,
  }));
}

function resolveCogsAndFees(prices: PriceState[], rawCogs: CogsState[], rawFees: FeesConfig[]) {
  // Prefer costPrice from API (set via Ozon), then cogs.json, then infer from prices
  const apiCogs: CogsState[] = [];
  const now = new Date().toISOString();
  const seenSkus = new Set<string>();
  for (const p of prices) {
    if (p.costPrice && p.costPrice > 0 && !seenSkus.has(p.sku)) {
      seenSkus.add(p.sku);
      apiCogs.push({ sku: p.sku, cogs: p.costPrice, currency: "RUB", updatedAt: now });
    }
  }
  const cogs = apiCogs.length > 0 ? apiCogs : rawCogs.length > 0 ? rawCogs : inferCogsFromPrices(prices);
  const fees = rawFees.length > 0 ? rawFees : demoFees;
  return { cogs, fees };
}

export async function GET(request: Request)  {
	const { error } = await requireAuth();
	if (error) return error;
  try {
    // Check for enabled connections
    const mp = new URL(request.url).searchParams.get("marketplace") || "all";
    const enabledConnections = await getEnabledConnectionsForMarketplace(mp);
    
    // If no enabled connections, return empty state
    if (enabledConnections.length === 0) {
      return NextResponse.json({
        mode: "live",
        warnings: ["No integrations connected"],
        rules: getPricingRulesMap(),
        emptyState: {
          title: INTEGRATIONS_COPY.ru.emptyState.title,
          body: INTEGRATIONS_COPY.ru.emptyState.body,
          ctaLabel: INTEGRATIONS_COPY.ru.emptyState.ctaLabel,
          ctaHref: INTEGRATIONS_COPY.ru.emptyState.ctaHref,
        },
        summary: null,
        fees: [],
        rows: [],
      });
    }

    // Load canonical data populated by integration sync
    const canonicalPrices = await readJsonFile<any[]>(PRICES_FILE, []);
    const orders = await readJsonFile<any[]>(ORDERS_FILE, []);
    const stocks = await readJsonFile<any[]>(STOCKS_FILE, []);
    const ads = await readJsonFile<any[]>(ADS_FILE, []);

    // Master data still uses configured defaults
    const canonicalCogs = await readJsonFile<CogsState[]>(COGS_FILE, []);
    const canonicalFees = await readJsonFile<FeesConfig[]>(FEES_FILE, []);

    // Filter by enabled connections
    const filteredPrices = filterByEnabledConnections(canonicalPrices, enabledConnections);
    const filteredOrders = filterByEnabledConnections(orders, enabledConnections);
    const filteredStocks = filterByEnabledConnections(stocks, enabledConnections);
    const filteredAds = filterByEnabledConnections(ads, enabledConnections);

    if (filteredPrices.length === 0) {
      return NextResponse.json({
        mode: "live",
        warnings: ["No live pricing data found. Run integration sync first."],
        rules: getPricingRulesMap(),
        emptyState: {
          title: INTEGRATIONS_COPY.ru.emptyState.title,
          body: "Подключение есть, но цены еще не синхронизированы. Запустите синхронизацию.",
          ctaLabel: "Перейти в интеграции",
          ctaHref: "/integrations",
        },
        summary: null,
        fees: [],
        rows: [],
      });
    }

    const pricingStates = filteredPrices;
    const { cogs, fees } = resolveCogsAndFees(pricingStates, canonicalCogs, canonicalFees);

    // Build owner map from responsibilities
    const ownerMap: OwnerMap = {};
    try {
      const responsibilities = getResponsibilities();
      const users = getSystemUsers();
      const userNameMap = new Map(users.map((u) => [u.id, u.name]));
      for (const r of responsibilities) {
        if (r.active) {
          const ownerName = userNameMap.get(r.marketplaceOwnerId) || r.marketplaceOwnerId;
          ownerMap[`${r.skuId}::${r.marketplace}`] = ownerName;
        }
      }
    } catch {
      // Responsibilities data may not exist
    }

    // Build approval info for pricing
    const approvalInfos: ApprovalInfo[] = [];
    try {
      const allApprovals = getApprovals();
      for (const a of allApprovals) {
        if (a.entityType === "price" || a.entityType === "promo") {
          // entityId format: "sku::marketplace"
          const parts = a.entityId.split("::");
          if (parts.length === 2) {
            approvalInfos.push({
              sku: parts[0],
              marketplace: parts[1] as any,
              status: a.status,
              approvalId: a.id,
            });
          }
        }
      }
    } catch {
      // Approvals data may not exist
    }

    // Count pending drafts
    let pendingDraftCount = 0;
    try {
      const draftsFile = path.join(process.cwd(), "data", "canonical", "priceDrafts.json");
      const drafts = await readJsonFile<PriceDraft[]>(draftsFile, []);
      pendingDraftCount = (drafts as any[]).filter((d: any) => d.status === "DRAFT").length;
    } catch {
      // No drafts
    }

    // Load change history for lastChanged
    let changeHistory: Array<{ sku: string; marketplace: string; changedAt: string }> = [];
    try {
      const historyFile = path.join(process.cwd(), "data", "canonical", "priceHistory.json");
      const history = await readJsonFile<PriceChangeEntry[]>(historyFile, []);
      // Get the most recent change per sku+marketplace
      const latestMap = new Map<string, string>();
      for (const h of history as any[]) {
        const key = `${h.sku}::${h.marketplace}`;
        if (!latestMap.has(key) || h.changedAt > latestMap.get(key)!) {
          latestMap.set(key, h.changedAt);
        }
      }
      changeHistory = Array.from(latestMap.entries()).map(([key, changedAt]) => {
        const [sku, marketplace] = key.split("::");
        return { sku, marketplace, changedAt };
      });
    } catch {
      // No history
    }

    const dashboard = buildPricingDashboard(
      pricingStates,
      cogs,
      fees,
      filteredOrders,
      filteredStocks,
      filteredAds,
      "live",
      ownerMap,
      approvalInfos,
      pendingDraftCount,
      changeHistory
    );

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("Error in pricing API:", error);
    return NextResponse.json(
      { error: "Failed to generate pricing data" },
      { status: 500 }
    );
  }
}
