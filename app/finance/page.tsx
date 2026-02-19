"use client";

import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { RevenueChart } from "@/components/RevenueChart";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language } from "@/types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  MetricChange,
  MetricLabel,
  MetricMain,
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

interface ChartDataPoint {
  date: string;
  revenue: number;
  orders: number;
}

interface FinanceSummary {
  totalIncome: number;
  totalExpenses: number;
  currentBalance: number;
  netIncome: number;
  isEstimatedBalance?: boolean;
}

interface FinanceResponse {
  transactions: Transaction[];
  chartData: ChartDataPoint[];
  summary: FinanceSummary;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

function toInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string, lang: Language): string {
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

function toChartLabel(dateStr: string, lang: Language): string {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ", {
    day: "numeric",
    month: "short",
  });
}

function toDateOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function FinancePage() {
  const [lang, setLang] = useState<Language>("ru");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionType | "all">("all");
  const [marketplaceFilter, setMarketplaceFilter] = useState<Marketplace | "all">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const transactionsPerPage = 15;

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allChartData, setAllChartData] = useState<ChartDataPoint[]>([]);
  const [summary, setSummary] = useState<FinanceSummary>({
    totalIncome: 0,
    totalExpenses: 0,
    currentBalance: 0,
    netIncome: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLang(storage.getLang());

    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setEndDate(toInputDate(today));
    setStartDate(toInputDate(firstDayOfMonth));
  }, []);

  useEffect(() => {
    if (!startDate || !endDate) return;

    const loadFinance = async () => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ startDate, endDate });
        const response = await fetch(`/api/finance?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as FinanceResponse;
        setAllTransactions(Array.isArray(data.transactions) ? data.transactions : []);
        setAllChartData(Array.isArray(data.chartData) ? data.chartData : []);
        setSummary(
          data.summary || {
            totalIncome: 0,
            totalExpenses: 0,
            currentBalance: 0,
            netIncome: 0,
          }
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    loadFinance();
  }, [startDate, endDate]);

  const filteredTransactions = useMemo(() => {
    return allTransactions.filter((transaction) => {
      const matchesSearch =
        transaction.id.toLowerCase().includes(search.toLowerCase()) ||
        transaction.description.toLowerCase().includes(search.toLowerCase()) ||
        (transaction.orderId || "").toLowerCase().includes(search.toLowerCase());

      const matchesType = typeFilter === "all" || transaction.type === typeFilter;
      const matchesMarketplace =
        marketplaceFilter === "all" || transaction.marketplace === marketplaceFilter;

      let matchesDate = true;
      if (startDate && endDate) {
        const txTime = new Date(transaction.date).getTime();
        const startTime = new Date(`${startDate}T00:00:00`).getTime();
        const endTime = new Date(`${endDate}T23:59:59`).getTime();
        matchesDate = txTime >= startTime && txTime <= endTime;
      }

      return matchesSearch && matchesType && matchesMarketplace && matchesDate;
    });
  }, [allTransactions, search, typeFilter, marketplaceFilter, startDate, endDate]);

  const chartData = useMemo(() => {
    return allChartData
      .filter((point) => {
        if (!startDate || !endDate) return true;
        return point.date >= startDate && point.date <= endDate;
      })
      .map((point) => ({
        ...point,
        date: toChartLabel(point.date, lang),
      }));
  }, [allChartData, startDate, endDate, lang]);

  const availableRange = useMemo(() => {
    if (allTransactions.length === 0) return null;

    const sorted = allTransactions
      .map((t) => toDateOnly(t.date))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    if (sorted.length === 0) return null;
    return { min: sorted[0], max: sorted[sorted.length - 1] };
  }, [allTransactions]);

  const typeCounts = useMemo(
    () => ({
      sale: allTransactions.filter((t) => t.type === "sale").length,
      refund: allTransactions.filter((t) => t.type === "refund").length,
      commission: allTransactions.filter((t) => t.type === "commission").length,
      withdrawal: allTransactions.filter((t) => t.type === "withdrawal").length,
      adjustment: allTransactions.filter((t) => t.type === "adjustment").length,
    }),
    [allTransactions]
  );

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / transactionsPerPage));
  const indexOfLastTransaction = currentPage * transactionsPerPage;
  const indexOfFirstTransaction = indexOfLastTransaction - transactionsPerPage;
  const currentTransactions = filteredTransactions.slice(
    indexOfFirstTransaction,
    indexOfLastTransaction
  );

  const profitability =
    summary.totalIncome > 0 ? (summary.netIncome / summary.totalIncome) * 100 : 0;

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
    setMarketplaceFilter("all");
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setEndDate(toInputDate(today));
    setStartDate(toInputDate(firstDayOfMonth));
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 text-sm text-text-muted">
          {lang === "ru" ? "Загрузка финансовых данных..." : "Moliya ma'lumotlari yuklanmoqda..."}
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="p-6">
          <p className="text-sm text-danger">
            {lang === "ru" ? "Ошибка загрузки финансовых данных" : "Moliya ma'lumotlarini yuklashda xato"}:{" "}
            {error}
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{getTranslation(lang, "finance_title")}</h1>
          <p className="page-subtitle">{getTranslation(lang, "finance_subtitle")}</p>
        </div>
        <Button variant="primary">{lang === "ru" ? "Вывести средства" : "Pul yechish"}</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Текущий баланс" : "Joriy balans"}</MetricLabel>
            <MetricMain className="text-primary">{formatCurrency(summary.currentBalance)} ₽</MetricMain>
            <p className="text-xs text-text-muted mt-1">
              {summary.isEstimatedBalance
                ? (lang === "ru"
                  ? "Расчет по заказам (не баланс кошелька Ozon)"
                  : "Buyurtmalar asosida hisoblangan (Ozon hamyon balansi emas)")
                : (lang === "ru" ? "Доступно для вывода" : "Yechib olish mumkin")}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Доход за период" : "Davriy daromad"}</MetricLabel>
            <MetricMain className="text-success">+{formatCurrency(summary.totalIncome)} ₽</MetricMain>
            <p className="text-xs text-text-muted mt-1">
              {typeCounts.sale} {lang === "ru" ? "продаж" : "sotuv"}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Расходы за период" : "Davriy xarajat"}</MetricLabel>
            <MetricMain className="text-danger">-{formatCurrency(summary.totalExpenses)} ₽</MetricMain>
            <p className="text-xs text-text-muted mt-1">
              {lang === "ru" ? "Комиссии, возвраты" : "Komissiya, qaytarish"}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Чистая прибыль" : "Sof foyda"}</MetricLabel>
            <MetricMain className={summary.netIncome >= 0 ? "text-success" : "text-danger"}>
              {summary.netIncome >= 0 ? "+" : ""}
              {formatCurrency(summary.netIncome)} ₽
            </MetricMain>
            <MetricChange value={`${profitability.toFixed(1)}%`} positive={summary.netIncome >= 0} />
          </CardBody>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{lang === "ru" ? "Динамика доходов" : "Daromad dinamikasi"}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                type="date"
                label={lang === "ru" ? "Начало периода" : "Davr boshlanishi"}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Input
                type="date"
                label={lang === "ru" ? "Конец периода" : "Davr tugashi"}
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
          {availableRange && (
            <p className="text-xs text-text-muted mb-3">
              {lang === "ru"
                ? `Данные доступны с ${availableRange.min} по ${availableRange.max}`
                : `Ma'lumotlar oralig'i: ${availableRange.min} - ${availableRange.max}`}
            </p>
          )}

          <RevenueChart data={chartData} lang={lang} />
        </CardBody>
      </Card>

      <Card className="mb-6">
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[250px]">
              <SearchInput
                placeholder={
                  lang === "ru"
                    ? "Поиск по транзакциям..."
                    : "Tranzaksiyalar bo'yicha qidirish..."
                }
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
                <option value="all">
                  {lang === "ru" ? "Все типы" : "Barcha turlar"} ({allTransactions.length})
                </option>
                <option value="sale">{getTypeName("sale")} ({typeCounts.sale})</option>
                <option value="refund">{getTypeName("refund")} ({typeCounts.refund})</option>
                <option value="commission">{getTypeName("commission")} ({typeCounts.commission})</option>
                <option value="withdrawal">{getTypeName("withdrawal")} ({typeCounts.withdrawal})</option>
                <option value="adjustment">{getTypeName("adjustment")} ({typeCounts.adjustment})</option>
              </select>
            </div>

            <div>
              <select
                value={marketplaceFilter}
                onChange={(e) => {
                  setMarketplaceFilter(e.target.value as Marketplace | "all");
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">{lang === "ru" ? "Все площадки" : "Barcha platformalar"}</option>
                <option value="Ozon">Ozon</option>
                <option value="Wildberries">Wildberries</option>
              </select>
            </div>

            {(search || typeFilter !== "all" || marketplaceFilter !== "all") && (
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
            ? `Показано ${currentTransactions.length} из ${filteredTransactions.length} транзакций`
            : `${currentTransactions.length} dan ${filteredTransactions.length} ta tranzaksiya ko'rsatilmoqda`}
        </p>
        <Badge variant="default">
          {lang === "ru" ? "Всего" : "Jami"}: {filteredTransactions.length}
        </Badge>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>{lang === "ru" ? "Дата" : "Sana"}</TableHead>
              <TableHead>{lang === "ru" ? "Тип" : "Turi"}</TableHead>
              <TableHead>{lang === "ru" ? "Описание" : "Tavsif"}</TableHead>
              <TableHead>{lang === "ru" ? "Площадка" : "Platforma"}</TableHead>
              <TableHead>{lang === "ru" ? "Сумма" : "Summa"}</TableHead>
              <TableHead>{lang === "ru" ? "Баланс" : "Balans"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentTransactions.length > 0 ? (
              currentTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium font-mono text-xs">{transaction.id}</TableCell>
                  <TableCell className="text-xs text-text-muted">
                    {formatDateTime(transaction.date, lang)}
                  </TableCell>
                  <TableCell className="text-xs text-text-muted">{getTypeName(transaction.type)}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{transaction.description}</p>
                      {transaction.orderId && (
                        <p className="text-xs text-text-muted">{transaction.orderId}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{transaction.marketplace}</TableCell>
                  <TableCell
                    className={`font-semibold ${transaction.amount > 0 ? "text-success" : "text-danger"}`}
                  >
                    {transaction.amount > 0 ? "+" : ""}
                    {formatCurrency(transaction.amount)} ₽
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {formatCurrency(transaction.balance)} ₽
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="py-8 text-text-muted">
                  {lang === "ru"
                    ? "Транзакции не найдены. Попробуйте изменить фильтры."
                    : "Tranzaksiyalar topilmadi. Filtrlarni o'zgartirib ko'ring."}
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-border">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-muted">
                {lang === "ru"
                  ? `Страница ${currentPage} из ${totalPages}`
                  : `${currentPage}-sahifa, jami ${totalPages} ta`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  {lang === "ru" ? "Назад" : "Orqaga"}
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((page) => (
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
