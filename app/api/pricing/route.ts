import { requireAuth } from '@/lib/auth-guard';
/**
 * API Route: GET /api/pricing
 * Returns pricing dashboard data
 */

import { NextResponse } from "next/server";
import path from "path";
import { buildPricingDashboard } from "@/src/pricing/engine";
import { demoPrices, demoCogs, demoFees } from "@/src/pricing/demoData";
import { getEnabledConnections, filterByEnabledConnections } from "@/src/integrations/enabled";
import { INTEGRATIONS_COPY } from "@/src/integrations/uiCopy";
import { readJsonFile } from "@/src/integrations/storage";

const PRICES_FILE = path.join(process.cwd(), "data", "canonical", "prices.json");
const ORDERS_FILE = path.join(process.cwd(), "data", "canonical", "orders.json");
const STOCKS_FILE = path.join(process.cwd(), "data", "canonical", "stocks.json");
const ADS_FILE = path.join(process.cwd(), "data", "canonical", "ads.json");

export async function GET()  {
	const { error } = await requireAuth();
	if (error) return error;
  try {
    // Check for enabled connections
    const enabledConnections = await getEnabledConnections();
    
    // If no enabled connections, return empty state
    if (enabledConnections.length === 0) {
      return NextResponse.json({
        mode: "demo",
        warnings: ["No integrations connected"],
        emptyState: {
          title: INTEGRATIONS_COPY.emptyState.title,
          body: INTEGRATIONS_COPY.emptyState.body,
          ctaLabel: INTEGRATIONS_COPY.emptyState.ctaLabel,
          ctaHref: INTEGRATIONS_COPY.emptyState.ctaHref,
        },
        summary: null,
        rows: [],
      });
    }

    // Load canonical data populated by integration sync
    const prices = await readJsonFile<any[]>(PRICES_FILE, []);
    const orders = await readJsonFile<any[]>(ORDERS_FILE, []);
    const stocks = await readJsonFile<any[]>(STOCKS_FILE, []);
    const ads = await readJsonFile<any[]>(ADS_FILE, []);

    // Master data still uses configured defaults
    const cogs = demoCogs;
    const fees = demoFees;

    // Filter by enabled connections
    const filteredPrices = filterByEnabledConnections(prices, enabledConnections);
    const filteredOrders = filterByEnabledConnections(orders, enabledConnections);
    const filteredStocks = filterByEnabledConnections(stocks, enabledConnections);
    const filteredAds = filterByEnabledConnections(ads, enabledConnections);

    const dashboard = buildPricingDashboard(
      filteredPrices.length > 0 ? filteredPrices : demoPrices,
      cogs,
      fees,
      filteredOrders.length > 0 ? filteredOrders : [],
      filteredStocks.length > 0 ? filteredStocks : [],
      filteredAds.length > 0 ? filteredAds : [],
      filteredPrices.length > 0 ? "live" : "demo"
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
