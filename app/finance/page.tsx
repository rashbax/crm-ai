"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import { formatIsoDayForLocale, getBusinessIsoDay } from "@/lib/date";
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
  MetricLabel,
  MetricMain,
} from "@/components/ui";

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
  isEstimatedBalance?: boolean;
}

interface FinanceTypeCounts {
  total: number;
  sale: number;
  refund: number;
  commission: number;
  withdrawal: number;
  adjustment: number;
}

interface FinanceSignal {
  type: string;
  severity: "warning" | "danger";
  messageRu: string;
  messageUz: string;
}

interface SkuProfitItem {
  sku: string;
  revenue: number;
  refundAmount: number;
  net: number;
  orderCount: number;
}

interface PrevSummary {
  netIncome: number;
  totalIncome: number;
  refunds: number;
  commissions: number;
}

interface FinanceResponse {
  period?: FinancePeriod;
  breakdown?: FinanceBreakdown;
  typeCounts?: FinanceTypeCounts;
  summary: FinanceSummary;
  snapshot?: {
    status: "fresh" | "stale" | "missing";
    updatedAt?: string;
  };
  signals?: FinanceSignal[];
  prevSummary?: PrevSummary;
  topSkus?: SkuProfitItem[];
  bottomSkus?: SkuProfitItem[];
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

function formatPeriodRange(from: string, to: string, lang: Language): string {
  const locale = lang === "ru" ? "ru-RU" : "uz-UZ";
  return `${formatIsoDayForLocale(from, locale)} - ${formatIsoDayForLocale(to, locale)}`;
}

const SIGNAL_TYPE_FILTER: Record<string, string> = {
  refund_rate_high: "refund",
  commission_pressure: "commission",
  withdrawal_delay: "withdrawal",
  adjustments_spike: "adjustment",
};

export default function FinancePage() {
  const router = useRouter();
  const financeAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const [lang, setLang] = useState<Language>("ru");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<"fresh" | "stale" | "missing" | null>(null);
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<string | null>(null);
  const [snapshotPollTick, setSnapshotPollTick] = useState(0);
  const [snapshotPollAttempts, setSnapshotPollAttempts] = useState(0);
  const [signals, setSignals] = useState<FinanceSignal[]>([]);
  const [prevSummary, setPrevSummary] = useState<PrevSummary | null>(null);
  const [topSkus, setTopSkus] = useState<SkuProfitItem[]>([]);
  const [bottomSkus, setBottomSkus] = useState<SkuProfitItem[]>([]);
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
          marketplace: storage.getMarketplace(),
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
        const status = data.snapshot?.status ?? null;
        setSnapshotStatus(status);
        setSnapshotUpdatedAt(data.snapshot?.updatedAt ?? null);
        if (status === "fresh") {
          setSnapshotPollAttempts(0);
        }
        setSignals(data.signals ?? []);
        setPrevSummary(data.prevSummary ?? null);
        setTopSkus(data.topSkus ?? []);
        setBottomSkus(data.bottomSkus ?? []);
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
  }, [
    appliedStartDate,
    appliedEndDate,
    snapshotPollTick,
  ]);

  useEffect(() => {
    setSnapshotPollAttempts(0);
    setSnapshotPollTick(0);
  }, [appliedStartDate, appliedEndDate]);

  useEffect(() => {
    if (snapshotStatus === null || snapshotStatus === "fresh") return;
    if (snapshotPollAttempts >= 6) return;
    const timer = setTimeout(() => {
      setSnapshotPollAttempts((prev) => prev + 1);
      setSnapshotPollTick((prev) => prev + 1);
    }, 10_000);
    return () => clearTimeout(timer);
  }, [snapshotStatus, snapshotPollAttempts]);

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
          {snapshotStatus && (
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full inline-block ${
                snapshotStatus === "fresh" ? "bg-success" :
                snapshotStatus === "stale" ? "bg-warning" : "bg-danger"
              }`} />
              <span className="text-xs text-text-muted">
                {snapshotStatus === "fresh"
                  ? (lang === "ru" ? "Данные актуальны" : "Ma'lumotlar yangi")
                  : snapshotStatus === "stale"
                  ? (lang === "ru" ? "Данные обновляются" : "Ma'lumotlar yangilanmoqda")
                  : (lang === "ru" ? "Данные недоступны" : "Ma'lumotlar mavjud emas")}
                {snapshotUpdatedAt && ` · ${lang === "ru" ? "обновлено" : "yangilangan"} ${new Date(snapshotUpdatedAt).toLocaleTimeString(lang === "ru" ? "ru-RU" : "uz-UZ", { hour: "2-digit", minute: "2-digit" })}`}
              </span>
            </div>
          )}
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
              {prevSummary && prevSummary.totalIncome > 0 && (() => {
                const pct = Math.round(((summary.totalIncome - prevSummary.totalIncome) / prevSummary.totalIncome) * 100);
                return (
                  <span className={`ml-2 font-medium ${pct >= 0 ? "text-success" : "text-danger"}`}>
                    {pct > 0 ? "+" : ""}{pct}%
                  </span>
                );
              })()}
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
            {prevSummary && prevSummary.netIncome !== 0 && (() => {
              const delta = summary.netIncome - prevSummary.netIncome;
              const pct = prevSummary.netIncome !== 0
                ? Math.round((delta / Math.abs(prevSummary.netIncome)) * 100)
                : 0;
              return (
                <p className={`text-xs mt-1 font-medium ${pct >= 0 ? "text-success" : "text-danger"}`}>
                  {pct > 0 ? "+" : ""}{pct}% {lang === "ru" ? "vs прошлый период" : "vs oldingi davr"}
                </p>
              );
            })()}
          </CardBody>
        </Card>
      </div>

      {signals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {signals.map((signal) => {
            const titles: Record<string, { ru: string; uz: string }> = {
              net_income_drop: { ru: "Прибыль снижается", uz: "Daromad kamaymoqda" },
              refund_rate_high: { ru: "Высокий уровень возвратов", uz: "Yuqori qaytarish ulushi" },
              commission_pressure: { ru: "Комиссионное давление", uz: "Komissiya bosimi" },
              withdrawal_delay: { ru: "Нет выводов средств", uz: "Pul yechilmagan" },
              adjustments_spike: { ru: "Скачок корректировок", uz: "Tuzatishlar oshdi" },
            };
            const title = titles[signal.type] ?? { ru: signal.type, uz: signal.type };
            const currentMp = storage.getMarketplace();
            const subPage = currentMp === "wb" ? "/finance/wb" : "/finance/ozon";
            const filterParam = SIGNAL_TYPE_FILTER[signal.type];
            const href = filterParam ? `${subPage}?typeFilter=${filterParam}` : subPage;
            return (
              <div
                key={signal.type}
                onClick={() => router.push(href)}
                className={`rounded-xl border p-4 cursor-pointer hover:opacity-80 transition-opacity ${
                  signal.severity === "danger"
                    ? "border-danger bg-danger-light"
                    : "border-warning bg-warning-light"
                }`}
              >
                <p className={`text-sm font-semibold mb-1 ${signal.severity === "danger" ? "text-danger" : "text-warning"}`}>
                  {lang === "ru" ? title.ru : title.uz}
                </p>
                <p className="text-xs text-text-muted">
                  {lang === "ru" ? signal.messageRu : signal.messageUz}
                </p>
                <p className="text-xs mt-2 font-medium text-text-muted">
                  {lang === "ru" ? "Смотреть транзакции →" : "Tranzaksiyalarni ko'rish →"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {breakdown.sales > 0 && (() => {
        const reasons: string[] = [];
        const refundRate = breakdown.refunds / breakdown.sales;
        const commRate = breakdown.commissions / breakdown.sales;
        const delivRate = breakdown.deliveryServices / breakdown.sales;
        const adsRate = breakdown.adsPromotion / breakdown.sales;
        if (refundRate > 0.05)
          reasons.push(lang === "ru"
            ? `Возвраты: ${Math.round(refundRate * 100)}% от выручки (−${formatCurrency(breakdown.refunds)} ₽)`
            : `Qaytarishlar: ${Math.round(refundRate * 100)}% tushumdan (−${formatCurrency(breakdown.refunds)} ₽)`);
        if (commRate > 0.10)
          reasons.push(lang === "ru"
            ? `Комиссии: ${Math.round(commRate * 100)}% от выручки (−${formatCurrency(breakdown.commissions)} ₽)`
            : `Komissiyalar: ${Math.round(commRate * 100)}% tushumdan (−${formatCurrency(breakdown.commissions)} ₽)`);
        if (delivRate > 0.03)
          reasons.push(lang === "ru"
            ? `Доставка: ${Math.round(delivRate * 100)}% от выручки (−${formatCurrency(breakdown.deliveryServices)} ₽)`
            : `Yetkazib berish: ${Math.round(delivRate * 100)}% tushumdan (−${formatCurrency(breakdown.deliveryServices)} ₽)`);
        if (adsRate > 0.03)
          reasons.push(lang === "ru"
            ? `Реклама: ${Math.round(adsRate * 100)}% от выручки (−${formatCurrency(breakdown.adsPromotion)} ₽)`
            : `Reklama: ${Math.round(adsRate * 100)}% tushumdan (−${formatCurrency(breakdown.adsPromotion)} ₽)`);
        if (prevSummary && prevSummary.netIncome > 0 && summary.netIncome < prevSummary.netIncome * 0.95) {
          const drop = Math.round(((prevSummary.netIncome - summary.netIncome) / prevSummary.netIncome) * 100);
          reasons.push(lang === "ru"
            ? `Прибыль снизилась на ${drop}% по сравнению с прошлым периодом`
            : `Daromad oldingi davrga nisbatan ${drop}% ga kamaydi`);
        }
        if (reasons.length === 0) return null;
        return (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{lang === "ru" ? "Почему такой результат" : "Nima uchun bunday natija"}</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="space-y-2">
                {reasons.slice(0, 5).map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-text-main">
                    <span className="text-text-muted mt-0.5 shrink-0">→</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        );
      })()}

      {(topSkus.length > 0 || bottomSkus.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>{lang === "ru" ? "Топ SKU по прибыли" : "Top SKU foydasi"}</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-2">
                {topSkus.map((item) => (
                  <div key={item.sku} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-text-muted truncate max-w-[60%]">{item.sku}</span>
                    <span className="font-semibold text-success tabular-nums">+{formatCurrency(item.net)} ₽</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-danger">{lang === "ru" ? "Проблемные SKU" : "Muammoli SKU"}</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-2">
                {bottomSkus.map((item) => (
                  <div key={item.sku} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-text-muted truncate max-w-[60%]">{item.sku}</span>
                    <span className={`font-semibold tabular-nums ${item.net < 0 ? "text-danger" : "text-text-main"}`}>
                      {item.net > 0 ? "+" : ""}{formatCurrency(item.net)} ₽
                    </span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      <div className="mb-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <CardTitle>{lang === "ru" ? "Начислено за период" : "Davr bo'yicha hisoblangan"}</CardTitle>
                <Badge variant="default" className="font-medium">
                  {period ? formatPeriodRange(period.from, period.to, lang) : "—"}
                </Badge>
              </div>
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
                    }}
                    disabled={!startDate || !endDate || refreshing}
                    className="w-full"
                  >
                    {lang === "ru" ? "Применить" : "Qo'llash"}
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-2">
              {[
                {
                  key: "sales",
                  labelRu: "Продажи",
                  labelUz: "Sotuvlar",
                  value: breakdown.sales,
                  tone: "text-success",
                },
                {
                  key: "refunds",
                  labelRu: "Возвраты",
                  labelUz: "Qaytarishlar",
                  value: -breakdown.refunds,
                  tone: "text-danger",
                },
                {
                  key: "ozonReward",
                  labelRu: "Вознаграждение Ozon",
                  labelUz: "Ozon mukofoti",
                  value: -breakdown.ozonReward,
                  tone: "text-danger",
                },
                {
                  key: "deliveryServices",
                  labelRu: "Услуги доставки",
                  labelUz: "Yetkazib berish xizmatlari",
                  value: -breakdown.deliveryServices,
                  tone: "text-danger",
                },
                {
                  key: "agentServices",
                  labelRu: "Услуги агентов",
                  labelUz: "Agent xizmatlari",
                  value: -breakdown.agentServices,
                  tone: "text-danger",
                },
                {
                  key: "fboServices",
                  labelRu: "Услуги FBO",
                  labelUz: "FBO xizmatlari",
                  value: -breakdown.fboServices,
                  tone: "text-danger",
                },
                {
                  key: "adsPromotion",
                  labelRu: "Продвижение и реклама",
                  labelUz: "Rag'batlantirish va reklama",
                  value: -breakdown.adsPromotion,
                  tone: "text-danger",
                },
                {
                  key: "otherServicesFines",
                  labelRu: "Другие услуги и штрафы",
                  labelUz: "Boshqa xizmatlar va jarimalar",
                  value: -breakdown.otherServicesFines,
                  tone: "text-danger",
                },
                {
                  key: "compensations",
                  labelRu: "Компенсации и декомпенсации",
                  labelUz: "Kompensatsiyalar va dekompensatsiyalar",
                  value: breakdown.compensations,
                  tone: breakdown.compensations >= 0 ? "text-success" : "text-danger",
                },
                {
                  key: "withdrawals",
                  labelRu: "Выводы",
                  labelUz: "Yechib olishlar",
                  value: -breakdown.withdrawals,
                  tone: "text-danger",
                },
                {
                  key: "adjustments",
                  labelRu: "Корректировки",
                  labelUz: "Tuzatishlar",
                  value: breakdown.adjustments,
                  tone: breakdown.adjustments >= 0 ? "text-success" : "text-danger",
                },
              ].map((row) => (
                <div key={row.key} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <p className="text-sm text-text-main">
                    {lang === "ru" ? row.labelRu : row.labelUz}
                  </p>
                  <p className={`text-sm font-semibold tabular-nums ${row.tone}`}>
                    {row.value > 0 ? "+" : ""}
                    {formatCurrency(row.value)} ₽
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl bg-background px-4 py-3">
              <p className="text-sm font-medium text-text-main">
                {lang === "ru" ? "Итог начислено" : "Jami hisoblangan"}
              </p>
              <p className={`text-base font-bold tabular-nums ${breakdown.totalAccrued >= 0 ? "text-success" : "text-danger"}`}>
                {breakdown.totalAccrued > 0 ? "+" : ""}
                {formatCurrency(breakdown.totalAccrued)} ₽
              </p>
            </div>
          </CardBody>
        </Card>

      </div>

    </Layout>
  );
}
