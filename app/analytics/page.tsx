"use client";

import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { RevenueChart } from "@/components/RevenueChart";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language } from "@/types";
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
  Badge,
  MetricMain,
  MetricLabel,
  MetricChange,
  MetricRow,
  Input,
  StatusPill,
} from "@/components/ui";

// Analytics Engine Integration
import { runAnalytics, getDefaultConfig } from "@/src/analytics";
import type { OrderEvent, StockState, AdsDaily, AnalyticsResult } from "@/src/analytics";

// Helper function for risk level badge styling
const getRiskBadgeClass = (risk: string) => {
  switch (risk) {
    case 'CRITICAL':
      return 'bg-danger text-white px-2 py-1 rounded text-xs font-semibold';
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
}

interface MarketplaceStats {
  name: string;
  revenue: number;
  orders: number;
  avgCheck: number;
  share: number;
}

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Generate chart data
const generateChartData = (days: number): ChartDataPoint[] => {
  const data: ChartDataPoint[] = [];
  const avgDaily = 44600;
  
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - i - 1));
    
    const variation = 0.7 + Math.random() * 0.6;
    const revenue = Math.floor(avgDaily * variation);
    
    data.push({
      date: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      revenue,
      orders: Math.floor(revenue / 1100),
    });
  }
  
  return data;
};

// Generate top products
const generateTopProducts = (): TopProduct[] => {
  const products = [
    { name: "Футболка oversize Rubi&Jons", sku: "RJ-001-BLK-M" },
    { name: "Толстовка с капюшоном Rubi&Jons", sku: "RJ-002-WHT-L" },
    { name: "Спортивные брюки Rubi&Jons", sku: "RJ-003-GRY-M" },
    { name: "Рюкзак 25L Rubi&Jons", sku: "RJ-004-BLK-OS" },
    { name: "Кроссовки беговые Rubi&Jons", sku: "RJ-005-WHT-42" },
    { name: "Бейсболка Rubi&Jons", sku: "RJ-006-BLK-OS" },
    { name: "Носки спортивные Rubi&Jons", sku: "RJ-007-WHT-M" },
    { name: "Шорты летние Rubi&Jons", sku: "RJ-008-BLU-L" },
  ];

  return products.map((p, i) => {
    const quantity = Math.floor(Math.random() * 150) + 50;
    const avgPrice = Math.floor(Math.random() * 2000) + 800;
    return {
      ...p,
      revenue: quantity * avgPrice,
      quantity,
      avgPrice,
    };
  }).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
};

// Generate marketplace stats
const generateMarketplaceStats = (): MarketplaceStats[] => {
  const ozonRevenue = 620000;
  const wbRevenue = 627840;
  const total = ozonRevenue + wbRevenue;

  return [
    {
      name: "Wildberries",
      revenue: wbRevenue,
      orders: 570,
      avgCheck: Math.floor(wbRevenue / 570),
      share: (wbRevenue / total) * 100,
    },
    {
      name: "Ozon",
      revenue: ozonRevenue,
      orders: 513,
      avgCheck: Math.floor(ozonRevenue / 513),
      share: (ozonRevenue / total) * 100,
    },
  ];
};

// Generate mock orders for analytics engine
const generateMockOrders = (): OrderEvent[] => {
  const orders: OrderEvent[] = [];
  const skus = ['RJ-001-BLK-M', 'RJ-002-WHT-L', 'RJ-003-GRY-M', 'RJ-004-BLK-OS', 'RJ-005-WHT-42'];
  const today = new Date();
  
  // Generate 28 days of order history
  for (let day = 0; day < 28; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() - (27 - day));
    const dateStr = date.toISOString().split('T')[0];
    
    skus.forEach(sku => {
      // Varying sales patterns
      const baseQty = sku === 'RJ-001-BLK-M' ? 30 : 
                      sku === 'RJ-002-WHT-L' ? 25 :
                      sku === 'RJ-003-GRY-M' ? 15 : 
                      sku === 'RJ-004-BLK-OS' ? 20 : 10;
      
      const variance = 0.7 + Math.random() * 0.6;
      const qty = Math.floor(baseQty * variance);
      const price = sku.includes('001') ? 1290 : 
                   sku.includes('002') ? 2490 :
                   sku.includes('003') ? 1890 :
                   sku.includes('004') ? 3200 : 2890;
      
      orders.push({
        date: dateStr,
        sku,
        qty,
        revenue: qty * price,
        price,
      });
    });
  }
  
  return orders;
};

// Generate mock stock states
const generateMockStocks = (): StockState[] => {
  return [
    { sku: 'RJ-001-BLK-M', onHand: 150, inbound: 0, updatedAt: new Date().toISOString() },
    { sku: 'RJ-002-WHT-L', onHand: 350, inbound: 100, updatedAt: new Date().toISOString() },
    { sku: 'RJ-003-GRY-M', onHand: 750, inbound: 0, updatedAt: new Date().toISOString() },
    { sku: 'RJ-004-BLK-OS', onHand: 1200, inbound: 200, updatedAt: new Date().toISOString() },
    { sku: 'RJ-005-WHT-42', onHand: 280, inbound: 0, updatedAt: new Date().toISOString() },
  ];
};

// Generate mock ads data
const generateMockAds = (): AdsDaily[] => {
  const ads: AdsDaily[] = [];
  const skusWithAds = ['RJ-001-BLK-M', 'RJ-002-WHT-L', 'RJ-004-BLK-OS'];
  const today = new Date();
  
  // Generate last 14 days of ads
  for (let day = 0; day < 14; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() - (13 - day));
    const dateStr = date.toISOString().split('T')[0];
    
    skusWithAds.forEach(sku => {
      const spend = sku === 'RJ-001-BLK-M' ? 500 :
                    sku === 'RJ-002-WHT-L' ? 600 : 450;
      
      ads.push({
        date: dateStr,
        sku,
        spend,
        clicks: Math.floor(spend * 2.5),
        ordersFromAds: Math.floor(spend / 50),
      });
    });
  }
  
  return ads;
};

export default function AnalyticsPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [topProducts] = useState<TopProduct[]>(generateTopProducts());
  const [marketplaceStats] = useState<MarketplaceStats[]>(generateMarketplaceStats());
  
  // Date filter state
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  // Analytics Engine State
  const [analyticsResults, setAnalyticsResults] = useState<AnalyticsResult[]>([]);
  const [showForecast, setShowForecast] = useState(true);

  useEffect(() => {
    setLang(storage.getLang());
    updateChartData("30d");
    
    // Set default date range (last 30 days)
    const today = new Date();
    const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(last30Days.toISOString().split('T')[0]);
    
    // Run analytics engine
    runAnalyticsEngine();
  }, []);
  
  // Generate mock data and run analytics
  const runAnalyticsEngine = () => {
    // Mock order events (last 28 days)
    const orders: OrderEvent[] = generateMockOrders();
    
    // Mock stock states
    const stocks: StockState[] = generateMockStocks();
    
    // Mock ads data
    const ads: AdsDaily[] = generateMockAds();
    
    // Run analytics
    const config = getDefaultConfig();
    config.moneyMetric = "revenue";
    config.useDayOfWeekSeasonality = true;
    
    const results = runAnalytics(orders, stocks, ads, config);
    setAnalyticsResults(results);
  };

  const updateChartData = (newPeriod: "7d" | "30d" | "90d") => {
    const days = newPeriod === "7d" ? 7 : newPeriod === "30d" ? 30 : 90;
    setChartData(generateChartData(days));
    setPeriod(newPeriod);
    
    // Update date inputs to match period
    const today = new Date();
    const startDay = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(startDay.toISOString().split('T')[0]);
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
    
    setChartData(generateChartData(customDays));
    setPeriod("30d"); // Reset period selector
  };

  const handleResetDateFilter = () => {
    updateChartData("30d");
  };

  // Calculate KPIs
  const totalRevenue = 1247840;
  const totalOrders = 1083;
  const avgCheck = Math.floor(totalRevenue / totalOrders);
  const profitMargin = 42;
  
  // Comparison with previous period
  const revenueChange = -8.5;
  const ordersChange = +12.3;
  const avgCheckChange = -18.2;

  // Category breakdown
  const categoryData = [
    { name: lang === "ru" ? "Одежда" : "Kiyim", revenue: 687000, share: 55 },
    { name: lang === "ru" ? "Обувь" : "Poyabzal", revenue: 312000, share: 25 },
    { name: lang === "ru" ? "Аксессуары" : "Aksessuarlar", revenue: 187000, share: 15 },
    { name: lang === "ru" ? "Другое" : "Boshqa", revenue: 62000, share: 5 },
  ];

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
            onClick={() => updateChartData("7d")}
          >
            7 {lang === "ru" ? "дней" : "kun"}
          </Button>
          <Button 
            variant={period === "30d" ? "primary" : "ghost"} 
            size="sm"
            onClick={() => updateChartData("30d")}
          >
            30 {lang === "ru" ? "дней" : "kun"}
          </Button>
          <Button 
            variant={period === "90d" ? "primary" : "ghost"} 
            size="sm"
            onClick={() => updateChartData("90d")}
          >
            90 {lang === "ru" ? "дней" : "kun"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Выручка" : "Tushumlar"}</MetricLabel>
            <MetricMain>{formatCurrency(totalRevenue)} ₽</MetricMain>
            <MetricRow className="mt-2">
              <MetricChange value={`${revenueChange}%`} positive={revenueChange > 0} />
              <MetricLabel className="text-xs">
                {lang === "ru" ? "к пред. периоду" : "avvalgi davrga nisbatan"}
              </MetricLabel>
            </MetricRow>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Заказы" : "Buyurtmalar"}</MetricLabel>
            <MetricMain>{totalOrders.toLocaleString()}</MetricMain>
            <MetricRow className="mt-2">
              <MetricChange value={`+${ordersChange}%`} positive={true} />
              <MetricLabel className="text-xs">
                {lang === "ru" ? "рост заказов" : "buyurtmalar o'sishi"}
              </MetricLabel>
            </MetricRow>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Средний чек" : "O'rtacha chek"}</MetricLabel>
            <MetricMain>{formatCurrency(avgCheck)} ₽</MetricMain>
            <MetricRow className="mt-2">
              <MetricChange value={`${avgCheckChange}%`} positive={avgCheckChange > 0} />
              <MetricLabel className="text-xs">
                {lang === "ru" ? "снижение чека" : "chek kamayishi"}
              </MetricLabel>
            </MetricRow>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Рентабельность" : "Rentabellik"}</MetricLabel>
            <MetricMain className="text-success">{profitMargin}%</MetricMain>
            <MetricRow className="mt-2">
              <MetricLabel className="text-xs text-text-muted">
                {lang === "ru" ? "чистая маржа" : "sof marja"}
              </MetricLabel>
            </MetricRow>
          </CardBody>
        </Card>
      </div>

      {/* Revenue Trend Chart */}
      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>{lang === "ru" ? "Динамика продаж" : "Savdo dinamikasi"}</CardTitle>
            <CardSubtitle>
              {lang === "ru" ? "Фильтр по периоду и анализ трендов" : "Davr filtri va trend tahlili"}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateChartData("7d")}
              >
                {lang === "ru" ? "7 дней" : "7 kun"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateChartData("30d")}
              >
                {lang === "ru" ? "30 дней" : "30 kun"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateChartData("90d")}
              >
                {lang === "ru" ? "90 дней" : "90 kun"}
              </Button>
            </div>
          </div>

          {/* Chart */}
          <RevenueChart data={chartData} lang={lang} />
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
                        {marketplace.share.toFixed(1)}% {lang === "ru" ? "доли" : "ulushi"}
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
                  <TableRow key={product.sku}>
                    <TableCell className="font-bold text-primary">{index + 1}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium truncate max-w-[200px]">
                          {product.name}
                        </p>
                        <p className="text-xs text-text-muted font-mono">{product.sku}</p>
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
          </CardBody>
        </Card>
      </div>

      {/* Category Breakdown */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{lang === "ru" ? "Продажи по категориям" : "Kategoriyalar bo'yicha sotuv"}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {categoryData.map((category) => (
              <div key={category.name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-main">{category.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-text-muted">{category.share}%</span>
                    <span className="text-sm font-semibold text-text-main">
                      {formatCurrency(category.revenue)} ₽
                    </span>
                  </div>
                </div>
                <div className="w-full bg-background rounded-full h-3">
                  <div 
                    className="h-3 rounded-full bg-primary"
                    style={{ width: `${category.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Stockout & Forecast Analysis - Analytics Engine */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {lang === "ru" ? "📊 Прогноз продаж и риски дефицита" : "📊 Sotuv prognozi va yetishmovchilik xavfi"}
              </CardTitle>
              <CardSubtitle>
                {lang === "ru" 
                  ? "Анализ остатков на основе истории продаж за 28 дней"
                  : "28 kunlik savdo tarixiga asoslangan qoldiq tahlili"
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
                              {lang === "ru" ? "След 7 дн:" : "Keyingi 7 kun:"} {result.forecastSeries.slice(0, 7).reduce((sum, f) => sum + f.units, 0).toFixed(0)} {lang === "ru" ? "шт" : "dona"}
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
                          <span className="text-xs text-success">✓ OK</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-text-muted">
                {lang === "ru" 
                  ? "Загрузка данных аналитики..."
                  : "Analitika ma'lumotlari yuklanmoqda..."
                }
              </div>
            )}
            
            {/* Summary Stats */}
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
          </CardBody>
        )}
      </Card>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Конверсия" : "Konversiya"}</MetricLabel>
            <MetricMain className="text-primary">3.2%</MetricMain>
            <p className="text-xs text-text-muted mt-1">
              {lang === "ru" ? "Визиты → Заказы" : "Tashriflar → Buyurtmalar"}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Возвраты" : "Qaytarishlar"}</MetricLabel>
            <MetricMain className="text-warning">8.5%</MetricMain>
            <p className="text-xs text-text-muted mt-1">
              {lang === "ru" ? "92 из 1083 заказов" : "1083 tadan 92 ta"}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Повторные покупки" : "Takroriy xaridlar"}</MetricLabel>
            <MetricMain className="text-success">23%</MetricMain>
            <p className="text-xs text-text-muted mt-1">
              {lang === "ru" ? "249 клиентов вернулись" : "249 mijoz qaytdi"}
            </p>
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
