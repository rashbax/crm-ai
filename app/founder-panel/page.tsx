"use client";

import { useEffect, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { RevenueChart } from "@/components/RevenueChart";
import { addDaysToIsoDay, diffIsoDays, formatIsoDayForLocale, getBusinessIsoDay } from "@/lib/date";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language, Task } from "@/types";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  CardSubtitle,
  MetricMain,
  MetricRow,
  MetricLabel,
  MetricChange,
  Button,
  Chip,
} from "@/components/ui";

interface FounderWidgets {
  criticalIncidents: number;
  overdueTasks: number;
  pendingApprovals: number;
  noOwnerSkus: number;
  stockoutRiskSkus: number;
  lossRiskItems: number;
  adStockConflicts: number;
  unansweredAppeals: number;
  slaBreachedAppeals: number;
  negativeAppeals: number;
  integrationAlerts: number;
  staleTasks: number;
  silentIncidents: number;
  expiredApprovals: number;
  criticalEscalations: { id: string; title: string; assignee: string; priority: string; impactLevel: string; dueDate: string; overdueDays: number; marketplace: string; status: string }[];
  staleTasksList: { id: string; title: string; assignee: string; status: string; lastUpdated: string; hoursSinceUpdate: number }[];
  topRiskySkus: { sku: string; marketplace: string; onHand: number; daysToStockout: number | null; openIncidents: number; hasOwner: boolean; riskScore: number }[];
  teamScorecard: {
    userId: string; userName: string; activeTasks: number; completedOnTime: number;
    overdueTasks: number; completionRate: number; blockedTasks: number; waitingTasks: number;
    incidentCount: number; avgResolutionHours: number | null; approvalDelay: number | null;
    founderInterventions: number; lastUpdateAge: number | null;
    area: string; riskySkuCount: number;
  }[];
  recentBlockers: { id: string; title: string; status: string; assignee: string; reason: string; dueDate: string; overdueDays: number }[];
  recentCriticalIncidents: { id: string; title: string; severity: string; status: string; owner: string; dueDate: string }[];
  pendingApprovalsList: { id: string; entityType: string; reason: string; requestedBy: string; requestedAt: string }[];
  kpi: {
    onTimeCompletionRate: number; overdueTaskCount: number;
    incidentResolutionTimeHours: number | null; approvalDelayHours: number | null;
    founderInterventionCount: number; stockoutCases: number;
    totalTasks: number; doneTasks: number; openIncidents: number; totalApprovals: number;
  };
}

interface SalesData {
  revenue: number;
  revenueChange: number;
  orderCount: number;
  orderChange: number;
  balance: number;
  accrued: number;
}

interface ChartDataPoint {
  date: string;
  revenue: number;
  orders: number;
  delivered?: number;
  deliveredRevenue?: number;
}

interface ApiOrder {
  sourceDate?: string;
  revenue?: number;
  sourceStatus?: string;
}

type ProductStatus = "active" | "draft" | "blocked";
type StockHealth = "critical" | "low" | "normal" | "good";

interface ApiProduct {
  name: string;
  sku: string;
  marketplaces: string[];
  onHand: number;
  inbound: number;
  stockKnown: boolean;
  soldLast30d: number;
  status: ProductStatus;
  stockHealth: StockHealth;
}

type QuickRange = 7 | 14 | 28;
type AlertTone = "critical" | "warning" | "info";

interface DashboardAlert {
  id: string;
  tone: AlertTone;
  title: string;
  message: string;
}

const RUB = "\u20BD";
const RU_DAYS = "\u0434\u043D\u0435\u0439";
const RU_DN = "\u0434\u043D";
const RU_ORDERS = "\u0437\u0430\u043A\u0430\u0437\u043E\u0432";
const RU_UNITS = "\u0448\u0442";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

const formatNumber = (num: number) => new Intl.NumberFormat("ru-RU").format(num);

const calculateChange = (current: number, previous: number): number => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

const toIsoDay = (input: Date): string => getBusinessIsoDay(input);

function rangeForLastDays(days: QuickRange): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { startDate: toIsoDay(start), endDate: toIsoDay(end) };
}

function dateLabel(isoDay: string, lang: Language): string {
  return formatIsoDayForLocale(isoDay, lang === "ru" ? "ru-RU" : "uz-UZ", {
    day: "numeric",
    month: "short",
  });
}

function estimateDaysToStockout(onHand: number, soldLast30d: number): number | null {
  if (onHand <= 0 || soldLast30d <= 0) return null;
  const daily = soldLast30d / 30;
  if (daily <= 0) return null;
  return onHand / daily;
}

function buildAlerts(
  lang: Language,
  daysInPeriod: number,
  salesData: SalesData,
  products: ApiProduct[]
): DashboardAlert[] {
  const MAX_ALERTS = 12;
  const saleProducts = products.filter((p) => p.status === "active");
  const outOfStock = products
    .filter((p) => p.status === "active" && p.stockKnown && p.onHand <= 0 && p.inbound <= 0)
    .sort((a, b) => b.soldLast30d - a.soldLast30d);

  const lowOrCriticalSelling = saleProducts
    .filter((p) => (p.stockHealth === "critical" || p.stockHealth === "low") && p.soldLast30d > 0 && p.onHand > 0)
    .map((p) => ({ ...p, daysToStockout: estimateDaysToStockout(p.onHand, p.soldLast30d) }))
    .filter((p) => p.daysToStockout != null && p.daysToStockout <= 21)
    .sort((a, b) => (a.daysToStockout as number) - (b.daysToStockout as number));

  const alerts: DashboardAlert[] = [];

  for (const p of outOfStock) {
    const productLabel = p.name && p.name !== p.sku ? `${p.name} (${p.sku})` : p.sku;
    const markets = p.marketplaces.length > 0 ? p.marketplaces.join(", ") : "-";
    alerts.push({
      id: `stock-out-${p.sku}`,
      tone: "critical",
      title: lang === "ru" ? "Нет на складе: продажи под риском" : "Omborda yo'q: sotuv xavf ostida",
      message:
        lang === "ru"
          ? `${productLabel} • ${markets}: остаток 0, в пути ${formatNumber(p.inbound)}. Продано за 30д: ${formatNumber(p.soldLast30d)}.`
          : `${productLabel} • ${markets}: qoldiq 0, yo'lda ${formatNumber(p.inbound)}. 30 kunda sotuv: ${formatNumber(p.soldLast30d)}.`,
    });
    if (alerts.length >= MAX_ALERTS) break;
  }

  if (alerts.length < MAX_ALERTS) {
    for (const p of lowOrCriticalSelling) {
      const productLabel = p.name && p.name !== p.sku ? `${p.name} (${p.sku})` : p.sku;
      const markets = p.marketplaces.length > 0 ? p.marketplaces.join(", ") : "-";
      alerts.push({
        id: `stock-risk-${p.sku}`,
        tone: (p.daysToStockout as number) <= 7 ? "critical" : "warning",
        title: lang === "ru" ? "Риск дефицита SKU" : "SKU taqchillik riski",
        message:
          lang === "ru"
            ? `${productLabel} • ${markets}: остаток ${formatNumber(p.onHand)} шт, 30д продажи ${formatNumber(p.soldLast30d)} (~${(p.daysToStockout as number).toFixed(1)} дн до нуля).`
            : `${productLabel} • ${markets}: qoldiq ${formatNumber(p.onHand)} dona, 30 kun sotuv ${formatNumber(p.soldLast30d)} (~${(p.daysToStockout as number).toFixed(1)} kun qoldi).`,
      });
      if (alerts.length >= MAX_ALERTS) break;
    }
  }

  const riskTone: AlertTone = salesData.orderChange <= -10 ? "critical" : salesData.orderChange < 0 ? "warning" : "info";
  const trendAlert: DashboardAlert = {
    id: "risk-trend",
    tone: riskTone,
    title: lang === "ru" ? "Риск: тренд заказов" : "Risk: buyurtma trendi",
    message:
      lang === "ru"
        ? `За ${daysInPeriod} ${RU_DAYS}: ${formatNumber(salesData.orderCount)} заказов, изменение ${salesData.orderChange.toFixed(2)}% к предыдущему периоду.`
        : `${daysInPeriod} kun: ${formatNumber(salesData.orderCount)} ta buyurtma, oldingi davrga nisbatan ${salesData.orderChange.toFixed(2)}%.`,
  };

  alerts.push(trendAlert);

  if (alerts.length === 1) {
    alerts.unshift({
      id: "stock-ok",
      tone: "info",
      title: lang === "ru" ? "Критических рисков по остаткам нет" : "Qoldiq bo'yicha kritik risk yo'q",
      message:
        lang === "ru"
          ? "Среди товаров со статусом активной продажи критичных SKU не найдено."
          : "Faol sotuv statusidagi mahsulotlarda kritik SKU topilmadi.",
    });
  } else if (outOfStock.length + lowOrCriticalSelling.length > MAX_ALERTS) {
    const hidden = outOfStock.length + lowOrCriticalSelling.length - Math.max(0, alerts.length - 1);
    if (hidden > 0) {
      alerts.push({
        id: "stock-more",
        tone: "info",
        title: lang === "ru" ? "Дополнительные риски" : "Qo'shimcha risklar",
        message:
          lang === "ru"
            ? `Есть ещё ${formatNumber(hidden)} SKU с риском. Откройте страницу товаров для деталей.`
            : `Yana ${formatNumber(hidden)} ta xavfli SKU bor. Tafsilot uchun mahsulotlar sahifasini oching.`,
      });
    }
  }

  return alerts;
}

export default function DashboardPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [founderWidgets, setFounderWidgets] = useState<FounderWidgets | null>(null);
  const [aiSummary, setAiSummary] = useState<string[]>([]);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiAsking, setAiAsking] = useState(false);

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isFiltering, setIsFiltering] = useState(false);
  const [quickRange, setQuickRange] = useState<QuickRange | null>(28);

  const [salesData, setSalesData] = useState<SalesData>({
    revenue: 0,
    revenueChange: 0,
    orderCount: 0,
    orderChange: 0,
    balance: 0,
    accrued: 0,
  });

  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [allOrders, setAllOrders] = useState<ApiOrder[] | null>(null);
  const [allProducts, setAllProducts] = useState<ApiProduct[] | null>(null);
  const requestSeqRef = useRef(0);
  const ordersAbortRef = useRef<AbortController | null>(null);
  const productsAbortRef = useRef<AbortController | null>(null);
  const financeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const currentLang = storage.getLang();
    setLang(currentLang);
    setTasks(storage.getTasks());

    const { startDate, endDate } = rangeForLastDays(28);
    setStartDate(startDate);
    setEndDate(endDate);
    void loadDashboardData(startDate, endDate, currentLang);
    void loadAiSummary(currentLang);

    // Load founder widgets with marketplace filter
    const currentMp = storage.getMarketplace() || "all";
    void loadFounderWidgets(currentMp);

    // Listen for marketplace changes from Topbar
    const handleMpChange = () => {
      const newMp = storage.getMarketplace() || "all";
      void loadFounderWidgets(newMp);
    };
    window.addEventListener("storage", handleMpChange);
    window.addEventListener("marketplaceChanged", handleMpChange);

    return () => {
      ordersAbortRef.current?.abort();
      productsAbortRef.current?.abort();
      financeAbortRef.current?.abort();
      window.removeEventListener("storage", handleMpChange);
      window.removeEventListener("marketplaceChanged", handleMpChange);
    };
  }, []);

  const loadFounderWidgets = async (marketplace?: string) => {
    try {
      const mp = marketplace || storage.getMarketplace() || "all";
      const res = await fetch(`/api/founder/dashboard?marketplace=${encodeURIComponent(mp)}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setFounderWidgets(data);
      }
    } catch (err) {
      console.error("Failed to load founder widgets:", err);
    }
  };

  const loadAiSummary = async (locale: Language = lang) => {
    try {
      setAiSummaryLoading(true);
      const response = await fetch(`/api/ai/summary?lang=${locale}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setAiSummary(Array.isArray(data?.lines) ? data.lines : []);
    } catch (error) {
      console.error("Failed to load AI summary:", error);
      setAiSummary([]);
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const askAi = async () => {
    const question = aiQuestion.trim();
    if (!question) return;

    setAiQuestion("");
    try {
      setAiAsking(true);
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, lang }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setAiAnswer(String(data?.answer || ""));
    } catch (error) {
      console.error("Failed to ask AI:", error);
    } finally {
      setAiAsking(false);
    }
  };

  const loadDashboardData = async (from: string, to: string, locale: Language = lang) => {
    const requestId = ++requestSeqRef.current;
    try {
      setIsFiltering(true);

      let orders = allOrders;
      if (!orders) {
        ordersAbortRef.current?.abort();
        const ordersController = new AbortController();
        ordersAbortRef.current = ordersController;
        const ordersRes = await fetch(`/api/orders?marketplace=${storage.getMarketplace()}`, { cache: "no-store", signal: ordersController.signal });
        const ordersJson = await ordersRes.json();
        orders = Array.isArray(ordersJson?.orders) ? ordersJson.orders : [];
        if (requestId !== requestSeqRef.current) return;
        setAllOrders(orders);
      }

      let products = allProducts;
      if (!products) {
        productsAbortRef.current?.abort();
        const productsController = new AbortController();
        productsAbortRef.current = productsController;
        const productsRes = await fetch(`/api/products?marketplace=${storage.getMarketplace()}`, { cache: "no-store", signal: productsController.signal });
        const productsJson = await productsRes.json();
        products = Array.isArray(productsJson?.products) ? productsJson.products : [];
        if (requestId !== requestSeqRef.current) return;
        setAllProducts(products);
      }

      const inRange = orders.filter((o) => {
        const day = getBusinessIsoDay(String(o.sourceDate || ""));
        return day >= from && day <= to;
      });

      const periodDays = Math.max(1, diffIsoDays(from, to) + 1);

      const prevTo = addDaysToIsoDay(from, -1);
      const prevFrom = addDaysToIsoDay(prevTo, -(periodDays - 1));

      const prevRange = orders.filter((o) => {
        const day = getBusinessIsoDay(String(o.sourceDate || ""));
        return day >= prevFrom && day <= prevTo;
      });

      const revenue = inRange.reduce((sum, o) => sum + Number(o.revenue || 0), 0);
      const prevRevenue = prevRange.reduce((sum, o) => sum + Number(o.revenue || 0), 0);
      const orderCount = inRange.length;
      const prevOrderCount = prevRange.length;

      const daily = new Map<string, { revenue: number; orders: number; delivered: number; deliveredRevenue: number }>();
      for (const order of inRange) {
        const key = getBusinessIsoDay(String(order.sourceDate || ""));
        const current = daily.get(key) || { revenue: 0, orders: 0, delivered: 0, deliveredRevenue: 0 };
        const rev = Number(order.revenue || 0);
        current.revenue += rev;
        current.orders += 1;
        const status = (String(order.sourceStatus || "")).toLowerCase();
        if (status === "delivered") {
          current.delivered += 1;
          current.deliveredRevenue += rev;
        }
        daily.set(key, current);
      }

      const points: ChartDataPoint[] = [];
      for (let offset = 0; offset < periodDays; offset += 1) {
        const key = addDaysToIsoDay(from, offset);
        const d = daily.get(key) || { revenue: 0, orders: 0, delivered: 0, deliveredRevenue: 0 };
        points.push({
          date: dateLabel(key, locale),
          revenue: Math.round(d.revenue),
          orders: d.orders,
          delivered: d.delivered,
          deliveredRevenue: Math.round(d.deliveredRevenue),
        });
      }

      setSalesData((prev) => ({
        ...prev,
        revenue: Math.round(revenue),
        revenueChange: calculateChange(revenue, prevRevenue),
        orderCount,
        orderChange: calculateChange(orderCount, prevOrderCount),
      }));
      setChartData(points);

      // Load finance details in background so chart/filter interactions stay responsive.
      void (async () => {
        try {
          financeAbortRef.current?.abort();
          const financeController = new AbortController();
          financeAbortRef.current = financeController;
          const financeRes = await fetch(
            `/api/finance?startDate=${encodeURIComponent(from)}&endDate=${encodeURIComponent(to)}&summaryOnly=1&forceLiveBalance=1`,
            { cache: "no-store", signal: financeController.signal }
          );
          if (!financeRes.ok || requestId !== requestSeqRef.current) return;
          const financeJson = await financeRes.json();
          if (requestId !== requestSeqRef.current) return;

          const currentBalance = Number(financeJson?.summary?.currentBalance);
          const totalAccrued = Number(financeJson?.breakdown?.totalAccrued);

          setSalesData((prev) => ({
            ...prev,
            balance: Number.isFinite(currentBalance) ? currentBalance : prev.balance,
            accrued: Number.isFinite(totalAccrued) ? Math.round(totalAccrued) : prev.accrued,
          }));
        } catch (financeError) {
          if ((financeError as Error)?.name === "AbortError") return;
          console.error("Failed to load finance data:", financeError);
        }
      })();
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      console.error("Failed to load dashboard data:", error);
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsFiltering(false);
      }
    }
  };

  const handleTaskComplete = (id: string) => {
    storage.deleteTask(id);
    setTasks(storage.getTasks());
  };

  const applyQuickRange = (days: QuickRange) => {
    const { startDate, endDate } = rangeForLastDays(days);
    setQuickRange(days);
    setStartDate(startDate);
    setEndDate(endDate);
    void loadDashboardData(startDate, endDate);
  };

  const daysInPeriod =
    startDate && endDate
      ? Math.max(1, diffIsoDays(startDate, endDate) + 1)
      : 28;

  const avgCheck = salesData.orderCount > 0 ? salesData.revenue / salesData.orderCount : 0;
  const avgPerDayOrders = daysInPeriod > 0 ? salesData.orderCount / daysInPeriod : 0;
  const alerts = buildAlerts(lang, daysInPeriod, salesData, allProducts || []);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{lang === "ru" ? "Центр управления" : "Boshqaruv markazi"}</h1>
          <p className="page-subtitle">
            {lang === "ru" ? "Сигналы, риски и решения для основателя" : "Founder uchun signallar, xavflar va qarorlar"}
          </p>
        </div>
        <Button variant="ghost">{lang === "ru" ? "\u0410\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0430" : "Analitika"}</Button>
      </div>

      {/* ============================================ */}
      {/* FOUNDER DASHBOARD 2.0 (Sprint 3)           */}
      {/* ============================================ */}
      {founderWidgets && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-text-main mb-1">
            {lang === "ru" ? "Сигналы и риски" : "Signallar va xavflar"}
          </h2>
          <p className="text-xs text-text-muted mb-3">{lang === "ru" ? "Требуют внимания прямо сейчас" : "Hozir e'tibor talab qiladi"}</p>

          {/* ROW 1: Signal Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: lang === "ru" ? "Критич. инциденты" : "Kritik hodisalar", value: founderWidgets.criticalIncidents, danger: true, href: "/incidents?severity=critical&status=open" },
              { label: lang === "ru" ? "Просрочено" : "Muddati o'tgan", value: founderWidgets.overdueTasks, danger: true, href: "/tasks?filter=overdue" },
              { label: lang === "ru" ? "Ждут решения" : "Qaror kutmoqda", value: founderWidgets.pendingApprovals, warning: true, href: "/approvals?status=pending" },
              { label: lang === "ru" ? "Без владельца" : "Ownersiz SKU", value: founderWidgets.noOwnerSkus, danger: true, href: "/responsibilities?filter=noOwner" },
              { label: lang === "ru" ? "Риск дефицита" : "Taqchillik xavfi", value: founderWidgets.stockoutRiskSkus, warning: true, href: "/products?filter=stockout" },
              { label: lang === "ru" ? "Риск убытка" : "Zarar xavfi", value: founderWidgets.lossRiskItems, warning: true, href: "/incidents" },
              { label: lang === "ru" ? "Реклама-Остаток" : "Reklama-Zaxira", value: founderWidgets.adStockConflicts, warning: true, href: "/incidents" },
              { label: lang === "ru" ? "Без ответа" : "Javobsiz", value: founderWidgets.unansweredAppeals || 0, danger: true, href: "/crm" },
              { label: lang === "ru" ? "Просрочено SLA" : "SLA o'tgan", value: founderWidgets.slaBreachedAppeals || 0, danger: true, href: "/crm" },
              { label: lang === "ru" ? "Негатив" : "Salbiy", value: founderWidgets.negativeAppeals || 0, warning: true, href: "/crm" },
              { label: lang === "ru" ? "Без обновлений" : "Jimlik (12s+)", value: founderWidgets.silentIncidents || 0, warning: true, href: "/incidents?filter=silent" },
              { label: lang === "ru" ? "Истекли" : "Muddati o'tgan", value: founderWidgets.expiredApprovals || 0, danger: true, href: "/approvals?filter=expired" },
              { label: lang === "ru" ? "Проблемы интеграций" : "Integratsiya muammolari", value: founderWidgets.integrationAlerts || 0, warning: true, href: "/settings" },
              { label: getTranslation(lang, "dash_stale_tasks"), value: founderWidgets.staleTasks || 0, warning: true, href: "/tasks?filter=stale" },
            ].map((w, i) => {
              const hasIssue = w.value > 0;
              const borderColor = hasIssue ? (w.danger ? "border-l-4 border-danger" : "border-l-4 border-warning") : "";
              const textColor = hasIssue ? (w.danger ? "text-danger" : "text-warning") : "text-success";
              return (
                <Card key={i} className={borderColor}>
                  <a href={w.href} className="block p-3 text-center hover:bg-background/50 transition-colors">
                    <p className="text-xs text-text-muted">{w.label}</p>
                    <p className={`text-2xl font-bold ${textColor}`}>{w.value}</p>
                  </a>
                </Card>
              );
            })}
          </div>

          {/* ROW 2: Recent Blockers + Critical Incidents + Pending Approvals */}
          <h3 className="text-sm font-bold text-text-main mt-5 mb-2">{lang === "ru" ? "Задачи, инциденты и решения" : "Vazifalar, hodisalar va qarorlar"}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Recent Blockers */}
            <Card>
              <div className="p-4">
                <h3 className="text-sm font-bold text-text-main mb-3">
                  {lang === "ru" ? "Заблокированные задачи" : "Bloklangan vazifalar"}
                </h3>
                {(founderWidgets.recentBlockers || []).length > 0 ? (
                  <div className="space-y-2 max-h-[180px] overflow-y-auto">
                    {founderWidgets.recentBlockers.map((b) => (
                      <div key={b.id} className={`p-2 rounded text-xs border-l-2 ${b.status === "blocked" ? "border-danger bg-danger/5" : "border-warning bg-warning/5"}`}>
                        <p className="font-medium text-text-main truncate">{b.title}</p>
                        <p className="text-text-muted">{b.assignee} • {b.reason || "—"}</p>
                        {b.overdueDays > 0 && <p className="text-danger font-semibold">+{b.overdueDays}d</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">{lang === "ru" ? "Нет блокеров" : "Blokerlar yo'q"}</p>
                )}
              </div>
            </Card>

            {/* Critical Incidents */}
            <Card>
              <div className="p-4">
                <h3 className="text-sm font-bold text-text-main mb-3">
                  {lang === "ru" ? "Критические инциденты" : "Kritik hodisalar"}
                </h3>
                {(founderWidgets.recentCriticalIncidents || []).length > 0 ? (
                  <div className="space-y-2 max-h-[180px] overflow-y-auto">
                    {founderWidgets.recentCriticalIncidents.map((inc) => (
                      <div key={inc.id} className={`p-2 rounded text-xs border-l-2 ${inc.severity === "critical" ? "border-danger bg-danger/5" : "border-warning bg-warning/5"}`}>
                        <p className="font-medium text-text-main truncate">{inc.title}</p>
                        <p className="text-text-muted">{inc.owner} • {inc.severity} • {inc.status}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-success">{lang === "ru" ? "Нет критических инцидентов" : "Kritik hodisalar yo'q"}</p>
                )}
              </div>
            </Card>

            {/* Pending Approvals */}
            <Card>
              <div className="p-4">
                <h3 className="text-sm font-bold text-text-main mb-3">
                  {lang === "ru" ? "Ожидают решения руководства" : "Rahbariyat qarorini kutmoqda"}
                </h3>
                {(founderWidgets.pendingApprovalsList || []).length > 0 ? (
                  <div className="space-y-2 max-h-[180px] overflow-y-auto">
                    {founderWidgets.pendingApprovalsList.map((a) => (
                      <a key={a.id} href="/approvals" className="block p-2 rounded text-xs border-l-2 border-warning bg-warning/5 hover:bg-warning/10 transition-colors">
                        <p className="font-medium text-text-main truncate">{a.reason}</p>
                        <p className="text-text-muted">{a.requestedBy} • {a.entityType}</p>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-success">{lang === "ru" ? "Нет ожидающих решений" : "Kutayotgan qarorlar yo'q"}</p>
                )}
              </div>
            </Card>
          </div>

          {/* ROW 2.8: Critical Overdue Escalations (G2 T3-01) */}
          {(founderWidgets.criticalEscalations || []).length > 0 && (
            <>
              <h3 className="text-sm font-bold text-text-main mt-5 mb-2">
                {lang === "ru" ? "Критические просрочки — нужно вмешательство" : "Kritik kechikishlar — aralashuv kerak"}
              </h3>
              <Card>
                <div className="p-4">
                  <div className="overflow-x-auto">
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                          <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600, color: "#6B7280" }}>{lang === "ru" ? "Задача" : "Vazifa"}</th>
                          <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600, color: "#6B7280" }}>{lang === "ru" ? "Исполнитель" : "Ijrochi"}</th>
                          <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 600, color: "#6B7280" }}>{lang === "ru" ? "Просрочка" : "Kechikish"}</th>
                          <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 600, color: "#6B7280" }}>{lang === "ru" ? "Статус" : "Status"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {founderWidgets.criticalEscalations.map((e, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #FEE2E2", background: i % 2 === 0 ? "#FFF5F5" : "#FFFFFF" }}>
                            <td style={{ padding: "6px 8px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }} title={e.title}>
                              <a href="/tasks?filter=overdue" style={{ color: "#EF4444", textDecoration: "none" }}>{e.title}</a>
                            </td>
                            <td style={{ padding: "6px 8px", color: "#374151" }}>{e.assignee}</td>
                            <td style={{ padding: "6px 8px", textAlign: "center", color: "#EF4444", fontWeight: 700 }}>+{e.overdueDays}{lang === "ru" ? "д" : "k"}</td>
                            <td style={{ padding: "6px 8px", textAlign: "center", color: "#6B7280", fontSize: 11 }}>{e.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            </>
          )}

          {/* ROW 2.5: Top Risky SKUs + Stale Tasks (T3-01) */}
          <h3 className="text-sm font-bold text-text-main mt-5 mb-2">{lang === "ru" ? "Рискованные SKU и застоявшиеся задачи" : "Xavfli SKU va eskirgan vazifalar"}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Top Risky SKUs */}
            <Card>
              <div className="p-4">
                <h3 className="text-sm font-bold text-text-main mb-3">
                  {getTranslation(lang, "dash_top_risky_skus")}
                </h3>
                {(founderWidgets.topRiskySkus || []).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                          <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 600, color: "#6B7280" }}>{getTranslation(lang, "dash_sku")}</th>
                          <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600, color: "#6B7280" }}>{getTranslation(lang, "dash_stock")}</th>
                          <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600, color: "#6B7280" }}>{getTranslation(lang, "dash_days_left")}</th>
                          <th style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: "#6B7280" }}>{getTranslation(lang, "dash_issues")}</th>
                          <th style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: "#6B7280" }}>{getTranslation(lang, "dash_owner")}</th>
                          <th style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: "#6B7280" }}>{getTranslation(lang, "dash_risk")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {founderWidgets.topRiskySkus.map((s, i) => {
                          const riskColor = s.riskScore >= 4 ? "#EF4444" : s.riskScore >= 2 ? "#F59E0B" : "#6B7280";
                          const riskLabel = s.riskScore >= 4 ? getTranslation(lang, "dash_high") : s.riskScore >= 2 ? getTranslation(lang, "dash_medium") : getTranslation(lang, "dash_low");
                          return (
                            <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                              <td style={{ padding: "6px 6px", fontWeight: 500, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.sku}>
                                {s.sku}
                                <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 4 }}>{s.marketplace}</span>
                              </td>
                              <td style={{ padding: "6px 6px", textAlign: "right", color: s.onHand <= 0 ? "#EF4444" : "#374151", fontWeight: s.onHand <= 0 ? 600 : 400 }}>{s.onHand}</td>
                              <td style={{ padding: "6px 6px", textAlign: "right", color: s.daysToStockout !== null && s.daysToStockout < 7 ? "#EF4444" : "#374151" }}>
                                {s.daysToStockout !== null ? s.daysToStockout : "—"}
                              </td>
                              <td style={{ padding: "6px 6px", textAlign: "center", color: s.openIncidents > 0 ? "#EF4444" : "#22C55E" }}>{s.openIncidents}</td>
                              <td style={{ padding: "6px 6px", textAlign: "center" }}>
                                <span style={{ color: s.hasOwner ? "#22C55E" : "#EF4444", fontWeight: 500 }}>
                                  {s.hasOwner ? getTranslation(lang, "dash_yes") : getTranslation(lang, "dash_no")}
                                </span>
                              </td>
                              <td style={{ padding: "6px 6px", textAlign: "center" }}>
                                <span style={{ color: riskColor, fontWeight: 600, fontSize: 11 }}>{riskLabel}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-success">{getTranslation(lang, "dash_no_risky")}</p>
                )}
              </div>
            </Card>

            {/* Stale Tasks */}
            <Card>
              <div className="p-4">
                <h3 className="text-sm font-bold text-text-main mb-3">
                  {getTranslation(lang, "dash_stale_tasks_block")}
                </h3>
                {(founderWidgets.staleTasksList || []).length > 0 ? (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto">
                    {founderWidgets.staleTasksList.map((t) => {
                      const urgency = t.hoursSinceUpdate > 72 ? "border-danger bg-danger/5" : "border-warning bg-warning/5";
                      return (
                        <a key={t.id} href="/tasks" className={`block p-2 rounded text-xs border-l-2 ${urgency} hover:opacity-80 transition-opacity`}>
                          <p className="font-medium text-text-main truncate">{t.title}</p>
                          <p className="text-text-muted">
                            {t.assignee} • {t.status} • <span className={t.hoursSinceUpdate > 72 ? "text-danger font-semibold" : "text-warning font-semibold"}>
                              {t.hoursSinceUpdate}{getTranslation(lang, "dash_hours_ago")}
                            </span>
                          </p>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-success">{getTranslation(lang, "dash_no_stale")}</p>
                )}
              </div>
            </Card>
          </div>

          {/* ROW 3: KPI Panel */}
          {founderWidgets.kpi && (
            <>
            <h3 className="text-sm font-bold text-text-main mt-5 mb-2">{lang === "ru" ? "Ключевые показатели" : "Asosiy ko'rsatkichlar"}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                { label: lang === "ru" ? "Вовремя %" : "O'z vaqtida %", value: `${founderWidgets.kpi.onTimeCompletionRate}%`, good: founderWidgets.kpi.onTimeCompletionRate >= 80 },
                { label: lang === "ru" ? "Просрочка" : "Kechikkan", value: String(founderWidgets.kpi.overdueTaskCount), good: founderWidgets.kpi.overdueTaskCount === 0 },
                { label: lang === "ru" ? "Решение инцид. (ч)" : "Hodisa hal (soat)", value: founderWidgets.kpi.incidentResolutionTimeHours !== null ? `${founderWidgets.kpi.incidentResolutionTimeHours}h` : "—", good: founderWidgets.kpi.incidentResolutionTimeHours !== null && founderWidgets.kpi.incidentResolutionTimeHours <= 12 },
                { label: lang === "ru" ? "Задержка одобр. (ч)" : "Tasdiqlash kechikish (soat)", value: founderWidgets.kpi.approvalDelayHours !== null ? `${founderWidgets.kpi.approvalDelayHours}h` : "—", good: founderWidgets.kpi.approvalDelayHours !== null && founderWidgets.kpi.approvalDelayHours <= 4 },
                { label: lang === "ru" ? "Вмешательства рук-ва" : "Rahbariyat aralashuvlari", value: String(founderWidgets.kpi.founderInterventionCount), good: founderWidgets.kpi.founderInterventionCount <= 2 },
                { label: lang === "ru" ? "Случаев дефицита" : "Taqchillik holatlari", value: String(founderWidgets.kpi.stockoutCases), good: founderWidgets.kpi.stockoutCases === 0 },
              ].map((kpi, i) => (
                <Card key={i}>
                  <div className="p-3 text-center">
                    <p className="text-xs text-text-muted">{kpi.label}</p>
                    <p className={`text-lg font-bold ${kpi.good ? "text-success" : "text-danger"}`}>{kpi.value}</p>
                  </div>
                </Card>
              ))}
            </div>
          </>
          )}

          {/* ROW 4: Team Scorecard (Enhanced) */}
          {founderWidgets.teamScorecard.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-bold text-text-main mb-2">
                {lang === "ru" ? "Команда" : "Jamoa ko'rsatkichlari"}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {founderWidgets.teamScorecard.map((m) => (
                  <Card key={m.userId}>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <p className="text-sm font-bold text-text-main">{m.userName}</p>
                          {m.area && <p className="text-[10px] text-text-muted">{getTranslation(lang, "dash_area")}: {m.area}</p>}
                        </div>
                        <span className={`text-sm font-bold ${m.completionRate >= 80 ? "text-success" : m.completionRate >= 50 ? "text-warning" : "text-danger"}`}>
                          {m.completionRate}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-text-muted">{lang === "ru" ? "Активные" : "Faol"}</p>
                          <p className="font-semibold">{m.activeTasks}</p>
                        </div>
                        <div>
                          <p className="text-text-muted">{lang === "ru" ? "Просроч." : "Kechikkan"}</p>
                          <p className={`font-semibold ${m.overdueTasks > 0 ? "text-danger" : ""}`}>{m.overdueTasks}</p>
                        </div>
                        <div>
                          <p className="text-text-muted">{lang === "ru" ? "Блок/Жду" : "Blok/Kutish"}</p>
                          <p className={`font-semibold ${m.blockedTasks > 0 ? "text-danger" : ""}`}>{m.blockedTasks}/{m.waitingTasks}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                        <div>
                          <p className="text-text-muted">{lang === "ru" ? "Инциденты" : "Hodisalar"}</p>
                          <p className={`font-semibold ${m.incidentCount > 0 ? "text-warning" : ""}`}>{m.incidentCount}</p>
                        </div>
                        <div>
                          <p className="text-text-muted">{getTranslation(lang, "dash_risky_skus")}</p>
                          <p className={`font-semibold ${m.riskySkuCount > 0 ? "text-danger" : ""}`}>{m.riskySkuCount}</p>
                        </div>
                        <div>
                          <p className="text-text-muted">{getTranslation(lang, "dash_interventions")}</p>
                          <p className={`font-semibold ${m.founderInterventions > 0 ? "text-warning" : ""}`}>{m.founderInterventions}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                        <div>
                          <p className="text-text-muted">{lang === "ru" ? "Решение (ч)" : "Hal (soat)"}</p>
                          <p className="font-semibold">{m.avgResolutionHours !== null ? `${m.avgResolutionHours}h` : "—"}</p>
                        </div>
                        <div>
                          <p className="text-text-muted">{lang === "ru" ? "Обновл." : "Yangilash"}</p>
                          <p className={`font-semibold ${m.lastUpdateAge !== null && m.lastUpdateAge > 48 ? "text-danger" : m.lastUpdateAge !== null && m.lastUpdateAge > 24 ? "text-warning" : ""}`}>
                            {m.lastUpdateAge !== null ? `${Math.round(m.lastUpdateAge)}h` : "—"}
                          </p>
                        </div>
                        <div />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <h3 className="text-sm font-bold text-text-main mb-2">
        {lang === "ru" ? "Финансы и продажи" : "Moliya va sotuvlar"}
        {startDate && endDate && (
          <span className="font-normal text-text-muted ml-2">
            {formatIsoDayForLocale(startDate, lang === "ru" ? "ru-RU" : "uz-UZ", { day: "numeric", month: "short" })}
            {" - "}
            {formatIsoDayForLocale(endDate, lang === "ru" ? "ru-RU" : "uz-UZ", { day: "numeric", month: "short", year: "numeric" })}
            {" | "}{daysInPeriod} {lang === "ru" ? RU_DAYS : "kun"}
          </span>
        )}
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{lang === "ru" ? "\u0411\u0430\u043B\u0430\u043D\u0441" : "Balans"}</CardTitle>
            <CardSubtitle>
              {lang === "ru" ? "\u0424\u0438\u043D\u0430\u043D\u0441\u044B \u0437\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434" : "Tanlangan davr moliyasi"}
            </CardSubtitle>
          </CardHeader>
          <CardBody className="space-y-5">
            <div>
              <p className="text-sm text-text-muted">{lang === "ru" ? "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0431\u0430\u043B\u0430\u043D\u0441" : "Joriy balans"}</p>
              <MetricMain className="mt-1">{formatCurrency(salesData.balance)} {RUB}</MetricMain>
            </div>
            <div>
              <p className="text-sm text-text-muted">
                {lang === "ru" ? `\u041D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u043E \u0437\u0430 ${daysInPeriod} ${RU_DAYS}` : `${daysInPeriod} kun uchun hisoblangan`}
              </p>
              <p className="text-lg font-bold text-text-main mt-1">{formatCurrency(salesData.accrued)} {RUB}</p>
              <p className="text-xs text-text-muted mt-1">
                ~{salesData.revenue > 0 ? ((salesData.accrued / salesData.revenue) * 100).toFixed(1) : "0.0"}% {lang === "ru" ? "\u043E\u0442 \u043E\u0431\u043E\u0440\u043E\u0442\u0430" : "aylanmadan"}
              </p>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{lang === "ru" ? "\u041F\u0440\u043E\u0434\u0430\u043D\u043D\u044B\u0435 \u0442\u043E\u0432\u0430\u0440\u044B" : "Sotilgan mahsulotlar"}</CardTitle>
                <CardSubtitle>
                  {daysInPeriod} {lang === "ru" ? RU_DAYS : "kun"} | {formatNumber(salesData.orderCount)} {lang === "ru" ? RU_ORDERS : "buyurtma"}
                </CardSubtitle>
              </div>
              <div className="flex items-center gap-2">
                {[7, 14, 28].map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={quickRange === d ? "primary" : "ghost"}
                    onClick={() => applyQuickRange(d as QuickRange)}
                    disabled={isFiltering}
                  >
                    {d} {lang === "ru" ? RU_DN : "kun"}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <MetricMain>{formatNumber(salesData.orderCount)} {lang === "ru" ? RU_UNITS : "dona"}</MetricMain>
            <MetricRow className="mt-2">
              <MetricLabel>{lang === "ru" ? "\u041F\u0440\u043E\u0434\u0430\u043D\u043E \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434" : "Davr bo'yicha sotuv"}</MetricLabel>
              <MetricChange
                value={`${salesData.orderChange > 0 ? "+" : ""}${salesData.orderChange.toFixed(2)}%`}
                positive={salesData.orderChange > 0}
              />
              <MetricLabel>
                | {formatCurrency(salesData.revenue)} {RUB}
              </MetricLabel>
            </MetricRow>

            <div className="mt-6">
              <RevenueChart data={chartData} lang={lang} metric="orders" />
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-text-muted">{lang === "ru" ? "\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u0447\u0435\u043A" : "O'rtacha chek"}</p>
                  <p className="text-lg font-semibold text-text-main mt-1">{formatCurrency(avgCheck)} {RUB}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">{lang === "ru" ? "\u0412 \u0434\u0435\u043D\u044C" : "Kuniga"}</p>
                  <p className="text-lg font-semibold text-text-main mt-1">
                    {avgPerDayOrders.toFixed(1)} {lang === "ru" ? "\u0437\u0430\u043A\u0430\u0437\u0430" : "buyurtma"}
                  </p>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{lang === "ru" ? "\u041E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u044F" : "Ogohlantirishlar"}</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border-l-4 ${
                    alert.tone === "critical"
                      ? "bg-danger/5 border-danger"
                      : alert.tone === "warning"
                      ? "bg-warning/5 border-warning"
                      : "bg-success/5 border-success"
                  }`}
                >
                  <p className="text-sm font-semibold text-text-main">{alert.title}</p>
                  <p className="text-xs text-text-muted mt-1">{alert.message}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{getTranslation(lang, "dashboard_tasks_today")}</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="tasks-list">
              {tasks.length > 0 ? (
                tasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="task-item">
                    <div className="task-label">
                      <input
                        type="checkbox"
                        onChange={() => handleTaskComplete(task.id)}
                        className="w-4 h-4 text-primary border-border rounded focus:ring-primary"
                      />
                      <span className="text-sm text-text-main">{task.title}</span>
                    </div>
                    <div className="task-counter">|</div>
                  </div>
                ))
              ) : (
                <>
                  <div className="task-item">
                    <div className="task-label">
                      <input type="checkbox" className="w-4 h-4 text-primary border-border rounded focus:ring-primary" />
                      <span className="text-sm text-text-main">{getTranslation(lang, "dashboard_task_discounts")}</span>
                    </div>
                    <div className="task-counter">62</div>
                  </div>
                  <div className="task-item">
                    <div className="task-label">
                      <input type="checkbox" className="w-4 h-4 text-primary border-border rounded focus:ring-primary" />
                      <span className="text-sm text-text-main">{getTranslation(lang, "dashboard_task_customers")}</span>
                    </div>
                    <div className="task-counter">2</div>
                  </div>
                  <div className="task-item">
                    <div className="task-label">
                      <input type="checkbox" className="w-4 h-4 text-primary border-border rounded focus:ring-primary" />
                      <span className="text-sm text-text-main">{getTranslation(lang, "dashboard_task_questions")}</span>
                    </div>
                    <div className="task-counter">2</div>
                  </div>
                </>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{getTranslation(lang, "dashboard_summary_title")}</CardTitle>
            <Chip>{lang === "ru" ? `${daysInPeriod} ${RU_DAYS}` : `${daysInPeriod} kun`}</Chip>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-text-muted">
            {lang === "ru"
              ? `\u0417\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434 (${daysInPeriod} ${RU_DAYS}) \u043E\u0431\u0449\u0438\u0439 \u043E\u0431\u043E\u0440\u043E\u0442 \u0441\u043E\u0441\u0442\u0430\u0432\u0438\u043B ${formatCurrency(salesData.revenue)} ${RUB}, \u0432\u0441\u0435\u0433\u043E ${formatNumber(salesData.orderCount)} ${RU_ORDERS}.`
              : `Tanlangan davr (${daysInPeriod} kun) uchun umumiy aylanma ${formatCurrency(salesData.revenue)} ${RUB}, jami ${formatNumber(salesData.orderCount)} ta buyurtma.`}
          </p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{lang === "ru" ? "AI: Краткий итог" : "AI: Qisqa xulosa"}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => void loadAiSummary()} disabled={aiSummaryLoading}>
                {aiSummaryLoading ? (lang === "ru" ? "Обновление..." : "Yangilanmoqda...") : (lang === "ru" ? "Обновить" : "Yangilash")}
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            {aiSummary.length > 0 ? (
              <ul className="space-y-2 text-sm text-text-main">
                {aiSummary.map((line, idx) => (
                  <li key={`ai-summary-${idx}`}>- {line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">{lang === "ru" ? "Пока нет AI-сводки." : "Hozircha AI xulosa yo'q."}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{lang === "ru" ? "AI: Вопрос-ответ" : "AI: Savol-javob"}</CardTitle>
            <CardSubtitle>
              {lang === "ru" ? "Спросите по текущим данным: риск SKU, 7 дней, слив бюджета." : "Joriy data bo'yicha so'rang: xavfli SKU, 7 kun, byudjet yeb qo'yish."}
            </CardSubtitle>
          </CardHeader>
          <CardBody>
            <div className="flex flex-col gap-3">
              <input
                className="w-full border border-border rounded-md px-3 py-2 bg-white text-sm"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder={lang === "ru" ? "Например: Какой SKU самый рискованный сегодня?" : "Masalan: Bugun eng xavfli SKU qaysi?"}
              />
              <div>
                <Button variant="primary" size="sm" onClick={() => void askAi()} disabled={aiAsking}>
                  {aiAsking ? (lang === "ru" ? "Отправка..." : "Yuborilmoqda...") : (lang === "ru" ? "Спросить AI" : "AIdan so'rash")}
                </Button>
              </div>
              {aiAnswer && <p className="text-sm text-text-main whitespace-pre-line leading-6">{aiAnswer}</p>}
            </div>
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}


