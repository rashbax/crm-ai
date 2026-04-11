"use client";

import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
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

type ProductStatus = "active" | "draft" | "blocked";
type StockHealth = "critical" | "low" | "normal" | "good";
type RiskLevel = "NONE" | "LOW" | "MED" | "HIGH" | "CRITICAL";

interface TaskItem { id: string; title: string; status: string; priority: string }
interface IncidentItem { id: string; title: string; severity: string; status: string }

interface Product {
  id: string;
  sku: string;
  articul?: string;
  marketplace: string;
  marketplaces: string[];
  connectionIds: string[];
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  onHand: number;
  inbound: number;
  stockKnown: boolean;
  soldLast30d: number;
  status: ProductStatus;
  stockHealth: StockHealth;
  riskLevel: RiskLevel;
  ownerName: string | null;
  ownerId: string | null;
  openTasksCount: number;
  openIncidentsCount: number;
  tasks: TaskItem[];
  incidents: IncidentItem[];
  priceHistory: { id: string; oldPrice: number; newPrice: number; reason: string; changedBy: string; changedAt: string }[];
  recentChanges: { id: string; entityType: string; fieldName: string; oldValue: string; newValue: string; changedBy: string; changedAt: string }[];
  updatedAt: string;
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }); }
  catch { return "—"; }
}

const RISK_ORDER: Record<RiskLevel, number> = { CRITICAL: 0, HIGH: 1, MED: 2, LOW: 3, NONE: 4 };

export default function ProductsPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatus | "all">("active");
  const [stockFilter, setStockFilter] = useState<StockHealth | "all">("all");
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "unassigned">("all");
  const [signal, setSignal] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [productsPerPage] = useState(20);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  useEffect(() => {
    setLang(storage.getLang());
    const params = new URLSearchParams(window.location.search);
    const f = params.get("filter");
    if (f === "stockout") setSignal("salesLowStock");
    else if (f === "noOwner") setSignal("noOwner");
    else if (f === "hasIncident") setSignal("hasIncident");
    void loadProducts();
  }, []);

  const t = (ru: string, uz: string) => lang === "ru" ? ru : uz;

  const loadProducts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/products?marketplace=${storage.getMarketplace()}`);
      const data = await response.json();
      setAllProducts(Array.isArray(data?.products) ? data.products : []);
    } catch {
      setAllProducts([]);
    } finally {
      setLoading(false);
    }
  };

  // Signal quick-filters
  const signals = useMemo(() => ({
    salesLowStock: allProducts.filter((p) => p.soldLast30d > 0 && p.stockHealth === "critical"),
    noOwner:       allProducts.filter((p) => !p.ownerName),
    hasIncident:   allProducts.filter((p) => p.openIncidentsCount > 0),
    manyTasks:     allProducts.filter((p) => p.openTasksCount > 2),
    priceRisk:     allProducts.filter((p) => p.riskLevel === "CRITICAL" || p.riskLevel === "HIGH"),
  }), [allProducts]);

  const ownerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const p of allProducts) if (p.ownerName) names.add(p.ownerName);
    return Array.from(names).sort();
  }, [allProducts]);

  const [ownerNameFilter, setOwnerNameFilter] = useState<string>("all");

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase();

    let base = allProducts;

    // Signal filter overrides other filters
    if (signal === "salesLowStock") base = signals.salesLowStock;
    else if (signal === "noOwner") base = signals.noOwner;
    else if (signal === "hasIncident") base = signals.hasIncident;
    else if (signal === "manyTasks") base = signals.manyTasks;
    else if (signal === "priceRisk") base = signals.priceRisk;

    return base.filter((p) => {
      const matchesSearch = !term ||
        p.sku.toLowerCase().includes(term) ||
        (p.ownerName || "").toLowerCase().includes(term) ||
        String(p.avgPrice).includes(term);

      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      const matchesStock = stockFilter === "all" || p.stockHealth === stockFilter;
      const matchesRisk = riskFilter === "all" || p.riskLevel === riskFilter;
      const matchesOwner = ownerFilter === "all"
        ? (ownerNameFilter === "all" || p.ownerName === ownerNameFilter)
        : !p.ownerName;

      return matchesSearch && matchesStatus && matchesStock && matchesRisk && matchesOwner;
    });
  }, [allProducts, search, statusFilter, stockFilter, riskFilter, ownerFilter, ownerNameFilter, signal, signals]);

  const summary = useMemo(() => {
    const totalStock = allProducts.reduce((sum, p) => sum + p.onHand, 0);
    const criticalCount = allProducts.filter((p) => p.stockHealth === "critical").length;
    const noOwnerCount = allProducts.filter((p) => !p.ownerName).length;
    const highRiskCount = allProducts.filter((p) => p.riskLevel === "CRITICAL" || p.riskLevel === "HIGH").length;
    const avgPrice = allProducts.length > 0
      ? allProducts.reduce((s, p) => s + p.avgPrice, 0) / allProducts.length : 0;
    return { totalStock, criticalCount, noOwnerCount, highRiskCount, avgPrice };
  }, [allProducts]);

  const statusCounts = {
    all: allProducts.length,
    active: allProducts.filter((p) => p.status === "active").length,
    draft: allProducts.filter((p) => p.status === "draft").length,
    blocked: allProducts.filter((p) => p.status === "blocked").length,
  };

  const indexOfLast = currentPage * productsPerPage;
  const indexOfFirst = indexOfLast - productsPerPage;
  const currentProducts = filteredProducts.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));

  const pageNumbers = useMemo(() => {
    const visible = 5;
    const start = Math.max(1, Math.min(currentPage - 2, Math.max(1, totalPages - visible + 1)));
    const end = Math.min(totalPages, start + visible - 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, stockFilter, riskFilter, ownerFilter, ownerNameFilter, signal]);


  const handleResetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setStockFilter("all");
    setRiskFilter("all");
    setOwnerFilter("all");
    setOwnerNameFilter("all");
    setSignal(null);
  };

  const riskBadgeVariant = (r: RiskLevel) =>
    r === "CRITICAL" ? "danger" : r === "HIGH" ? "warning" : r === "MED" ? "default" : "success";

  const riskLabel = (r: RiskLevel) => ({
    CRITICAL: t("Критический", "Kritik"),
    HIGH:     t("Высокий", "Yuqori"),
    MED:      t("Средний", "O'rta"),
    LOW:      t("Низкий", "Past"),
    NONE:     t("Нет", "Yo'q"),
  })[r];

  const stockHealthBadgeVariant = (h: StockHealth) =>
    h === "critical" ? "danger" : h === "low" ? "warning" : h === "normal" ? "default" : "success";

  const stockHealthLabel = (h: StockHealth) => ({
    critical: t("Критический", "Kritik"),
    low:      t("Низкий", "Past"),
    normal:   t("Нормальный", "Normal"),
    good:     t("Хороший", "Yaxshi"),
  })[h];

  const taskStatusVariant = (s: string) =>
    s === "overdue" ? "danger" : s === "blocked" ? "warning" : s === "need_approval" ? "warning" : "default";

  const incidentSeverityVariant = (s: string) =>
    s === "critical" ? "danger" : s === "high" ? "warning" : "default";

  const hasActiveFilters = search || statusFilter !== "all" || stockFilter !== "all" ||
    riskFilter !== "all" || ownerFilter !== "all" || ownerNameFilter !== "all" || signal;

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
              <h1 className="page-title">{t("Товары", "Mahsulotlar")}</h1>
              <p className="page-subtitle">{t("SKU-реестр: статус, владелец, риск, задачи и инциденты", "SKU reestri: holat, egasi, risk, vazifalar va muammolar")}</p>
            </div>
            <Button variant="primary" onClick={() => void loadProducts()}>{t("Обновить", "Yangilash")}</Button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card><div className="p-4">
              <p className="text-xs text-text-muted">{t("Всего SKU", "Jami SKU")}</p>
              <p className="text-2xl font-bold">{allProducts.length}</p>
            </div></Card>
            <Card><div className="p-4">
              <p className="text-xs text-text-muted">{t("Критический запас", "Kritik qoldiq")}</p>
              <p className={`text-2xl font-bold ${summary.criticalCount > 0 ? "text-red-600" : "text-green-600"}`}>{summary.criticalCount}</p>
            </div></Card>
            <Card><div className="p-4">
              <p className="text-xs text-text-muted">{t("Без владельца", "Egasiz SKU")}</p>
              <p className={`text-2xl font-bold ${summary.noOwnerCount > 0 ? "text-amber-600" : "text-green-600"}`}>{summary.noOwnerCount}</p>
            </div></Card>
            <Card><div className="p-4">
              <p className="text-xs text-text-muted">{t("Высокий риск", "Yuqori risk")}</p>
              <p className={`text-2xl font-bold ${summary.highRiskCount > 0 ? "text-red-600" : "text-green-600"}`}>{summary.highRiskCount}</p>
            </div></Card>
          </div>

          {/* Signal bar */}
          <div className="mb-4 flex flex-wrap gap-2">
            {([
              { key: "salesLowStock", label: t("Продажи + низкий запас", "Sotuv + past qoldiq"), count: signals.salesLowStock.length },
              { key: "noOwner",       label: t("Без владельца", "Egasiz"),                       count: signals.noOwner.length },
              { key: "hasIncident",   label: t("Есть инцидент", "Muammo bor"),                   count: signals.hasIncident.length },
              { key: "manyTasks",     label: t("Много задач (3+)", "Ko'p vazifa (3+)"),           count: signals.manyTasks.length },
              { key: "priceRisk",     label: t("Высокий риск", "Yuqori risk"),                   count: signals.priceRisk.length },
            ] as const).map(({ key, label, count }) => {
              const isActive = signal === key;
              return (
                <button
                  key={key}
                  onClick={() => setSignal(isActive ? null : key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-gray-800 text-white border-gray-800"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800"
                  }`}
                >
                  {label}
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold ${
                    isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <div className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <SearchInput
                    placeholder={t("Поиск по SKU, владельцу", "SKU, egasi bo'yicha qidiruv")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ProductStatus | "all")}
                  className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">{t("Все статусы", "Barcha statuslar")} ({statusCounts.all})</option>
                  <option value="active">{t("Продается", "Sotilmoqda")} ({statusCounts.active})</option>
                  <option value="draft">{t("Готов к продаже", "Sotuvga tayyor")} ({statusCounts.draft})</option>
                  <option value="blocked">{t("Нет на складе", "Omborda yo'q")} ({statusCounts.blocked})</option>
                </select>
                <select
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as StockHealth | "all")}
                  className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">{t("Все остатки", "Barcha qoldiqlar")}</option>
                  <option value="critical">{t("Критический", "Kritik")}</option>
                  <option value="low">{t("Низкий", "Past")}</option>
                  <option value="normal">{t("Нормальный", "Normal")}</option>
                  <option value="good">{t("Хороший", "Yaxshi")}</option>
                </select>
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value as RiskLevel | "all")}
                  className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">{t("Все риски", "Barcha risklar")}</option>
                  <option value="CRITICAL">{t("Критический", "Kritik")}</option>
                  <option value="HIGH">{t("Высокий", "Yuqori")}</option>
                  <option value="MED">{t("Средний", "O'rta")}</option>
                  <option value="LOW">{t("Низкий", "Past")}</option>
                  <option value="NONE">{t("Нет", "Yo'q")}</option>
                </select>
                <select
                  value={ownerFilter === "unassigned" ? "unassigned" : ownerNameFilter}
                  onChange={(e) => {
                    if (e.target.value === "unassigned") { setOwnerFilter("unassigned"); setOwnerNameFilter("all"); }
                    else { setOwnerFilter("all"); setOwnerNameFilter(e.target.value); }
                  }}
                  className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">{t("Все владельцы", "Barcha egalar")}</option>
                  <option value="unassigned">{t("Без владельца", "Egasiz")}</option>
                  {ownerOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                    {t("Сбросить", "Tozalash")}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-text-muted">
              {t(`Показано ${currentProducts.length} из ${filteredProducts.length}`, `${currentProducts.length} / ${filteredProducts.length} ko'rsatilgan`)}
            </p>
            <Badge variant="default">{t("Всего", "Jami")}: {filteredProducts.length}</Badge>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>{t("Цена", "Narx")}</TableHead>
                  <TableHead>{t("В наличии", "Mavjud")}</TableHead>
                  <TableHead>{t("В пути", "Yo'lda")}</TableHead>
                  <TableHead>{t("Продано 30д", "30 kun sotuv")}</TableHead>
                  <TableHead>{t("Запас", "Qoldiq")}</TableHead>
                  <TableHead>{t("Владелец", "Egasi")}</TableHead>
                  <TableHead>{t("Задачи", "Vazifalar")}</TableHead>
                  <TableHead>{t("Инциденты", "Muammolar")}</TableHead>
                  <TableHead>{t("Риск", "Risk")}</TableHead>
                  <TableHead>{t("Статус", "Status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentProducts.length > 0 ? (
                  currentProducts.map((product) => {
                    const dailySales = product.soldLast30d / 30;
                    const stockDays = dailySales > 0 ? Math.round(product.onHand / dailySales) : product.onHand > 0 ? 999 : 0;
                    const stockDaysLabel = stockDays >= 999 ? "999+" : `${stockDays}`;
                    return (
                      <TableRow
                        key={product.id}
                        className="cursor-pointer hover:bg-background"
                        onClick={() => setDetailProduct(product)}
                      >
                        <TableCell>
                          <div>
                            <span className="font-mono text-xs">{product.sku}</span>
                            {product.articul && (
                              <p className="text-xs text-text-muted mt-0.5">#{product.articul}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold whitespace-nowrap">{formatMoney(product.avgPrice)}</TableCell>
                        <TableCell>
                          {product.stockKnown ? product.onHand.toLocaleString("ru-RU") : "—"}
                        </TableCell>
                        <TableCell>
                          {product.stockKnown
                            ? product.inbound > 0
                              ? <span className="text-blue-600 font-medium">+{product.inbound.toLocaleString("ru-RU")}</span>
                              : <span className="text-text-muted">—</span>
                            : "—"}
                        </TableCell>
                        <TableCell>{product.soldLast30d.toLocaleString("ru-RU")}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <Badge variant={stockHealthBadgeVariant(product.stockHealth)}>{stockHealthLabel(product.stockHealth)}</Badge>
                            <span className="text-xs text-text-muted">{stockDaysLabel} {t("дн", "kun")}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {product.ownerName
                            ? <span className="text-sm">{product.ownerName}</span>
                            : <span className="text-xs text-amber-600 font-semibold">{t("Не назначен", "Tayinlanmagan")}</span>
                          }
                        </TableCell>
                        <TableCell>
                          {product.openTasksCount > 0
                            ? <Badge variant={product.openTasksCount > 3 ? "danger" : "warning"}>{product.openTasksCount}</Badge>
                            : <span className="text-xs text-text-muted">—</span>
                          }
                        </TableCell>
                        <TableCell>
                          {product.openIncidentsCount > 0
                            ? <Badge variant="danger">{product.openIncidentsCount}</Badge>
                            : <span className="text-xs text-text-muted">—</span>
                          }
                        </TableCell>
                        <TableCell>
                          <Badge variant={riskBadgeVariant(product.riskLevel)}>{riskLabel(product.riskLevel)}</Badge>
                        </TableCell>
                        <TableCell>
                          <StatusPill status={product.status}>
                            {product.status === "active" ? t("Продается", "Sotilmoqda") : product.status === "draft" ? t("Готов", "Tayyor") : t("Нет на складе", "Omborda yo'q")}
                          </StatusPill>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-text-muted">
                      {t("Товары по текущим фильтрам не найдены", "Joriy filtrlarda mahsulotlar topilmadi")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {filteredProducts.length > 0 && (
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

      {/* SKU Detail Modal */}
      {detailProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailProduct(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <p className="font-mono text-sm text-text-muted">{detailProduct.marketplace.toUpperCase()}</p>
                <h2 className="text-lg font-bold">{detailProduct.sku}</h2>
              </div>
              <button onClick={() => setDetailProduct(null)} className="text-text-muted hover:text-text-main text-2xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Status row */}
              <div className="flex flex-wrap gap-2 items-center">
                <StatusPill status={detailProduct.status}>
                  {detailProduct.status === "active" ? t("Продается", "Sotilmoqda") : detailProduct.status === "draft" ? t("Готов", "Tayyor") : t("Нет на складе", "Omborda yo'q")}
                </StatusPill>
                <Badge variant={riskBadgeVariant(detailProduct.riskLevel)}>{t("Риск", "Risk")}: {riskLabel(detailProduct.riskLevel)}</Badge>
                <Badge variant={stockHealthBadgeVariant(detailProduct.stockHealth)}>{t("Запас", "Qoldiq")}: {stockHealthLabel(detailProduct.stockHealth)}</Badge>
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-background rounded-lg p-3">
                  <p className="text-xs text-text-muted mb-1">{t("Цена", "Narx")}</p>
                  <p className="font-bold text-sm">{formatMoney(detailProduct.avgPrice)}</p>
                </div>
                <div className="bg-background rounded-lg p-3">
                  <p className="text-xs text-text-muted mb-1">{t("В наличии", "Mavjud")}</p>
                  <p className="font-bold text-sm">{detailProduct.stockKnown ? detailProduct.onHand.toLocaleString("ru-RU") : "—"}</p>
                  {detailProduct.inbound > 0 && <p className="text-xs text-text-muted">+{detailProduct.inbound} {t("в пути", "yo'lda")}</p>}
                </div>
                <div className="bg-background rounded-lg p-3">
                  <p className="text-xs text-text-muted mb-1">{t("Продано 30д", "30 kun sotuv")}</p>
                  <p className="font-bold text-sm">{detailProduct.soldLast30d.toLocaleString("ru-RU")}</p>
                </div>
              </div>

              {/* Owner */}
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">{t("Владелец", "Egasi")}</p>
                {detailProduct.ownerName
                  ? <p className="text-sm font-semibold">{detailProduct.ownerName}</p>
                  : <p className="text-sm text-amber-600 font-semibold">{t("Не назначен — требуется назначение", "Tayinlanmagan — tayinlash kerak")}</p>
                }
              </div>

              {/* Open tasks */}
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                  {t("Открытые задачи", "Ochiq vazifalar")} ({detailProduct.openTasksCount})
                </p>
                {detailProduct.tasks.length === 0
                  ? <p className="text-sm text-text-muted">{t("Нет открытых задач", "Ochiq vazifalar yo'q")}</p>
                  : <div className="space-y-1.5">
                      {detailProduct.tasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-2 text-sm">
                          <Badge variant={taskStatusVariant(task.status)}>{task.status}</Badge>
                          <span className="truncate">{task.title}</span>
                        </div>
                      ))}
                    </div>
                }
              </div>

              {/* Open incidents */}
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                  {t("Открытые инциденты", "Ochiq muammolar")} ({detailProduct.openIncidentsCount})
                </p>
                {detailProduct.incidents.length === 0
                  ? <p className="text-sm text-text-muted">{t("Нет открытых инцидентов", "Ochiq muammolar yo'q")}</p>
                  : <div className="space-y-1.5">
                      {detailProduct.incidents.map((inc) => (
                        <div key={inc.id} className="flex items-center gap-2 text-sm">
                          <Badge variant={incidentSeverityVariant(inc.severity)}>{inc.severity}</Badge>
                          <span className="truncate">{inc.title}</span>
                        </div>
                      ))}
                    </div>
                }
              </div>

              {/* Price history */}
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                  {t("История цен", "Narx tarixi")}
                </p>
                {detailProduct.priceHistory.length === 0 ? (
                  <p className="text-sm text-text-muted">{t("Изменений через систему ещё не было", "Tizim orqali o'zgarish yo'q")}</p>
                ) : (
                  <div className="space-y-1.5">
                    {detailProduct.priceHistory.map((h) => (
                      <div key={h.id} className="text-xs bg-background rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{h.oldPrice.toLocaleString("ru-RU")} → {h.newPrice.toLocaleString("ru-RU")} ₽</span>
                          <span className="text-text-muted">{formatDate(h.changedAt)}</span>
                        </div>
                        {h.reason && <p className="text-text-muted mt-0.5 truncate">{h.reason}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent changes */}
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                  {t("Последние изменения", "So'nggi o'zgarishlar")}
                </p>
                {detailProduct.recentChanges.length === 0 ? (
                  <p className="text-sm text-text-muted">{t("Нет связанных изменений", "Bog'liq o'zgarishlar yo'q")}</p>
                ) : (
                  <div className="space-y-1.5">
                    {detailProduct.recentChanges.map((l) => (
                      <div key={l.id} className="text-xs bg-background rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium capitalize">{l.entityType} · {l.fieldName}</span>
                          <span className="text-text-muted">{formatDate(l.changedAt)}</span>
                        </div>
                        <p className="text-text-muted mt-0.5">{l.oldValue || "—"} → {l.newValue}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
