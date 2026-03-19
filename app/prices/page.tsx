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
    case 'CRITICAL': return 'bg-danger text-white px-2 py-1 rounded text-xs font-semibold';
    case 'HIGH': return 'bg-danger text-white px-2 py-1 rounded text-xs font-semibold';
    case 'MED': return 'bg-warning text-white px-2 py-1 rounded text-xs font-semibold';
    case 'LOW': return 'bg-success text-white px-2 py-1 rounded text-xs font-semibold';
    default: return 'bg-gray-400 text-white px-2 py-1 rounded text-xs font-semibold';
  }
};

const getRiskLabel = (risk: string, lang: Language) => {
  const ru: Record<string, string> = {
    CRITICAL: "\u041A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439",
    HIGH: "\u0412\u044B\u0441\u043E\u043A\u0438\u0439",
    MED: "\u0421\u0440\u0435\u0434\u043D\u0438\u0439",
    LOW: "\u041D\u0438\u0437\u043A\u0438\u0439",
    NONE: "\u041D\u0435\u0442 \u0440\u0438\u0441\u043A\u0430",
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

function getFallbackIndexPairs(mp: MarketplacePricing): PriceIndexPair[] {
  if (mp.current.price > 0 && mp.recommended.price > 0) {
    return [
      {
        ownPrice: mp.current.price,
        marketPrice: mp.recommended.price,
        source: "recommended_proxy",
      },
    ];
  }
  return [];
}

function getPriceIndexInfo(
  row: PricingRow,
  mp: MarketplacePricing,
  lang: Language
): PriceIndexInfo {
  if (row.stock.availableUnits <= 0) {
    return {
      label: lang === "ru" ? "\u0411\u0435\u0437 \u0438\u043D\u0434\u0435\u043A\u0441\u0430" : "Indekssiz",
      badgeClass: "bg-gray-100 text-gray-700 border border-gray-200",
      recommendation: lang === "ru" ? "\u041D\u0435\u0442 \u043E\u0441\u0442\u0430\u0442\u043A\u043E\u0432, \u0438\u043D\u0434\u0435\u043A\u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D." : "Qoldiq yo'q, indeks mavjud emas.",
      details: [
        lang === "ru"
          ? "\u041F\u043E\u0441\u043B\u0435 \u043F\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u0441\u043A\u043B\u0430\u0434\u0430 \u0438\u043D\u0434\u0435\u043A\u0441 \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438."
          : "Ombor to'ldirilgach indeks avtomatik paydo bo'ladi.",
      ],
    };
  }

  const inputPairs = mp.priceIndexPairs || getFallbackIndexPairs(mp);
  const indexResult = evaluateOzonPriceIndex(inputPairs);

  if (indexResult.state === "NONE") {
    return {
      label: lang === "ru" ? "\u0411\u0435\u0437 \u0438\u043D\u0434\u0435\u043A\u0441\u0430" : "Indekssiz",
      badgeClass: "bg-gray-100 text-gray-700 border border-gray-200",
      recommendation:
        lang === "ru"
          ? "\u0414\u043B\u044F \u0440\u0430\u0441\u0447\u0435\u0442\u0430 \u0438\u043D\u0434\u0435\u043A\u0441\u0430 \u043D\u0435\u0442 \u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0445 \u043F\u0430\u0440 \u0446\u0435\u043D."
          : "Indeksni hisoblash uchun narx juftliklari yo'q.",
      details: [],
    };
  }

  const ratioDetails = indexResult.usedPairs.map((pair, idx) => {
    const ratio = pair.ownPrice / pair.marketPrice;
    return `${lang === "ru" ? "\u041F\u0430\u0440\u0430" : "Juft"} ${idx + 1}: ${ratio.toFixed(3)} (${formatCurrency(pair.ownPrice)}/${formatCurrency(pair.marketPrice)})`;
  });
  const maxGoodPrice = Math.floor(
    Math.min(...indexResult.usedPairs.map((pair) => pair.marketPrice * 1.03))
  );
  const maxModeratePrice = Math.floor(
    Math.min(...indexResult.usedPairs.map((pair) => pair.marketPrice * 1.1))
  );
  const currentPrice = Math.floor(mp.current.price);
  const indexGuidance =
    lang === "ru"
      ? [
          `\u0422\u0435\u043A\u0443\u0449\u0430\u044F \u0446\u0435\u043D\u0430: \u20BD${formatCurrency(currentPrice)}`,
          `\u0413\u0440\u0430\u043D\u0438\u0446\u0430 \u00AB\u0412\u044B\u0433\u043E\u0434\u043D\u044B\u0439\u00BB: \u2264 \u20BD${formatCurrency(maxGoodPrice)}`,
          `\u0413\u0440\u0430\u043D\u0438\u0446\u0430 \u00AB\u0423\u043C\u0435\u0440\u0435\u043D\u043D\u044B\u0439\u00BB: \u2264 \u20BD${formatCurrency(maxModeratePrice)}`,
        ]
      : [
          `Joriy narx: \u20BD${formatCurrency(currentPrice)}`,
          `Yaxshi zona: \u2264 \u20BD${formatCurrency(maxGoodPrice)}`,
          `O'rtacha zona: \u2264 \u20BD${formatCurrency(maxModeratePrice)}`,
        ];

  if (indexResult.state === "BAD") {
    return {
      label: lang === "ru" ? "\u041D\u0435\u0432\u044B\u0433\u043E\u0434\u043D\u044B\u0439" : "Nomaqbul",
      badgeClass: "bg-red-50 text-red-700 border border-red-200",
      recommendation:
        lang === "ru"
          ? `\u0418\u043D\u0434\u0435\u043A\u0441 \u043A\u0440\u0430\u0441\u043D\u044B\u0439: \u0441\u043D\u0438\u0437\u044C\u0442\u0435 \u0446\u0435\u043D\u0443 \u043C\u0438\u043D\u0438\u043C\u0443\u043C \u0434\u043E \u20BD${formatCurrency(maxModeratePrice)}, \u0430 \u043B\u0443\u0447\u0448\u0435 \u2014 \u0434\u043E \u20BD${formatCurrency(maxGoodPrice)}.`
          : "Narxni xaridor uchun maqbulroq qilish tavsiya etiladi.",
      details: [...ratioDetails, ...indexGuidance],
    };
  }

  if (indexResult.state === "MODERATE") {
    return {
      label: lang === "ru" ? "\u0423\u043C\u0435\u0440\u0435\u043D\u043D\u044B\u0439" : "O'rtacha",
      badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
      recommendation:
        lang === "ru"
          ? `\u0418\u043D\u0434\u0435\u043A\u0441 \u0436\u0451\u043B\u0442\u044B\u0439: \u0434\u043B\u044F \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0430 \u0432 \u00AB\u0412\u044B\u0433\u043E\u0434\u043D\u044B\u0439\u00BB \u0434\u0435\u0440\u0436\u0438\u0442\u0435 \u0446\u0435\u043D\u0443 \u043D\u0435 \u0432\u044B\u0448\u0435 \u20BD${formatCurrency(maxGoodPrice)}.`
          : "Narxni ozgina sozlab indeksni yaxshilash mumkin.",
      details: [...ratioDetails, ...indexGuidance],
    };
  }

  return {
    label: lang === "ru" ? "\u0412\u044B\u0433\u043E\u0434\u043D\u044B\u0439" : "Maqbul",
    badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    recommendation:
      lang === "ru"
        ? `\u0418\u043D\u0434\u0435\u043A\u0441 \u0437\u0435\u043B\u0451\u043D\u044B\u0439: \u0442\u0435\u043A\u0443\u0449\u0430\u044F \u0446\u0435\u043D\u0430 \u0432 \u0446\u0435\u043B\u0435\u0432\u043E\u043C \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0435 (\u0432\u0435\u0440\u0445\u043D\u044F\u044F \u0433\u0440\u0430\u043D\u0438\u0446\u0430 \u20BD${formatCurrency(maxGoodPrice)}).`
        : "A'lo indeks. Joriy strategiyani davom ettirish mumkin.",
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
}

export default function PricesPage() {
  const { enabledConnections } = useEnabledConnections();
  const [lang, setLang] = useState<Language>("ru");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PricingDashboardResponse | null>(null);
  
  // Filters
  const [searchSku, setSearchSku] = useState("");
  const [saleFilter, setSaleFilter] = useState<SaleFilter>("on_sale");
  const [marketplaceFilter, setMarketplaceFilter] = useState<Marketplace | "all">("all");
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);
  const [showLowMarginOnly, setShowLowMarginOnly] = useState(false);
  const [showHighRiskOnly, setShowHighRiskOnly] = useState(false);
  
  // Price editor modal
  const [editor, setEditor] = useState<PriceEditorState | null>(null);
  
  // Drafts
  const [draftItems, setDraftItems] = useState<Array<{
    sku: string;
    marketplace: Marketplace;
    newPrice: number;
    newDiscount: number;
  }>>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<TooltipPlacement | null>(null);
  const tooltipHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (marketplaceFilter === "all") return;
    if (!connectedMarketplaceIds.includes(marketplaceFilter)) {
      setMarketplaceFilter("all");
    }
  }, [connectedMarketplaceIds, marketplaceFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchSku, marketplaceFilter, saleFilter, showBlockedOnly, showLowMarginOnly, showHighRiskOnly]);

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
      const response = await fetch('/api/pricing');
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Error loading pricing data:", error);
    } finally {
      setLoading(false);
    }
  };

  const openPriceEditor = (row: PricingRow, mp: MarketplacePricing) => {
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
    });
  };

  const closePriceEditor = () => {
    setEditor(null);
  };

  const addToDraft = () => {
    if (!editor) return;

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
      };
      setDraftItems(updated);
    } else {
      setDraftItems([...draftItems, {
        sku: editor.sku,
        marketplace: editor.marketplace,
        newPrice: editor.newPrice,
        newDiscount: editor.newDiscount,
      }]);
    }

    closePriceEditor();
  };

  const removeDraftItem = (sku: string, marketplace: Marketplace) => {
    setDraftItems(draftItems.filter(d => !(d.sku === sku && d.marketplace === marketplace)));
  };

  const applyChanges = async () => {
    if (draftItems.length === 0) {
      alert(lang === "ru" ? "\u041D\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0434\u043B\u044F \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u0438\u044F" : "Qo'llash uchun o'zgarishlar yo'q");
      return;
    }

    alert(
      (lang === "ru" ? "\u041F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439:\n" : "O'zgarishlarni qo'llash:\n") +
      draftItems.map(d => `${d.sku} @ ${marketplaceNames[d.marketplace]}: в‚Ѕ${d.newPrice} (${d.newDiscount}%)`).join("\n") +
      "\n\n" +
      (lang === "ru" ? "\u0412 MVP \u044D\u0442\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043B\u0430\u043D. \u0420\u0435\u0430\u043B\u044C\u043D\u044B\u0435 API \u0432\u044B\u0437\u043E\u0432\u044B \u043D\u0435 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u044F\u0442\u0441\u044F." : "MVP da bu faqat reja. Haqiqiy API chaqiruvlar yo'q.")
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
      const mps = row.marketplaces.filter(
        (m) => marketplaceFilter === "all" || m.marketplace === marketplaceFilter
      );
      for (const mp of mps) {
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
  }, [data, searchSku, marketplaceFilter, saleFilter, showBlockedOnly, showLowMarginOnly, showHighRiskOnly]);

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
          <p className="text-text-muted">{lang === "ru" ? "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." : "Yuklanmoqda..."}</p>
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


  return (
    <Layout>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {lang === "ru" ? "\u0426\u0435\u043D\u044B \u0438 \u0441\u043A\u0438\u0434\u043A\u0438" : "Narxlar va chegirmalar"}
          </h1>
          <p className="page-subtitle">
            {lang === "ru" 
              ? "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0446\u0435\u043D\u0430\u043C\u0438 \u0441 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u043C\u0438 \u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0430\u0446\u0438\u044F\u043C\u0438"
              : "Avtomatik tavsiyalar bilan narxlarni boshqarish"
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {draftItems.length > 0 && (
            <Badge variant="primary">
              {draftItems.length} {lang === "ru" ? "\u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439" : "o'zgarish"}
            </Badge>
          )}
          <Button
            variant={draftItems.length > 0 ? "primary" : "ghost"}
            onClick={() => setShowDrafts(true)}
          >
            {lang === "ru" ? "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A\u0438" : "Qoralamalar"} ({draftItems.length})
          </Button>
        </div>
      </div>

      {/* Warnings */}
      {data?.warnings && data.warnings.length > 0 && (
        <div className="mb-4 p-4 bg-warning/10 border border-warning rounded-lg">
          <p className="text-sm font-semibold text-warning mb-2">
            {lang === "ru" ? "\u26A0\uFE0F \u041F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u044F:" : "\u26A0\uFE0F Ogohlantirishlar:"}
          </p>
          {data.warnings.map((w, i) => (
            <p key={i} className="text-sm text-text-muted">вЂў {w}</p>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardBody>
            <p className="text-xs text-text-muted mb-1">
              {lang === "ru" ? "\u0412\u0441\u0435\u0433\u043E \u0442\u043E\u0432\u0430\u0440\u043E\u0432" : "Jami mahsulotlar"}
            </p>
            <p className="text-2xl font-bold text-text-main">
              {data?.summary?.totalSkus ?? 0}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs text-text-muted mb-1">
              {lang === "ru" ? "\u0417\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E" : "Bloklangan"}
            </p>
            <p className="text-2xl font-bold text-danger">
              {data?.summary?.blockedCount ?? 0}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs text-text-muted mb-1">
              {lang === "ru" ? "\u041D\u0438\u0437\u043A\u0430\u044F \u043C\u0430\u0440\u0436\u0430" : "Past marja"}
            </p>
            <p className="text-2xl font-bold text-warning">
              {data?.summary?.lowMarginCount ?? 0}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs text-text-muted mb-1">
              {lang === "ru" ? "\u0412\u044B\u0441\u043E\u043A\u0438\u0439 \u0440\u0438\u0441\u043A" : "Yuqori xavf"}
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
                label={lang === "ru" ? "\u041F\u043E\u0438\u0441\u043A \u043F\u043E SKU" : "SKU bo'yicha qidirish"}
                value={searchSku}
                onChange={(e) => setSearchSku(e.target.value)}
                placeholder="RJ-001..."
              />
            </div>

            <div className="min-w-[170px]">
              <label className="block text-xs font-medium text-text-muted mb-1">
                {lang === "ru" ? "\u0421\u0442\u0430\u0442\u0443\u0441 \u043F\u0440\u043E\u0434\u0430\u0436" : "Savdo holati"}
              </label>
              <select
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={saleFilter}
                onChange={(e) => setSaleFilter(e.target.value as SaleFilter)}
              >
                <option value="on_sale">{lang === "ru" ? "\u041F\u0440\u043E\u0434\u0430\u044E\u0442\u0441\u044F" : "Sotuvda"}</option>
                <option value="not_on_sale">{lang === "ru" ? "\u0413\u043E\u0442\u043E\u0432\u044B \u043A \u043F\u0440\u043E\u0434\u0430\u0436\u0435" : "Sotuvga tayyor"}</option>
                <option value="all">{lang === "ru" ? "\u0412\u0441\u0435" : "Hammasi"}</option>
              </select>
            </div>

            <div className="min-w-[150px]">
              <label className="block text-xs font-medium text-text-muted mb-1">
                {lang === "ru" ? "\u041F\u043B\u043E\u0449\u0430\u0434\u043A\u0430" : "Platforma"}
              </label>
              <select
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={marketplaceFilter}
                onChange={(e) => setMarketplaceFilter(e.target.value as any)}
              >
                <option value="all">{lang === "ru" ? "\u0412\u0441\u0435" : "Hammasi"}</option>
                {connectedMarketplaceIds.map((id) => (
                  <option key={id} value={id}>
                    {id === "ym" ? "Yandex Market" : marketplaceNames[id]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={showBlockedOnly ? "danger" : "ghost"}
                size="sm"
                onClick={() => setShowBlockedOnly(!showBlockedOnly)}
              >
                {lang === "ru" ? "\u0417\u0430\u0431\u043B\u043E\u043A." : "Bloklangan"}
              </Button>
              <Button
                variant={showLowMarginOnly ? "warning" : "ghost"}
                size="sm"
                onClick={() => setShowLowMarginOnly(!showLowMarginOnly)}
              >
                {lang === "ru" ? "\u041D\u0438\u0437\u043A. \u043C\u0430\u0440\u0436\u0430" : "Past marja"}
              </Button>
              <Button
                variant={showHighRiskOnly ? "danger" : "ghost"}
                size="sm"
                onClick={() => setShowHighRiskOnly(!showHighRiskOnly)}
              >
                {lang === "ru" ? "\u0412\u044B\u0441. \u0440\u0438\u0441\u043A" : "Yuqori xavf"}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Pricing Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {lang === "ru" ? "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0446\u0435\u043D\u0430\u043C\u0438" : "Narxlarni boshqarish"}
          </CardTitle>
          <CardSubtitle>
            {filteredRows.length} {lang === "ru" ? "\u0442\u043E\u0432\u0430\u0440\u043E\u0432" : "mahsulot"}
          </CardSubtitle>
        </CardHeader>
        <CardBody>
          <div className="overflow-x-auto overflow-y-visible">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>{lang === "ru" ? "\u041F\u043B\u043E\u0449\u0430\u0434\u043A\u0430" : "Platforma"}</TableHead>
                  <TableHead>{lang === "ru" ? "\u0422\u0435\u043A\u0443\u0449\u0430\u044F" : "Joriy"}</TableHead>
                  <TableHead>{lang === "ru" ? "\u0421\u043A\u0438\u0434\u043A\u0430" : "Cheg."}</TableHead>
                  <TableHead>{lang === "ru" ? "\u041C\u0438\u043D" : "Min"}</TableHead>
                  <TableHead>{lang === "ru" ? "\u041C\u0430\u0440\u0436\u0430" : "Marja"}</TableHead>
                  <TableHead>{lang === "ru" ? "\u041E\u0441\u0442\u0430\u0442\u043E\u043A" : "Qoldiq"}</TableHead>
                  <TableHead>{lang === "ru" ? "\u041F\u0440\u043E\u0433\u043D\u043E\u0437" : "Prognoz"}</TableHead>
                  <TableHead>{lang === "ru" ? "\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434." : "Tavsiya"}</TableHead>
                  <TableHead>{lang === "ru" ? "\u0418\u043D\u0434\u0435\u043A\u0441 \u0446\u0435\u043D" : "Narx indeksi"}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedFlatRows.map(({ row, mp }) => (
                      <TableRow key={`${row.sku}-${mp.marketplace}`}>
                        <TableCell className="font-mono text-xs">
                          {row.sku}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-medium">{marketplaceNames[mp.marketplace]}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-sm">{"\u20BD"}{formatCurrency(mp.current.price)}</span>
                        </TableCell>
                        <TableCell>
                          {mp.current.discountPct ? (
                            <span className="text-xs text-danger font-medium">-{mp.current.discountPct}%</span>
                          ) : (
                            <span className="text-xs text-text-muted">{"\u2014"}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-text-muted">
                            {"\u20BD"}{formatCurrency(mp.guardrails.minPrice)}
                          </span>
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
                        <TableCell>
                          <div>
                            <div className="font-semibold text-sm">{row.stock.availableUnits}</div>
                            <span className={getRiskBadgeClass(row.stock.riskLevel)}>
                              {getRiskLabel(row.stock.riskLevel, lang)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{row.forecast.daily.toFixed(1)}/{lang === "ru" ? "\u0434" : "k"}</span>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            <div className="font-medium">{"\u20BD"}{formatCurrency(mp.recommended.price)}</div>
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
                                  className={`pointer-events-none fixed z-40 w-80 max-w-[min(19rem,calc(100vw-3rem))] break-words rounded-xl bg-gray-900 text-white p-4 shadow-xl transition-opacity duration-100 ${isActive ? "opacity-100 visible" : "opacity-0 invisible"}`}
                                  style={
                                    isActive
                                      ? { top: activeTooltip?.top ?? 0, left: activeTooltip?.left ?? 0 }
                                      : undefined
                                  }
                                >
                                  <p className="text-sm font-semibold mb-2">{indexInfo.label}</p>
                                  <p className="text-sm text-gray-100 mb-3">{indexInfo.recommendation}</p>
                                  <div className="space-y-1">
                                    {indexInfo.details.map((line, i) => (
                                      <p key={i} className="text-xs text-gray-300">{line}</p>
                                    ))}
                                  </div>
                                  <p className="text-xs text-sky-300 mt-3">
                                    {lang === "ru" ? "\u041A\u0430\u043A \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u044B\u0432\u0430\u0435\u043C \u0438\u043D\u0434\u0435\u043A\u0441" : "Indeks qanday hisoblanadi"}
                                  </p>
                                </div>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPriceEditor(row, mp)}
                            className="text-xs"
                          >
                            {"\u270E"}
                          </Button>
                        </TableCell>
                      </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredRows.length === 0 && (
            <div className="text-center py-12">
              <p className="text-text-muted">
                {lang === "ru" ? "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u043C \u0444\u0438\u043B\u044C\u0442\u0440\u0430\u043C" : "Tanlangan filtrlarda ma'lumotlar yo'q"}
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

      {/* Price Editor Modal */}
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
                  <CardTitle>{lang === "ru" ? "\u0420\u0435\u0434\u0430\u043A\u0442\u043E\u0440 \u0446\u0435\u043D\u044B" : "Narx muharriri"}</CardTitle>
                  <CardSubtitle>{editor.sku} @ {marketplaceNames[editor.marketplace]}</CardSubtitle>
                </div>
                <button 
                  onClick={closePriceEditor}
                  className="text-text-muted hover:text-text-main text-xl"
                >
                  {"\u2715"}
                </button>
              </div>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <div className="p-3 bg-background rounded">
                  <p className="text-xs text-text-muted mb-2">{lang === "ru" ? "\u0422\u0435\u043A\u0443\u0449\u0438\u0435:" : "Joriy:"}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-text-muted">{lang === "ru" ? "\u0426\u0435\u043D\u0430:" : "Narx:"}</span>
                      <span className="ml-2 font-semibold">{"\u20BD"}{formatCurrency(editor.currentPrice)}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">{lang === "ru" ? "\u0421\u043A\u0438\u0434\u043A\u0430:" : "Chegirma:"}</span>
                      <span className="ml-2 font-semibold">{editor.currentDiscount}%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <Input
                    type="number"
                    label={lang === "ru" ? "\u041D\u043E\u0432\u0430\u044F \u0446\u0435\u043D\u0430 (\u20BD)" : "Yangi narx (\u20BD)"}
                    value={editor.newPrice}
                    onChange={(e) => setEditor({...editor, newPrice: parseFloat(e.target.value) || 0})}
                  />
                  <p className="text-xs text-text-muted mt-1">
                    {lang === "ru" ? "\u041C\u0438\u043D:" : "Min:"} {"\u20BD"}{formatCurrency(editor.minPrice)} | 
                    {lang === "ru" ? " \u0426\u0435\u043B\u044C:" : " Maqsad:"} {"\u20BD"}{formatCurrency(editor.targetPrice)}
                  </p>
                </div>

                <div>
                  <Input
                    type="number"
                    label={lang === "ru" ? "\u041D\u043E\u0432\u0430\u044F \u0441\u043A\u0438\u0434\u043A\u0430 (%)" : "Yangi chegirma (%)"}
                    value={editor.newDiscount}
                    onChange={(e) => setEditor({...editor, newDiscount: parseFloat(e.target.value) || 0})}
                    min={0}
                    max={100}
                  />
                </div>

                {editor.newPrice < editor.minPrice && (
                  <div className="p-3 bg-danger/10 border border-danger rounded">
                    <p className="text-sm text-danger font-semibold">
                      {"\u26A0\uFE0F"} {lang === "ru" ? "\u0426\u0435\u043D\u0430 \u043D\u0438\u0436\u0435 \u043C\u0438\u043D\u0438\u043C\u0430\u043B\u044C\u043D\u043E\u0439!" : "Narx minimaldan past!"}
                    </p>
                  </div>
                )}

                {editor.newDiscount > 30 && (
                  <div className="p-3 bg-warning/10 border border-warning rounded">
                    <p className="text-sm text-warning">
                      {"\u26A0\uFE0F"} {lang === "ru" ? "\u041E\u0447\u0435\u043D\u044C \u0431\u043E\u043B\u044C\u0448\u0430\u044F \u0441\u043A\u0438\u0434\u043A\u0430" : "Juda katta chegirma"}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button
                    variant="primary"
                    onClick={addToDraft}
                    className="flex-1"
                  >
                    {lang === "ru" ? "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A" : "Qo'shish"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={closePriceEditor}
                  >
                    {lang === "ru" ? "\u041E\u0442\u043C\u0435\u043D\u0430" : "Bekor"}
                  </Button>
                </div>
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
                  <CardTitle>{lang === "ru" ? "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A" : "Qoralama"}</CardTitle>
                  <CardSubtitle>{draftItems.length} {lang === "ru" ? "\u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439" : "o'zgarish"}</CardSubtitle>
                </div>
                <button 
                  onClick={() => setShowDrafts(false)}
                  className="text-text-muted hover:text-text-main text-xl"
                >
                  {"\u2715"}
                </button>
              </div>
            </CardHeader>
            <CardBody>
              {draftItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted">
                    {lang === "ru" ? "\u041D\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439" : "O'zgarishlar yo'q"}
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
                          {"\u2715"}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-text-muted text-xs">{lang === "ru" ? "\u0426\u0435\u043D\u0430:" : "Narx:"}</span>
                          <span className="ml-2 font-semibold">{"\u20BD"}{formatCurrency(item.newPrice)}</span>
                        </div>
                        <div>
                          <span className="text-text-muted text-xs">{lang === "ru" ? "\u0421\u043A\u0438\u0434\u043A\u0430:" : "Cheg.:"}</span>
                          <span className="ml-2 font-semibold">{item.newDiscount}%</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="primary"
                      onClick={applyChanges}
                      className="flex-1"
                    >
                      {lang === "ru" ? "\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C" : "Qo'llash"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setDraftItems([])}
                    >
                      {lang === "ru" ? "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C" : "Tozalash"}
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
