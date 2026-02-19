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

interface Product {
  id: string;
  sku: string;
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
  firstSeenAt: string;
  updatedAt: string;
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} RUB`;
}

function formatDate(value: string, lang: Language) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProductsPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatus | "all">("all");
  const [stockFilter, setStockFilter] = useState<StockHealth | "all">("all");
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [productsPerPage] = useState(20);
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  useEffect(() => {
    setLang(storage.getLang());
    void loadProducts();
  }, []);

  const labels = {
    title: lang === "ru" ? "Товары" : "Mahsulotlar",
    subtitle:
      lang === "ru"
        ? "Реальные данные API: SKU, остатки, цены, маркетплейсы, обновление"
        : "Real API ma'lumotlari: SKU, qoldiq, narxlar, marketpleyslar, yangilanish",
    refresh: lang === "ru" ? "Обновить" : "Yangilash",
    rows: lang === "ru" ? "Строк" : "Qatorlar",
    totalStock: lang === "ru" ? "Всего в наличии" : "Jami mavjud",
    availableProducts: lang === "ru" ? "Доступные товары" : "Mavjud tovarlar",
    stockCoverage: lang === "ru" ? "Товаров со стоком" : "Qoldiq bor tovarlar",
    totalInbound: lang === "ru" ? "Всего в пути" : "Jami yo'lda",
    avgPrice: lang === "ru" ? "Средняя цена" : "O'rtacha narx",
    searchPlaceholder:
      lang === "ru"
        ? "Поиск по SKU, маркетплейсу, цене"
        : "SKU, marketpleys, narx bo'yicha qidiruv",
    allStatus: lang === "ru" ? "Все статусы" : "Barcha statuslar",
    allStock: lang === "ru" ? "Все остатки" : "Barcha qoldiqlar",
    allMarketplace: lang === "ru" ? "Все маркетплейсы" : "Barcha marketpleyslar",
    reset: lang === "ru" ? "Сбросить" : "Tozalash",
    total: lang === "ru" ? "Всего" : "Jami",
    sku: "SKU",
    marketplaces: lang === "ru" ? "Маркетплейсы" : "Marketpleyslar",
    priceRange: lang === "ru" ? "Диапазон цен" : "Narx diapazoni",
    avgPriceCol: lang === "ru" ? "Средняя цена" : "O'rtacha narx",
    onHand: lang === "ru" ? "В наличии" : "Mavjud",
    inbound: lang === "ru" ? "В пути" : "Yo'lda",
    updated: lang === "ru" ? "Обновлено" : "Yangilangan",
    status: lang === "ru" ? "Статус" : "Status",
    stockHealthCol: lang === "ru" ? "Здоровье остатка" : "Qoldiq holati",
    empty:
      lang === "ru"
        ? "Товары по текущим фильтрам не найдены"
        : "Joriy filtrlarda mahsulotlar topilmadi",
    page: lang === "ru" ? "Страница" : "Sahifa",
    prev: lang === "ru" ? "Назад" : "Orqaga",
    next: lang === "ru" ? "Далее" : "Oldinga",
    statusAll: lang === "ru" ? "Все" : "Barchasi",
    statusActive: lang === "ru" ? "Продается" : "Sotilmoqda",
    statusDraft: lang === "ru" ? "Готов к продаже" : "Sotuvga tayyor",
    statusBlocked: lang === "ru" ? "Нет на складе" : "Omborda yo'q",
    stockCritical: lang === "ru" ? "Критический" : "Kritik",
    stockLow: lang === "ru" ? "Низкий" : "Past",
    stockNormal: lang === "ru" ? "Нормальный" : "Normal",
    stockGood: lang === "ru" ? "Хороший" : "Yaxshi",
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/products");
      const data = await response.json();
      setAllProducts(Array.isArray(data?.products) ? data.products : []);
    } catch (error) {
      console.error("Error loading products:", error);
      setAllProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const marketplaceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProducts) {
      for (const m of p.marketplaces) set.add(m);
    }
    return Array.from(set.values()).sort();
  }, [allProducts]);

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase();
    return allProducts.filter((p) => {
      const matchesSearch =
        p.sku.toLowerCase().includes(term) ||
        p.marketplaces.join(",").toLowerCase().includes(term) ||
        String(p.avgPrice).includes(term);

      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      const matchesStock = stockFilter === "all" || p.stockHealth === stockFilter;
      const matchesMarketplace = marketplaceFilter === "all" || p.marketplaces.includes(marketplaceFilter);

      return matchesSearch && matchesStatus && matchesStock && matchesMarketplace;
    });
  }, [allProducts, search, statusFilter, stockFilter, marketplaceFilter]);

  const summary = useMemo(() => {
    const totalStock = filteredProducts.reduce((sum, p) => sum + p.onHand, 0);
    const totalInbound = filteredProducts.reduce((sum, p) => sum + p.inbound, 0);
    const availableProducts = filteredProducts.filter((p) => p.status !== "blocked").length;
    const stockCoverage = filteredProducts.filter((p) => p.stockKnown).length;
    const avgPrice =
      filteredProducts.length > 0
        ? filteredProducts.reduce((sum, p) => sum + p.avgPrice, 0) / filteredProducts.length
        : 0;

    return { totalStock, totalInbound, availableProducts, stockCoverage, avgPrice };
  }, [filteredProducts]);

  const statusCounts = {
    all: allProducts.length,
    active: allProducts.filter((p) => p.status === "active").length,
    draft: allProducts.filter((p) => p.status === "draft").length,
    blocked: allProducts.filter((p) => p.status === "blocked").length,
  };

  const stockCounts = {
    critical: allProducts.filter((p) => p.stockHealth === "critical").length,
    low: allProducts.filter((p) => p.stockHealth === "low").length,
    normal: allProducts.filter((p) => p.stockHealth === "normal").length,
    good: allProducts.filter((p) => p.stockHealth === "good").length,
  };

  const indexOfLastProduct = currentPage * productsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
  const currentProducts = filteredProducts.slice(indexOfFirstProduct, indexOfLastProduct);
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);

  const handleResetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setStockFilter("all");
    setMarketplaceFilter("all");
    setCurrentPage(1);
  };

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
              <h1 className="page-title">{labels.title}</h1>
              <p className="page-subtitle">{labels.subtitle}</p>
            </div>
            <Button variant="primary" onClick={() => void loadProducts()}>{labels.refresh}</Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card><div className="p-4"><p className="text-xs text-text-muted">{labels.rows}</p><p className="text-2xl font-bold">{filteredProducts.length}</p></div></Card>
            <Card><div className="p-4"><p className="text-xs text-text-muted">{labels.availableProducts}</p><p className="text-2xl font-bold">{summary.availableProducts.toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ")}</p></div></Card>
            <Card><div className="p-4"><p className="text-xs text-text-muted">{labels.stockCoverage}</p><p className="text-2xl font-bold">{summary.stockCoverage.toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ")}</p><p className="text-xs text-text-muted mt-1">{labels.totalStock}: {summary.totalStock.toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ")}</p></div></Card>
            <Card><div className="p-4"><p className="text-xs text-text-muted">{labels.avgPrice}</p><p className="text-2xl font-bold">{formatMoney(summary.avgPrice)}</p><p className="text-xs text-text-muted mt-1">{labels.totalInbound}: {summary.totalInbound.toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ")}</p></div></Card>
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
                    onChange={(e) => setStatusFilter(e.target.value as ProductStatus | "all")}
                    className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">{labels.allStatus} ({statusCounts.all})</option>
                    <option value="active">{labels.statusActive} ({statusCounts.active})</option>
                    <option value="draft">{labels.statusDraft} ({statusCounts.draft})</option>
                    <option value="blocked">{labels.statusBlocked} ({statusCounts.blocked})</option>
                  </select>
                </div>

                <div>
                  <select
                    value={stockFilter}
                    onChange={(e) => setStockFilter(e.target.value as StockHealth | "all")}
                    className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">{labels.allStock}</option>
                    <option value="critical">{labels.stockCritical} ({stockCounts.critical})</option>
                    <option value="low">{labels.stockLow} ({stockCounts.low})</option>
                    <option value="normal">{labels.stockNormal} ({stockCounts.normal})</option>
                    <option value="good">{labels.stockGood} ({stockCounts.good})</option>
                  </select>
                </div>

                <div>
                  <select
                    value={marketplaceFilter}
                    onChange={(e) => setMarketplaceFilter(e.target.value)}
                    className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">{labels.allMarketplace}</option>
                    {marketplaceOptions.map((m) => (
                      <option key={m} value={m}>{m.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                {(search || statusFilter !== "all" || stockFilter !== "all" || marketplaceFilter !== "all") && (
                  <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                    {labels.reset}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-text-muted">
              {lang === "ru"
                ? `Показано ${currentProducts.length} из ${filteredProducts.length}`
                : `${currentProducts.length} / ${filteredProducts.length} ko'rsatilgan`}
            </p>
            <Badge variant="default">{labels.total}: {filteredProducts.length}</Badge>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{labels.sku}</TableHead>
                  <TableHead>{labels.marketplaces}</TableHead>
                  <TableHead>{labels.priceRange}</TableHead>
                  <TableHead>{labels.avgPriceCol}</TableHead>
                  <TableHead>{labels.onHand}</TableHead>
                  <TableHead>{labels.inbound}</TableHead>
                  <TableHead>{lang === "ru" ? "Продано 30д" : "30 kun sotuv"}</TableHead>
                  <TableHead>{labels.stockHealthCol}</TableHead>
                  <TableHead>{lang === "ru" ? "Первое появление" : "Birinchi paydo bo'lish"}</TableHead>
                  <TableHead>{labels.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentProducts.length > 0 ? (
                  currentProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {product.marketplaces.map((m) => (
                            <Badge key={`${product.id}-${m}`} variant="secondary">{m.toUpperCase()}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{formatMoney(product.minPrice)} - {formatMoney(product.maxPrice)}</TableCell>
                      <TableCell className="font-semibold">{formatMoney(product.avgPrice)}</TableCell>
                      <TableCell>
                        {product.stockKnown
                          ? product.onHand.toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {product.stockKnown
                          ? product.inbound.toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ")
                          : "-"}
                      </TableCell>
                      <TableCell>{product.soldLast30d.toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ")}</TableCell>
                      <TableCell>
                        <Badge variant={product.stockHealth === "critical" ? "danger" : product.stockHealth === "low" ? "secondary" : product.stockHealth === "normal" ? "default" : "success"}>
                          {product.stockHealth === "critical"
                            ? labels.stockCritical
                            : product.stockHealth === "low"
                              ? labels.stockLow
                              : product.stockHealth === "normal"
                                ? labels.stockNormal
                                : labels.stockGood}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-text-muted">{formatDate(product.firstSeenAt, lang)}</TableCell>
                      <TableCell>
                        <StatusPill status={product.status}>
                          {product.status === "active" ? labels.statusActive : product.status === "draft" ? labels.statusDraft : labels.statusBlocked}
                        </StatusPill>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-text-muted">
                      {labels.empty}
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
