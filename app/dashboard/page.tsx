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
  teamScorecard: { userId: string; userName: string; activeTasks: number; completedOnTime: number; overdueTasks: number; completionRate: number }[];
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
}

interface ApiOrder {
  sourceDate?: string;
  revenue?: number;
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
      title: lang === "ru" ? "Out of stock: продажи под риском" : "Out of stock: sotuv xavf ostida",
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
    void loadFounderWidgets();

    return () => {
      ordersAbortRef.current?.abort();
      productsAbortRef.current?.abort();
      financeAbortRef.current?.abort();
    };
  }, []);

  const loadFounderWidgets = async () => {
    try {
      const res = await fetch("/api/founder/dashboard", { cache: "no-store" });
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
        const ordersRes = await fetch("/api/orders", { cache: "no-store", signal: ordersController.signal });
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
        const productsRes = await fetch("/api/products", { cache: "no-store", signal: productsController.signal });
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

      const daily = new Map<string, { revenue: number; orders: number }>();
      for (const order of inRange) {
        const key = getBusinessIsoDay(String(order.sourceDate || ""));
        const current = daily.get(key) || { revenue: 0, orders: 0 };
        current.revenue += Number(order.revenue || 0);
        current.orders += 1;
        daily.set(key, current);
      }

      const points: ChartDataPoint[] = [];
      for (let offset = 0; offset < periodDays; offset += 1) {
        const key = addDaysToIsoDay(from, offset);
        const d = daily.get(key) || { revenue: 0, orders: 0 };
        points.push({
          date: dateLabel(key, locale),
          revenue: Math.round(d.revenue),
          orders: d.orders,
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
          <h1 className="page-title">{getTranslation(lang, "dashboard_title")}</h1>
          <p className="page-subtitle">
            {startDate && endDate
              ? `${formatIsoDayForLocale(startDate, lang === "ru" ? "ru-RU" : "uz-UZ", {
                  day: "numeric",
                  month: "short",
                })} - ${formatIsoDayForLocale(endDate, lang === "ru" ? "ru-RU" : "uz-UZ", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })} | ${daysInPeriod} ${lang === "ru" ? RU_DAYS : "kun"}`
              : getTranslation(lang, "dashboard_subtitle")}
          </p>
        </div>
        <Button variant="ghost">{lang === "ru" ? "\u0410\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0430" : "Analitika"}</Button>
      </div>

      {/* Founder Control Center */}
      {founderWidgets && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-text-main mb-3">
            {lang === "ru" ? "Founder Control Center" : "Founder Boshqaruv Markazi"}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              {
                label: lang === "ru" ? "Просрочено" : "Muddati o'tgan",
                value: founderWidgets.overdueTasks,
                color: founderWidgets.overdueTasks > 0 ? "text-danger" : "text-success",
                bg: founderWidgets.overdueTasks > 0 ? "border-l-4 border-danger" : "",
                href: "/tasks",
              },
              {
                label: lang === "ru" ? "Ждут решения" : "Qaror kutmoqda",
                value: founderWidgets.pendingApprovals,
                color: founderWidgets.pendingApprovals > 0 ? "text-warning" : "text-success",
                bg: founderWidgets.pendingApprovals > 0 ? "border-l-4 border-warning" : "",
                href: "/tasks",
              },
              {
                label: lang === "ru" ? "Без владельца" : "Ownersiz SKU",
                value: founderWidgets.noOwnerSkus,
                color: founderWidgets.noOwnerSkus > 0 ? "text-danger" : "text-success",
                bg: founderWidgets.noOwnerSkus > 0 ? "border-l-4 border-danger" : "",
                href: "/responsibilities",
              },
              {
                label: lang === "ru" ? "Stockout риск" : "Stockout xavfi",
                value: founderWidgets.stockoutRiskSkus,
                color: founderWidgets.stockoutRiskSkus > 0 ? "text-warning" : "text-success",
                bg: founderWidgets.stockoutRiskSkus > 0 ? "border-l-4 border-warning" : "",
                href: "/products",
              },
              {
                label: lang === "ru" ? "Инциденты" : "Hodisalar",
                value: founderWidgets.criticalIncidents,
                color: founderWidgets.criticalIncidents > 0 ? "text-danger" : "text-success",
                bg: founderWidgets.criticalIncidents > 0 ? "border-l-4 border-danger" : "",
              },
              {
                label: lang === "ru" ? "Zarar risk" : "Zarar xavfi",
                value: founderWidgets.lossRiskItems,
                color: founderWidgets.lossRiskItems > 0 ? "text-warning" : "text-success",
                bg: "",
              },
              {
                label: lang === "ru" ? "Ad-Stock" : "Reklama-Zaxira",
                value: founderWidgets.adStockConflicts,
                color: founderWidgets.adStockConflicts > 0 ? "text-warning" : "text-success",
                bg: "",
              },
            ].map((w, i) => (
              <Card key={i} className={`${w.bg}`}>
                <a href={w.href || "#"} className="block p-3 text-center hover:bg-background/50">
                  <p className="text-xs text-text-muted">{w.label}</p>
                  <p className={`text-2xl font-bold ${w.color}`}>{w.value}</p>
                </a>
              </Card>
            ))}
          </div>

          {/* Team Scorecard mini */}
          {founderWidgets.teamScorecard.length > 0 && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {founderWidgets.teamScorecard.map((m) => (
                <Card key={m.userId}>
                  <div className="p-3">
                    <p className="text-sm font-semibold text-text-main truncate">{m.userName}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-text-muted">
                        {lang === "ru" ? "Активные" : "Faol"}: {m.activeTasks}
                      </span>
                      {m.overdueTasks > 0 && (
                        <span className="text-xs text-danger font-semibold">
                          {lang === "ru" ? "Просроч." : "Kechikkan"}: {m.overdueTasks}
                        </span>
                      )}
                      <span className={`text-xs font-semibold ${m.completionRate >= 80 ? "text-success" : m.completionRate >= 50 ? "text-warning" : "text-danger"}`}>
                        {m.completionRate}%
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

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


