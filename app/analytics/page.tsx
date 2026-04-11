"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import { RevenueChart } from "@/components/RevenueChart";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language } from "@/types";
import type { AnalyticsResult } from "@/src/analytics";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  CardSubtitle,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  MetricMain,
  MetricLabel,
  MetricRow,
} from "@/components/ui";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ru-RU", { style: "decimal", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const getRiskBadgeClass = (risk: string) => {
  switch (risk) {
    case "CRITICAL": case "HIGH": return "bg-danger text-white px-2 py-1 rounded text-xs font-semibold";
    case "MED": return "bg-warning text-white px-2 py-1 rounded text-xs font-semibold";
    case "LOW": return "bg-success text-white px-2 py-1 rounded text-xs font-semibold";
    default: return "bg-gray-400 text-white px-2 py-1 rounded text-xs font-semibold";
  }
};

interface ChartDataPoint {
  date: string; revenue: number; orders: number;
  delivered?: number; deliveredRevenue?: number;
  prevDate?: string; prevRevenue?: number; prevOrders?: number;
}
interface PeriodLabel { start: string; end: string; }
interface Product { name: string; sku: string; revenue: number; quantity: number; avgPrice: number; marketplace: string; }
interface KPI { totalRevenue: number; totalOrders: number; avgCheck: number; cancelledOrders: number; cancelRate: number; }
interface KPIPrev { totalRevenue: number; totalOrders: number; avgCheck: number; cancelRate: number; }
interface Signals {
  decliningRevenueSKUs: { sku: string; currentRevenue: number; prevRevenue: number; dropPct: number }[];
  decliningRevenueSKUCount: number;
  risingCancelSKUs: { sku: string; cancelRate: number; cancelCount: number }[];
  risingCancelSKUCount: number;
  avgCheckTrend: "up" | "down" | "stable";
  trendDirection: "up" | "down" | "stable";
  bottomSKUCount: number;
}

function ChangeBadge({ value, inverse = false }: { value: number; inverse?: boolean }) {
  if (value === 0) return null;
  const isGood = inverse ? value < 0 : value > 0;
  return (
    <span className={`text-sm font-semibold ${isGood ? "text-success" : "text-danger"}`}>
      {value > 0 ? "+" : ""}{value}%
    </span>
  );
}

function TrendArrow({ direction }: { direction: "up" | "down" | "stable" }) {
  if (direction === "up") return <span className="text-success text-sm font-bold">↑</span>;
  if (direction === "down") return <span className="text-danger text-sm font-bold">↓</span>;
  return <span className="text-text-muted text-sm">→</span>;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Language>("ru");
  const [period, setPeriod] = useState<"7d" | "28d">("28d");
  const [loading, setLoading] = useState(true);
  const [showForecast, setShowForecast] = useState(true);

  const [kpi, setKpi] = useState<KPI>({ totalRevenue: 0, totalOrders: 0, avgCheck: 0, cancelledOrders: 0, cancelRate: 0 });
  const [kpiPrev, setKpiPrev] = useState<KPIPrev>({ totalRevenue: 0, totalOrders: 0, avgCheck: 0, cancelRate: 0 });
  const [estimatedProfit, setEstimatedProfit] = useState<number>(0);
  const [prevEstimatedProfit, setPrevEstimatedProfit] = useState<number>(0);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [topProducts, setTopProducts] = useState<Product[]>([]);
  const [bottomProducts, setBottomProducts] = useState<Product[]>([]);
  const [analyticsResults, setAnalyticsResults] = useState<AnalyticsResult[]>([]);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [periodLabels, setPeriodLabels] = useState<{ current: PeriodLabel; previous: PeriodLabel } | null>(null);

  const fetchAnalytics = useCallback(async (days: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?days=${days}&marketplace=${storage.getMarketplace()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      setKpi(data.kpi);
      setKpiPrev(data.kpiPrev);
      setEstimatedProfit(data.estimatedProfit ?? 0);
      setPrevEstimatedProfit(data.prevEstimatedProfit ?? 0);
      setTopProducts(data.topProducts || []);
      setBottomProducts(data.bottomProducts || []);
      setAnalyticsResults(data.analyticsResults || []);
      setSignals(data.signals || null);
      setPeriodLabels(data.periodLabels || null);

      const currentData: any[] = data.chartData || [];
      const prevData: any[] = data.prevChartData || [];
      setChartData(currentData.map((d: any, i: number) => {
        const prev = prevData[i];
        return { date: d.date, revenue: d.revenue, orders: d.orders, delivered: d.delivered, deliveredRevenue: d.deliveredRevenue,
          prevDate: prev?.date, prevRevenue: prev?.revenue, prevOrders: prev?.orders };
      }));
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLang(storage.getLang());
    fetchAnalytics(28);
  }, [fetchAnalytics]);

  const updatePeriod = (newPeriod: "7d" | "28d") => {
    setPeriod(newPeriod);
    fetchAnalytics(newPeriod === "7d" ? 7 : 28);
  };

  const t = (ru: string, uz: string) => lang === "ru" ? ru : uz;

  const pct = (cur: number, prev: number) =>
    prev > 0 ? parseFloat((((cur - prev) / prev) * 100).toFixed(1)) : 0;

  const revenueChange = pct(kpi.totalRevenue, kpiPrev.totalRevenue);
  const ordersChange = pct(kpi.totalOrders, kpiPrev.totalOrders);
  const avgCheckChange = pct(kpi.avgCheck, kpiPrev.avgCheck);
  const cancelRateChange = parseFloat((kpi.cancelRate - kpiPrev.cancelRate).toFixed(1));
  const profitChange = pct(estimatedProfit, prevEstimatedProfit);

  const trendDir = signals?.trendDirection ?? "stable";

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{getTranslation(lang, "analytics_title")}</h1>
          <p className="page-subtitle">{getTranslation(lang, "analytics_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={period === "7d" ? "primary" : "ghost"} size="sm" onClick={() => updatePeriod("7d")}>
            7 {t("дней", "kun")}
          </Button>
          <Button variant={period === "28d" ? "primary" : "ghost"} size="sm" onClick={() => updatePeriod("28d")}>
            28 {t("дней", "kun")}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-muted">
          {t("Загрузка данных...", "Ma'lumotlar yuklanmoqda...")}
        </div>
      ) : (
        <>
          {/* KPI Cards — 5 cards including profit + cancel rate change */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardBody>
                <MetricLabel>{t("Выручка", "Tushum")}</MetricLabel>
                <MetricRow className="items-baseline gap-2 mt-1">
                  <MetricMain>{formatCurrency(kpi.totalRevenue)} ₽</MetricMain>
                  <ChangeBadge value={revenueChange} />
                </MetricRow>
                <p className="text-xs text-text-muted mt-1.5">
                  {t(`Пред. период: ${formatCurrency(kpiPrev.totalRevenue)} ₽`, `Oldingi: ${formatCurrency(kpiPrev.totalRevenue)} ₽`)}
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <MetricLabel>{t("Заказы", "Buyurtmalar")}</MetricLabel>
                <MetricRow className="items-baseline gap-2 mt-1">
                  <MetricMain>{kpi.totalOrders.toLocaleString()}</MetricMain>
                  <ChangeBadge value={ordersChange} />
                </MetricRow>
                <p className="text-xs text-text-muted mt-1.5">
                  {t(`Пред.: ${kpiPrev.totalOrders}`, `Oldingi: ${kpiPrev.totalOrders}`)}
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <MetricLabel>{t("Средний чек", "O'rtacha chek")}</MetricLabel>
                <MetricRow className="items-baseline gap-2 mt-1">
                  <MetricMain>{formatCurrency(kpi.avgCheck)} ₽</MetricMain>
                  <ChangeBadge value={avgCheckChange} />
                </MetricRow>
                <p className="text-xs text-text-muted mt-1.5">
                  {t(`Пред.: ${formatCurrency(kpiPrev.avgCheck)} ₽`, `Oldingi: ${formatCurrency(kpiPrev.avgCheck)} ₽`)}
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <MetricLabel>{t("Отмены", "Bekor")}</MetricLabel>
                <MetricRow className="items-baseline gap-2 mt-1">
                  <MetricMain className={kpi.cancelRate > 10 ? "text-danger" : kpi.cancelRate > 5 ? "text-warning" : "text-success"}>
                    {kpi.cancelRate}%
                  </MetricMain>
                  {cancelRateChange !== 0 && (
                    <span className={`text-sm font-semibold ${cancelRateChange > 0 ? "text-danger" : "text-success"}`}>
                      {cancelRateChange > 0 ? "+" : ""}{cancelRateChange}pp
                    </span>
                  )}
                </MetricRow>
                <p className="text-xs text-text-muted mt-1.5">
                  {kpi.cancelledOrders} {t(`из ${kpi.totalOrders + kpi.cancelledOrders}`, `/ ${kpi.totalOrders + kpi.cancelledOrders}`)} • {t(`Пред.: ${kpiPrev.cancelRate}%`, `Oldingi: ${kpiPrev.cancelRate}%`)}
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <MetricLabel>{t("Прибыль (est.)", "Foyda (est.)")}</MetricLabel>
                <MetricRow className="items-baseline gap-2 mt-1">
                  <MetricMain className={estimatedProfit > prevEstimatedProfit ? "text-success" : estimatedProfit < prevEstimatedProfit ? "text-danger" : ""}>
                    {formatCurrency(estimatedProfit)} ₽
                  </MetricMain>
                  <ChangeBadge value={profitChange} />
                </MetricRow>
                <p className="text-xs text-text-muted mt-1.5">
                  {t("После ~15% комиссии маркетплейса", "~15% komissiya chegirilgandan so'ng")}
                </p>
              </CardBody>
            </Card>
          </div>

          {/* Signal Cards */}
          {signals && (signals.decliningRevenueSKUCount > 0 || signals.risingCancelSKUCount > 0 || signals.trendDirection === "down" || signals.avgCheckTrend === "down") && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {/* Declining revenue SKUs */}
              {signals.decliningRevenueSKUCount > 0 && (
                <div
                  className="bg-red-50 border border-red-200 rounded-lg p-4 cursor-pointer hover:bg-red-100 transition-colors"
                  onClick={() => router.push("/products")}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-red-600 uppercase tracking-wide">{t("Падение выручки", "Tushum pasayishi")}</p>
                      <p className="text-2xl font-bold text-red-700 mt-1">{signals.decliningRevenueSKUCount}</p>
                      <p className="text-xs text-red-500 mt-0.5">{t("SKU потеряли >20%", "SKU >20% yo'qotdi")}</p>
                    </div>
                    <span className="text-2xl">📉</span>
                  </div>
                  {signals.decliningRevenueSKUs.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {signals.decliningRevenueSKUs.slice(0, 2).map((s) => (
                        <p key={s.sku} className="text-xs text-red-600 font-mono truncate">
                          {s.sku} <span className="font-bold">-{s.dropPct}%</span>
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-red-400 mt-2">→ {t("Перейти к товарам", "Mahsulotlarga o'tish")}</p>
                </div>
              )}

              {/* Rising cancellations */}
              {signals.risingCancelSKUCount > 0 && (
                <div
                  className="bg-orange-50 border border-orange-200 rounded-lg p-4 cursor-pointer hover:bg-orange-100 transition-colors"
                  onClick={() => router.push("/orders")}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-orange-600 uppercase tracking-wide">{t("Рост отмен", "Bekor o'sdi")}</p>
                      <p className="text-2xl font-bold text-orange-700 mt-1">{signals.risingCancelSKUCount}</p>
                      <p className="text-xs text-orange-500 mt-0.5">{t("SKU с отменами >20%", "SKU bekor >20%")}</p>
                    </div>
                    <span className="text-2xl">⚠️</span>
                  </div>
                  {signals.risingCancelSKUs.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {signals.risingCancelSKUs.slice(0, 2).map((s) => (
                        <p key={s.sku} className="text-xs text-orange-600 font-mono truncate">
                          {s.sku} <span className="font-bold">{s.cancelRate}%</span>
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-orange-400 mt-2">→ {t("Перейти к заказам", "Buyurtmalarga o'tish")}</p>
                </div>
              )}

              {/* Avg check declining */}
              {signals.avgCheckTrend === "down" && (
                <div
                  className="bg-amber-50 border border-amber-200 rounded-lg p-4 cursor-pointer hover:bg-amber-100 transition-colors"
                  onClick={() => router.push("/orders")}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">{t("Средний чек падает", "O'rtacha chek tushdi")}</p>
                      <p className="text-2xl font-bold text-amber-700 mt-1">{formatCurrency(kpi.avgCheck)} ₽</p>
                      <p className="text-xs text-amber-500 mt-0.5">
                        {t(`Было: ${formatCurrency(kpiPrev.avgCheck)} ₽`, `Oldingi: ${formatCurrency(kpiPrev.avgCheck)} ₽`)}
                      </p>
                    </div>
                    <span className="text-2xl">💰</span>
                  </div>
                  <p className="text-xs text-amber-400 mt-2">→ {t("Перейти к заказам", "Buyurtmalarga o'tish")}</p>
                </div>
              )}

              {/* Trend direction declining */}
              {trendDir === "down" && (
                <div
                  className="bg-red-50 border border-red-200 rounded-lg p-4 cursor-pointer hover:bg-red-100 transition-colors"
                  onClick={() => router.push("/incidents")}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-red-600 uppercase tracking-wide">{t("Тренд снижается", "Trend pasaymoqda")}</p>
                      <p className="text-2xl font-bold text-red-700 mt-1">↓</p>
                      <p className="text-xs text-red-500 mt-0.5">{t("2я половина периода слабее", "2-yarmi kuchsizroq")}</p>
                    </div>
                    <span className="text-2xl">📊</span>
                  </div>
                  <p className="text-xs text-red-400 mt-2">→ {t("Открыть инциденты", "Intsidentlarga o'tish")}</p>
                </div>
              )}

              {/* Bottom SKU count */}
              {signals.bottomSKUCount > 0 && (
                <div
                  className="bg-gray-50 border border-gray-200 rounded-lg p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => router.push("/products")}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">{t("Аутсайдеры", "Pastki SKUlar")}</p>
                      <p className="text-2xl font-bold text-gray-700 mt-1">{signals.bottomSKUCount}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{t("SKU с низкой выручкой", "Kam tushum SKUlar")}</p>
                    </div>
                    <span className="text-2xl">🔻</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">→ {t("Перейти к товарам", "Mahsulotlarga o'tish")}</p>
                </div>
              )}
            </div>
          )}

          {/* Trend Chart */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle>{t("Динамика заказов", "Buyurtmalar dinamikasi")}</CardTitle>
                  <TrendArrow direction={trendDir} />
                  {trendDir === "down" && (
                    <span className="text-xs bg-red-100 text-red-600 border border-red-200 rounded-full px-2 py-0.5 font-medium">
                      {t("Тренд снижается", "Trend pasaymoqda")}
                    </span>
                  )}
                  {trendDir === "up" && (
                    <span className="text-xs bg-green-100 text-green-600 border border-green-200 rounded-full px-2 py-0.5 font-medium">
                      {t("Тренд растёт", "Trend o'smoqda")}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardBody>
              {chartData.length > 0 ? (
                <RevenueChart data={chartData} lang={lang} metric="orders" periodLabels={periodLabels || undefined} />
              ) : (
                <div className="text-center py-12 text-text-muted">
                  {t("Нет данных за выбранный период", "Tanlangan davr uchun ma'lumot yo'q")}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Top + Bottom SKUs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Top SKUs */}
            <Card>
              <CardHeader>
                <CardTitle>🏆 {t("Топ товаров", "Top mahsulotlar")}</CardTitle>
              </CardHeader>
              <CardBody>
                {topProducts.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>{t("Кол-во", "Soni")}</TableHead>
                        <TableHead>{t("Выручка", "Tushum")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topProducts.map((p, i) => (
                        <TableRow
                          key={`${p.sku}-${p.marketplace}`}
                          className="cursor-pointer hover:bg-background"
                          onClick={() => router.push("/products")}
                        >
                          <TableCell className="font-bold text-primary">{i + 1}</TableCell>
                          <TableCell>
                            <p className="text-sm font-mono truncate max-w-[180px]">{p.sku}</p>
                            <span className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${p.marketplace === "Ozon" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                              {p.marketplace}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">{p.quantity}</TableCell>
                          <TableCell className="font-semibold text-success">{formatCurrency(p.revenue)} ₽</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-text-muted">{t("Нет данных", "Ma'lumot yo'q")}</div>
                )}
              </CardBody>
            </Card>

            {/* Bottom SKUs */}
            <Card>
              <CardHeader>
                <CardTitle>🔻 {t("Аутсайдеры", "Pastki mahsulotlar")}</CardTitle>
                <CardSubtitle>{t("Наименьшая выручка за период", "Davrda eng kam tushum")}</CardSubtitle>
              </CardHeader>
              <CardBody>
                {bottomProducts.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>{t("Кол-во", "Soni")}</TableHead>
                        <TableHead>{t("Выручка", "Tushum")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bottomProducts.map((p, i) => (
                        <TableRow
                          key={`${p.sku}-${p.marketplace}`}
                          className="cursor-pointer hover:bg-background"
                          onClick={() => router.push("/products")}
                        >
                          <TableCell className="font-bold text-text-muted">{i + 1}</TableCell>
                          <TableCell>
                            <p className="text-sm font-mono truncate max-w-[180px]">{p.sku}</p>
                            <span className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${p.marketplace === "Ozon" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                              {p.marketplace}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-text-muted">{p.quantity}</TableCell>
                          <TableCell className="font-semibold text-danger">{formatCurrency(p.revenue)} ₽</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-text-muted">
                    {t("Недостаточно данных для сравнения", "Taqqoslash uchun ma'lumot yetarli emas")}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Declining SKUs detail — action bridge to products */}
          {signals && signals.decliningRevenueSKUs.length > 0 && (
            <Card className="mb-6 border-red-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-red-700">📉 {t("SKU с падением выручки", "Tushum pasaygan SKUlar")}</CardTitle>
                    <CardSubtitle>{t("Сравнение с предыдущим периодом", "Oldingi davr bilan taqqoslash")}</CardSubtitle>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => router.push("/products")}>
                    {t("Все товары →", "Barcha mahsulotlar →")}
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>{t("Текущий период", "Joriy davr")}</TableHead>
                      <TableHead>{t("Предыдущий", "Oldingi")}</TableHead>
                      <TableHead>{t("Падение", "Pasayish")}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signals.decliningRevenueSKUs.map((s) => (
                      <TableRow key={s.sku} className="cursor-pointer hover:bg-background" onClick={() => router.push("/products")}>
                        <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(s.currentRevenue)} ₽</TableCell>
                        <TableCell className="text-text-muted">{formatCurrency(s.prevRevenue)} ₽</TableCell>
                        <TableCell><span className="text-danger font-bold">-{s.dropPct}%</span></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <button onClick={(e) => { e.stopPropagation(); router.push("/tasks"); }} className="text-xs text-primary hover:underline">{t("Задача", "Vazifa")}</button>
                            <span className="text-text-muted">·</span>
                            <button onClick={(e) => { e.stopPropagation(); router.push("/incidents"); }} className="text-xs text-danger hover:underline">{t("Инцидент", "Insidnt")}</button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardBody>
            </Card>
          )}

          {/* Stockout forecast */}
          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t("Прогноз продаж и риски дефицита", "Sotuv prognozi va yetishmovchilik xavfi")}</CardTitle>
                  <CardSubtitle>{t("Анализ остатков на основе реальных данных", "Haqiqiy ma'lumotlarga asoslangan qoldiq tahlili")}</CardSubtitle>
                </div>
                <Button variant={showForecast ? "primary" : "ghost"} size="sm" onClick={() => setShowForecast(!showForecast)}>
                  {showForecast ? t("Скрыть", "Yashirish") : t("Показать", "Ko'rsatish")}
                </Button>
              </div>
            </CardHeader>
            {showForecast && (
              <CardBody>
                {analyticsResults.length > 0 ? (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>{t("Прогноз", "Prognoz")}</TableHead>
                          <TableHead>{t("Остаток", "Qoldiq")}</TableHead>
                          <TableHead>{t("Дней", "Kunlar")}</TableHead>
                          <TableHead>{t("Риск", "Xavf")}</TableHead>
                          <TableHead>{t("Потери", "Yo'qotish")}</TableHead>
                          <TableHead>{t("Заказать", "Buyurtma")}</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analyticsResults.map((result) => (
                          <TableRow key={result.sku} className="cursor-pointer hover:bg-background" onClick={() => router.push("/products")}>
                            <TableCell className="font-mono text-xs">{result.sku}</TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{result.dailyForecast.toFixed(1)} {t("шт/день", "dona/kun")}</div>
                            </TableCell>
                            <TableCell><div className="font-semibold">{result.availableUnits}</div></TableCell>
                            <TableCell>
                              <span className={`font-semibold ${result.stockoutInDays !== null && result.stockoutInDays < 7 ? "text-danger" : result.stockoutInDays !== null && result.stockoutInDays < 14 ? "text-warning" : "text-success"}`}>
                                {result.stockoutInDays !== null ? result.stockoutInDays : "∞"}
                              </span>
                            </TableCell>
                            <TableCell><span className={getRiskBadgeClass(result.riskLevel)}>{result.riskLevel}</span></TableCell>
                            <TableCell>
                              {result.possibleLossMoney > 0 ? (
                                <div className="text-sm font-semibold text-danger">₽{formatCurrency(result.possibleLossMoney)}</div>
                              ) : <span className="text-xs text-text-muted">—</span>}
                            </TableCell>
                            <TableCell>
                              {result.recommendedReorderQty > 0 ? (
                                <div className="text-sm font-semibold text-primary">{result.recommendedReorderQty}</div>
                              ) : <span className="text-xs text-success">OK</span>}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => router.push("/tasks")} className="text-xs text-primary hover:underline">{t("Задача", "Vazifa")}</button>
                                <span className="text-text-muted">·</span>
                                <button onClick={() => router.push("/incidents")} className="text-xs text-danger hover:underline">{t("Инцидент", "Insidnt")}</button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <div className="mt-6 p-4 bg-background rounded-lg grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-text-muted mb-1">{t("Критические риски", "Kritik xavflar")}</p>
                        <p className="text-2xl font-bold text-danger">{analyticsResults.filter(r => r.riskLevel === "CRITICAL").length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted mb-1">{t("Высокие риски", "Yuqori xavflar")}</p>
                        <p className="text-2xl font-bold text-warning">{analyticsResults.filter(r => r.riskLevel === "HIGH").length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted mb-1">{t("Потенц. потери", "Potensial yo'qotish")}</p>
                        <p className="text-2xl font-bold text-danger">₽{formatCurrency(analyticsResults.reduce((s, r) => s + r.possibleLossMoney, 0))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted mb-1">{t("Требуют заказа", "Buyurtma kerak")}</p>
                        <p className="text-2xl font-bold text-primary">{analyticsResults.filter(r => r.recommendedReorderQty > 0).length}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-text-muted">{t("Нет данных для анализа", "Tahlil uchun ma'lumot yo'q")}</div>
                )}
              </CardBody>
            )}
          </Card>
        </>
      )}
    </Layout>
  );
}
