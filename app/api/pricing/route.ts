import { requireAuth } from '@/lib/auth-guard';
/**
 * API Route: GET /api/pricing
 * Returns pricing dashboard data
 */

import { NextResponse } from "next/server";
import path from "path";
import { buildPricingDashboard } from "@/src/pricing/engine";
import { demoFees } from "@/src/pricing/demoData";
import { getPricingRulesMap } from "@/src/pricing/config";
import { getEnabledConnections, filterByEnabledConnections } from "@/src/integrations/enabled";
import { INTEGRATIONS_COPY } from "@/src/integrations/uiCopy";
import { readJsonFile } from "@/src/integrations/storage";
import type { CogsState, FeesConfig, PriceState } from "@/src/pricing/types";

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
  const cogs = rawCogs.length > 0 ? rawCogs : inferCogsFromPrices(prices);
  const fees = rawFees.length > 0 ? rawFees : demoFees;
  return { cogs, fees };
}

export async function GET()  {
	const { error } = await requireAuth();
	if (error) return error;
  try {
    // Check for enabled connections
    const enabledConnections = await getEnabledConnections();
    
    // If no enabled connections, return empty state
    if (enabledConnections.length === 0) {
      return NextResponse.json({
        mode: "live",
        warnings: ["No integrations connected"],
        rules: getPricingRulesMap(),
        emptyState: {
          title: INTEGRATIONS_COPY.emptyState.title,
          body: INTEGRATIONS_COPY.emptyState.body,
          ctaLabel: INTEGRATIONS_COPY.emptyState.ctaLabel,
          ctaHref: INTEGRATIONS_COPY.emptyState.ctaHref,
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
          title: INTEGRATIONS_COPY.emptyState.title,
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


    const dashboard = buildPricingDashboard(
      pricingStates,
      cogs,
      fees,
      filteredOrders,
      filteredStocks,
      filteredAds,
      "live"
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
