"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { formatIsoDayForLocale, getBusinessIsoDay, getBusinessTimeZone } from "@/lib/date";
import { storage } from "@/lib/storage";
import type { Language } from "@/types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  SearchInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";

type TransactionType = "sale" | "refund" | "commission" | "withdrawal" | "adjustment";
type Marketplace = "Ozon" | "Wildberries";

interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  marketplace: Marketplace;
  orderId?: string;
  amount: number;
  balance: number;
  description: string;
}

interface FinancePeriod {
  from: string;
  to: string;
}

interface FinanceBreakdown {
  sales: number;
  refunds: number;
  ozonReward: number;
  deliveryServices: number;
  agentServices: number;
  fboServices: number;
  adsPromotion: number;
  otherServicesFines: number;
  compensations: number;
  commissions: number;
  withdrawals: number;
  adjustments: number;
  totalAccrued: number;
}

interface FinanceSummary {
  totalIncome: number;
  totalExpenses: number;
  currentBalance: number;
  netIncome: number;
}

interface FinancePagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

interface FinanceTypeCounts {
  total: number;
  sale: number;
  refund: number;
  commission: number;
  withdrawal: number;
  adjustment: number;
}

interface FinanceResponse {
  transactions: Transaction[];
  period?: FinancePeriod;
  breakdown?: FinanceBreakdown;
  pagination?: FinancePagination;
  typeCounts?: FinanceTypeCounts;
  summary: FinanceSummary;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

function formatDateTime(value: string, lang: Language): string {
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

function formatPeriodRange(from: string, to: string, lang: Language): string {
  const locale = lang === "ru" ? "ru-RU" : "uz-UZ";
  return `${formatIsoDayForLocale(from, locale)} - ${formatIsoDayForLocale(to, locale)}`;
}

export default function OzonFinancePage() {
  const financeAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const [lang, setLang] = useState<Language>("ru");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionType | "all">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const transactionsPerPage = 15;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [period, setPeriod] = useState<FinancePeriod | null>(null);
  const [breakdown, setBreakdown] = useState<FinanceBreakdown>({
    sales: 0,
    refunds: 0,
    ozonReward: 0,
    deliveryServices: 0,
    agentServices: 0,
    fboServices: 0,
    adsPromotion: 0,
    otherServicesFines: 0,
    compensations: 0,
    commissions: 0,
    withdrawals: 0,
    adjustments: 0,
    totalAccrued: 0,
  });
  const [summary, setSummary] = useState<FinanceSummary>({
    totalIncome: 0,
    totalExpenses: 0,
    currentBalance: 0,
    netIncome: 0,
  });
  const [typeCounts, setTypeCounts] = useState<FinanceTypeCounts>({
    total: 0,
    sale: 0,
    refund: 0,
    commission: 0,
    withdrawal: 0,
    adjustment: 0,
  });
  const [pagination, setPagination] = useState<FinancePagination>({
    page: 1,
    pageSize: transactionsPerPage,
    totalItems: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLang(storage.getLang());

    const initialEnd = getBusinessIsoDay();
    const initialStart = `${initialEnd.slice(0, 7)}-01`;
    setStartDate(initialStart);
    setEndDate(initialEnd);
    setAppliedStartDate(initialStart);
    setAppliedEndDate(initialEnd);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    if (!appliedStartDate || !appliedEndDate) return;

    const loadFinance = async () => {
      const requestId = ++requestSeqRef.current;
      financeAbortRef.current?.abort();
      const controller = new AbortController();
      financeAbortRef.current = controller;
      const isInitial = requestId === 1;
      if (isInitial) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          startDate: appliedStartDate,
          endDate: appliedEndDate,
          page: String(currentPage),
          pageSize: String(transactionsPerPage),
          search: debouncedSearch,
          typeFilter,
          marketplaceFilter: "Ozon",
        });
        const response = await fetch(`/api/finance?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as FinanceResponse;
        if (requestId !== requestSeqRef.current) return;
        const nextTransactions = Array.isArray(data.transactions) ? data.transactions : [];
        setTransactions(nextTransactions);
        setPeriod(data.period || null);
        setBreakdown(
          data.breakdown || {
            sales: 0,
            refunds: 0,
            ozonReward: 0,
            deliveryServices: 0,
            agentServices: 0,
            fboServices: 0,
            adsPromotion: 0,
            otherServicesFines: 0,
            compensations: 0,
            commissions: 0,
            withdrawals: 0,
            adjustments: 0,
            totalAccrued: 0,
          }
        );
        setSummary(
          data.summary || {
            totalIncome: 0,
            totalExpenses: 0,
            currentBalance: 0,
            netIncome: 0,
          }
        );
        setTypeCounts(
          data.typeCounts || {
            total: 0,
            sale: 0,
            refund: 0,
            commission: 0,
            withdrawal: 0,
            adjustment: 0,
          }
        );
        const nextPagination = data.pagination || {
          page: currentPage,
          pageSize: transactionsPerPage,
          totalItems: nextTransactions.length,
          totalPages: 1,
        };
        setPagination(nextPagination);
        if (nextPagination.page !== currentPage) {
          setCurrentPage(nextPagination.page);
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        if (requestId !== requestSeqRef.current) return;
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(msg);
      } finally {
        if (requestId === requestSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    loadFinance();
    return () => {
      financeAbortRef.current?.abort();
    };
  }, [appliedStartDate, appliedEndDate, currentPage, debouncedSearch, typeFilter, transactionsPerPage]);

  const totalPages = pagination.totalPages;
  const pageNumber = pagination.page;
  const currentTransactions = transactions;
  const pageNumbers = useMemo(() => {
    const visiblePages = 5;
    const windowStart = Math.max(1, Math.min(pageNumber - 2, Math.max(1, totalPages - visiblePages + 1)));
    const windowEnd = Math.min(totalPages, windowStart + visiblePages - 1);
    return Array.from({ length: Math.max(0, windowEnd - windowStart + 1) }, (_, i) => windowStart + i);
  }, [pageNumber, totalPages]);

  const getTypeName = (type: TransactionType): string => {
    const names = {
      sale: lang === "ru" ? "Продажа" : "Sotuv",
      refund: lang === "ru" ? "Возврат" : "Qaytarish",
      commission: lang === "ru" ? "Комиссия" : "Komissiya",
      withdrawal: lang === "ru" ? "Вывод" : "Yechib olish",
      adjustment: lang === "ru" ? "Корректировка" : "Tuzatish",
    };
    return names[type];
  };

  const handleResetFilters = () => {
    setSearch("");
    setTypeFilter("all");
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const toInput = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const nextStart = toInput(monthStart);
    const nextEnd = toInput(now);
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setAppliedStartDate(nextStart);
    setAppliedEndDate(nextEnd);
    setCurrentPage(1);
  };

  const incomeItems = [
    { labelRu: "Выручка", labelUz: "Tushum", value: breakdown.sales, color: "#0f9f9b" },
    { labelRu: "Компенсации", labelUz: "Kompensatsiyalar", value: Math.max(0, breakdown.compensations), color: "#2bb3cf" },
    { labelRu: "Корректировки", labelUz: "Tuzatishlar", value: Math.max(0, breakdown.adjustments), color: "#7ccf9a" },
  ];
  const outcomeItems = [
    { labelRu: "Вознаграждение Ozon", labelUz: "Ozon mukofoti", value: breakdown.ozonReward, color: "#1f8fe5" },
    { labelRu: "Услуги доставки", labelUz: "Yetkazib berish", value: breakdown.deliveryServices, color: "#e8bc74" },
    { labelRu: "Услуги агентов", labelUz: "Agent xizmatlari", value: breakdown.agentServices, color: "#a6a8ff" },
    { labelRu: "Услуги FBO", labelUz: "FBO xizmatlari", value: breakdown.fboServices, color: "#f08c63" },
    { labelRu: "Продвижение и реклама", labelUz: "Reklama", value: breakdown.adsPromotion, color: "#ef4a89" },
    { labelRu: "Другие услуги и штрафы", labelUz: "Boshqa va jarimalar", value: breakdown.otherServicesFines, color: "#4f46c5" },
  ];
  const incomeTotal = incomeItems.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const outcomeTotal = outcomeItems.reduce((sum, item) => sum + Math.max(0, item.value), 0);

  if (loading) {
    return (
      <Layout>
        <div className="p-6 text-sm text-text-muted">
          {lang === "ru" ? "Загрузка финансовых данных Ozon..." : "Ozon moliya ma'lumotlari yuklanmoqda..."}
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="p-6">
          <p className="text-sm text-danger">
            {lang === "ru" ? "Ошибка загрузки финансовых данных" : "Moliya ma'lumotlarini yuklashda xato"}: {error}
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{lang === "ru" ? "Экономика магазина" : "Do'kon iqtisodiyoti"}</h1>
          <p className="page-subtitle">
            {lang === "ru" ? "Ozon: детальный разбор доходов и расходов" : "Ozon: daromad va xarajatlar tafsiloti"}
          </p>
        </div>
        <a
          href="/finance"
          className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm hover:bg-background transition-colors"
        >
          {lang === "ru" ? "К финансам" : "Moliya bo'limiga"}
        </a>
      </div>

      <Card className="mb-6">
        <CardBody>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-4 lg:pr-6 lg:border-r lg:border-border">
              <h3 className="text-xl font-semibold mb-3">{lang === "ru" ? "Продажи и возвраты" : "Sotuv va qaytarish"}</h3>
              <p className="text-4xl font-bold mb-4 text-text-main">
                {formatCurrency(incomeTotal)} ₽
              </p>
              <div className="h-2 rounded-full bg-background mb-4 overflow-hidden flex">
                {incomeItems.map((item) => {
                  const width = incomeTotal > 0 ? (Math.max(0, item.value) / incomeTotal) * 100 : 0;
                  return (
                    <span
                      key={item.labelRu}
                      style={{ width: `${width}%`, backgroundColor: item.color }}
                      className="h-full"
                    />
                  );
                })}
              </div>
              <div className="space-y-2">
                {incomeItems.map((item) => (
                  <div key={item.labelRu} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm min-w-0">
                      <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate">{lang === "ru" ? item.labelRu : item.labelUz}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">+{formatCurrency(Math.max(0, item.value))} ₽</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    <span className="h-3 w-3 rounded-sm bg-red-400 shrink-0" />
                    <span className="truncate">{lang === "ru" ? "Возвраты" : "Qaytarishlar"}</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-danger">-{formatCurrency(breakdown.refunds)} ₽</span>
                </div>
              </div>
            </section>

            <section className="lg:col-span-5 lg:pr-6 lg:border-r lg:border-border">
              <h3 className="text-xl font-semibold mb-3">{lang === "ru" ? "Начисления" : "Hisob-kitoblar"}</h3>
              <p className="text-4xl font-bold mb-4 text-danger">-{formatCurrency(outcomeTotal)} ₽</p>
              <div className="h-2 rounded-full bg-background mb-4 overflow-hidden flex">
                {outcomeItems.map((item) => {
                  const width = outcomeTotal > 0 ? (Math.max(0, item.value) / outcomeTotal) * 100 : 0;
                  return (
                    <span
                      key={item.labelRu}
                      style={{ width: `${width}%`, backgroundColor: item.color }}
                      className="h-full"
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {outcomeItems.map((item) => (
                  <div key={item.labelRu} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm min-w-0">
                      <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate">{lang === "ru" ? item.labelRu : item.labelUz}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">-{formatCurrency(Math.max(0, item.value))} ₽</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="lg:col-span-3">
              <h3 className="text-xl font-semibold mb-3">{lang === "ru" ? "Итого" : "Jami"}</h3>
              <p className={`text-4xl font-bold mb-4 ${summary.netIncome >= 0 ? "text-success" : "text-danger"}`}>
                {summary.netIncome > 0 ? "+" : ""}
                {formatCurrency(summary.netIncome)} ₽
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">{lang === "ru" ? "Текущий баланс" : "Joriy balans"}</span>
                  <span className="font-semibold">{formatCurrency(summary.currentBalance)} ₽</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">{lang === "ru" ? "Доход" : "Daromad"}</span>
                  <span className="font-semibold text-success">+{formatCurrency(summary.totalIncome)} ₽</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">{lang === "ru" ? "Расход" : "Xarajat"}</span>
                  <span className="font-semibold text-danger">-{formatCurrency(summary.totalExpenses)} ₽</span>
                </div>
              </div>
              <div className="mt-4">
                <Badge variant="default" className="font-medium">
                  {period ? formatPeriodRange(period.from, period.to, lang) : "-"}
                </Badge>
              </div>
            </section>
          </div>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input
              type="date"
              label={lang === "ru" ? "Начало периода" : "Davr boshlanishi"}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              type="date"
              label={lang === "ru" ? "Конец периода" : "Davr tugashi"}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <div className="flex items-end">
              <Button
                variant="primary"
                onClick={() => {
                  if (!startDate || !endDate) return;
                  setAppliedStartDate(startDate);
                  setAppliedEndDate(endDate);
                  setCurrentPage(1);
                }}
                disabled={!startDate || !endDate || refreshing}
                className="w-full"
              >
                {lang === "ru" ? "Применить" : "Qo'llash"}
              </Button>
            </div>
          </div>
        </CardHeader>

        <div className="p-4 border-t border-border">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[250px]">
              <SearchInput
                placeholder={lang === "ru" ? "Поиск по транзакциям..." : "Tranzaksiyalar bo'yicha qidirish..."}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as TransactionType | "all");
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">{lang === "ru" ? "Все типы" : "Barcha turlar"} ({typeCounts.total})</option>
                <option value="sale">{getTypeName("sale")} ({typeCounts.sale})</option>
                <option value="refund">{getTypeName("refund")} ({typeCounts.refund})</option>
                <option value="commission">{getTypeName("commission")} ({typeCounts.commission})</option>
                <option value="withdrawal">{getTypeName("withdrawal")} ({typeCounts.withdrawal})</option>
                <option value="adjustment">{getTypeName("adjustment")} ({typeCounts.adjustment})</option>
              </select>
            </div>

            {(search || typeFilter !== "all") && (
              <div>
                <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                  {lang === "ru" ? "Сбросить" : "Tozalash"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-text-muted">
          {lang === "ru"
            ? `Показано ${currentTransactions.length} из ${pagination.totalItems} транзакций`
            : `${currentTransactions.length} dan ${pagination.totalItems} ta tranzaksiya ko'rsatilmoqda`}
        </p>
        <Badge variant="default">{lang === "ru" ? "Всего" : "Jami"}: {pagination.totalItems}</Badge>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>{lang === "ru" ? "Дата" : "Sana"}</TableHead>
              <TableHead>{lang === "ru" ? "Тип" : "Turi"}</TableHead>
              <TableHead>{lang === "ru" ? "Описание" : "Tavsif"}</TableHead>
              <TableHead>{lang === "ru" ? "Сумма" : "Summa"}</TableHead>
              <TableHead>{lang === "ru" ? "Баланс" : "Balans"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentTransactions.length > 0 ? (
              currentTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium font-mono text-xs">{transaction.id}</TableCell>
                  <TableCell className="text-xs text-text-muted">{formatDateTime(transaction.date, lang)}</TableCell>
                  <TableCell className="text-xs text-text-muted">{getTypeName(transaction.type)}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{transaction.description}</p>
                      {transaction.orderId && <p className="text-xs text-text-muted">{transaction.orderId}</p>}
                    </div>
                  </TableCell>
                  <TableCell className={`font-semibold ${transaction.amount > 0 ? "text-success" : "text-danger"}`}>
                    {transaction.amount > 0 ? "+" : ""}
                    {formatCurrency(transaction.amount)} ₽
                  </TableCell>
                  <TableCell className="font-medium text-sm">{formatCurrency(transaction.balance)} ₽</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="py-8 text-text-muted">
                  {lang === "ru" ? "Транзакции не найдены. Попробуйте изменить фильтры." : "Tranzaksiyalar topilmadi. Filtrlarni o'zgartirib ko'ring."}
                </TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-border">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-muted">
                {lang === "ru" ? `Страница ${pageNumber} из ${totalPages}` : `${pageNumber}-sahifa, jami ${totalPages} ta`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={pageNumber === 1}
                >
                  {lang === "ru" ? "Назад" : "Orqaga"}
                </Button>

                <div className="flex items-center gap-1">
                  {pageNumbers.map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 rounded text-sm ${
                        page === pageNumber ? "bg-primary text-white font-medium" : "hover:bg-background text-text-main"
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
                  disabled={pageNumber === totalPages}
                >
                  {lang === "ru" ? "Вперёд" : "Oldinga"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </Layout>
  );
}
