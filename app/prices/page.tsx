"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import { useEnabledConnections } from "@/src/integrations/useEnabledConnections";
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
  Input,
} from "@/components/ui";
import type {
  PricingDashboardResponse,
  PricingRow,
  MarketplacePricing,
  Marketplace,
  PricingRules,
  PriceIndexPair,
  PriceChangeEntry,
  PromoItem,
} from "@/src/pricing/types";
import { evaluateOzonPriceIndex } from "@/src/pricing/priceIndex";

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Marketplace names
const marketplaceNames: Record<Marketplace, string> = {
  wb: "WB",
  ozon: "Ozon",
  uzum: "Uzum",
  ym: "YM",
};

type SaleFilter = "on_sale" | "not_on_sale" | "all";
type MarketplaceTab = "all" | "wb" | "ozon";

function isMarketplaceOnSale(row: PricingRow, mp: MarketplacePricing): boolean {
  if (typeof mp.listing?.onSale === "boolean") return mp.listing.onSale;

  const visibility = String(mp.listing?.visibility || "").toLowerCase();
  const status = String(mp.listing?.status || "").toLowerCase();

  const hiddenByVisibility =
    visibility.includes("hidden") ||
    visibility.includes("inactive") ||
    visibility.includes("blocked") ||
    visibility.includes("out_of_stock");
  const blockedByStatus =
    status.includes("archiv") ||
    status.includes("disabled") ||
    status.includes("blocked") ||
    status.includes("not_for_sale");

  if (hiddenByVisibility || blockedByStatus) return false;

  if (visibility || status) return true;
  return row.stock.availableUnits > 0;
}

// Risk badge colors
const getRiskBadgeClass = (risk: string) => {
  switch (risk) {
    case 'CRITICAL': return 'bg-danger text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap';
    case 'HIGH': return 'bg-danger text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap';
    case 'MED': return 'bg-warning text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap';
    case 'LOW': return 'bg-success text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap';
    default: return 'bg-gray-400 text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap';
  }
};

const getRiskLabel = (risk: string, lang: Language) => {
  const ru: Record<string, string> = {
    CRITICAL: "Критический",
    HIGH: "Высокий",
    MED: "Средний",
    LOW: "Низкий",
    NONE: "Нет риска",
  };
  const uz: Record<string, string> = {
    CRITICAL: "Kritik",
    HIGH: "Yuqori",
    MED: "O'rta",
    LOW: "Past",
    NONE: "Xavf yo'q",
  };
  const key = String(risk || "").toUpperCase();
  return lang === "ru" ? (ru[key] || key) : (uz[key] || key);
};

interface PriceIndexInfo {
  label: string;
  badgeClass: string;
  recommendation: string;
  details: string[];
}

type TooltipVertical = "top" | "bottom";

interface TooltipPlacement {
  key: string;
  top: number;
  left: number;
}

const DEFAULT_RULES: PricingRules = {
  indexThresholds: {
    badMaxMarginPct: 0.05,
    moderateMaxMarginPct: 0.12,
    goodMaxMarginPct: 0.22,
  },
  guardrails: {
    lowMarginBlockPct: 0.05,
  },
};

// No fallback — only show real Ozon price index data from API
function getFallbackIndexPairs(_mp: MarketplacePricing): PriceIndexPair[] {
  return [];
}

function getPriceIndexInfo(
  row: PricingRow,
  mp: MarketplacePricing,
  lang: Language
): PriceIndexInfo {
  if (row.stock.availableUnits <= 0) {
    return {
      label: lang === "ru" ? "Без индекса" : "Indekssiz",
      badgeClass: "bg-gray-100 text-gray-700 border border-gray-200",
      recommendation: lang === "ru" ? "Нет остатков, индекс недоступен." : "Qoldiq yo'q, indeks mavjud emas.",
      details: [
        lang === "ru"
          ? "После пополнения склада индекс появится автоматически."
          : "Ombor to'ldirilgach indeks avtomatik paydo bo'ladi.",
      ],
    };
  }

  const inputPairs = mp.priceIndexPairs || getFallbackIndexPairs(mp);
  const indexResult = evaluateOzonPriceIndex(inputPairs, mp.ozonColorIndex);

  if (indexResult.state === "NONE") {
    return {
      label: lang === "ru" ? "Без индекса" : "Indekssiz",
      badgeClass: "bg-gray-100 text-gray-700 border border-gray-200",
      recommendation:
        lang === "ru"
          ? "Индекс цен появится после синхронизации с Ozon."
          : "Narx indeksi Ozon bilan sinxronlashgandan keyin paydo bo'ladi.",
      details: [
        lang === "ru"
          ? "Ozon рассчитывает индекс на основе цен конкурентов."
          : "Ozon indeksni raqobatchilar narxlari asosida hisoblaydi.",
      ],
    };
  }

  // Build source labels for real Ozon price index data
  const sourceLabels: Record<string, { ru: string; uz: string }> = {
    external: { ru: "Конкуренты (другие площадки)", uz: "Raqobatchilar (boshqa saytlar)" },
    ozon: { ru: "Конкуренты (на Ozon)", uz: "Raqobatchilar (Ozon'da)" },
    self_marketplace: { ru: "Вы на других площадках", uz: "Siz boshqa saytlarda" },
  };

  const ratioDetails = indexResult.usedPairs.map((pair, idx) => {
    const ratio = pair.ownPrice / pair.marketPrice;
    const sourceLabel = pair.source && sourceLabels[pair.source]
      ? (lang === "ru" ? sourceLabels[pair.source].ru : sourceLabels[pair.source].uz)
      : (lang === "ru" ? `Сравнение ${idx + 1}` : `Taqqoslash ${idx + 1}`);
    return lang === "ru"
      ? `${sourceLabel}: мин. цена ₽${formatCurrency(pair.marketPrice)}, индекс ${ratio.toFixed(2)}`
      : `${sourceLabel}: min. narx ₽${formatCurrency(pair.marketPrice)}, indeks ${ratio.toFixed(2)}`;
  });
  const currentPrice = Math.floor(mp.current.price);
  const indexGuidance =
    lang === "ru"
      ? [
          `Текущая цена: ₽${formatCurrency(currentPrice)}`,
          "Индекс рассчитывается Ozon на основе цен конкурентов.",
          "Зелёный = хорошая видимость в поиске. Красный = Ozon понижает в выдаче.",
        ]
      : [
          `Joriy narx: ₽${formatCurrency(currentPrice)}`,
          "Indeks Ozon tomonidan raqobatchilar narxlari asosida hisoblanadi.",
          "Yashil = qidiruvda yaxshi ko'rinish. Qizil = Ozon natijalarni pasaytiradi.",
        ];

  if (indexResult.state === "BAD") {
    return {
      label: lang === "ru" ? "Невыгодный" : "Nomaqbul",
      badgeClass: "bg-red-50 text-red-700 border border-red-200",
      recommendation:
        lang === "ru"
          ? "Индекс красный: Ozon понижает товар в поиске. Рассмотрите снижение цены."
          : "Indeks qizil: Ozon mahsulotni qidiruvda pasaytiradi. Narxni kamaytirishni ko'rib chiqing.",
      details: [...ratioDetails, ...indexGuidance],
    };
  }

  if (indexResult.state === "MODERATE") {
    return {
      label: lang === "ru" ? "Умеренный" : "O'rtacha",
      badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
      recommendation:
        lang === "ru"
          ? "Индекс жёлтый: видимость нормальная, но можно улучшить снизив цену."
          : "Indeks sariq: ko'rinish normal, lekin narxni pasaytirib yaxshilash mumkin.",
      details: [...ratioDetails, ...indexGuidance],
    };
  }

  return {
    label: lang === "ru" ? "Выгодный" : "Maqbul",
    badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    recommendation:
      lang === "ru"
        ? "Индекс зелёный: отличная видимость в поиске Ozon."
        : "Indeks yashil: Ozon qidiruvida ajoyib ko'rinish.",
    details: [...ratioDetails, ...indexGuidance],
  };
}

interface PriceEditorState {
  open: boolean;
  sku: string;
  marketplace: Marketplace;
  currentPrice: number;
  currentDiscount: number;
  minPrice: number;
  targetPrice: number;
  newPrice: number;
  newDiscount: number;
  reason: string;
}

function formatTimeAgo(isoDate: string, lang: Language): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return lang === "ru" ? `${days}д назад` : `${days}k oldin`;
  if (hours > 0) return lang === "ru" ? `${hours}ч назад` : `${hours}s oldin`;
  return lang === "ru" ? "Только что" : "Hozirgina";
}

export default function PricesPage() {
  const { enabledConnections } = useEnabledConnections();
  const [lang, setLang] = useState<Language>("ru");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PricingDashboardResponse | null>(null);

  // Marketplace filtering handled by global Topbar selector
  const mpTab: MarketplaceTab = "all";

  // Filters
  const [searchSku, setSearchSku] = useState("");
  const [saleFilter, setSaleFilter] = useState<SaleFilter>("on_sale");
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);
  const [showLowMarginOnly, setShowLowMarginOnly] = useState(false);
  const [showHighRiskOnly, setShowHighRiskOnly] = useState(false);

  // Price editor modal
  const [editor, setEditor] = useState<PriceEditorState | null>(null);

  // Promo modal
  const [promoModal, setPromoModal] = useState<{sku: string; marketplace: Marketplace; promos: PromoItem[]} | null>(null);

  // History modal
  const [historyModal, setHistoryModal] = useState<{sku: string; marketplace: Marketplace} | null>(null);
  const [historyData, setHistoryData] = useState<PriceChangeEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Drafts
  const [draftItems, setDraftItems] = useState<Array<{
    sku: string;
    marketplace: Marketplace;
    newPrice: number;
    newDiscount: number;
    reason: string;
  }>>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<TooltipPlacement | null>(null);
  const tooltipHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = (key: string) => getTranslation(lang, key);

  const connectedMarketplaceIds = useMemo<Marketplace[]>(() => {
    const ids = new Set(enabledConnections.map((c) => c.marketplaceId));
    const connected: Marketplace[] = [];
    if (ids.has("wb")) connected.push("wb");
    if (ids.has("ozon")) connected.push("ozon");
    if (ids.has("uzum")) connected.push("uzum");
    if (ids.has("ym")) connected.push("ym");
    return connected;
  }, [enabledConnections]);

  useEffect(() => {
    setLang(storage.getLang());
    loadPricingData();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchSku, saleFilter, showBlockedOnly, showLowMarginOnly, showHighRiskOnly]);

  const handleIndexTooltipEnter = (key: string, target: HTMLElement) => {
    if (tooltipHideTimeoutRef.current) {
      clearTimeout(tooltipHideTimeoutRef.current);
      tooltipHideTimeoutRef.current = null;
    }

    const rect = target.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = 260;
    const viewportPadding = 16;

    const spaceAbove = rect.top - viewportPadding;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const canShowAbove = spaceAbove >= tooltipHeight;
    const canShowBelow = spaceBelow >= tooltipHeight;
    const vertical: TooltipVertical =
      canShowAbove && !canShowBelow
        ? "top"
        : !canShowAbove && canShowBelow
          ? "bottom"
          : spaceBelow >= spaceAbove
            ? "bottom"
            : "top";

    const centerX = rect.left + rect.width / 2;
    const preferredLeft = centerX - tooltipWidth * 0.55;
    const left = Math.min(
      window.innerWidth - tooltipWidth - viewportPadding,
      Math.max(viewportPadding, preferredLeft)
    );
    const preferredTop =
      vertical === "top"
        ? rect.top - tooltipHeight - 8
        : rect.bottom + 8;
    const top = Math.min(
      window.innerHeight - tooltipHeight - viewportPadding,
      Math.max(viewportPadding, preferredTop)
    );

    setActiveTooltip({ key, top, left });
  };

  const handleIndexTooltipLeave = (key: string) => {
    if (tooltipHideTimeoutRef.current) {
      clearTimeout(tooltipHideTimeoutRef.current);
    }
    tooltipHideTimeoutRef.current = setTimeout(() => {
      setActiveTooltip((prev) => (prev?.key === key ? null : prev));
      tooltipHideTimeoutRef.current = null;
    }, 90);
  };

  const loadPricingData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/pricing?marketplace=${storage.getMarketplace()}`);
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Error loading pricing data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (sku: string, marketplace: Marketplace) => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/pricing/history?sku=${sku}&marketplace=${marketplace}`);
      const result = await response.json();
      setHistoryData(result.history || []);
    } catch {
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistoryModal = (sku: string, marketplace: Marketplace) => {
    setHistoryModal({ sku, marketplace });
    loadHistory(sku, marketplace);
  };

  const openPriceEditor = (row: PricingRow, mp: MarketplacePricing) => {
    // T3-09: Owner mandatory for price changes
    if (!mp.owner) {
      alert(
        lang === "ru"
          ? `Нельзя изменить цену для "${row.sku}" — не назначен ответственный. Назначьте владельца в модуле ответственности.`
          : `"${row.sku}" uchun narxni o'zgartirish mumkin emas — mas'ul tayinlanmagan. Javobgarlik modulida egasini belgilang.`
      );
      return;
    }
    setEditor({
      open: true,
      sku: row.sku,
      marketplace: mp.marketplace,
      currentPrice: mp.current.price,
      currentDiscount: mp.current.discountPct || 0,
      minPrice: mp.guardrails.minPrice,
      targetPrice: mp.guardrails.targetPrice,
      newPrice: mp.current.price,
      newDiscount: mp.current.discountPct || 0,
      reason: "",
    });
  };

  const closePriceEditor = () => {
    setEditor(null);
  };

  const addToDraft = async () => {
    if (!editor) return;
    if (!editor.reason.trim()) {
      alert(t("prices_editor_reason_required"));
      return;
    }

    const existing = draftItems.findIndex(
      d => d.sku === editor.sku && d.marketplace === editor.marketplace
    );

    if (existing >= 0) {
      const updated = [...draftItems];
      updated[existing] = {
        sku: editor.sku,
        marketplace: editor.marketplace,
        newPrice: editor.newPrice,
        newDiscount: editor.newDiscount,
        reason: editor.reason,
      };
      setDraftItems(updated);
    } else {
      setDraftItems([...draftItems, {
        sku: editor.sku,
        marketplace: editor.marketplace,
        newPrice: editor.newPrice,
        newDiscount: editor.newDiscount,
        reason: editor.reason,
      }]);
    }

    // Record in price change history
    try {
      await fetch("/api/pricing/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: editor.sku,
          marketplace: editor.marketplace,
          oldPrice: editor.currentPrice,
          newPrice: editor.newPrice,
          oldDiscount: editor.currentDiscount,
          newDiscount: editor.newDiscount,
          reason: editor.reason,
          changedBy: "admin",
        }),
      });
    } catch {
      // Non-blocking
    }

    closePriceEditor();
  };

  const removeDraftItem = (sku: string, marketplace: Marketplace) => {
    setDraftItems(draftItems.filter(d => !(d.sku === sku && d.marketplace === marketplace)));
  };

  const applyChanges = async () => {
    if (draftItems.length === 0) {
      alert(lang === "ru" ? "Нет изменений для применения" : "Qo'llash uchun o'zgarishlar yo'q");
      return;
    }

    alert(
      (lang === "ru" ? "Применение изменений:\n" : "O'zgarishlarni qo'llash:\n") +
      draftItems.map(d => `${d.sku} @ ${marketplaceNames[d.marketplace]}: ₽${d.newPrice} (${d.newDiscount}%) — ${d.reason}`).join("\n") +
      "\n\n" +
      (lang === "ru" ? "В MVP это только план. Реальные API вызовы не производятся." : "MVP da bu faqat reja. Haqiqiy API chaqiruvlar yo'q.")
    );

    setDraftItems([]);
    setShowDrafts(false);
  };

  // Filter rows
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Flatten rows: each marketplace becomes its own independent row
  const flatRows = useMemo(() => {
    if (!data?.rows) return [];
    const result: { row: PricingRow; mp: MarketplacePricing }[] = [];
    for (const row of data.rows) {
      const mps = row.marketplaces;
      for (const mp of mps) {
        // Marketplace tab filter
        if (mpTab !== "all" && mp.marketplace !== mpTab) continue;

        // SKU search
        if (searchSku && !row.sku.toLowerCase().includes(searchSku.toLowerCase())) continue;

        // Sale filter
        if (saleFilter === "on_sale" && !isMarketplaceOnSale(row, mp)) continue;
        if (saleFilter === "not_on_sale" && isMarketplaceOnSale(row, mp)) continue;

        // Blocked filter
        if (showBlockedOnly && !mp.guardrails.blocked) continue;

        // Low margin filter
        if (showLowMarginOnly) {
          const rules = data?.rules?.[mp.marketplace] ?? DEFAULT_RULES;
          if (mp.guardrails.marginPct >= rules.indexThresholds.moderateMaxMarginPct) continue;
        }

        // High risk filter
        if (showHighRiskOnly && row.stock.riskLevel !== "HIGH" && row.stock.riskLevel !== "CRITICAL") continue;

        result.push({ row, mp });
      }
    }
    return result;
  }, [data, searchSku, saleFilter, showBlockedOnly, showLowMarginOnly, showHighRiskOnly, mpTab]);

  const filteredRows = flatRows;

  // Clamp page when filtered results shrink
  useEffect(() => {
    setCurrentPage((prev) => {
      if (flatRows.length === 0) return 1;
      return Math.min(prev, Math.max(1, Math.ceil(flatRows.length / ITEMS_PER_PAGE)));
    });
  }, [flatRows.length]);

  const totalPages = Math.max(1, Math.ceil(flatRows.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedFlatRows = flatRows.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const pageNumbers = useMemo(() => {
    const visiblePages = 5;
    const windowStart = Math.max(
      1,
      Math.min(safePage - 2, Math.max(1, totalPages - visiblePages + 1))
    );
    const windowEnd = Math.min(totalPages, windowStart + visiblePages - 1);
    return Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i);
  }, [safePage, totalPages]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-text-muted">{lang === "ru" ? "Загрузка..." : "Yuklanmoqda..."}</p>
        </div>
      </Layout>
    );
  }

  if (data?.emptyState) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto py-16 px-4">
          <Card>
            <CardBody>
              <div className="text-center">
                <h2 className="text-xl font-semibold text-text-main mb-2">{data.emptyState.title}</h2>
                <p className="text-sm text-text-muted mb-6">{data.emptyState.body}</p>
                <a
                  href={data.emptyState.ctaHref}
                  className="inline-flex items-center justify-center rounded-lg bg-primary text-white px-4 py-2 text-sm font-medium"
                >
                  {data.emptyState.ctaLabel}
                </a>
              </div>
            </CardBody>
          </Card>
        </div>
      </Layout>
    );
  }

  const signals = data?.signals;

  return (
    <Layout>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("prices_title")}</h1>
          <p className="page-subtitle">{t("prices_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {draftItems.length > 0 && (
            <Badge variant="primary">
              {draftItems.length} {lang === "ru" ? "изменений" : "o'zgarish"}
            </Badge>
          )}
          <Button
            variant={draftItems.length > 0 ? "primary" : "ghost"}
            onClick={() => setShowDrafts(true)}
          >
            {lang === "ru" ? "Черновики" : "Qoralamalar"} ({draftItems.length})
          </Button>
        </div>
      </div>

      {/* Warnings */}
      {data?.warnings && data.warnings.length > 0 && (
        <div className="mb-4 p-4 bg-warning/10 border border-warning rounded-lg">
          <p className="text-sm font-semibold text-warning mb-2">
            {lang === "ru" ? "⚠️ Предупреждения:" : "⚠️ Ogohlantirishlar:"}
          </p>
          {data.warnings.map((w, i) => (
            <p key={i} className="text-sm text-text-muted">• {w}</p>
          ))}
        </div>
      )}

      {/* T3-09: Signal Cards */}
      {signals && (signals.lossRiskCount > 0 || signals.promoStuckCount > 0 || signals.pendingApprovals > 0 || signals.unappliedDrafts > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {signals.lossRiskCount > 0 && (
            <Card className="border-danger/30 bg-danger/5">
              <CardBody className="py-3 px-4">
                <p className="text-xs text-danger font-medium">{t("prices_signal_loss_risk")}</p>
                <p className="text-xl font-bold text-danger">{signals.lossRiskCount}</p>
              </CardBody>
            </Card>
          )}
          {signals.promoStuckCount > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <CardBody className="py-3 px-4">
                <p className="text-xs text-warning font-medium">{t("prices_signal_promo_stuck")}</p>
                <p className="text-xl font-bold text-warning">{signals.promoStuckCount}</p>
              </CardBody>
            </Card>
          )}
          {signals.pendingApprovals > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardBody className="py-3 px-4">
                <p className="text-xs text-primary font-medium">{t("prices_signal_pending_approvals")}</p>
                <p className="text-xl font-bold text-primary">{signals.pendingApprovals}</p>
              </CardBody>
            </Card>
          )}
          {signals.unappliedDrafts > 0 && (
            <Card className="border-gray-300 bg-gray-50">
              <CardBody className="py-3 px-4">
                <p className="text-xs text-gray-600 font-medium">{t("prices_signal_unapplied")}</p>
                <p className="text-xl font-bold text-gray-700">{signals.unappliedDrafts}</p>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardBody>
            <p className="text-xs text-text-muted mb-1">
              {lang === "ru" ? "Всего товаров" : "Jami mahsulotlar"}
            </p>
            <p className="text-2xl font-bold text-text-main">
              {data?.summary?.totalSkus ?? 0}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs text-text-muted mb-1">
              {lang === "ru" ? "Заблокировано" : "Bloklangan"}
            </p>
            <p className="text-2xl font-bold text-danger">
              {data?.summary?.blockedCount ?? 0}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs text-text-muted mb-1">
              {lang === "ru" ? "Низкая маржа" : "Past marja"}
            </p>
            <p className="text-2xl font-bold text-warning">
              {data?.summary?.lowMarginCount ?? 0}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs text-text-muted mb-1">
              {lang === "ru" ? "Высокий риск" : "Yuqori xavf"}
            </p>
            <p className="text-2xl font-bold text-danger">
              {data?.summary?.highRiskCount ?? 0}
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[170px] lg:max-w-sm">
              <Input
                type="text"
                label={t("prices_search_placeholder")}
                value={searchSku}
                onChange={(e) => setSearchSku(e.target.value)}
                placeholder="RJ-001..."
              />
            </div>

            <div className="min-w-[170px]">
              <label className="block text-xs font-medium text-text-muted mb-1">
                {lang === "ru" ? "Статус продаж" : "Savdo holati"}
              </label>
              <select
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={saleFilter}
                onChange={(e) => setSaleFilter(e.target.value as SaleFilter)}
              >
                <option value="on_sale">{lang === "ru" ? "Продаются" : "Sotuvda"}</option>
                <option value="not_on_sale">{lang === "ru" ? "Готовы к продаже" : "Sotuvga tayyor"}</option>
                <option value="all">{lang === "ru" ? "Все" : "Hammasi"}</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={showBlockedOnly ? "danger" : "ghost"}
                size="sm"
                onClick={() => setShowBlockedOnly(!showBlockedOnly)}
              >
                {lang === "ru" ? "Заблок." : "Bloklangan"}
              </Button>
              <Button
                variant={showLowMarginOnly ? "warning" : "ghost"}
                size="sm"
                onClick={() => setShowLowMarginOnly(!showLowMarginOnly)}
              >
                {lang === "ru" ? "Низк. маржа" : "Past marja"}
              </Button>
              <Button
                variant={showHighRiskOnly ? "danger" : "ghost"}
                size="sm"
                onClick={() => setShowHighRiskOnly(!showHighRiskOnly)}
              >
                {lang === "ru" ? "Выс. риск" : "Yuqori xavf"}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Pricing Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {lang === "ru" ? "Управление ценами" : "Narxlarni boshqarish"}
          </CardTitle>
          <CardSubtitle>
            {filteredRows.length} {lang === "ru" ? "товаров" : "mahsulot"}
          </CardSubtitle>
        </CardHeader>
        <CardBody>
          <div className="overflow-x-auto overflow-y-visible">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>{lang === "ru" ? "Текущая" : "Joriy"}</TableHead>
                  <TableHead>{lang === "ru" ? "Черновик" : "Qoralama"}</TableHead>
                  <TableHead>{lang === "ru" ? "Себестоимость" : "Tannarx"}</TableHead>
                  <TableHead>{lang === "ru" ? "Маржа" : "Marja"}</TableHead>
                  <TableHead>{t("prices_th_owner")}</TableHead>
                  <TableHead>{t("prices_th_promo_status")}</TableHead>
                  <TableHead>{t("prices_th_approval")}</TableHead>
                  <TableHead>{lang === "ru" ? "Остаток" : "Qoldiq"}</TableHead>
                  <TableHead>{lang === "ru" ? "Рекоменд." : "Tavsiya"}</TableHead>
                  <TableHead>{lang === "ru" ? "Индекс цен" : "Narx indeksi"}</TableHead>
                  <TableHead>{t("prices_th_last_changed")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedFlatRows.map(({ row, mp }) => (
                      <TableRow key={`${row.sku}-${mp.marketplace}`}>
                        <TableCell className="font-mono text-xs">
                          <div>{row.sku}</div>
                          <div className="text-text-muted text-[10px]">{marketplaceNames[mp.marketplace]}</div>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-sm">{"₽"}{formatCurrency(mp.current.price)}</span>
                        </TableCell>
                        {/* T3-09: Draft price inline */}
                        <TableCell>
                          {(() => {
                            const draft = draftItems.find(d => d.sku === row.sku && d.marketplace === mp.marketplace);
                            if (!draft) return <span className="text-xs text-text-muted">—</span>;
                            const diff = draft.newPrice - mp.current.price;
                            const diffPct = mp.current.price > 0 ? (diff / mp.current.price * 100).toFixed(0) : "0";
                            return (
                              <div>
                                <span className="font-semibold text-sm text-primary">{"₽"}{formatCurrency(draft.newPrice)}</span>
                                <div className={`text-xs ${diff < 0 ? "text-danger" : diff > 0 ? "text-success" : "text-text-muted"}`}>
                                  {diff > 0 ? "+" : ""}{diffPct}%
                                </div>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {mp.costPrice ? (
                            <div>
                              <span className="text-sm">{"₽"}{formatCurrency(mp.costPrice)}</span>
                              {mp.current.price > 0 && (
                                <span className="text-xs text-text-muted ml-1">
                                  ({((mp.costPrice / mp.current.price) * 100).toFixed(0)}%)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-text-muted">{lang === "ru" ? "Не указана" : "Ko'rsatilmagan"}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm font-semibold ${
                            mp.guardrails.marginPct < 0.05 ? 'text-danger' :
                            mp.guardrails.marginPct < 0.15 ? 'text-warning' :
                            'text-success'
                          }`}>
                            {(mp.guardrails.marginPct * 100).toFixed(1)}%
                          </span>
                        </TableCell>
                        {/* T3-09: Owner */}
                        <TableCell>
                          {mp.owner ? (
                            <span className="text-xs text-text-main">{mp.owner}</span>
                          ) : (
                            <span className="text-xs text-danger">{t("prices_no_owner")}</span>
                          )}
                        </TableCell>
                        {/* T3-09: Promo Status */}
                        <TableCell>
                          {mp.promos && mp.promos.length > 0 ? (
                            <button
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold hover:bg-amber-100 transition-colors whitespace-nowrap"
                              onClick={() => setPromoModal({ sku: row.sku, marketplace: mp.marketplace, promos: mp.promos! })}
                            >
                              {mp.promos.length}{" "}
                              {lang === "ru"
                                ? mp.promos.length === 1 ? "акция" : mp.promos.length < 5 ? "акции" : "акций"
                                : "aksiya"}{" "}›
                            </button>
                          ) : mp.promoStatus === "active" ? (
                            <Badge variant="warning">{t("prices_promo_active")}</Badge>
                          ) : (
                            <span className="text-xs text-text-muted">{t("prices_promo_none")}</span>
                          )}
                        </TableCell>
                        {/* T3-09: Approval Status */}
                        <TableCell>
                          {mp.approvalStatus === "pending" ? (
                            <Badge variant="warning">{t("prices_approval_pending")}</Badge>
                          ) : mp.approvalStatus === "approved" ? (
                            <Badge variant="success">{t("prices_approval_approved")}</Badge>
                          ) : mp.approvalStatus === "rejected" ? (
                            <Badge variant="danger">{t("prices_approval_rejected")}</Badge>
                          ) : (
                            <span className="text-xs text-text-muted">{t("prices_approval_none")}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-semibold text-sm">{row.stock.availableUnits}</div>
                            <span className={getRiskBadgeClass(row.stock.riskLevel)}>
                              {getRiskLabel(row.stock.riskLevel, lang)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            <div className="font-medium">{"₽"}{formatCurrency(mp.recommended.price)}</div>
                            {mp.recommended.discountPct > 0 && (
                              <div className="text-danger">-{mp.recommended.discountPct}%</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const indexInfo = getPriceIndexInfo(row, mp, lang);
                            const tooltipKey = `${row.sku}-${mp.marketplace}`;
                            const isActive = activeTooltip?.key === tooltipKey;
                            return (
                              <div
                                className="relative inline-block"
                                onMouseEnter={(e) => handleIndexTooltipEnter(tooltipKey, e.currentTarget)}
                                onMouseLeave={() => handleIndexTooltipLeave(tooltipKey)}
                              >
                                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${indexInfo.badgeClass}`}>
                                  {indexInfo.label}
                                </span>
                                <div
                                  className={`pointer-events-none fixed z-40 w-80 max-w-[min(19rem,calc(100vw-3rem))] break-words rounded-xl bg-white border border-gray-200 text-gray-900 p-4 shadow-lg transition-opacity duration-100 ${isActive ? "opacity-100 visible" : "opacity-0 invisible"}`}
                                  style={
                                    isActive
                                      ? { top: activeTooltip?.top ?? 0, left: activeTooltip?.left ?? 0 }
                                      : undefined
                                  }
                                >
                                  <p className="text-sm font-semibold mb-2">{indexInfo.label}</p>
                                  <p className="text-sm text-gray-600 mb-3">{indexInfo.recommendation}</p>
                                  <div className="space-y-1">
                                    {indexInfo.details.map((line, i) => (
                                      <p key={i} className="text-xs text-gray-500">{line}</p>
                                    ))}
                                  </div>
                                  <p className="text-xs text-primary mt-3">
                                    {lang === "ru" ? "Как рассчитываем индекс" : "Indeks qanday hisoblanadi"}
                                  </p>
                                </div>
                              </div>
                            );
                          })()}
                        </TableCell>
                        {/* T3-09: Last Changed */}
                        <TableCell>
                          {mp.lastChanged ? (
                            <button
                              className="text-xs text-primary hover:underline"
                              onClick={() => openHistoryModal(row.sku, mp.marketplace)}
                            >
                              {formatTimeAgo(mp.lastChanged, lang)}
                            </button>
                          ) : (
                            <span className="text-xs text-text-muted">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openPriceEditor(row, mp)}
                              className="text-xs"
                            >
                              {"✎"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openHistoryModal(row.sku, mp.marketplace)}
                              className="text-xs"
                              title={t("prices_history_title")}
                            >
                              {"⏱"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredRows.length === 0 && (
            <div className="text-center py-12">
              <p className="text-text-muted">
                {lang === "ru" ? "Нет данных по выбранным фильтрам" : "Tanlangan filtrlarda ma'lumotlar yo'q"}
              </p>
            </div>
          )}

          {filteredRows.length > 0 && (
            <div className="px-6 py-4 border-t border-border">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-muted">
                  {lang === "ru" ? "Страница" : "Sahifa"} {safePage} / {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                  >
                    {lang === "ru" ? "Назад" : "Orqaga"}
                  </Button>
                  <div className="flex items-center gap-1">
                    {pageNumbers.map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1 rounded text-sm ${
                          page === safePage
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
                    disabled={safePage === totalPages}
                  >
                    {lang === "ru" ? "Далее" : "Oldinga"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Price Editor Modal — with mandatory reason (T3-09) */}
      {editor && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closePriceEditor}
        >
          <Card
            className="w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{lang === "ru" ? "Редактор цены" : "Narx muharriri"}</CardTitle>
                  <CardSubtitle>{editor.sku} @ {marketplaceNames[editor.marketplace]}</CardSubtitle>
                </div>
                <button
                  onClick={closePriceEditor}
                  className="text-text-muted hover:text-text-main text-xl"
                >
                  {"✕"}
                </button>
              </div>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <div className="p-3 bg-background rounded">
                  <p className="text-xs text-text-muted mb-2">{lang === "ru" ? "Текущие:" : "Joriy:"}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-text-muted">{lang === "ru" ? "Цена:" : "Narx:"}</span>
                      <span className="ml-2 font-semibold">{"₽"}{formatCurrency(editor.currentPrice)}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">{lang === "ru" ? "Скидка:" : "Chegirma:"}</span>
                      <span className="ml-2 font-semibold">{editor.currentDiscount}%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <Input
                    type="number"
                    label={lang === "ru" ? "Новая цена (₽)" : "Yangi narx (₽)"}
                    value={editor.newPrice}
                    onChange={(e) => setEditor({...editor, newPrice: parseFloat(e.target.value) || 0})}
                  />
                  <p className="text-xs text-text-muted mt-1">
                    {lang === "ru" ? "Мин:" : "Min:"} {"₽"}{formatCurrency(editor.minPrice)} |
                    {lang === "ru" ? " Цель:" : " Maqsad:"} {"₽"}{formatCurrency(editor.targetPrice)}
                  </p>
                </div>

                <div>
                  <Input
                    type="number"
                    label={lang === "ru" ? "Новая скидка (%)" : "Yangi chegirma (%)"}
                    value={editor.newDiscount}
                    onChange={(e) => setEditor({...editor, newDiscount: parseFloat(e.target.value) || 0})}
                    min={0}
                    max={100}
                  />
                </div>

                {/* T3-09: Mandatory reason */}
                <div>
                  <Input
                    type="text"
                    label={t("prices_editor_reason")}
                    value={editor.reason}
                    onChange={(e) => setEditor({...editor, reason: e.target.value})}
                    placeholder={t("prices_editor_reason_placeholder")}
                  />
                  {editor.reason.trim() === "" && (
                    <p className="text-xs text-danger mt-1">{t("prices_editor_reason_required")}</p>
                  )}
                </div>

                {editor.newPrice < editor.minPrice && (
                  <div className="p-3 bg-danger/10 border border-danger rounded">
                    <p className="text-sm text-danger font-semibold">
                      {"⚠️"} {lang === "ru" ? "Цена ниже минимальной!" : "Narx minimaldan past!"}
                    </p>
                    <p className="text-xs text-danger mt-1">
                      {t("prices_approval_needed")}
                    </p>
                  </div>
                )}

                {editor.currentPrice > 0 && editor.newPrice > 0 && ((editor.currentPrice - editor.newPrice) / editor.currentPrice) > 0.15 && (
                  <div className="p-3 bg-warning/10 border border-warning rounded">
                    <p className="text-sm text-warning font-semibold">
                      {"⚠️"} {lang === "ru" ? "Снижение цены более 15%" : "Narx 15% dan ortiq pasaygan"}
                    </p>
                    <p className="text-xs text-warning mt-1">
                      {t("prices_approval_needed")}
                    </p>
                  </div>
                )}

                {editor.newDiscount > 30 && (
                  <div className="p-3 bg-warning/10 border border-warning rounded">
                    <p className="text-sm text-warning">
                      {"⚠️"} {lang === "ru" ? "Очень большая скидка" : "Juda katta chegirma"}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button
                    variant="primary"
                    onClick={addToDraft}
                    className="flex-1"
                    disabled={editor.reason.trim() === ""}
                  >
                    {lang === "ru" ? "Добавить в черновик" : "Qo'shish"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={closePriceEditor}
                  >
                    {lang === "ru" ? "Отмена" : "Bekor"}
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Price Change History Modal (T3-09) */}
      {historyModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setHistoryModal(null)}
        >
          <Card
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{t("prices_history_title")}</CardTitle>
                  <CardSubtitle>{historyModal.sku} @ {marketplaceNames[historyModal.marketplace]}</CardSubtitle>
                </div>
                <button
                  onClick={() => setHistoryModal(null)}
                  className="text-text-muted hover:text-text-main text-xl"
                >
                  {"✕"}
                </button>
              </div>
            </CardHeader>
            <CardBody>
              {historyLoading ? (
                <p className="text-text-muted text-center py-8">{lang === "ru" ? "Загрузка..." : "Yuklanmoqda..."}</p>
              ) : historyData.length === 0 ? (
                <p className="text-text-muted text-center py-8">{t("prices_history_empty")}</p>
              ) : (
                <div className="space-y-3">
                  {historyData.map((entry) => (
                    <div key={entry.id} className="p-3 border border-border rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div className="text-xs text-text-muted">
                          {new Date(entry.changedAt).toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ")}
                        </div>
                        {entry.approvalStatus && (
                          <Badge variant={entry.approvalStatus === "pending" ? "warning" : entry.approvalStatus === "approved" ? "success" : "danger"}>
                            {entry.approvalStatus === "pending" ? t("prices_approval_pending") : entry.approvalStatus === "approved" ? t("prices_approval_approved") : t("prices_approval_rejected")}
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-text-muted text-xs">{t("prices_history_old")}:</span>
                          <span className="ml-1 font-medium">{"₽"}{formatCurrency(entry.oldPrice)}</span>
                        </div>
                        <div>
                          <span className="text-text-muted text-xs">{t("prices_history_new")}:</span>
                          <span className="ml-1 font-medium">{"₽"}{formatCurrency(entry.newPrice)}</span>
                        </div>
                      </div>
                      <div className="mt-2 text-xs">
                        <span className="text-text-muted">{t("prices_history_by")}:</span>
                        <span className="ml-1">{entry.changedBy}</span>
                      </div>
                      <div className="mt-1 text-xs">
                        <span className="text-text-muted">{t("prices_history_reason")}:</span>
                        <span className="ml-1">{entry.reason}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Promo Detail Modal */}
      {promoModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setPromoModal(null)}
        >
          <Card
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>
                    {lang === "ru" ? "Акции" : "Aksiyalar"}
                  </CardTitle>
                  <CardSubtitle>
                    {promoModal.sku} @ {marketplaceNames[promoModal.marketplace]}
                    {" · "}
                    {promoModal.promos.length}{" "}
                    {lang === "ru"
                      ? promoModal.promos.length === 1 ? "акция" : promoModal.promos.length < 5 ? "акции" : "акций"
                      : "aksiya"}
                  </CardSubtitle>
                </div>
                <button
                  onClick={() => setPromoModal(null)}
                  className="text-text-muted hover:text-text-main text-xl"
                >
                  {"✕"}
                </button>
              </div>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                {promoModal.promos.map((promo, idx) => {
                  const actionTypeLabel: Record<string, { ru: string; uz: string }> = {
                    DISCOUNT_ON_STOCK: { ru: "Скидка на остаток", uz: "Qoldiqqa chegirma" },
                    STOCK_DISCOUNT: { ru: "Скидка на сток", uz: "Qoldiqqa chegirma" },
                    SALE: { ru: "Распродажа", uz: "Chegirma savdosi" },
                    COUPON: { ru: "Купон", uz: "Kupon" },
                    BUNDLE: { ru: "Комплект", uz: "To'plam" },
                    MARKETPLACE_MULTI_LEVEL_DISCOUNT_ON_AMOUNT: { ru: "Эластичный бустинг", uz: "Elastik boosting" },
                    MULTI_LEVEL_DISCOUNT: { ru: "Многоуровневая скидка", uz: "Ko'p bosqichli chegirma" },
                    PROMO_CODE: { ru: "Промокод", uz: "Promokod" },
                    FLASH_SALE: { ru: "Флеш-распродажа", uz: "Flash-sotuv" },
                    GIFT: { ru: "Подарок", uz: "Sovg'a" },
                  };
                  const typeKey = promo.actionType?.toUpperCase() || "";
                  const typeLabel = actionTypeLabel[typeKey]
                    ? (lang === "ru" ? actionTypeLabel[typeKey].ru : actionTypeLabel[typeKey].uz)
                    : promo.actionType || (lang === "ru" ? "Акция" : "Aksiya");

                  const formatDate = (iso?: string) => {
                    if (!iso) return "—";
                    return new Date(iso).toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ", {
                      day: "numeric", month: "short", year: "numeric"
                    });
                  };

                  return (
                    <div key={promo.actionId ?? idx} className="p-4 border border-amber-200 bg-amber-50 rounded-lg">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-semibold text-text-main leading-snug">{promo.title}</p>
                        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 font-medium">
                          {typeLabel}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
                        <div>
                          <span className="text-text-muted">{lang === "ru" ? "Начало:" : "Boshlanish:"}</span>
                          <span className="ml-1 text-text-main">{formatDate(promo.dateStart)}</span>
                        </div>
                        <div>
                          <span className="text-text-muted">{lang === "ru" ? "Конец:" : "Tugash:"}</span>
                          <span className="ml-1 text-text-main">{formatDate(promo.dateEnd)}</span>
                        </div>
                        {promo.actionPrice != null && (
                          <div>
                            <span className="text-text-muted">{lang === "ru" ? "Цена акции:" : "Aksiya narxi:"}</span>
                            <span className="ml-1 font-semibold text-text-main">₽{formatCurrency(promo.actionPrice)}</span>
                          </div>
                        )}
                        {promo.discountPct != null && (
                          <div>
                            <span className="text-text-muted">{lang === "ru" ? "Скидка:" : "Chegirma:"}</span>
                            <span className="ml-1 font-semibold text-danger">-{promo.discountPct.toFixed(0)}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Drafts Modal */}
      {showDrafts && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowDrafts(false)}
        >
          <Card
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{lang === "ru" ? "Черновик" : "Qoralama"}</CardTitle>
                  <CardSubtitle>{draftItems.length} {lang === "ru" ? "изменений" : "o'zgarish"}</CardSubtitle>
                </div>
                <button
                  onClick={() => setShowDrafts(false)}
                  className="text-text-muted hover:text-text-main text-xl"
                >
                  {"✕"}
                </button>
              </div>
            </CardHeader>
            <CardBody>
              {draftItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted">
                    {lang === "ru" ? "Нет изменений" : "O'zgarishlar yo'q"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {draftItems.map((item, idx) => (
                    <div key={idx} className="p-4 border border-border rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-sm">{item.sku}</p>
                          <p className="text-xs text-text-muted">{marketplaceNames[item.marketplace]}</p>
                        </div>
                        <button
                          onClick={() => removeDraftItem(item.sku, item.marketplace)}
                          className="text-danger hover:text-danger/80 text-sm"
                        >
                          {"✕"}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-text-muted text-xs">{lang === "ru" ? "Цена:" : "Narx:"}</span>
                          <span className="ml-2 font-semibold">{"₽"}{formatCurrency(item.newPrice)}</span>
                        </div>
                        <div>
                          <span className="text-text-muted text-xs">{lang === "ru" ? "Скидка:" : "Cheg.:"}</span>
                          <span className="ml-2 font-semibold">{item.newDiscount}%</span>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-text-muted">
                        <span>{t("prices_history_reason")}:</span>
                        <span className="ml-1 text-text-main">{item.reason}</span>
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="primary"
                      onClick={applyChanges}
                      className="flex-1"
                    >
                      {lang === "ru" ? "Применить" : "Qo'llash"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setDraftItems([])}
                    >
                      {lang === "ru" ? "Очистить" : "Tozalash"}
                    </Button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </Layout>
  );
}
