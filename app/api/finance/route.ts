import { requireAuth } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import path from "path";
import { readJsonFile, writeJsonFile, withLock, getConnections } from "@/src/integrations/storage";
import { filterByEnabledConnections, getEnabledConnections } from "@/src/integrations/enabled";
import { decryptCredentials } from "@/lib/encryption";
import { addDaysToIsoDay, getBusinessIsoDay, toBusinessDayBoundaryIso } from "@/lib/date";
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

interface FinanceBreakdown {
  sales: number;
  refunds: number;
  ozonReward: number;
  deliveryServices: number;
  agentServices: number;
  fboServices: number;
  adsPromotion: number;
  otherServicesFines: number;
  compensations: number;
  commissions: number;
  withdrawals: number;
  adjustments: number;
  totalAccrued: number;
}

interface TransactionTypeCounts {
  total: number;
  sale: number;
  refund: number;
  commission: number;
  withdrawal: number;
  adjustment: number;
}

interface FinanceBasePayload {
  transactions: Transaction[];
  chartData: ChartDataPoint[];
  period: { from: string; to: string };
  breakdown: FinanceBreakdown;
  summary: {
    totalIncome: number;
    totalExpenses: number;
    currentBalance: number;
    netIncome: number;
    isEstimatedBalance: boolean;
  };
  typeCounts: TransactionTypeCounts;
}

interface FinanceSnapshotRecord {
  updatedAt: number;
  currentBalance: number | null;
  breakdown: FinanceBreakdown | null;
}

interface FinanceSnapshotInfo {
  status: "fresh" | "stale" | "missing";
  updatedAt?: string;
}

const FINANCE_CACHE_TTL_MS = 60_000;
const financeResponseCache = new Map<string, { expiresAt: number; payload: unknown }>();
const financeBaseCache = new Map<string, { expiresAt: number; payload: FinanceBasePayload }>();
const OZON_BALANCE_CACHE_TTL_MS = 60_000;
const OZON_FETCH_TIMEOUT_MS = 12_000;
const FINANCE_SNAPSHOT_TTL_MS = 10 * 60 * 1000;
let ozonBalanceCache: { expiresAt: number; value: number | null } | null = null;
const financeSnapshotRefreshJobs = new Map<string, Promise<void>>();

function putFinanceCache(key: string, payload: unknown): void {
  const now = Date.now();
  if (financeResponseCache.size > 200) {
    for (const [k, v] of financeResponseCache.entries()) {
      if (v.expiresAt <= now) {
        financeResponseCache.delete(k);
      }
    }
    while (financeResponseCache.size > 200) {
      const first = financeResponseCache.keys().next().value;
      if (!first) break;
      financeResponseCache.delete(first);
    }
  }

  financeResponseCache.set(key, {
    expiresAt: now + FINANCE_CACHE_TTL_MS,
    payload,
  });
}

function putFinanceBaseCache(key: string, payload: FinanceBasePayload): void {
  const now = Date.now();
  if (financeBaseCache.size > 200) {
    for (const [k, v] of financeBaseCache.entries()) {
      if (v.expiresAt <= now) {
        financeBaseCache.delete(k);
      }
    }
    while (financeBaseCache.size > 200) {
      const first = financeBaseCache.keys().next().value;
      if (!first) break;
      financeBaseCache.delete(first);
    }
  }

  financeBaseCache.set(key, {
    expiresAt: now + FINANCE_CACHE_TTL_MS,
    payload,
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function opText(op: any): string {
  const parts: string[] = [];
  const append = (v: unknown) => {
    if (v == null) return;
    if (typeof v === "string") {
      parts.push(v);
      return;
    }
    if (typeof v === "number") {
      parts.push(String(v));
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) append(item);
      return;
    }
    if (typeof v === "object") {
      for (const val of Object.values(v as Record<string, unknown>)) append(val);
    }
  };

  append(op?.type);
  append(op?.operation_type);
  append(op?.operation_type_name);
  append(op?.operation_name);
  append(op?.service);
  append(op?.services);
  append(op?.posting?.services);
  append(op?.details);
  append(op?.description);
  return parts.join(" ").toLowerCase();
}

function classifyExpenseBucket(op: any): keyof Pick<
  FinanceBreakdown,
  | "ozonReward"
  | "deliveryServices"
  | "agentServices"
  | "fboServices"
  | "adsPromotion"
  | "otherServicesFines"
  | "compensations"
> {
  const text = opText(op);

  if (
    /компенс|декомпенс|compens/.test(text)
  ) {
    return "compensations";
  }

  if (
    /продвиж|реклам|advert|promo|marketing|campaign|trafaret|трафарет|баннер|banner/.test(text)
  ) {
    return "adsPromotion";
  }

  if (
    /доставк|логист|delivery|shipping|last mile/.test(text)
  ) {
    return "deliveryServices";
  }

  if (
    /агент|agent/.test(text)
  ) {
    return "agentServices";
  }

  if (
    /\bfbo\b/.test(text)
  ) {
    return "fboServices";
  }

  if (
    /вознаграж|комисси|commission|reward/.test(text)
  ) {
    return "ozonReward";
  }

  if (
    /штраф|penalty|fine|неустой/.test(text)
  ) {
    return "otherServicesFines";
  }

  return "otherServicesFines";
}

async function fetchOzonDetailedBreakdownByRange(
  creds: { clientId: string; apiKey: string } | null,
  from: Date,
  to: Date
): Promise<FinanceBreakdown | null> {
  if (!creds) return null;

  const breakdown: FinanceBreakdown = {
    sales: 0,
    refunds: 0,
    ozonReward: 0,
    deliveryServices: 0,
    agentServices: 0,
    fboServices: 0,
    adsPromotion: 0,
    otherServicesFines: 0,
    compensations: 0,
    commissions: 0,
    withdrawals: 0,
    adjustments: 0,
    totalAccrued: 0,
  };

  let cursorKey = getBusinessIsoDay(from);
  const toKey = getBusinessIsoDay(to);
  while (cursorKey <= toKey) {
    const chunkEndKey = addDaysToIsoDay(cursorKey, 27) <= toKey ? addDaysToIsoDay(cursorKey, 27) : toKey;
    let page = 1;
    let pageCount = 1;

    do {
      const body = await ozonPost(creds, "/v3/finance/transaction/list", {
        page,
        page_size: 1000,
        filter: {
          date: {
            from: toBusinessDayBoundaryIso(cursorKey, false),
            to: toBusinessDayBoundaryIso(chunkEndKey, true),
          },
        },
      });

      const result = (body as any)?.result || {};
      const operations = Array.isArray(result.operations) ? result.operations : [];

      for (const op of operations) {
        const amount = Number(op?.amount);
        if (!Number.isFinite(amount)) continue;

        const type = String(op?.type || "").toLowerCase();
        const accrualForSale = Number(op?.accruals_for_sale);

        if (Number.isFinite(accrualForSale) && accrualForSale > 0) {
          breakdown.sales += accrualForSale;
          continue;
        }

        if (amount > 0 && type === "orders") {
          breakdown.sales += amount;
          continue;
        }

        if (amount < 0) {
          if (/return|refund|cancel|возврат|отмен/.test(opText(op))) {
            breakdown.refunds += Math.abs(amount);
          } else if (/withdraw|payout|выплат|вывод/.test(opText(op))) {
            breakdown.withdrawals += Math.abs(amount);
          } else {
            const bucket = classifyExpenseBucket(op);
            (breakdown[bucket] as number) += Math.abs(amount);
          }
          continue;
        }

        if (amount > 0) {
          if (/компенс|декомпенс|compens/.test(opText(op))) {
            breakdown.compensations += amount;
          } else {
            breakdown.adjustments += amount;
          }
        }
      }

      pageCount = Number(result.page_count || 1);
      page += 1;
    } while (page <= pageCount);

    cursorKey = addDaysToIsoDay(chunkEndKey, 1);
  }

  breakdown.commissions = breakdown.ozonReward;
  breakdown.totalAccrued =
    breakdown.sales -
    breakdown.refunds -
    breakdown.ozonReward -
    breakdown.deliveryServices -
    breakdown.agentServices -
    breakdown.fboServices -
    breakdown.adsPromotion -
    breakdown.otherServicesFines -
    breakdown.withdrawals +
    breakdown.compensations +
    breakdown.adjustments;

  breakdown.sales = round2(breakdown.sales);
  breakdown.refunds = round2(breakdown.refunds);
  breakdown.ozonReward = round2(breakdown.ozonReward);
  breakdown.deliveryServices = round2(breakdown.deliveryServices);
  breakdown.agentServices = round2(breakdown.agentServices);
  breakdown.fboServices = round2(breakdown.fboServices);
  breakdown.adsPromotion = round2(breakdown.adsPromotion);
  breakdown.otherServicesFines = round2(breakdown.otherServicesFines);
  breakdown.compensations = round2(breakdown.compensations);
  breakdown.commissions = round2(breakdown.commissions);
  breakdown.withdrawals = round2(breakdown.withdrawals);
  breakdown.adjustments = round2(breakdown.adjustments);
  breakdown.totalAccrued = round2(breakdown.totalAccrued);

  return breakdown;
}

const ORDERS_FILE = path.join(process.cwd(), "data", "canonical", "orders.json");
const CONNECTIONS_FILE = path.join(process.cwd(), "data", "secure", "connections.json");
const FINANCE_SNAPSHOTS_FILE = path.join(process.cwd(), "data", "cache", "finance-snapshots.json");
const FINANCE_SNAPSHOTS_LOCK = path.join(process.cwd(), "data", "cache", "finance-snapshots.lock");
const OZON_API_BASE = "https://api-seller.ozon.ru";

function toSnapshotKey(enabledKey: string, from: Date, to: Date): string {
  return `${enabledKey}|${getBusinessIsoDay(from)}|${getBusinessIsoDay(to)}`;
}

async function readFinanceSnapshotsStore(): Promise<Record<string, FinanceSnapshotRecord>> {
  return readJsonFile<Record<string, FinanceSnapshotRecord>>(FINANCE_SNAPSHOTS_FILE, {});
}

async function getFinanceSnapshot(
  snapshotKey: string
): Promise<{ record: FinanceSnapshotRecord; fresh: boolean } | null> {
  const store = await readFinanceSnapshotsStore();
  const record = store[snapshotKey];
  if (!record || typeof record.updatedAt !== "number") return null;
  return {
    record,
    fresh: Date.now() - record.updatedAt <= FINANCE_SNAPSHOT_TTL_MS,
  };
}

async function saveFinanceSnapshot(snapshotKey: string, record: FinanceSnapshotRecord): Promise<void> {
  await withLock(FINANCE_SNAPSHOTS_LOCK, async () => {
    const store = await readFinanceSnapshotsStore();
    store[snapshotKey] = record;
    await writeJsonFile(FINANCE_SNAPSHOTS_FILE, store);
  });
}

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
    signal: AbortSignal.timeout(OZON_FETCH_TIMEOUT_MS),
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

async function fetchExactOzonBalance(
  creds: { clientId: string; apiKey: string } | null
): Promise<number | null> {
  if (!creds) return null;
  const cached = ozonBalanceCache;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => getBusinessIsoDay(d);

  try {
    const data = await ozonPost(creds, "/v1/finance/balance", {
      date_from: fmt(monthAgo),
      date_to: fmt(now),
    });
    const directCandidates = [
      (data as any)?.total?.closing_balance?.value,
      (data as any)?.result?.total?.closing_balance?.value,
      (data as any)?.total?.opening_balance?.value,
      (data as any)?.result?.total?.opening_balance?.value,
    ];
    for (const value of directCandidates) {
      if (typeof value === "number" && Number.isFinite(value)) {
        ozonBalanceCache = { expiresAt: Date.now() + OZON_BALANCE_CACHE_TTL_MS, value };
        return value;
      }
    }
    const candidates = collectNumbersByKeyPattern(
      data,
      [/(^|_)(available|current|wallet|final|closing)(_|\b)balance/i]
    );
    const value = candidates.length > 0 ? candidates[0] : null;
    ozonBalanceCache = { expiresAt: Date.now() + OZON_BALANCE_CACHE_TTL_MS, value };
    return value;
  } catch {
    ozonBalanceCache = { expiresAt: Date.now() + OZON_BALANCE_CACHE_TTL_MS, value: null };
    return null;
  }
}

function parseDateInput(input: string | null, fallback: Date): Date {
  if (!input) return fallback;
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return fallback;
  return date;
}

const WB_STATISTICS_API = "https://statistics-api.wildberries.ru";
const WB_FETCH_TIMEOUT_MS = 15_000;

async function wbGet<T>(token: string, baseUrl: string, apiPath: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(apiPath, baseUrl);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: token, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(WB_FETCH_TIMEOUT_MS),
  });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    const details = body?.message || body?.error || text || `HTTP ${response.status}`;
    throw new Error(`WB API ${apiPath} failed: ${details}`);
  }
  return (body ?? {}) as T;
}

async function getWbCreds(): Promise<{ token: string } | null> {
  if (process.env.REAL_API !== "1") return null;
  const connections = await getConnections(CONNECTIONS_FILE);
  const wbConnection = (connections as Connection[]).find(
    (c) => c.enabled && c.marketplaceId === "wb"
  );
  if (!wbConnection?.creds) return null;

  const rawCreds =
    typeof wbConnection.creds === "string"
      ? decryptCredentials(wbConnection.creds)
      : (wbConnection.creds as Record<string, string>);

  const token = String(rawCreds.token || "").trim();
  if (!token) return null;
  return { token };
}

async function fetchWbDetailedBreakdownByRange(
  creds: { token: string } | null,
  from: Date,
  to: Date
): Promise<FinanceBreakdown | null> {
  if (!creds) return null;

  const breakdown: FinanceBreakdown = {
    sales: 0,
    refunds: 0,
    ozonReward: 0,
    deliveryServices: 0,
    agentServices: 0,
    fboServices: 0,
    adsPromotion: 0,
    otherServicesFines: 0,
    compensations: 0,
    commissions: 0,
    withdrawals: 0,
    adjustments: 0,
    totalAccrued: 0,
  };

  const dateFrom = getBusinessIsoDay(from);
  const dateTo = getBusinessIsoDay(to);
  let rrdid = 0;

  for (let page = 0; page < 100; page++) {
    let data: any;
    try {
      data = await wbGet<any>(
        creds.token,
        WB_STATISTICS_API,
        "/api/v1/supplier/reportDetailByPeriod",
        { dateFrom, dateTo, limit: "100000", rrdid: String(rrdid) }
      );
    } catch (err) {
      console.error("[WB Finance] reportDetailByPeriod failed:", err instanceof Error ? err.message : err);
      break;
    }

    // WB API may return the array directly or wrapped
    const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    if (rows.length === 0) {
      if (page === 0) {
        console.warn(`[WB Finance] reportDetailByPeriod returned no rows for ${dateFrom}..${dateTo}`);
      }
      break;
    }

    for (const row of rows) {
      const docType = String(row?.doc_type_name || "").toLowerCase();
      const retailAmount = Number(row?.retail_amount || 0);
      const forPay = Number(row?.ppvz_for_pay || 0);
      const salesCommission = Math.abs(Number(row?.ppvz_sales_commission || 0));
      const deliveryCost = Math.abs(Number(row?.delivery_rub || 0));
      const penalty = Math.abs(Number(row?.penalty || 0));
      const additionalPayment = Number(row?.additional_payment || 0);
      const rebillLogisticCost = Math.abs(Number(row?.rebill_logistic_cost || 0));
      const storagePayment = Math.abs(Number(row?.storage_fee || 0));
      const acceptance = Math.abs(Number(row?.acceptance || 0));

      if (docType.includes("возврат") || docType.includes("return")) {
        breakdown.refunds += Math.abs(Number.isFinite(forPay) ? forPay : retailAmount);
      } else if (docType.includes("продажа") || docType.includes("sale")) {
        breakdown.sales += Number.isFinite(forPay) && forPay > 0 ? forPay : (Number.isFinite(retailAmount) ? retailAmount : 0);
      } else if (docType.includes("штраф") || docType.includes("penalty")) {
        breakdown.otherServicesFines += penalty;
      } else if (docType.includes("компенс") || docType.includes("compens")) {
        breakdown.compensations += additionalPayment > 0 ? additionalPayment : Math.abs(forPay);
      } else {
        if (Number.isFinite(forPay) && forPay > 0) {
          breakdown.adjustments += forPay;
        }
      }

      breakdown.commissions += Number.isFinite(salesCommission) ? salesCommission : 0;
      breakdown.deliveryServices += Number.isFinite(deliveryCost) ? deliveryCost : 0;
      breakdown.deliveryServices += Number.isFinite(rebillLogisticCost) ? rebillLogisticCost : 0;
      breakdown.fboServices += Number.isFinite(storagePayment) ? storagePayment : 0;
      breakdown.fboServices += Number.isFinite(acceptance) ? acceptance : 0;

      if (row?.rrd_id && Number(row.rrd_id) > rrdid) {
        rrdid = Number(row.rrd_id);
      }
    }

    if (rows.length < 100000) break;
  }

  breakdown.ozonReward = breakdown.commissions;
  breakdown.totalAccrued =
    breakdown.sales -
    breakdown.refunds -
    breakdown.commissions -
    breakdown.deliveryServices -
    breakdown.fboServices -
    breakdown.adsPromotion -
    breakdown.otherServicesFines -
    breakdown.withdrawals +
    breakdown.compensations +
    breakdown.adjustments;

  breakdown.sales = round2(breakdown.sales);
  breakdown.refunds = round2(breakdown.refunds);
  breakdown.ozonReward = round2(breakdown.ozonReward);
  breakdown.deliveryServices = round2(breakdown.deliveryServices);
  breakdown.agentServices = round2(breakdown.agentServices);
  breakdown.fboServices = round2(breakdown.fboServices);
  breakdown.adsPromotion = round2(breakdown.adsPromotion);
  breakdown.otherServicesFines = round2(breakdown.otherServicesFines);
  breakdown.compensations = round2(breakdown.compensations);
  breakdown.commissions = round2(breakdown.commissions);
  breakdown.withdrawals = round2(breakdown.withdrawals);
  breakdown.adjustments = round2(breakdown.adjustments);
  breakdown.totalAccrued = round2(breakdown.totalAccrued);

  return breakdown;
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
  creds: { clientId: string; apiKey: string } | null,
  from: Date,
  to: Date
): Promise<{ totalIncome: number; totalExpenses: number; netIncome: number } | null> {
  if (!creds) return null;

  const fmt = (d: Date) => getBusinessIsoDay(d);
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
  let cursorKey = getBusinessIsoDay(from);
  const toKey = getBusinessIsoDay(to);
  let totalIncome = 0;
  let totalExpensesAbs = 0;

  while (cursorKey <= toKey) {
    const chunkEndKey = addDaysToIsoDay(cursorKey, 27) <= toKey ? addDaysToIsoDay(cursorKey, 27) : toKey;
    let page = 1;
    let pageCount = 1;

    do {
      const body = await ozonPost(creds, "/v3/finance/transaction/list", {
        page,
        page_size: 1000,
        filter: {
          date: {
            from: toBusinessDayBoundaryIso(cursorKey, false),
            to: toBusinessDayBoundaryIso(chunkEndKey, true),
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

    cursorKey = addDaysToIsoDay(chunkEndKey, 1);
  }

  const totalIncomeRounded = Math.round(totalIncome * 100) / 100;
  const totalExpensesRounded = Math.round(totalExpensesAbs * 100) / 100;
  const netIncome = Math.round((totalIncomeRounded - totalExpensesRounded) * 100) / 100;
  return { totalIncome: totalIncomeRounded, totalExpenses: totalExpensesRounded, netIncome };
}

function buildSnapshotInfo(snapshot: { record: FinanceSnapshotRecord; fresh: boolean } | null): FinanceSnapshotInfo {
  if (!snapshot) return { status: "missing" };
  return {
    status: snapshot.fresh ? "fresh" : "stale",
    updatedAt: new Date(snapshot.record.updatedAt).toISOString(),
  };
}

async function findRecentBalance(connectionPrefix: string): Promise<number | null> {
  const store = await readFinanceSnapshotsStore();
  let best: { updatedAt: number; balance: number } | null = null;
  for (const [key, record] of Object.entries(store)) {
    if (!key.startsWith(connectionPrefix)) continue;
    if (typeof record.currentBalance !== "number" || !Number.isFinite(record.currentBalance)) continue;
    if (!best || record.updatedAt > best.updatedAt) {
      best = { updatedAt: record.updatedAt, balance: record.currentBalance };
    }
  }
  return best?.balance ?? null;
}

function isEmptyBreakdown(b: FinanceBreakdown | null | undefined): boolean {
  if (!b) return true;
  return b.sales === 0 && b.refunds === 0 && b.totalAccrued === 0 && b.commissions === 0 && b.deliveryServices === 0;
}

function mergeBreakdowns(a: FinanceBreakdown | null, b: FinanceBreakdown | null): FinanceBreakdown | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return {
    sales: round2(a.sales + b.sales),
    refunds: round2(a.refunds + b.refunds),
    ozonReward: round2(a.ozonReward + b.ozonReward),
    deliveryServices: round2(a.deliveryServices + b.deliveryServices),
    agentServices: round2(a.agentServices + b.agentServices),
    fboServices: round2(a.fboServices + b.fboServices),
    adsPromotion: round2(a.adsPromotion + b.adsPromotion),
    otherServicesFines: round2(a.otherServicesFines + b.otherServicesFines),
    compensations: round2(a.compensations + b.compensations),
    commissions: round2(a.commissions + b.commissions),
    withdrawals: round2(a.withdrawals + b.withdrawals),
    adjustments: round2(a.adjustments + b.adjustments),
    totalAccrued: round2(a.totalAccrued + b.totalAccrued),
  };
}

function scheduleFinanceSnapshotRefresh(snapshotKey: string, from: Date, to: Date): void {
  if (process.env.REAL_API !== "1") return;
  if (financeSnapshotRefreshJobs.has(snapshotKey)) return;

  const job = (async () => {
    try {
      const [ozonCreds, wbCreds] = await Promise.all([
        getOzonCreds(),
        getWbCreds(),
      ]);
      if (!ozonCreds && !wbCreds) return;

      const [exactBalance, ozonBreakdown, wbBreakdown] = await Promise.all([
        ozonCreds ? fetchExactOzonBalance(ozonCreds) : Promise.resolve(null),
        ozonCreds ? fetchOzonDetailedBreakdownByRange(ozonCreds, from, to) : Promise.resolve(null),
        wbCreds ? fetchWbDetailedBreakdownByRange(wbCreds, from, to) : Promise.resolve(null),
      ]);

      const mergedBreakdown = mergeBreakdowns(ozonBreakdown, wbBreakdown);

      await saveFinanceSnapshot(snapshotKey, {
        updatedAt: Date.now(),
        currentBalance: exactBalance,
        breakdown: mergedBreakdown,
      });

      // Save WB-specific snapshot for the WB finance page (only if API returned real data)
      if (wbBreakdown && !isEmptyBreakdown(wbBreakdown)) {
        const wbSnapshotKey = `wb-breakdown|${getBusinessIsoDay(from)}|${getBusinessIsoDay(to)}`;
        await saveFinanceSnapshot(wbSnapshotKey, {
          updatedAt: Date.now(),
          currentBalance: null,
          breakdown: wbBreakdown,
        });
      }
      // Save Ozon-specific snapshot for the Ozon finance page
      if (ozonBreakdown) {
        const ozonSnapshotKey = `ozon-breakdown|${getBusinessIsoDay(from)}|${getBusinessIsoDay(to)}`;
        await saveFinanceSnapshot(ozonSnapshotKey, {
          updatedAt: Date.now(),
          currentBalance: exactBalance,
          breakdown: ozonBreakdown,
        });
      }
    } catch (error) {
      console.error("Failed to refresh finance snapshot:", error);
    } finally {
      financeSnapshotRefreshJobs.delete(snapshotKey);
    }
  })();

  financeSnapshotRefreshJobs.set(snapshotKey, job);
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
    const todayKey = getBusinessIsoDay(now);
    const defaultFrom = parseDateInput(`${todayKey.slice(0, 7)}-01`, now);
    const params = new URL(request.url).searchParams;
    const summaryOnly = params.get("summaryOnly") === "1";
    const forceLiveBalance = params.get("forceLiveBalance") === "1";
    const requestedPage = Number(params.get("page") ?? "1");
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
    const requestedPageSize = Number(params.get("pageSize") ?? "15");
    const pageSize =
      Number.isFinite(requestedPageSize) && requestedPageSize > 0
        ? Math.min(100, Math.floor(requestedPageSize))
        : 15;
    const search = (params.get("search") ?? "").trim().toLowerCase();
    const typeFilterRaw = (params.get("typeFilter") ?? "all").trim().toLowerCase();
    const marketplaceFilterRaw = (params.get("marketplaceFilter") ?? "all").trim();
    const typeFilter: TransactionType | "all" =
      typeFilterRaw === "sale" ||
      typeFilterRaw === "refund" ||
      typeFilterRaw === "commission" ||
      typeFilterRaw === "withdrawal" ||
      typeFilterRaw === "adjustment"
        ? typeFilterRaw
        : "all";
    const marketplaceFilter: Marketplace | "all" =
      marketplaceFilterRaw === "Ozon" || marketplaceFilterRaw === "Wildberries"
        ? marketplaceFilterRaw
        : "all";
    let from = parseDateInput(params.get("startDate"), defaultFrom);
    let to = parseDateInput(params.get("endDate"), now);
    if (from.getTime() > to.getTime()) {
      const temp = from;
      from = new Date(to.getTime());
      to = new Date(temp.getTime());
    }
    const fromKey = getBusinessIsoDay(from);
    const toKey = getBusinessIsoDay(to);

    const enabledKey = enabled
      .map((c) => `${c.id}:${c.marketplaceId}`)
      .sort()
      .join("|");
    const snapshotKey = toSnapshotKey(enabledKey, from, to);
    const snapshot = await getFinanceSnapshot(snapshotKey);
    const snapshotInfo = buildSnapshotInfo(snapshot);
    if (!snapshot || !snapshot.fresh) {
      scheduleFinanceSnapshotRefresh(snapshotKey, from, to);
    }
    const baseCacheKey = `${enabledKey}|${fromKey}|${toKey}|real=${process.env.REAL_API === "1" ? "1" : "0"}|summaryOnly=${summaryOnly ? "1" : "0"}|forceLiveBalance=${forceLiveBalance ? "1" : "0"}`;
    const responseCacheKey = `${baseCacheKey}|page=${page}|pageSize=${pageSize}|search=${search}|type=${typeFilter}|marketplace=${marketplaceFilter}`;
    const cached = financeResponseCache.get(responseCacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload);
    }

    if (summaryOnly) {
      const rawOrders = await readJsonFile<OrderEvent[]>(ORDERS_FILE, []);
      const orders = filterByEnabledConnections(rawOrders, enabled);
      let estimatedBalance = 0;
      let sales = 0;
      let refunds = 0;

      for (const o of orders) {
        const base = amountFromOrder(o);
        if (!Number.isFinite(base) || base <= 0) continue;

        const dateKey = getBusinessIsoDay(isoSafe(o.date));
        const refund = isRefundStatus((o as any).sourceStatus);
        const signed = refund ? -base : base;
        estimatedBalance += signed;

        if (dateKey >= fromKey && dateKey <= toKey) {
          if (refund) {
            refunds += base;
          } else {
            sales += base;
          }
        }
      }

      const commissions = 0;
      const withdrawals = 0;
      const adjustments = 0;
      const totalAccrued = sales - refunds - commissions - withdrawals + adjustments;

      let exactBalance = snapshot?.record.currentBalance ?? null;
      if (forceLiveBalance || exactBalance == null) {
        const creds = await getOzonCreds();
        const liveBalance = await fetchExactOzonBalance(creds);
        if (typeof liveBalance === "number" && Number.isFinite(liveBalance)) {
          exactBalance = liveBalance;
          await saveFinanceSnapshot(snapshotKey, {
            updatedAt: Date.now(),
            currentBalance: liveBalance,
            breakdown: snapshot?.record.breakdown ?? null,
          });
        }
      }
      if (exactBalance == null) {
        const ozonConn = enabled.find((c) => c.marketplaceId === "ozon");
        if (ozonConn) {
          exactBalance = await findRecentBalance(`${ozonConn.id}:ozon`);
        }
      }
      const currentBalance = exactBalance ?? round2(totalAccrued);
      const isEstimatedBalance = exactBalance == null;
      const snapshotBreakdown = snapshot?.record.breakdown;
      const totalIncome =
        snapshotBreakdown?.sales != null ? round2(snapshotBreakdown.sales) : round2(sales);
      const totalExpenses =
        snapshotBreakdown != null
          ? round2(
              snapshotBreakdown.refunds +
                snapshotBreakdown.ozonReward +
                snapshotBreakdown.deliveryServices +
                snapshotBreakdown.agentServices +
                snapshotBreakdown.fboServices +
                snapshotBreakdown.adsPromotion +
                snapshotBreakdown.otherServicesFines +
                snapshotBreakdown.withdrawals
            )
          : round2(refunds);
      const netIncome =
        snapshotBreakdown?.totalAccrued != null ? round2(snapshotBreakdown.totalAccrued) : round2(totalAccrued);

      const payload = {
        transactions: [],
        chartData: [],
        period: {
          from: fromKey,
          to: toKey,
        },
        breakdown: {
          sales: round2(sales),
          refunds: round2(refunds),
          ozonReward: 0,
          deliveryServices: 0,
          agentServices: 0,
          fboServices: 0,
          adsPromotion: 0,
          otherServicesFines: 0,
          compensations: 0,
          commissions,
          withdrawals,
          adjustments,
          totalAccrued: round2(totalAccrued),
        } as FinanceBreakdown,
        summary: {
          totalIncome,
          totalExpenses,
          currentBalance,
          netIncome,
          isEstimatedBalance,
        },
        snapshot: snapshotInfo,
      };
      putFinanceCache(responseCacheKey, payload);
      return NextResponse.json(payload);
    }

    let basePayload: FinanceBasePayload | null = null;
    const baseCached = financeBaseCache.get(baseCacheKey);
    if (baseCached && baseCached.expiresAt > Date.now()) {
      basePayload = baseCached.payload;
    } else {
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
        const orderId = `${o.sku}-${getBusinessIsoDay(dateIso)}`;

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

      const rangeTransactions = transactions.filter((t) => {
        const dayKey = getBusinessIsoDay(t.date);
        return dayKey >= fromKey && dayKey <= toKey;
      });
      const typeCounts: TransactionTypeCounts = {
        total: rangeTransactions.length,
        sale: 0,
        refund: 0,
        commission: 0,
        withdrawal: 0,
        adjustment: 0,
      };
      for (const transaction of rangeTransactions) {
        typeCounts[transaction.type] += 1;
      }

      const orderIncome = rangeTransactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
      const orderExpenses = Math.abs(rangeTransactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
      const estimatedBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : 0;
      const orderNet = orderIncome - orderExpenses;

      let exactBalance = snapshot?.record.currentBalance ?? null;
      if (exactBalance == null) {
        const ozonConn = enabled.find((c) => c.marketplaceId === "ozon");
        if (ozonConn) {
          exactBalance = await findRecentBalance(`${ozonConn.id}:ozon`);
        }
      }
      const detailedBreakdown = snapshot?.record.breakdown ?? null;
      const totalIncome = detailedBreakdown?.sales ?? orderIncome;
      const totalExpenses =
        detailedBreakdown
          ? round2(
              detailedBreakdown.refunds +
                detailedBreakdown.ozonReward +
                detailedBreakdown.deliveryServices +
                detailedBreakdown.agentServices +
                detailedBreakdown.fboServices +
                detailedBreakdown.adsPromotion +
                detailedBreakdown.otherServicesFines +
                detailedBreakdown.withdrawals
            )
          : orderExpenses;
      const netIncome = detailedBreakdown?.totalAccrued ?? orderNet;
      const currentBalance = exactBalance ?? round2(orderNet);
      const isEstimatedBalance = exactBalance == null;

      const sales = rangeTransactions
        .filter((t) => t.type === "sale")
        .reduce((s, t) => s + Math.max(0, t.amount), 0);
      const refunds = Math.abs(
        rangeTransactions
          .filter((t) => t.type === "refund")
          .reduce((s, t) => s + t.amount, 0)
      );
      const commissions = Math.abs(
        rangeTransactions
          .filter((t) => t.type === "commission")
          .reduce((s, t) => s + t.amount, 0)
      );
      const withdrawals = Math.abs(
        rangeTransactions
          .filter((t) => t.type === "withdrawal")
          .reduce((s, t) => s + t.amount, 0)
      );
      const adjustments = rangeTransactions
        .filter((t) => t.type === "adjustment")
        .reduce((s, t) => s + t.amount, 0);
      const totalAccrued = sales - refunds - commissions - withdrawals + adjustments;
      const breakdown: FinanceBreakdown = detailedBreakdown ?? {
        sales,
        refunds,
        ozonReward: commissions,
        deliveryServices: 0,
        agentServices: 0,
        fboServices: 0,
        adsPromotion: 0,
        otherServicesFines: 0,
        compensations: 0,
        commissions,
        withdrawals,
        adjustments,
        totalAccrued,
      };

      const daily = new Map<string, { revenue: number; orders: number }>();
      for (const t of transactions) {
        const day = getBusinessIsoDay(t.date);
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

      basePayload = {
        transactions: rangeTransactions,
        chartData,
        period: {
          from: fromKey,
          to: toKey,
        },
        breakdown,
        summary: {
          totalIncome,
          totalExpenses,
          currentBalance,
          netIncome,
          isEstimatedBalance,
        },
        typeCounts,
      };
      putFinanceBaseCache(baseCacheKey, basePayload);
    }

    if (!basePayload) {
      throw new Error("Failed to prepare finance payload");
    }

    const rangeTransactions = basePayload.transactions;

    // When marketplace filter is applied, recompute summary/breakdown/typeCounts
    // from marketplace-filtered data so the Ozon page shows Ozon-only numbers
    let responseSummary = basePayload.summary;
    let responseBreakdown = basePayload.breakdown;
    let responseTypeCounts = basePayload.typeCounts;

    if (marketplaceFilter !== "all") {
      const mpTransactions = rangeTransactions.filter(
        (t) => t.marketplace === marketplaceFilter
      );
      const mpTypeCounts: TransactionTypeCounts = {
        total: mpTransactions.length,
        sale: 0,
        refund: 0,
        commission: 0,
        withdrawal: 0,
        adjustment: 0,
      };
      for (const t of mpTransactions) {
        mpTypeCounts[t.type] += 1;
      }
      responseTypeCounts = mpTypeCounts;

      const mpIncome = mpTransactions
        .filter((t) => t.amount > 0)
        .reduce((s, t) => s + t.amount, 0);
      const mpExpenses = Math.abs(
        mpTransactions
          .filter((t) => t.amount < 0)
          .reduce((s, t) => s + t.amount, 0)
      );
      const mpNet = mpIncome - mpExpenses;

      // Look for marketplace-specific snapshot first, then fall back to the combined snapshot
      const mpSnapshotPrefix = marketplaceFilter === "Ozon" ? "ozon-breakdown" : marketplaceFilter === "Wildberries" ? "wb-breakdown" : null;
      let mpSnapshot: { record: FinanceSnapshotRecord; fresh: boolean } | null = null;
      if (mpSnapshotPrefix) {
        const mpSnapshotKey = `${mpSnapshotPrefix}|${basePayload.period.from}|${basePayload.period.to}`;
        mpSnapshot = await getFinanceSnapshot(mpSnapshotKey);
      }
      const rawMpBreakdown = mpSnapshot?.record.breakdown ?? null;
      const snpBreakdown = !isEmptyBreakdown(rawMpBreakdown) ? rawMpBreakdown : (!isEmptyBreakdown(snapshot?.record.breakdown) ? snapshot?.record.breakdown ?? null : null);
      if (snpBreakdown) {
        responseBreakdown = snpBreakdown;
        responseSummary = {
          ...basePayload.summary,
          totalIncome: round2(snpBreakdown.sales),
          totalExpenses: round2(
            snpBreakdown.refunds +
              snpBreakdown.ozonReward +
              snpBreakdown.deliveryServices +
              snpBreakdown.agentServices +
              snpBreakdown.fboServices +
              snpBreakdown.adsPromotion +
              snpBreakdown.otherServicesFines +
              snpBreakdown.withdrawals
          ),
          netIncome: round2(snpBreakdown.totalAccrued),
        };
      } else {
        const mpSales = mpTransactions
          .filter((t) => t.type === "sale")
          .reduce((s, t) => s + Math.max(0, t.amount), 0);
        const mpRefunds = Math.abs(
          mpTransactions
            .filter((t) => t.type === "refund")
            .reduce((s, t) => s + t.amount, 0)
        );
        const mpCommissions = Math.abs(
          mpTransactions
            .filter((t) => t.type === "commission")
            .reduce((s, t) => s + t.amount, 0)
        );
        const mpWithdrawals = Math.abs(
          mpTransactions
            .filter((t) => t.type === "withdrawal")
            .reduce((s, t) => s + t.amount, 0)
        );
        const mpAdjustments = mpTransactions
          .filter((t) => t.type === "adjustment")
          .reduce((s, t) => s + t.amount, 0);
        const mpTotalAccrued = mpSales - mpRefunds - mpCommissions - mpWithdrawals + mpAdjustments;
        responseBreakdown = {
          sales: round2(mpSales),
          refunds: round2(mpRefunds),
          ozonReward: round2(mpCommissions),
          deliveryServices: 0,
          agentServices: 0,
          fboServices: 0,
          adsPromotion: 0,
          otherServicesFines: 0,
          compensations: 0,
          commissions: round2(mpCommissions),
          withdrawals: round2(mpWithdrawals),
          adjustments: round2(mpAdjustments),
          totalAccrued: round2(mpTotalAccrued),
        };
        responseSummary = {
          ...basePayload.summary,
          totalIncome: round2(mpIncome),
          totalExpenses: round2(mpExpenses),
          netIncome: round2(mpNet),
        };
      }
    }

    const filteredTransactions = rangeTransactions.filter((transaction) => {
      const matchesSearch =
        !search ||
        transaction.id.toLowerCase().includes(search) ||
        transaction.description.toLowerCase().includes(search) ||
        (transaction.orderId || "").toLowerCase().includes(search);
      const matchesType = typeFilter === "all" || transaction.type === typeFilter;
      const matchesMarketplace =
        marketplaceFilter === "all" || transaction.marketplace === marketplaceFilter;
      return matchesSearch && matchesType && matchesMarketplace;
    });
    const descFilteredTransactions = filteredTransactions.slice().reverse();
    const totalItems = descFilteredTransactions.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const paginatedTransactions = descFilteredTransactions.slice(startIndex, startIndex + pageSize);

    const payload = {
      transactions: paginatedTransactions,
      chartData: basePayload.chartData,
      period: basePayload.period,
      breakdown: responseBreakdown,
      pagination: {
        page: safePage,
        pageSize,
        totalItems,
        totalPages,
      },
      typeCounts: responseTypeCounts,
      summary: responseSummary,
      snapshot: snapshotInfo,
    };
    putFinanceCache(responseCacheKey, payload);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Error in finance API:", err);
    return NextResponse.json({ error: "Failed to load finance data" }, { status: 500 });
  }
}
