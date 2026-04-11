/**
 * Loads full CRM data context for AI assistant.
 * Provides compact snapshots of all data sources so the AI can answer
 * questions about products, sales, prices, stock, finance, tasks, incidents, etc.
 */

import path from "path";
import { readJsonFile } from "@/src/integrations/storage";
import { filterByEnabledConnections, getEnabledConnections } from "@/src/integrations/enabled";
import { getBusinessIsoDay } from "@/lib/date";
import { getFounderTasks, getIncidents, getApprovals } from "@/lib/founder-store";
import { buildAutomationDecisionRows } from "@/lib/automation/decisions";
import { loadAutomationSnapshot } from "@/lib/automation/snapshot";
import type { OrderEvent, PriceState, StockState } from "@/src/pricing/types";

const DATA_DIR = path.join(process.cwd(), "data", "canonical");

interface CompactOrder {
  sku: string;
  marketplace: string;
  qty: number;
  revenue: number;
  status: string;
  date: string;
}

interface CompactProduct {
  sku: string;
  marketplace: string;
  price: number;
  stock: number;
  sold30d: number;
  daysLeft: number;
}

interface CompactTask {
  title: string;
  status: string;
  priority: string;
  owner: string;
  dueDate?: string;
}

interface CompactIncident {
  title: string;
  severity: string;
  status: string;
  owner: string;
  dueDate: string;
}

interface CompactApproval {
  entityType: string;
  reason: string;
  status: string;
  requestedBy: string;
}

export interface CrmDataContext {
  today: string;
  sales: {
    todayLineItems: number;
    todayUnitsSold: number;
    todayRevenue: number;
    last7dUnitsSold: number;
    last7dRevenue: number;
    last30dUnitsSold: number;
    last30dRevenue: number;
    topSkusToday: Array<{ sku: string; unitsSold: number; revenue: number }>;
    topSkus30d: Array<{ sku: string; unitsSold: number; revenue: number }>;
  };
  products: CompactProduct[];
  stockAlerts: Array<{ sku: string; stock: number; daysLeft: number; marketplace: string }>;
  pricesSummary: {
    totalSkus: number;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
  };
  ads: {
    totalCampaigns: number;
    pauseRecommended: number;
    reduceRecommended: number;
    wasteCount: number;
    topWaste: Array<{ sku: string; spendToday: number; conversions: number }>;
  };
  tasks: {
    total: number;
    overdue: number;
    inProgress: number;
    blocked: number;
    items: CompactTask[];
  };
  incidents: {
    total: number;
    open: number;
    critical: number;
    items: CompactIncident[];
  };
  approvals: {
    total: number;
    pending: number;
    items: CompactApproval[];
  };
}

function isCancelled(status?: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s.includes("cancel") || s.includes("отмен");
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function loadFullCrmContext(): Promise<CrmDataContext> {
  const enabledConnections = await getEnabledConnections();
  const today = getBusinessIsoDay();
  const day7ago = daysAgo(7);
  const day30ago = daysAgo(30);

  // Load raw data
  const rawOrders = await readJsonFile<OrderEvent[]>(path.join(DATA_DIR, "orders.json"), []);
  const rawPrices = await readJsonFile<PriceState[]>(path.join(DATA_DIR, "prices.json"), []);
  const rawStocks = await readJsonFile<StockState[]>(path.join(DATA_DIR, "stocks.json"), []);

  // Filter by enabled connections
  const orders = filterByEnabledConnections(rawOrders, enabledConnections);
  const prices = filterByEnabledConnections(rawPrices, enabledConnections);
  const stocks = filterByEnabledConnections(rawStocks, enabledConnections);

  // Sales aggregation
  const validOrders = orders.filter(o => !isCancelled(o.sourceStatus));
  const todayOrders = validOrders.filter(o => getBusinessIsoDay(o.date) === today);
  const week = validOrders.filter(o => o.date >= day7ago);
  const month = validOrders.filter(o => o.date >= day30ago);

  const todayUnits = todayOrders.reduce((s, o) => s + Math.max(0, o.qty || 0), 0);
  const todayRevenue = todayOrders.reduce((s, o) => s + Math.max(0, o.revenue || 0), 0);

  // Top SKUs today
  const skuMapToday = new Map<string, { qty: number; revenue: number }>();
  for (const o of todayOrders) {
    const prev = skuMapToday.get(o.sku) || { qty: 0, revenue: 0 };
    skuMapToday.set(o.sku, { qty: prev.qty + (o.qty || 0), revenue: prev.revenue + (o.revenue || 0) });
  }
  const topSkusToday = Array.from(skuMapToday.entries())
    .map(([sku, d]) => ({ sku, ...d }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Top SKUs 30d
  const skuMap30d = new Map<string, { qty: number; revenue: number }>();
  for (const o of month) {
    const prev = skuMap30d.get(o.sku) || { qty: 0, revenue: 0 };
    skuMap30d.set(o.sku, { qty: prev.qty + (o.qty || 0), revenue: prev.revenue + (o.revenue || 0) });
  }
  const topSkus30d = Array.from(skuMap30d.entries())
    .map(([sku, d]) => ({ sku, ...d }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Products: merge prices + stocks + sales
  const productMap = new Map<string, CompactProduct>();
  for (const p of prices) {
    const key = `${p.sku}_${p.marketplace}`;
    productMap.set(key, {
      sku: p.sku,
      marketplace: p.marketplace || "unknown",
      price: p.price || 0,
      stock: 0,
      sold30d: 0,
      daysLeft: Infinity,
    });
  }
  for (const s of stocks) {
    const key = `${s.sku}_${s.marketplace}`;
    const existing = productMap.get(key);
    if (existing) {
      existing.stock = s.onHand || 0;
    } else {
      productMap.set(key, {
        sku: s.sku,
        marketplace: s.marketplace || "unknown",
        price: 0,
        stock: s.onHand || 0,
        sold30d: 0,
        daysLeft: Infinity,
      });
    }
  }
  // Add 30d sales to products
  for (const [sku, data] of Array.from(skuMap30d.entries())) {
    for (const [, prod] of Array.from(productMap.entries())) {
      if (prod.sku === sku) {
        prod.sold30d = data.qty;
        const dailySales = data.qty / 30;
        prod.daysLeft = dailySales > 0 ? Math.round(prod.stock / dailySales) : Infinity;
      }
    }
  }

  const products = Array.from(productMap.values()).slice(0, 50);

  // Stock alerts
  const stockAlerts = products
    .filter(p => p.daysLeft < 14 && p.daysLeft !== Infinity)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 10);

  // Prices summary
  const priceValues = prices.map(p => p.price || 0).filter(p => p > 0);
  const pricesSummary = {
    totalSkus: priceValues.length,
    avgPrice: priceValues.length ? Math.round(priceValues.reduce((a, b) => a + b, 0) / priceValues.length) : 0,
    minPrice: priceValues.length ? Math.min(...priceValues) : 0,
    maxPrice: priceValues.length ? Math.max(...priceValues) : 0,
  };

  // Automation / ads
  let ads = { totalCampaigns: 0, pauseRecommended: 0, reduceRecommended: 0, wasteCount: 0, topWaste: [] as Array<{ sku: string; spendToday: number; conversions: number }> };
  try {
    const snapshot = await loadAutomationSnapshot();
    const rows = buildAutomationDecisionRows(snapshot.stockItems, snapshot.adCampaigns);
    ads = {
      totalCampaigns: rows.filter(r => r.adStatus === "active").length,
      pauseRecommended: rows.filter(r => r.decision === "pause").length,
      reduceRecommended: rows.filter(r => r.decision === "reduce").length,
      wasteCount: rows.filter(r => r.wasteFlag).length,
      topWaste: rows.filter(r => r.wasteFlag).sort((a, b) => b.spendToday - a.spendToday).slice(0, 5)
        .map(r => ({ sku: r.sku, spendToday: Math.round(r.spendToday), conversions: r.conversionsToday })),
    };
  } catch { /* no ads data */ }

  // Tasks
  const allTasks = getFounderTasks();
  const tasks = {
    total: allTasks.length,
    overdue: allTasks.filter(t => t.isOverdue).length,
    inProgress: allTasks.filter(t => t.status === "in_progress").length,
    blocked: allTasks.filter(t => t.status === "blocked").length,
    items: allTasks.slice(0, 20).map(t => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      owner: t.assigneeId,
      dueDate: t.dueDate,
    })),
  };

  // Incidents
  const allIncidents = getIncidents();
  const incidents = {
    total: allIncidents.length,
    open: allIncidents.filter(i => i.status === "open" || i.status === "in_progress").length,
    critical: allIncidents.filter(i => i.severity === "critical").length,
    items: allIncidents.slice(0, 10).map(i => ({
      title: i.title,
      severity: i.severity,
      status: i.status,
      owner: i.ownerId,
      dueDate: i.dueDate,
    })),
  };

  // Approvals
  const allApprovals = getApprovals();
  const approvals = {
    total: allApprovals.length,
    pending: allApprovals.filter(a => a.status === "pending").length,
    items: allApprovals.filter(a => a.status === "pending").slice(0, 10).map(a => ({
      entityType: a.entityType,
      reason: a.reason,
      status: a.status,
      requestedBy: a.requestedBy,
    })),
  };

  return {
    today,
    sales: {
      todayLineItems: todayOrders.length,
      todayUnitsSold: todayUnits,
      todayRevenue: Math.round(todayRevenue),
      last7dUnitsSold: week.reduce((s, o) => s + Math.max(0, o.qty || 0), 0),
      last7dRevenue: Math.round(week.reduce((s, o) => s + (o.revenue || 0), 0)),
      last30dUnitsSold: month.reduce((s, o) => s + Math.max(0, o.qty || 0), 0),
      last30dRevenue: Math.round(month.reduce((s, o) => s + (o.revenue || 0), 0)),
      topSkusToday: topSkusToday.map(s => ({ sku: s.sku, unitsSold: s.qty, revenue: s.revenue })),
      topSkus30d: topSkus30d.map(s => ({ sku: s.sku, unitsSold: s.qty, revenue: s.revenue })),
    },
    products,
    stockAlerts,
    pricesSummary,
    ads,
    tasks,
    incidents,
    approvals,
  };
}
