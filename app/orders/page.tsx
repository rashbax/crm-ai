"use client";

import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { getBusinessTimeZone } from "@/lib/date";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language } from "@/types";
import {
  Badge,
  Button,
  Card,
  SearchInput,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";

type OrderStatus = "processing" | "shipped" | "in_transit" | "delivered" | "returned" | "cancelled";
type TrendSignal = "surge" | "drop" | "rising_returns" | "rising_cancellations";

interface Order {
  id: string;
  sourceDate: string;
  marketplace: string;
  connectionId: string | null;
  sku: string;
  qty: number;
  unitPrice: number;
  revenue: number;
  sourceStatus?: string | null;
  status: OrderStatus;
}

interface SkuHealth {
  stockHealth: string;
  openIncidentsCount: number;
  riskLevel: string;
}

const PROBLEMATIC: Set<OrderStatus> = new Set<OrderStatus>(["returned", "cancelled"]);
const DELAYED_PROCESSING_DAYS = 5;

function formatMoney(value: number) {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} RUB`;
}

function formatDate(value: string, lang: Language) {
  if (!value) return "-";
  const normalized = value.includes("T") ? value : `${value}T00:00:00.000Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ", {
    timeZone: getBusinessTimeZone(),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isDelayed(order: Order): boolean {
  if (order.status !== "processing") return false;
  const ts = new Date(order.sourceDate).getTime();
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  return ageDays > DELAYED_PROCESSING_DAYS;
}

function stockHealthBadge(health: string, lang: Language): JSX.Element | null {
  if (health === "critical") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
        {lang === "ru" ? "Крит. запас" : "Kritik qoldiq"}
      </span>
    );
  }
  if (health === "low") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
        {lang === "ru" ? "Мало" : "Kam"}
      </span>
    );
  }
  return null;
}

export default function OrdersPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [currentMp, setCurrentMp] = useState<string>("ozon");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showProblematic, setShowProblematic] = useState(false);
  const [activeSignal, setActiveSignal] = useState<TrendSignal | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [ordersPerPage] = useState(20);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [skuHealthMap, setSkuHealthMap] = useState<Map<string, SkuHealth>>(new Map());

  useEffect(() => {
    setLang(storage.getLang());
    setCurrentMp(storage.getMarketplace() || "ozon");
    void loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const mp = storage.getMarketplace();
      const [ordersRes, productsRes] = await Promise.all([
        fetch(`/api/orders?marketplace=${mp}`),
        fetch(`/api/products?marketplace=${mp}`),
      ]);
      const ordersData = await ordersRes.json();
      const productsData = await productsRes.json();

      setAllOrders(Array.isArray(ordersData?.orders) ? ordersData.orders : []);

      const healthMap = new Map<string, SkuHealth>();
      for (const p of productsData?.products ?? []) {
        healthMap.set(p.sku, {
          stockHealth: p.stockHealth,
          openIncidentsCount: p.openIncidentsCount,
          riskLevel: p.riskLevel,
        });
      }
      setSkuHealthMap(healthMap);
    } catch (error) {
      console.error("Error loading orders:", error);
      setAllOrders([]);
    } finally {
      setLoading(false);
    }
  };

  // --- Trend signals computed from all orders (last 14 days) ---
  const trendSignals = useMemo(() => {
    const now = Date.now();
    const day7ms = 7 * 24 * 60 * 60 * 1000;
    const day14ms = 14 * 24 * 60 * 60 * 1000;

    const stats = new Map<string, {
      last7: number; prior7: number;
      last7Returns: number; prior7Returns: number;
      last7Cancels: number; prior7Cancels: number;
    }>();

    for (const o of allOrders) {
      const ts = new Date(o.sourceDate).getTime();
      const age = now - ts;
      if (!Number.isFinite(ts) || age > day14ms) continue;

      const entry = stats.get(o.sku) ?? { last7: 0, prior7: 0, last7Returns: 0, prior7Returns: 0, last7Cancels: 0, prior7Cancels: 0 };
      if (age <= day7ms) {
        entry.last7 += o.qty;
        if (o.status === "returned") entry.last7Returns++;
        if (o.status === "cancelled") entry.last7Cancels++;
      } else {
        entry.prior7 += o.qty;
        if (o.status === "returned") entry.prior7Returns++;
        if (o.status === "cancelled") entry.prior7Cancels++;
      }
      stats.set(o.sku, entry);
    }

    const surge = new Set<string>();
    const drop = new Set<string>();
    const risingReturns = new Set<string>();
    const risingCancels = new Set<string>();

    for (const [sku, s] of stats) {
      if (s.last7 >= 3 && s.last7 > s.prior7 * 1.5) surge.add(sku);
      if (s.prior7 >= 3 && s.last7 < s.prior7 * 0.5) drop.add(sku);
      if (s.last7Returns >= 2 && s.last7Returns > s.prior7Returns) risingReturns.add(sku);
      if (s.last7Cancels >= 2 && s.last7Cancels > s.prior7Cancels) risingCancels.add(sku);
    }

    return { surge, drop, risingReturns, risingCancels };
  }, [allOrders]);

  // Signal SKU sets for active filter
  const signalSkus = useMemo((): Set<string> | null => {
    if (!activeSignal) return null;
    if (activeSignal === "surge") return trendSignals.surge;
    if (activeSignal === "drop") return trendSignals.drop;
    if (activeSignal === "rising_returns") return trendSignals.risingReturns;
    if (activeSignal === "rising_cancellations") return trendSignals.risingCancels;
    return null;
  }, [activeSignal, trendSignals]);

  const filteredOrders = useMemo(() => {
    return allOrders.filter((order) => {
      const term = search.toLowerCase();
      const matchesSearch =
        !term ||
        order.id.toLowerCase().includes(term) ||
        order.sku.toLowerCase().includes(term);

      const matchesStatus = statusFilter === "all" || order.status === statusFilter;

      const orderTs = new Date(order.sourceDate).getTime();
      const matchesFrom = !dateFrom || orderTs >= new Date(dateFrom).getTime();
      const matchesTo = !dateTo || orderTs <= new Date(dateTo + "T23:59:59").getTime();

      const matchesProblematic = !showProblematic || PROBLEMATIC.has(order.status) || isDelayed(order);

      const matchesSignal = !signalSkus || signalSkus.has(order.sku);

      return matchesSearch && matchesStatus && matchesFrom && matchesTo && matchesProblematic && matchesSignal;
    });
  }, [allOrders, search, statusFilter, dateFrom, dateTo, showProblematic, signalSkus]);

  const indexOfLast = currentPage * ordersPerPage;
  const indexOfFirst = indexOfLast - ordersPerPage;
  const currentOrders = filteredOrders.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ordersPerPage));

  const pageNumbers = useMemo(() => {
    const visiblePages = 5;
    const windowStart = Math.max(1, Math.min(currentPage - 2, Math.max(1, totalPages - visiblePages + 1)));
    const windowEnd = Math.min(totalPages, windowStart + visiblePages - 1);
    return Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i);
  }, [currentPage, totalPages]);

  // --- Stats from ALL orders (not filtered) ---
  const stats = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((s, o) => s + o.revenue, 0);
    const totalQty = filteredOrders.reduce((s, o) => s + o.qty, 0);
    const uniqueSkus = new Set(filteredOrders.map((o) => o.sku)).size;
    const returnsCount = filteredOrders.filter((o) => o.status === "returned").length;
    const cancelsCount = filteredOrders.filter((o) => o.status === "cancelled").length;
    return { totalRevenue, totalQty, uniqueSkus, returnsCount, cancelsCount };
  }, [filteredOrders]);

  const statusCounts = useMemo(() => ({
    all: allOrders.length,
    processing: allOrders.filter((o) => o.status === "processing").length,
    shipped: allOrders.filter((o) => o.status === "shipped").length,
    in_transit: allOrders.filter((o) => o.status === "in_transit").length,
    delivered: allOrders.filter((o) => o.status === "delivered").length,
    returned: allOrders.filter((o) => o.status === "returned").length,
    cancelled: allOrders.filter((o) => o.status === "cancelled").length,
  }), [allOrders]);

  const hasActiveFilter = search || statusFilter !== "all" || dateFrom || dateTo || showProblematic || activeSignal;

  const handleReset = () => {
    setSearch("");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setShowProblematic(false);
    setActiveSignal(null);
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage((prev) => {
      if (filteredOrders.length === 0) return 1;
      return Math.min(prev, totalPages);
    });
  }, [filteredOrders.length, totalPages]);

  const t = (ru: string, uz: string) => lang === "ru" ? ru : uz;

  const statusLabel = (s: OrderStatus) => {
    const map: Record<OrderStatus, string> = {
      processing: t("В обработке", "Jarayonda"),
      shipped: t("Отгружен", "Jo'natilgan"),
      in_transit: t("В пути", "Yetkazilmoqda"),
      delivered: t("Доставлен", "Yetkazildi"),
      returned: t("Возврат", "Qaytdi"),
      cancelled: t("Отменён", "Bekor qilindi"),
    };
    return map[s] ?? s;
  };

  // WB only produces: processing, shipped, cancelled
  // Ozon produces all 6 statuses
  // WB stats API only gives isCancel (boolean) + sales enrichment → 3 actual states
  const availableStatuses: { value: OrderStatus; label: string }[] = currentMp === "wb"
    ? [
        { value: "processing", label: t("В обработке", "Jarayonda") },
        { value: "delivered",  label: t("Доставлен", "Yetkazildi") },
        { value: "cancelled",  label: t("Отменён", "Bekor qilindi") },
      ]
    : [
        { value: "processing", label: t("В обработке", "Jarayonda") },
        { value: "shipped",    label: t("Отгружен", "Jo'natilgan") },
        { value: "in_transit", label: t("В пути", "Yetkazilmoqda") },
        { value: "delivered",  label: t("Доставлен", "Yetkazildi") },
        { value: "returned",   label: t("Возврат", "Qaytdi") },
        { value: "cancelled",  label: t("Отменён", "Bekor qilindi") },
      ];

  const signalPills: { key: TrendSignal; label: string; skus: Set<string>; color: string }[] = [
    { key: "surge", label: t("Рост заказов ↑", "Buyurtma o'sdi ↑"), skus: trendSignals.surge, color: "green" },
    { key: "drop", label: t("Падение заказов ↓", "Buyurtma tushdi ↓"), skus: trendSignals.drop, color: "amber" },
    { key: "rising_returns", label: t("Рост возвратов", "Qaytishlar o'sdi"), skus: trendSignals.risingReturns, color: "red" },
    { key: "rising_cancellations", label: t("Рост отмен", "Bekor o'sdi"), skus: trendSignals.risingCancels, color: "red" },
  ];

  const rowBg = (order: Order) => {
    if (order.status === "returned") return "bg-red-50";
    if (order.status === "cancelled") return "bg-red-50/60";
    if (isDelayed(order)) return "bg-amber-50/60";
    return "";
  };

  return (
    <Layout>
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-text-muted">{t("Загрузка...", "Yuklanmoqda...")}</p>
        </div>
      ) : (
        <>
          <div className="page-header">
            <div>
              <h1 className="page-title">{getTranslation(lang, "orders_title")}</h1>
              <p className="page-subtitle">{t("Заказы по маркетплейсу", "Marketplace buyurtmalari")}</p>
            </div>
            <Button variant="primary" onClick={() => void loadData()}>{t("Обновить", "Yangilash")}</Button>
          </div>

          {/* Stats cards — 6 total */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <Card>
              <div className="p-4">
                <p className="text-xs text-text-muted">{t("Строк", "Qatorlar")}</p>
                <p className="text-2xl font-bold">{filteredOrders.length}</p>
              </div>
            </Card>
            <Card>
              <div className="p-4">
                <p className="text-xs text-text-muted">{t("Кол-во", "Soni")}</p>
                <p className="text-2xl font-bold">{stats.totalQty.toLocaleString("ru-RU")}</p>
              </div>
            </Card>
            <Card>
              <div className="p-4">
                <p className="text-xs text-text-muted">{t("Выручка", "Tushum")}</p>
                <p className="text-xl font-bold">{formatMoney(stats.totalRevenue)}</p>
              </div>
            </Card>
            <Card>
              <div className="p-4">
                <p className="text-xs text-text-muted">{t("Уникальные SKU", "Noyob SKU")}</p>
                <p className="text-2xl font-bold">{stats.uniqueSkus}</p>
              </div>
            </Card>
            <Card>
              <div className="p-4">
                <p className="text-xs text-text-muted">{t("Возвраты", "Qaytishlar")}</p>
                <p className={`text-2xl font-bold ${stats.returnsCount > 0 ? "text-red-600" : ""}`}>
                  {stats.returnsCount}
                </p>
              </div>
            </Card>
            <Card>
              <div className="p-4">
                <p className="text-xs text-text-muted">{t("Отменено", "Bekor qilingan")}</p>
                <p className={`text-2xl font-bold ${stats.cancelsCount > 0 ? "text-red-600" : ""}`}>
                  {stats.cancelsCount}
                </p>
              </div>
            </Card>
          </div>

          {/* Trend signal pills */}
          {signalPills.some((s) => s.skus.size > 0) && (
            <Card className="mb-4">
              <div className="px-4 py-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-text-muted mr-1">{t("Сигналы (7д):", "Signallar (7k):")}</span>
                {signalPills.map((pill) => {
                  if (pill.skus.size === 0) return null;
                  const isActive = activeSignal === pill.key;
                  return (
                    <button
                      key={pill.key}
                      onClick={() => setActiveSignal(isActive ? null : pill.key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all whitespace-nowrap ${
                        isActive
                          ? "bg-gray-800 text-white border-gray-800"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800"
                      }`}
                    >
                      {pill.label}
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-700"}`}>
                        {pill.skus.size}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Filters */}
          <Card className="mb-6">
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <SearchInput
                    placeholder={t("Поиск по SKU, номеру заказа", "SKU, buyurtma raqami bo'yicha")}
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value as OrderStatus | "all"); setCurrentPage(1); }}
                  className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">{t("Все статусы", "Barcha statuslar")} ({statusCounts.all})</option>
                  {availableStatuses.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label} ({statusCounts[s.value] ?? 0})
                    </option>
                  ))}
                </select>
                {/* Problematic quick-filter */}
                <button
                  onClick={() => { setShowProblematic((v) => !v); setCurrentPage(1); }}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${
                    showProblematic
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:text-red-600"
                  }`}
                >
                  ⚠ {t("Проблемные", "Muammoli")}
                </button>
                {hasActiveFilter && (
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    {t("Сбросить", "Tozalash")}
                  </Button>
                )}
              </div>
              {/* Date range */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-text-muted">{t("Период:", "Davr:")}</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                  className="px-2 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-xs text-text-muted">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                  className="px-2 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(""); setDateTo(""); }}
                    className="text-xs text-text-muted hover:text-text-main"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </Card>

          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-text-muted">
              {t(`Показано ${currentOrders.length} из ${filteredOrders.length}`, `${currentOrders.length} / ${filteredOrders.length} ko'rsatilgan`)}
            </p>
            <Badge variant="default">{t("Всего", "Jami")}: {filteredOrders.length}</Badge>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Заказ", "Buyurtma")}</TableHead>
                  <TableHead>{t("Дата", "Sana")}</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>{t("Здоровье SKU", "SKU holati")}</TableHead>
                  <TableHead>{t("Кол-во", "Soni")}</TableHead>
                  <TableHead>{t("Цена за ед.", "Birlik narxi")}</TableHead>
                  <TableHead>{t("Выручка", "Tushum")}</TableHead>
                  <TableHead>{t("Статус", "Status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentOrders.length > 0 ? (
                  currentOrders.map((order) => {
                    const health = skuHealthMap.get(order.sku);
                    const delayed = isDelayed(order);
                    return (
                      <TableRow key={order.id} className={rowBg(order)}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {(PROBLEMATIC.has(order.status) || delayed) && (
                              <span className="w-1 h-full min-h-[20px] rounded-full bg-red-400 inline-block" />
                            )}
                            {order.id}
                          </div>
                        </TableCell>
                        <TableCell className="text-text-muted text-xs">{formatDate(order.sourceDate, lang)}</TableCell>
                        <TableCell className="font-mono text-xs">{order.sku}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {health && stockHealthBadge(health.stockHealth, lang)}
                            {health && health.openIncidentsCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
                                {t(`${health.openIncidentsCount} инц.`, `${health.openIncidentsCount} inc.`)}
                              </span>
                            )}
                            {(!health || (health.stockHealth !== "critical" && health.stockHealth !== "low" && health.openIncidentsCount === 0)) && (
                              <span className="text-xs text-text-muted">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{order.qty.toLocaleString("ru-RU")}</TableCell>
                        <TableCell>{formatMoney(order.unitPrice)}</TableCell>
                        <TableCell className="font-semibold">{formatMoney(order.revenue)}</TableCell>
                        <TableCell>
                          <StatusPill status={order.status} title={order.sourceStatus || undefined}>
                            {delayed && order.status === "processing"
                              ? t("Задержан", "Kechikkan")
                              : statusLabel(order.status)}
                          </StatusPill>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-text-muted">
                      {t("По текущим фильтрам нет заказов.", "Joriy filtrlarda buyurtma topilmadi.")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-text-muted">{t("Страница", "Sahifa")} {currentPage} / {totalPages}</p>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                      {t("Назад", "Orqaga")}
                    </Button>
                    <div className="flex items-center gap-1">
                      {pageNumbers.map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1 rounded text-sm ${page === currentPage ? "bg-primary text-white font-medium" : "hover:bg-background text-text-main"}`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                      {t("Далее", "Oldinga")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </Layout>
  );
}
