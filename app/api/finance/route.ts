import { requireAuth } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import path from "path";
import { readJsonFile, getConnections } from "@/src/integrations/storage";
import { filterByEnabledConnections, getEnabledConnections } from "@/src/integrations/enabled";
import { decryptCredentials } from "@/lib/encryption";
import type { Connection } from "@/src/integrations/types";
import type { OrderEvent } from "@/src/pricing/types";

type TransactionType = "sale" | "refund" | "commission" | "withdrawal" | "adjustment";
type Marketplace = "Ozon" | "Wildberries";

interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  marketplace: Marketplace;
  orderId?: string;
  amount: number;
  balance: number;
  description: string;
}

interface ChartDataPoint {
  date: string;
  revenue: number;
  orders: number;
}

const ORDERS_FILE = path.join(process.cwd(), "data", "canonical", "orders.json");
const CONNECTIONS_FILE = path.join(process.cwd(), "data", "secure", "connections.json");
const OZON_API_BASE = "https://api-seller.ozon.ru";

function mapMarketplace(m?: string): Marketplace {
  return m === "wb" ? "Wildberries" : "Ozon";
}

function isRefundStatus(status?: string): boolean {
  const s = String(status || "").toLowerCase();
  return (
    s.includes("cancel") ||
    s.includes("refund") ||
    s.includes("return") ||
    s.includes("otmen") ||
    s.includes("vozvr")
  );
}

function amountFromOrder(o: OrderEvent): number {
  if (typeof o.revenue === "number" && Number.isFinite(o.revenue)) return Math.abs(o.revenue);
  const price = typeof o.price === "number" ? o.price : 0;
  const qty = Number.isFinite(o.qty) ? o.qty : 0;
  return Math.abs(price * qty);
}

function isoSafe(value: string): string {
  if (!value) return new Date().toISOString();
  if (value.includes("T")) return value;
  return `${value}T00:00:00.000Z`;
}

function collectNumbersByKeyPattern(node: unknown, patterns: RegExp[], out: number[] = []): number[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectNumbersByKeyPattern(item, patterns, out);
    return out;
  }
  if (typeof node !== "object") return out;

  const entries = Object.entries(node as Record<string, unknown>);
  for (const [key, value] of entries) {
    const matched = patterns.some((re) => re.test(key));
    if (matched && typeof value === "number" && Number.isFinite(value)) {
      out.push(value);
    }
    if (typeof value === "object" && value !== null) {
      collectNumbersByKeyPattern(value, patterns, out);
    }
  }
  return out;
}

async function ozonPost(
  creds: { clientId: string; apiKey: string },
  endpoint: string,
  payload: Record<string, unknown>
): Promise<any> {
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

  return body ?? {};
}

async function fetchExactOzonBalance(): Promise<number | null> {
  if (process.env.REAL_API !== "1") return null;

  const connections = await getConnections(CONNECTIONS_FILE);
  const ozonConnection = (connections as Connection[]).find(
    (c) => c.enabled && c.marketplaceId === "ozon"
  );
  if (!ozonConnection?.creds) return null;

  const rawCreds =
    typeof ozonConnection.creds === "string"
      ? decryptCredentials(ozonConnection.creds)
      : (ozonConnection.creds as Record<string, string>);

  const clientId = String(rawCreds.clientId || "").trim();
  const apiKey = String(rawCreds.apiKey || "").trim();
  if (!clientId || !apiKey) return null;

  const creds = { clientId, apiKey };

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Prefer versions proven to work for this account.
  const attempts: Array<{ endpoint: string; payload: Record<string, unknown> }> = [
    {
      endpoint: "/v1/finance/balance",
      payload: {
        date_from: fmt(monthAgo),
        date_to: fmt(now),
      },
    },
    {
      endpoint: "/v3/finance/transaction/list",
      payload: {
        page: 1,
        page_size: 1,
        filter: { date: { from: monthAgo.toISOString(), to: now.toISOString() } },
      },
    },
    { endpoint: "/v3/finance/balance", payload: {} },
    { endpoint: "/v2/finance/balance", payload: {} },
  ];

  for (const attempt of attempts) {
    try {
      const data = await ozonPost(creds, attempt.endpoint, attempt.payload);

      const directCandidates = [
        (data as any)?.result?.total?.closing_balance?.value,
        (data as any)?.total?.closing_balance?.value,
        (data as any)?.result?.total?.opening_balance?.value,
        (data as any)?.total?.opening_balance?.value,
        (data as any)?.result?.balance,
        (data as any)?.balance,
        (data as any)?.result?.available_balance,
        (data as any)?.available_balance,
        (data as any)?.result?.current_balance,
        (data as any)?.current_balance,
      ];
      for (const value of directCandidates) {
        if (typeof value === "number" && Number.isFinite(value)) return value;
      }

      if (attempt.endpoint.includes("/finance/transaction/list")) {
        continue;
      }

      const candidates = collectNumbersByKeyPattern(
        data,
        [/(^|_)(available|current|wallet|final|closing)(_|\b)balance/i]
      );
      if (candidates.length > 0) return candidates[0];
    } catch {
      // Try next endpoint.
    }
  }

  return null;
}

function parseDateInput(input: string | null, fallback: Date): Date {
  if (!input) return fallback;
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return fallback;
  return date;
}

async function getOzonCreds(): Promise<{ clientId: string; apiKey: string } | null> {
  if (process.env.REAL_API !== "1") return null;
  const connections = await getConnections(CONNECTIONS_FILE);
  const ozonConnection = (connections as Connection[]).find(
    (c) => c.enabled && c.marketplaceId === "ozon"
  );
  if (!ozonConnection?.creds) return null;

  const rawCreds =
    typeof ozonConnection.creds === "string"
      ? decryptCredentials(ozonConnection.creds)
      : (ozonConnection.creds as Record<string, string>);

  const clientId = String(rawCreds.clientId || "").trim();
  const apiKey = String(rawCreds.apiKey || "").trim();
  if (!clientId || !apiKey) return null;
  return { clientId, apiKey };
}

async function fetchOzonFinanceSummaryByRange(
  from: Date,
  to: Date
): Promise<{ totalIncome: number; totalExpenses: number; netIncome: number } | null> {
  const creds = await getOzonCreds();
  if (!creds) return null;

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  try {
    const body = await ozonPost(creds, "/v1/finance/balance", {
      date_from: fmt(from),
      date_to: fmt(to),
    });

    const sales = Number((body as any)?.cashflows?.sales?.amount?.value ?? 0);
    const accrued = Number((body as any)?.total?.accrued?.value ?? NaN);

    if (Number.isFinite(sales) && Number.isFinite(accrued)) {
      const totalIncome = Math.round(sales * 100) / 100;
      const netIncome = Math.round(accrued * 100) / 100;
      const totalExpenses = Math.round(Math.max(0, totalIncome - netIncome) * 100) / 100;
      return { totalIncome, totalExpenses, netIncome };
    }
  } catch {
    // Fallback below.
  }

  // Fallback if v1 balance is unavailable.
  let cursor = new Date(from.getTime());
  let totalIncome = 0;
  let totalExpensesAbs = 0;

  while (cursor.getTime() <= to.getTime()) {
    const chunkEnd = new Date(Math.min(to.getTime(), cursor.getTime() + 27 * 24 * 60 * 60 * 1000));
    let page = 1;
    let pageCount = 1;

    do {
      const body = await ozonPost(creds, "/v3/finance/transaction/list", {
        page,
        page_size: 1000,
        filter: {
          date: {
            from: cursor.toISOString(),
            to: chunkEnd.toISOString(),
          },
        },
      });

      const result = (body as any)?.result || {};
      const operations = Array.isArray(result.operations) ? result.operations : [];
      for (const op of operations) {
        const amount = Number(op?.amount);
        if (!Number.isFinite(amount)) continue;
        const opType = String(op?.type || "").toLowerCase();
        const accrualForSale = Number(op?.accruals_for_sale);

        if (Number.isFinite(accrualForSale) && accrualForSale > 0) {
          totalIncome += accrualForSale;
        } else if (amount > 0 && opType === "orders") {
          totalIncome += amount;
        }

        if (amount < 0) {
          totalExpensesAbs += Math.abs(amount);
        }
      }

      pageCount = Number(result.page_count || 1);
      page += 1;
    } while (page <= pageCount);

    cursor = new Date(chunkEnd.getTime() + 24 * 60 * 60 * 1000);
  }

  const totalIncomeRounded = Math.round(totalIncome * 100) / 100;
  const totalExpensesRounded = Math.round(totalExpensesAbs * 100) / 100;
  const netIncome = Math.round((totalIncomeRounded - totalExpensesRounded) * 100) / 100;
  return { totalIncome: totalIncomeRounded, totalExpenses: totalExpensesRounded, netIncome };
}

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const enabled = await getEnabledConnections();
    if (enabled.length === 0) {
      return NextResponse.json({
        transactions: [],
        chartData: [],
        summary: { totalIncome: 0, totalExpenses: 0, currentBalance: 0, netIncome: 0, isEstimatedBalance: true },
      });
    }

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const params = new URL(request.url).searchParams;
    let from = parseDateInput(params.get("startDate"), defaultFrom);
    let to = parseDateInput(params.get("endDate"), now);
    to.setUTCHours(23, 59, 59, 999);
    if (from.getTime() > to.getTime()) {
      const temp = from;
      from = new Date(to.getTime());
      to = new Date(temp.getTime());
      to.setUTCHours(23, 59, 59, 999);
    }

    const rawOrders = await readJsonFile<OrderEvent[]>(ORDERS_FILE, []);
    const orders = filterByEnabledConnections(rawOrders, enabled)
      .slice()
      .sort((a, b) => new Date(isoSafe(a.date)).getTime() - new Date(isoSafe(b.date)).getTime());

    const txNoBalance: Omit<Transaction, "balance">[] = [];
    let trxId = 1;

    for (const o of orders) {
      const base = amountFromOrder(o);
      if (!Number.isFinite(base) || base <= 0) continue;

      const dateIso = isoSafe(o.date);
      const marketplace = mapMarketplace(o.marketplace);
      const refund = isRefundStatus((o as any).sourceStatus);
      const orderId = `${o.sku}-${dateIso.slice(0, 10)}`;

      if (refund) {
        txNoBalance.push({
          id: `TRX-${String(trxId++).padStart(6, "0")}`,
          date: dateIso,
          type: "refund",
          marketplace,
          orderId,
          amount: -base,
          description: "Order refund/cancel",
        });
        continue;
      }

      txNoBalance.push({
        id: `TRX-${String(trxId++).padStart(6, "0")}`,
        date: dateIso,
        type: "sale",
        marketplace,
        orderId,
        amount: base,
        description: "Order sale",
      });
    }

    txNoBalance.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    const transactions: Transaction[] = txNoBalance.map((t) => {
      running += t.amount;
      return { ...t, balance: running };
    });

    const rangeStartMs = from.getTime();
    const rangeEndMs = to.getTime();
    const rangeTransactions = transactions.filter((t) => {
      const ts = new Date(t.date).getTime();
      return ts >= rangeStartMs && ts <= rangeEndMs;
    });

    const orderIncome = rangeTransactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const orderExpenses = Math.abs(rangeTransactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
    const estimatedBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : 0;
    const orderNet = orderIncome - orderExpenses;

    const financeSummary = await fetchOzonFinanceSummaryByRange(from, to);
    const totalIncome = financeSummary?.totalIncome ?? orderIncome;
    const totalExpenses = financeSummary?.totalExpenses ?? orderExpenses;
    const netIncome = financeSummary?.netIncome ?? orderNet;

    const exactBalance = await fetchExactOzonBalance();
    const currentBalance = exactBalance ?? estimatedBalance;
    const isEstimatedBalance = exactBalance == null;

    const daily = new Map<string, { revenue: number; orders: number }>();
    for (const t of transactions) {
      const day = t.date.slice(0, 10);
      const existing = daily.get(day) || { revenue: 0, orders: 0 };
      if (t.type === "sale") {
        existing.revenue += t.amount;
        existing.orders += 1;
      }
      daily.set(day, existing);
    }

    const chartData: ChartDataPoint[] = Array.from(daily.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => ({
        date: day,
        revenue: Math.round(v.revenue * 100) / 100,
        orders: v.orders,
      }));

    return NextResponse.json({
      transactions: transactions.slice().reverse(),
      chartData,
      summary: {
        totalIncome,
        totalExpenses,
        currentBalance,
        netIncome,
        isEstimatedBalance,
      },
    });
  } catch (err) {
    console.error("Error in finance API:", err);
    return NextResponse.json({ error: "Failed to load finance data" }, { status: 500 });
  }
}
