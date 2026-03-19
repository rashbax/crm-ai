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

type OrderStatus = "new" | "processing" | "shipped" | "cancelled";
type Marketplace = "Ozon" | "Wildberries";

interface Order {
  id: string;
  sourceDate: string;
  marketplace: Marketplace;
  connectionId: string | null;
  sku: string;
  qty: number;
  unitPrice: number;
  revenue: number;
  sourceStatus?: string | null;
  status: OrderStatus;
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} RUB`;
}

function formatDate(value: string, lang: Language) {
  if (!value) return "-";
  if (!value.includes("T")) return value;
  const date = new Date(value);
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

export default function OrdersPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [marketplaceFilter, setMarketplaceFilter] = useState<Marketplace | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [ordersPerPage] = useState(20);
  const [allOrders, setAllOrders] = useState<Order[]>([]);

  useEffect(() => {
    setLang(storage.getLang());
    void loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/orders");
      const data = await response.json();
      setAllOrders(Array.isArray(data?.orders) ? data.orders : []);
    } catch (error) {
      console.error("Error loading orders:", error);
      setAllOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = useMemo(() => {
    return allOrders.filter((order) => {
      const term = search.toLowerCase();
      const matchesSearch =
        order.id.toLowerCase().includes(term) ||
        order.sku.toLowerCase().includes(term) ||
        order.marketplace.toLowerCase().includes(term) ||
        String(order.qty).includes(term) ||
        String(order.revenue).includes(term);

      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const matchesMarketplace = marketplaceFilter === "all" || order.marketplace === marketplaceFilter;

      return matchesSearch && matchesStatus && matchesMarketplace;
    });
  }, [allOrders, search, statusFilter, marketplaceFilter]);

  const indexOfLastOrder = currentPage * ordersPerPage;
  const indexOfFirstOrder = indexOfLastOrder - ordersPerPage;
  const currentOrders = filteredOrders.slice(indexOfFirstOrder, indexOfLastOrder);
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ordersPerPage));

  const pageNumbers = useMemo(() => {
    const visiblePages = 5;
    const windowStart = Math.max(
      1,
      Math.min(currentPage - 2, Math.max(1, totalPages - visiblePages + 1))
    );
    const windowEnd = Math.min(totalPages, windowStart + visiblePages - 1);
    return Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i);
  }, [currentPage, totalPages]);

  const summary = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.revenue, 0);
    const totalQty = filteredOrders.reduce((sum, o) => sum + o.qty, 0);
    const uniqueSkus = new Set(filteredOrders.map((o) => o.sku)).size;
    const avgCheck = totalQty > 0 ? totalRevenue / totalQty : 0;
    return { totalRevenue, totalQty, uniqueSkus, avgCheck };
  }, [filteredOrders]);

  const statusCounts = {
    all: allOrders.length,
    new: allOrders.filter((o) => o.status === "new").length,
    processing: allOrders.filter((o) => o.status === "processing").length,
    shipped: allOrders.filter((o) => o.status === "shipped").length,
    cancelled: allOrders.filter((o) => o.status === "cancelled").length,
  };

  const labels = {
    subtitle:
      lang === "ru"
        ? "Реальные данные API: SKU, количество, цена за единицу, выручка"
        : "Real API ma'lumotlari: SKU, soni, birlik narxi, tushum",
    refresh: lang === "ru" ? "Обновить" : "Yangilash",
    rows: lang === "ru" ? "Строк" : "Qatorlar",
    totalQty: lang === "ru" ? "Общее кол-во" : "Jami soni",
    totalRevenue: lang === "ru" ? "Общая выручка" : "Jami tushum",
    uniqueSku: lang === "ru" ? "Уникальные SKU" : "Noyob SKU",
    avgUnit: lang === "ru" ? "Средняя цена" : "O'rtacha narx",
    searchPlaceholder:
      lang === "ru"
        ? "Поиск по SKU, номеру заказа, количеству, выручке"
        : "SKU, buyurtma raqami, soni, tushum bo'yicha qidiruv",
    allStatus: lang === "ru" ? "Все статусы" : "Barcha statuslar",
    allMarketplaces: lang === "ru" ? "Все маркетплейсы" : "Barcha marketpleyslar",
    reset: lang === "ru" ? "Сбросить" : "Tozalash",
    shown:
      lang === "ru"
        ? `Показано ${currentOrders.length} из ${filteredOrders.length} строк`
        : `${currentOrders.length} / ${filteredOrders.length} qator ko'rsatilgan`,
    order: lang === "ru" ? "Заказ" : "Buyurtma",
    date: lang === "ru" ? "Дата" : "Sana",
    marketplace: lang === "ru" ? "Маркетплейс" : "Marketpleys",
    sku: "SKU",
    qty: lang === "ru" ? "Кол-во" : "Soni",
    unitPrice: lang === "ru" ? "Цена за ед." : "Birlik narxi",
    revenue: lang === "ru" ? "Выручка" : "Tushum",
    status: lang === "ru" ? "Статус" : "Status",
    noRows:
      lang === "ru"
        ? "По текущим фильтрам нет строк с реальными заказами."
        : "Joriy filtrlarda real buyurtma qatorlari topilmadi.",
    page: lang === "ru" ? "Страница" : "Sahifa",
    prev: lang === "ru" ? "Назад" : "Orqaga",
    next: lang === "ru" ? "Далее" : "Oldinga",
    statusNew: lang === "ru" ? "Новый" : "Yangi",
    statusProcessing: lang === "ru" ? "В обработке" : "Jarayonda",
    statusShipped: lang === "ru" ? "Отгружен" : "Yuborilgan",
    statusCancelled: lang === "ru" ? "Отменен" : "Bekor qilingan",
  };

  const handleResetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setMarketplaceFilter("all");
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage((prev) => {
      if (filteredOrders.length === 0) return 1;
      return Math.min(prev, totalPages);
    });
  }, [filteredOrders.length, totalPages]);

  return (
    <Layout>
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-text-muted">{lang === "ru" ? "Загрузка..." : "Yuklanmoqda..."}</p>
        </div>
      ) : (
        <>
          <div className="page-header">
            <div>
              <h1 className="page-title">{getTranslation(lang, "orders_title")}</h1>
              <p className="page-subtitle">{labels.subtitle}</p>
            </div>
            <Button variant="primary" onClick={() => void loadOrders()}>{labels.refresh}</Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card><div className="p-4"><p className="text-xs text-text-muted">{labels.rows}</p><p className="text-2xl font-bold">{filteredOrders.length}</p></div></Card>
            <Card><div className="p-4"><p className="text-xs text-text-muted">{labels.totalQty}</p><p className="text-2xl font-bold">{summary.totalQty.toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ")}</p></div></Card>
            <Card><div className="p-4"><p className="text-xs text-text-muted">{labels.totalRevenue}</p><p className="text-2xl font-bold">{formatMoney(summary.totalRevenue)}</p></div></Card>
            <Card><div className="p-4"><p className="text-xs text-text-muted">{labels.uniqueSku}</p><p className="text-2xl font-bold">{summary.uniqueSkus}</p><p className="text-xs text-text-muted mt-1">{labels.avgUnit}: {formatMoney(summary.avgCheck)}</p></div></Card>
          </div>

          <Card className="mb-6">
            <div className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[250px]">
                  <SearchInput
                    placeholder={labels.searchPlaceholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "all")}
                    className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">{labels.allStatus} ({statusCounts.all})</option>
                    <option value="new">{labels.statusNew} ({statusCounts.new})</option>
                    <option value="processing">{labels.statusProcessing} ({statusCounts.processing})</option>
                    <option value="shipped">{labels.statusShipped} ({statusCounts.shipped})</option>
                    <option value="cancelled">{labels.statusCancelled} ({statusCounts.cancelled})</option>
                  </select>
                </div>
                <div>
                  <select
                    value={marketplaceFilter}
                    onChange={(e) => setMarketplaceFilter(e.target.value as Marketplace | "all")}
                    className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">{labels.allMarketplaces}</option>
                    <option value="Ozon">Ozon</option>
                    <option value="Wildberries">Wildberries</option>
                  </select>
                </div>
                {(search || statusFilter !== "all" || marketplaceFilter !== "all") && (
                  <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                    {labels.reset}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-text-muted">{labels.shown}</p>
            <Badge variant="default">{lang === "ru" ? "Всего" : "Jami"}: {filteredOrders.length}</Badge>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{labels.order}</TableHead>
                  <TableHead>{labels.date}</TableHead>
                  <TableHead>{labels.marketplace}</TableHead>
                  <TableHead>{labels.sku}</TableHead>
                  <TableHead>{labels.qty}</TableHead>
                  <TableHead>{labels.unitPrice}</TableHead>
                  <TableHead>{labels.revenue}</TableHead>
                  <TableHead>{labels.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentOrders.length > 0 ? (
                  currentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.id}</TableCell>
                      <TableCell className="text-text-muted text-xs">{formatDate(order.sourceDate, lang)}</TableCell>
                      <TableCell><Badge variant="default">{order.marketplace}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{order.sku}</TableCell>
                      <TableCell>{order.qty.toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ")}</TableCell>
                      <TableCell>{formatMoney(order.unitPrice)}</TableCell>
                      <TableCell className="font-semibold">{formatMoney(order.revenue)}</TableCell>
                      <TableCell>
                        <StatusPill status={order.status} title={order.sourceStatus || undefined}>
                          {order.status === "new"
                            ? labels.statusNew
                            : order.status === "processing"
                              ? labels.statusProcessing
                              : order.status === "shipped"
                                ? labels.statusShipped
                                : labels.statusCancelled}
                        </StatusPill>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-text-muted">
                      {labels.noRows}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-text-muted">{labels.page} {currentPage} / {totalPages}</p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      {labels.prev}
                    </Button>
                    <div className="flex items-center gap-1">
                      {pageNumbers.map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1 rounded text-sm ${
                            page === currentPage
                              ? "bg-primary text-white font-medium"
                              : "hover:bg-background text-text-main"
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      {labels.next}
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
