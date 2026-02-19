"use client";

import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { RevenueChart } from "@/components/RevenueChart";
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
  Badge,
  Input,
} from "@/components/ui";

// Mock data types
interface SalesData {
  revenue: number;
  revenueChange: number;
  orderCount: number;
  balance: number;
  accrued: number;
}

interface ChartDataPoint {
  date: string;
  revenue: number;
  orders: number;
}

interface Alert {
  id: string;
  type: "critical" | "warning" | "info";
  title: string;
  message: string;
  timestamp: string;
  icon: string;
  action?: string;
}

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Format number
const formatNumber = (num: number) => {
  return new Intl.NumberFormat('ru-RU').format(num);
};

// Calculate percentage change
const calculateChange = (current: number, previous: number): number => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

// Generate chart data
const generateChartData = (startDate: string, endDate: string, totalRevenue: number, totalOrders: number): ChartDataPoint[] => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  
  const step = Math.max(1, Math.floor(days / 60));
  const data: ChartDataPoint[] = [];
  
  const avgDailyRevenue = totalRevenue / days;
  const avgDailyOrders = totalOrders / days;
  
  for (let i = 0; i <= days; i += step) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    
    const variation = 0.7 + Math.random() * 0.6;
    const revenue = Math.floor(avgDailyRevenue * variation);
    const orders = Math.floor(avgDailyOrders * variation);
    
    data.push({
      date: currentDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      revenue,
      orders,
    });
  }
  
  return data;
};

// Generate alerts
const generateAlerts = (lang: Language): Alert[] => {
  const now = new Date();
  
  return [
    {
      id: "alert-001",
      type: "critical",
      title: lang === "ru" ? "⚠️ Критический остаток" : "⚠️ Kritik qoldiq",
      message: lang === "ru" 
        ? "Футболка RJ-001: 150 шт (осталось 5 дней). Реклама тратит ₽500/день на товар, который скоро закончится."
        : "Futbolka RJ-001: 150 dona (5 kun qoldi). Reklama tugaydigan mahsulotga kuniga ₽500 sarflayapti.",
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      icon: "⚠️",
      action: lang === "ru" ? "Остановить рекламу" : "Reklamani to'xtatish",
    },
    {
      id: "alert-002",
      type: "critical",
      title: lang === "ru" ? "💸 Перерасход бюджета" : "💸 Byudjet oshib ketishi",
      message: lang === "ru"
        ? "Толстовка RJ-002: реклама тратит ₽600/день, остаток 180 шт (6 дней). Потенциальная потеря ₽3,600 после распродажи."
        : "Tolstovka RJ-002: reklama kuniga ₽600, qoldiq 180 dona (6 kun). Sotilganidan keyin ₽3,600 yo'qotish xavfi.",
      timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      icon: "💸",
      action: lang === "ru" ? "Снизить бюджет" : "Byudjetni kamaytirish",
    },
    {
      id: "alert-003",
      type: "warning",
      title: lang === "ru" ? "📉 Низкий остаток" : "📉 Past qoldiq",
      message: lang === "ru"
        ? "Рюкзак RJ-004: 320 шт (13 дней). Рекомендуется снизить бюджет рекламы на 30% для продления периода продаж."
        : "Ryukzak RJ-004: 320 dona (13 kun). Savdo davrini uzaytirish uchun reklama byudjetini 30% kamaytirishni tavsiya qilamiz.",
      timestamp: new Date(now.getTime() - 8 * 60 * 60 * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      icon: "📉",
      action: lang === "ru" ? "Применить правило" : "Qoidani qo'llash",
    },
    {
      id: "alert-004",
      type: "warning",
      title: lang === "ru" ? "⏰ Требуется заказ" : "⏰ Buyurtma kerak",
      message: lang === "ru"
        ? "Кроссовки RJ-005: осталось 8 дней. Время доставки 7 дней. Заказывайте сейчас, чтобы избежать дефицита."
        : "Krossovka RJ-005: 8 kun qoldi. Yetkazib berish 7 kun. Yetishmovchilikdan qochish uchun hozir buyurtma bering.",
      timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      icon: "⏰",
    },
    {
      id: "alert-005",
      type: "info",
      title: lang === "ru" ? "✅ Остаток пополнен" : "✅ Qoldiq to'ldirildi",
      message: lang === "ru"
        ? "Бейсболка RJ-006: остаток увеличен до 1,200 шт. Реклама возобновлена на полный бюджет."
        : "Beysbolka RJ-006: qoldiq 1,200 donagacha oshirildi. Reklama to'liq byudjet bilan qayta boshlandi.",
      timestamp: new Date(now.getTime() - 48 * 60 * 60 * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      icon: "✅",
    },
  ];
};

export default function DashboardPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [tasks, setTasks] = useState<Task[]>([]);
  
  // Date filter states
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isFiltering, setIsFiltering] = useState(false);
  
  // Sales data state
  const [salesData, setSalesData] = useState<SalesData>({
    revenue: 9508873,
    revenueChange: -35.28,
    orderCount: 12283,
    balance: 2088841,
    accrued: 793167,
  });
  
  // Chart data state
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  
  // Alerts state
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    setLang(storage.getLang());
    setTasks(storage.getTasks());
    
    // Set default date range (last 28 days)
    const today = new Date();
    const last28Days = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000);
    
    const endDateStr = today.toISOString().split('T')[0];
    const startDateStr = last28Days.toISOString().split('T')[0];
    
    setEndDate(endDateStr);
    setStartDate(startDateStr);
    
    // Generate initial chart data
    setChartData(generateChartData(startDateStr, endDateStr, 9508873, 12283));
    
    // Generate alerts
    setAlerts(generateAlerts(lang));
  }, [lang]);

  const handleTaskComplete = (id: string) => {
    storage.deleteTask(id);
    setTasks(storage.getTasks());
  };

  // Filter data by date range
  const handleFilterByDate = () => {
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

    setIsFiltering(true);

    setTimeout(() => {
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      const dailyRevenue = 339602;
      const dailyOrders = 438;
      
      const filteredRevenue = dailyRevenue * daysDiff;
      const filteredOrders = dailyOrders * daysDiff;
      
      const previousRevenue = filteredRevenue * 1.35;
      const change = calculateChange(filteredRevenue, previousRevenue);
      
      setSalesData({
        revenue: filteredRevenue,
        revenueChange: change,
        orderCount: filteredOrders,
        balance: 2088841,
        accrued: Math.floor(filteredRevenue * 0.083),
      });
      
      setChartData(generateChartData(startDate, endDate, filteredRevenue, filteredOrders));
      
      setIsFiltering(false);
    }, 500);
  };

  // Reset to default
  const handleResetFilter = () => {
    const today = new Date();
    const last28Days = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000);
    
    const endDateStr = today.toISOString().split('T')[0];
    const startDateStr = last28Days.toISOString().split('T')[0];
    
    setEndDate(endDateStr);
    setStartDate(startDateStr);
    
    setSalesData({
      revenue: 9508873,
      revenueChange: -35.28,
      orderCount: 12283,
      balance: 2088841,
      accrued: 793167,
    });
    
    setChartData(generateChartData(startDateStr, endDateStr, 9508873, 12283));
  };

  // Calculate days in period
  const daysInPeriod = startDate && endDate 
    ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
    : 28;

  return (
    <Layout>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {getTranslation(lang, "dashboard_title")}
          </h1>
          <p className="page-subtitle">
            {startDate && endDate ? (
              <>
                {new Date(startDate).toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ", { 
                  day: 'numeric', 
                  month: 'short' 
                })} — {new Date(endDate).toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ", { 
                  day: 'numeric', 
                  month: 'short', 
                  year: 'numeric' 
                })} • {daysInPeriod} {lang === "ru" ? "дней" : "kun"}
              </>
            ) : (
              getTranslation(lang, "dashboard_subtitle")
            )}
          </p>
        </div>
        <Button variant="ghost">
          {getTranslation(lang, 'dashboard_analytics_tab')}
        </Button>
      </div>

      {/* Main Content: Alerts + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Alerts Section - Left Side */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {getTranslation(lang, 'dashboard_alerts_tab')}
              </CardTitle>
              <Badge variant="danger">{alerts.filter(a => a.type === "critical").length}</Badge>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {alerts.map((alert) => (
                <div 
                  key={alert.id}
                  className={`p-3 rounded-lg border-l-4 ${
                    alert.type === "critical" ? "bg-danger/5 border-danger" :
                    alert.type === "warning" ? "bg-warning/5 border-warning" :
                    "bg-success/5 border-success"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-2xl">{alert.icon}</span>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-text-main mb-1">
                        {alert.title}
                      </h4>
                      <p className="text-xs text-text-muted leading-relaxed mb-2">
                        {alert.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-muted">
                          {alert.timestamp}
                        </span>
                        {alert.action && (
                          <Button variant="ghost" size="sm" className="text-xs">
                            {alert.action}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Revenue Chart - Right Side (2 columns) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>
                {getTranslation(lang, "dashboard_card_orders_title")}
              </CardTitle>
              <CardSubtitle>
                {daysInPeriod} {lang === "ru" ? "дней" : "kun"} • {formatNumber(salesData.orderCount)} {lang === "ru" ? "заказов" : "buyurtma"}
              </CardSubtitle>
            </div>
          </CardHeader>
          <CardBody>
            <MetricMain>{formatCurrency(salesData.revenue)} ₽</MetricMain>
            <MetricRow className="mt-2">
              <MetricLabel>
                {getTranslation(lang, "dashboard_revenue_label")}
              </MetricLabel>
              <MetricChange 
                value={`${salesData.revenueChange > 0 ? '+' : ''}${salesData.revenueChange.toFixed(2)}%`} 
                positive={salesData.revenueChange > 0} 
              />
              <MetricLabel>
                • {formatNumber(salesData.orderCount)} {lang === "ru" ? "шт" : "dona"}
              </MetricLabel>
            </MetricRow>
            
            {/* Revenue Chart */}
            <div className="mt-6">
              <RevenueChart data={chartData} lang={lang} />
            </div>

            {/* Additional Metrics */}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-text-muted">
                    {lang === "ru" ? "Средний чек" : "O'rtacha chek"}
                  </p>
                  <p className="text-lg font-semibold text-text-main mt-1">
                    {formatCurrency(salesData.revenue / salesData.orderCount)} ₽
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">
                    {getTranslation(lang, 'dashboard_per_day')}
                  </p>
                  <p className="text-lg font-semibold text-text-main mt-1">
                    {formatCurrency(salesData.revenue / daysInPeriod)} ₽
                  </p>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Balance & Tasks Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Balance Card */}
        <Card>
          <CardHeader>
            <CardTitle>
              {getTranslation(lang, "dashboard_balance_card_title")}
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {/* Current Balance */}
            <div>
              <p className="text-sm text-text-muted">
                {getTranslation(lang, "dashboard_current_balance")}
              </p>
              <MetricMain className="mt-1">{formatCurrency(salesData.balance)} ₽</MetricMain>
            </div>

            {/* Accrued */}
            <div>
              <p className="text-sm text-text-muted">
                {lang === "ru" ? `Начислено за ${daysInPeriod} дней` : `${daysInPeriod} kun uchun hisoblangan`}
              </p>
              <p className="text-lg font-bold text-text-main mt-1">
                {formatCurrency(salesData.accrued)} ₽
              </p>
              <p className="text-xs text-text-muted mt-1">
                ~{((salesData.accrued / salesData.revenue) * 100).toFixed(1)}% {lang === "ru" ? "от оборота" : "aylanmadan"}
              </p>
            </div>
          </CardBody>
        </Card>

        {/* Tasks Card */}
        <Card>
          <CardHeader>
            <CardTitle>
              {getTranslation(lang, "dashboard_tasks_today")}
            </CardTitle>
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
                      <span className="text-sm text-text-main">
                        {task.title}
                      </span>
                    </div>
                    <div className="task-counter">•</div>
                  </div>
                ))
              ) : (
                <>
                  <div className="task-item">
                    <div className="task-label">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-primary border-border rounded focus:ring-primary"
                      />
                      <span className="text-sm text-text-main">
                        {getTranslation(lang, "dashboard_task_discounts")}
                      </span>
                    </div>
                    <div className="task-counter">62</div>
                  </div>
                  <div className="task-item">
                    <div className="task-label">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-primary border-border rounded focus:ring-primary"
                      />
                      <span className="text-sm text-text-main">
                        {getTranslation(lang, "dashboard_task_customers")}
                      </span>
                    </div>
                    <div className="task-counter">2</div>
                  </div>
                  <div className="task-item">
                    <div className="task-label">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-primary border-border rounded focus:ring-primary"
                      />
                      <span className="text-sm text-text-main">
                        {getTranslation(lang, "dashboard_task_questions")}
                      </span>
                    </div>
                    <div className="task-counter">2</div>
                  </div>
                </>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Summary Card */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {getTranslation(lang, "dashboard_summary_title")}
            </CardTitle>
            <Chip>
              {lang === "ru" ? `${daysInPeriod} дней` : `${daysInPeriod} kun`}
            </Chip>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-text-muted">
            {lang === "ru" 
              ? `За выбранный период (${daysInPeriod} дней) общий оборот составил ${formatCurrency(salesData.revenue)} ₽ с ${formatNumber(salesData.orderCount)} заказами. Система обнаружила ${alerts.filter(a => a.type === "critical").length} критических оповещений о товарах с низким остатком и избыточных расходах на рекламу.`
              : `Tanlangan davr uchun (${daysInPeriod} kun) umumiy aylanma ${formatCurrency(salesData.revenue)} ₽ ni tashkil etdi, ${formatNumber(salesData.orderCount)} ta buyurtma bilan. Tizim past qoldiq va ortiqcha reklama xarajatlar haqida ${alerts.filter(a => a.type === "critical").length} ta kritik ogohlantirish topdi.`
            }
          </p>
        </CardBody>
      </Card>
    </Layout>
  );
}
