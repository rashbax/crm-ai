"use client";

import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import { RevenueChart } from "@/components/RevenueChart";
import { addDaysToIsoDay, formatIsoDayForLocale, getBusinessIsoDay } from "@/lib/date";
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
  MetricChange,
  MetricRow,
} from "@/components/ui";

// Helper function for risk level badge styling
const getRiskBadgeClass = (risk: string) => {
  switch (risk) {
    case 'CRITICAL':
    case 'HIGH':
      return 'bg-danger text-white px-2 py-1 rounded text-xs font-semibold';
    case 'MED':
      return 'bg-warning text-white px-2 py-1 rounded text-xs font-semibold';
    case 'LOW':
      return 'bg-success text-white px-2 py-1 rounded text-xs font-semibold';
    default:
      return 'bg-gray-400 text-white px-2 py-1 rounded text-xs font-semibold';
  }
};

interface ChartDataPoint {
  date: string;
  revenue: number;
  orders: number;
}

interface TopProduct {
  name: string;
  sku: string;
  revenue: number;
  quantity: number;
  avgPrice: number;
  marketplace: string;
}

interface MarketplaceStats {
  name: string;
  revenue: number;
  orders: number;
  avgCheck: number;
  share: number;
}

interface KPI {
  totalRevenue: number;
  totalOrders: number;
  avgCheck: number;
  cancelledOrders: number;
  cancelRate: number;
}

interface KPIPrev {
  totalRevenue: number;
  totalOrders: number;
  avgCheck: number;
}

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function AnalyticsPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [loading, setLoading] = useState(true);

  // Data from API
  const [kpi, setKpi] = useState<KPI>({ totalRevenue: 0, totalOrders: 0, avgCheck: 0, cancelledOrders: 0, cancelRate: 0 });
  const [kpiPrev, setKpiPrev] = useState<KPIPrev>({ totalRevenue: 0, totalOrders: 0, avgCheck: 0 });
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [marketplaceStats, setMarketplaceStats] = useState<MarketplaceStats[]>([]);
  const [analyticsResults, setAnalyticsResults] = useState<AnalyticsResult[]>([]);
  const [showForecast, setShowForecast] = useState(true);

  // Date filter state
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const fetchAnalytics = useCallback(async (days: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      setKpi(data.kpi);
      setKpiPrev(data.kpiPrev);
      setTopProducts(data.topProducts || []);
      setMarketplaceStats(data.marketplaceStats || []);
      setAnalyticsResults(data.analyticsResults || []);

      // Format chart dates for display
      const formatted: ChartDataPoint[] = (data.chartData || []).map((d: any) => ({
        date: formatIsoDayForLocale(d.date, 'ru-RU', { day: 'numeric', month: 'short' }),
        revenue: d.revenue,
        orders: d.orders,
      }));
      setChartData(formatted);
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLang(storage.getLang());
    const todayKey = getBusinessIsoDay();
    setEndDate(todayKey);
    setStartDate(addDaysToIsoDay(todayKey, -30));
    fetchAnalytics(30);
  }, [fetchAnalytics]);

  const updatePeriod = (newPeriod: "7d" | "30d" | "90d") => {
    const days = newPeriod === "7d" ? 7 : newPeriod === "30d" ? 30 : 90;
    setPeriod(newPeriod);
    const todayKey = getBusinessIsoDay();
    setEndDate(todayKey);
    setStartDate(addDaysToIsoDay(todayKey, -days));
    fetchAnalytics(days);
  };

  const handleApplyDateFilter = () => {
    if (!startDate || !endDate) {
      alert(lang === "ru" ? "Выберите даты" : "Sanalarni tanlang");
      return;
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      alert(lang === "ru" ? "Начальная дата не может быть позже конечной" : "Boshlanish sanasi tugash sanasidan katta bo'lmasligi kerak");
      return;
    }
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const customDays = Math.max(1, Math.min(daysDiff, 365));
    fetchAnalytics(customDays);
  };

  const handleResetDateFilter = () => {
    updatePeriod("30d");
  };

  // Calculate percentage changes
  const revenueChange = kpiPrev.totalRevenue > 0
    ? parseFloat((((kpi.totalRevenue - kpiPrev.totalRevenue) / kpiPrev.totalRevenue) * 100).toFixed(1))
    : 0;
  const ordersChange = kpiPrev.totalOrders > 0
    ? parseFloat((((kpi.totalOrders - kpiPrev.totalOrders) / kpiPrev.totalOrders) * 100).toFixed(1))
    : 0;
  const avgCheckChange = kpiPrev.avgCheck > 0
    ? parseFloat((((kpi.avgCheck - kpiPrev.avgCheck) / kpiPrev.avgCheck) * 100).toFixed(1))
    : 0;

  return (
    <Layout>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {getTranslation(lang, "analytics_title")}
          </h1>
          <p className="page-subtitle">
            {getTranslation(lang, "analytics_subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={period === "7d" ? "primary" : "ghost"}
            size="sm"
            onClick={() => updatePeriod("7d")}
          >
            7 {lang === "ru" ? "дней" : "kun"}
          </Button>
          <Button
            variant={period === "30d" ? "primary" : "ghost"}
            size="sm"
            onClick={() => updatePeriod("30d")}
          >
            30 {lang === "ru" ? "дней" : "kun"}
          </Button>
          <Button
            variant={period === "90d" ? "primary" : "ghost"}
            size="sm"
            onClick={() => updatePeriod("90d")}
          >
            90 {lang === "ru" ? "дней" : "kun"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-muted">
          {lang === "ru" ? "Загрузка данных..." : "Ma'lumotlar yuklanmoqda..."}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardBody>
                <MetricLabel>{lang === "ru" ? "Выручка" : "Tushumlar"}</MetricLabel>
                <MetricMain>{formatCurrency(kpi.totalRevenue)} ₽</MetricMain>
                <MetricRow className="mt-2">
                  <MetricChange value={`${revenueChange > 0 ? '+' : ''}${revenueChange}%`} positive={revenueChange > 0} />
                  <MetricLabel className="text-xs">
                    {lang === "ru" ? "к пред. периоду" : "avvalgi davrga nisbatan"}
                  </MetricLabel>
                </MetricRow>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <MetricLabel>{lang === "ru" ? "Заказы" : "Buyurtmalar"}</MetricLabel>
                <MetricMain>{kpi.totalOrders.toLocaleString()}</MetricMain>
                <MetricRow className="mt-2">
                  <MetricChange value={`${ordersChange > 0 ? '+' : ''}${ordersChange}%`} positive={ordersChange > 0} />
                  <MetricLabel className="text-xs">
                    {lang === "ru" ? "к пред. периоду" : "avvalgi davrga nisbatan"}
                  </MetricLabel>
                </MetricRow>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <MetricLabel>{lang === "ru" ? "Средний чек" : "O'rtacha chek"}</MetricLabel>
                <MetricMain>{formatCurrency(kpi.avgCheck)} ₽</MetricMain>
                <MetricRow className="mt-2">
                  <MetricChange value={`${avgCheckChange > 0 ? '+' : ''}${avgCheckChange}%`} positive={avgCheckChange > 0} />
                  <MetricLabel className="text-xs">
                    {lang === "ru" ? "к пред. периоду" : "avvalgi davrga nisbatan"}
                  </MetricLabel>
                </MetricRow>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <MetricLabel>{lang === "ru" ? "Отмены / Возвраты" : "Bekor qilish / Qaytarish"}</MetricLabel>
                <MetricMain className={kpi.cancelRate > 10 ? "text-danger" : kpi.cancelRate > 5 ? "text-warning" : "text-success"}>
                  {kpi.cancelRate}%
                </MetricMain>
                <MetricRow className="mt-2">
                  <MetricLabel className="text-xs text-text-muted">
                    {kpi.cancelledOrders} {lang === "ru" ? `из ${kpi.totalOrders + kpi.cancelledOrders}` : `${kpi.totalOrders + kpi.cancelledOrders} tadan`}
                  </MetricLabel>
                </MetricRow>
              </CardBody>
            </Card>
          </div>

          {/* Revenue Trend Chart */}
          <Card className="mb-6">
            <CardHeader>
              <div>
                <CardTitle>{lang === "ru" ? "Количество продаж" : "Sotuvlar soni"}</CardTitle>
                <CardSubtitle>
                  {lang === "ru" ? "Проданные единицы по дням" : "Kunlik sotilgan birliklar"}
                </CardSubtitle>
              </div>
            </CardHeader>
            <CardBody>
              {/* Period Filter */}
              <div className="mb-6 p-4 bg-background rounded-lg border border-border">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-medium text-text-muted mb-1">
                      {lang === "ru" ? "Начало периода" : "Davr boshlanishi"}
                    </label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>

                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-medium text-text-muted mb-1">
                      {lang === "ru" ? "Конец периода" : "Davr tugashi"}
                    </label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <Button
                      variant="primary"
                      onClick={handleApplyDateFilter}
                    >
                      {lang === "ru" ? "Применить" : "Qo'llash"}
                    </Button>
                  </div>

                  <div>
                    <Button
                      variant="ghost"
                      onClick={handleResetDateFilter}
                    >
                      {getTranslation(lang, 'products_filter_reset')}
                    </Button>
                  </div>
                </div>

                {/* Quick Period Buttons */}
                <div className="flex flex-wrap gap-2 mt-4">
                  <span className="text-sm text-text-muted mr-2">
                    {lang === "ru" ? "Быстрый выбор:" : "Tez tanlash:"}
                  </span>
                  <Button variant={period === "7d" ? "primary" : "ghost"} size="sm" onClick={() => updatePeriod("7d")}>
                    {lang === "ru" ? "7 дней" : "7 kun"}
                  </Button>
                  <Button variant={period === "30d" ? "primary" : "ghost"} size="sm" onClick={() => updatePeriod("30d")}>
                    {lang === "ru" ? "30 дней" : "30 kun"}
                  </Button>
                  <Button variant={period === "90d" ? "primary" : "ghost"} size="sm" onClick={() => updatePeriod("90d")}>
                    {lang === "ru" ? "90 дней" : "90 kun"}
                  </Button>
                </div>
              </div>

              {/* Chart */}
              {chartData.length > 0 ? (
                <RevenueChart data={chartData} lang={lang} metric="orders" />
              ) : (
                <div className="text-center py-12 text-text-muted">
                  {lang === "ru" ? "Нет данных за выбранный период" : "Tanlangan davr uchun ma'lumot yo'q"}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Marketplace Comparison & Top Products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Marketplace Stats */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {lang === "ru" ? "Сравнение площадок" : "Platformalar taqqoslash"}
                </CardTitle>
              </CardHeader>
              <CardBody>
                {marketplaceStats.length > 0 ? (
                  <div className="space-y-4">
                    {marketplaceStats.map((marketplace) => (
                      <div key={marketplace.name} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-text-main">{marketplace.name}</p>
                            <p className="text-xs text-text-muted">
                              {marketplace.orders} {lang === "ru" ? "заказов" : "buyurtma"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-text-main">
                              {formatCurrency(marketplace.revenue)} ₽
                            </p>
                            <p className="text-xs text-text-muted">
                              {marketplace.share}% {lang === "ru" ? "доли" : "ulushi"}
                            </p>
                          </div>
                        </div>
                        <div className="w-full bg-background rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              marketplace.name === "Wildberries" ? "bg-success" : "bg-primary"
                            }`}
                            style={{ width: `${marketplace.share}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-text-muted">
                          <span>
                            {lang === "ru" ? "Ср. чек:" : "O'rtacha:"} {formatCurrency(marketplace.avgCheck)} ₽
                          </span>
                          <span>
                            {lang === "ru" ? "Доход:" : "Daromad:"} {formatCurrency(marketplace.revenue)} ₽
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-text-muted">
                    {lang === "ru" ? "Нет данных" : "Ma'lumot yo'q"}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Top Products */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {lang === "ru" ? "Топ товаров" : "Top mahsulotlar"}
                </CardTitle>
              </CardHeader>
              <CardBody>
                {topProducts.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>{lang === "ru" ? "Товар" : "Mahsulot"}</TableHead>
                        <TableHead>{lang === "ru" ? "Кол-во" : "Soni"}</TableHead>
                        <TableHead>{lang === "ru" ? "Выручка" : "Tushum"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topProducts.map((product, index) => (
                        <TableRow key={`${product.sku}-${product.marketplace}`}>
                          <TableCell className="font-bold text-primary">{index + 1}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium truncate max-w-[200px]">
                                {product.name}
                              </p>
                              <span
                                className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  product.marketplace === "Ozon" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                                }`}
                              >
                                {product.marketplace}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{product.quantity}</TableCell>
                          <TableCell className="font-semibold text-success">
                            {formatCurrency(product.revenue)} ₽
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-text-muted">
                    {lang === "ru" ? "Нет данных" : "Ma'lumot yo'q"}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Stockout & Forecast Analysis - Analytics Engine */}
          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    {lang === "ru" ? "Прогноз продаж и риски дефицита" : "Sotuv prognozi va yetishmovchilik xavfi"}
                  </CardTitle>
                  <CardSubtitle>
                    {lang === "ru"
                      ? "Анализ остатков на основе реальных данных продаж"
                      : "Haqiqiy savdo ma'lumotlariga asoslangan qoldiq tahlili"
                    }
                  </CardSubtitle>
                </div>
                <Button
                  variant={showForecast ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => setShowForecast(!showForecast)}
                >
                  {showForecast
                    ? (lang === "ru" ? "Скрыть" : "Yashirish")
                    : (lang === "ru" ? "Показать" : "Ko'rsatish")
                  }
                </Button>
              </div>
            </CardHeader>
            {showForecast && (
              <CardBody>
                {analyticsResults.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{lang === "ru" ? "SKU" : "SKU"}</TableHead>
                        <TableHead>{lang === "ru" ? "Прогноз" : "Prognoz"}</TableHead>
                        <TableHead>{lang === "ru" ? "Остаток" : "Qoldiq"}</TableHead>
                        <TableHead>{lang === "ru" ? "Дней" : "Kunlar"}</TableHead>
                        <TableHead>{lang === "ru" ? "Риск" : "Xavf"}</TableHead>
                        <TableHead>{lang === "ru" ? "Потери" : "Yo'qotish"}</TableHead>
                        <TableHead>{lang === "ru" ? "Заказать" : "Buyurtma"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analyticsResults.map((result) => (
                        <TableRow key={result.sku}>
                          <TableCell className="font-mono text-xs">{result.sku}</TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">
                              {result.dailyForecast.toFixed(1)} {lang === "ru" ? "шт/день" : "dona/kun"}
                            </div>
                            <div className="text-xs text-text-muted">
                              {result.forecastSeries.length > 0 && (
                                <>
                                  {lang === "ru" ? "След 7 дн:" : "Keyingi 7 kun:"} {result.forecastSeries.slice(0, 7).reduce((sum: number, f: any) => sum + f.units, 0).toFixed(0)} {lang === "ru" ? "шт" : "dona"}
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold">{result.availableUnits}</div>
                            <div className="text-xs text-text-muted">
                              {lang === "ru" ? "дост." : "mavjud"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`font-semibold ${
                              result.stockoutInDays !== null && result.stockoutInDays < 7 ? "text-danger" :
                              result.stockoutInDays !== null && result.stockoutInDays < 14 ? "text-warning" :
                              "text-success"
                            }`}>
                              {result.stockoutInDays !== null ? result.stockoutInDays : "∞"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={getRiskBadgeClass(result.riskLevel)}>
                              {result.riskLevel}
                            </span>
                          </TableCell>
                          <TableCell>
                            {result.possibleLossMoney > 0 ? (
                              <div>
                                <div className="text-sm font-semibold text-danger">
                                  ₽{formatCurrency(result.possibleLossMoney)}
                                </div>
                                <div className="text-xs text-text-muted">
                                  {result.possibleLostUnits.toFixed(0)} {lang === "ru" ? "шт" : "dona"}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-text-muted">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {result.recommendedReorderQty > 0 ? (
                              <div>
                                <div className="text-sm font-semibold text-primary">
                                  {result.recommendedReorderQty}
                                </div>
                                <div className="text-xs text-text-muted">
                                  ROP: {result.reorderPoint.toFixed(0)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-success">OK</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-text-muted">
                    {lang === "ru"
                      ? "Нет данных для анализа"
                      : "Tahlil uchun ma'lumot yo'q"
                    }
                  </div>
                )}

                {/* Summary Stats */}
                {analyticsResults.length > 0 && (
                  <div className="mt-6 p-4 bg-background rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-text-muted mb-1">
                          {lang === "ru" ? "Критические риски" : "Kritik xavflar"}
                        </p>
                        <p className="text-2xl font-bold text-danger">
                          {analyticsResults.filter(r => r.riskLevel === "CRITICAL").length}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted mb-1">
                          {lang === "ru" ? "Высокие риски" : "Yuqori xavflar"}
                        </p>
                        <p className="text-2xl font-bold text-warning">
                          {analyticsResults.filter(r => r.riskLevel === "HIGH").length}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted mb-1">
                          {lang === "ru" ? "Потенциальные потери" : "Potensial yo'qotishlar"}
                        </p>
                        <p className="text-2xl font-bold text-danger">
                          ₽{formatCurrency(analyticsResults.reduce((sum, r) => sum + r.possibleLossMoney, 0))}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted mb-1">
                          {lang === "ru" ? "Требуют заказа" : "Buyurtma kerak"}
                        </p>
                        <p className="text-2xl font-bold text-primary">
                          {analyticsResults.filter(r => r.recommendedReorderQty > 0).length}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardBody>
            )}
          </Card>

          {/* Additional Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <Card>
              <CardBody>
                <MetricLabel>{lang === "ru" ? "Всего SKU" : "Jami SKU"}</MetricLabel>
                <MetricMain className="text-primary">{topProducts.length}</MetricMain>
                <p className="text-xs text-text-muted mt-1">
                  {lang === "ru" ? "уникальных товаров" : "noyob mahsulotlar"}
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <MetricLabel>{lang === "ru" ? "Площадки" : "Platformalar"}</MetricLabel>
                <MetricMain className="text-primary">{marketplaceStats.length}</MetricMain>
                <p className="text-xs text-text-muted mt-1">
                  {marketplaceStats.map(m => m.name).join(", ") || (lang === "ru" ? "нет подключений" : "ulanish yo'q")}
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <MetricLabel>{lang === "ru" ? "Отмены / Возвраты" : "Bekor / Qaytarish"}</MetricLabel>
                <MetricMain className={kpi.cancelRate > 10 ? "text-danger" : kpi.cancelRate > 5 ? "text-warning" : "text-success"}>
                  {kpi.cancelledOrders}
                </MetricMain>
                <p className="text-xs text-text-muted mt-1">
                  {lang === "ru" ? `${kpi.cancelRate}% от всех заказов` : `Barcha buyurtmalarning ${kpi.cancelRate}%`}
                </p>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </Layout>
  );
}
