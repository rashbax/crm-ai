"use client";

import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
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
} from "@/src/pricing/types";

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
  const [lang, setLang] = useState<Language>("ru");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PricingDashboardResponse | null>(null);
  
  // Filters
  const [searchSku, setSearchSku] = useState("");
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

  useEffect(() => {
    setLang(storage.getLang());
    loadPricingData();
  }, []);

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
      alert(lang === "ru" ? "Нет изменений для применения" : "Qo'llash uchun o'zgarishlar yo'q");
      return;
    }

    alert(
      (lang === "ru" ? "Применение изменений:\n" : "O'zgarishlarni qo'llash:\n") +
      draftItems.map(d => `${d.sku} @ ${marketplaceNames[d.marketplace]}: ₽${d.newPrice} (${d.newDiscount}%)`).join("\n") +
      "\n\n" +
      (lang === "ru" ? "В MVP это только план. Реальные API вызовы не производятся." : "MVP da bu faqat reja. Haqiqiy API chaqiruvlar yo'q.")
    );

    setDraftItems([]);
    setShowDrafts(false);
  };

  // Filter rows
  const filteredRows = data?.rows.filter(row => {
    if (searchSku && !row.sku.toLowerCase().includes(searchSku.toLowerCase())) {
      return false;
    }

    if (marketplaceFilter !== "all") {
      const hasMarketplace = row.marketplaces.some(m => m.marketplace === marketplaceFilter);
      if (!hasMarketplace) return false;
    }

    if (showBlockedOnly) {
      const hasBlocked = row.marketplaces.some(m => m.guardrails.blocked);
      if (!hasBlocked) return false;
    }

    if (showLowMarginOnly) {
      const hasLowMargin = row.marketplaces.some(m => m.guardrails.marginPct < 0.1);
      if (!hasLowMargin) return false;
    }

    if (showHighRiskOnly) {
      if (row.stock.riskLevel !== "HIGH" && row.stock.riskLevel !== "CRITICAL") {
        return false;
      }
    }

    return true;
  }) || [];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-text-muted">{lang === "ru" ? "Загрузка..." : "Yuklanmoqda..."}</p>
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
            {lang === "ru" ? "Цены и скидки" : "Narxlar va chegirmalar"}
          </h1>
          <p className="page-subtitle">
            {lang === "ru" 
              ? "Управление ценами с автоматическими рекомендациями"
              : "Avtomatik tavsiyalar bilan narxlarni boshqarish"
            }
          </p>
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
            <div className="flex-1 min-w-[200px]">
              <Input
                type="text"
                label={lang === "ru" ? "Поиск по SKU" : "SKU bo'yicha qidirish"}
                value={searchSku}
                onChange={(e) => setSearchSku(e.target.value)}
                placeholder="RJ-001..."
              />
            </div>

            <div className="min-w-[150px]">
              <label className="block text-xs font-medium text-text-muted mb-1">
                {lang === "ru" ? "Площадка" : "Platforma"}
              </label>
              <select
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={marketplaceFilter}
                onChange={(e) => setMarketplaceFilter(e.target.value as any)}
              >
                <option value="all">{lang === "ru" ? "Все" : "Hammasi"}</option>
                <option value="wb">Wildberries</option>
                <option value="ozon">Ozon</option>
                <option value="uzum">Uzum</option>
                <option value="ym">Yandex Market</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={showBlockedOnly ? "danger" : "ghost"}
                size="sm"
                onClick={() => setShowBlockedOnly(!showBlockedOnly)}
              >
                {lang === "ru" ? "Заблокир." : "Bloklangan"}
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>{lang === "ru" ? "Площадка" : "Platforma"}</TableHead>
                  <TableHead>{lang === "ru" ? "Текущая" : "Joriy"}</TableHead>
                  <TableHead>{lang === "ru" ? "Скидка" : "Cheg."}</TableHead>
                  <TableHead>{lang === "ru" ? "Мин" : "Min"}</TableHead>
                  <TableHead>{lang === "ru" ? "Маржа" : "Marja"}</TableHead>
                  <TableHead>{lang === "ru" ? "Остаток" : "Qoldiq"}</TableHead>
                  <TableHead>{lang === "ru" ? "Прогноз" : "Prognoz"}</TableHead>
                  <TableHead>{lang === "ru" ? "Рекоменд." : "Tavsiya"}</TableHead>
                  <TableHead>{lang === "ru" ? "Статус" : "Status"}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) =>
                  row.marketplaces
                    .filter(mp => marketplaceFilter === "all" || mp.marketplace === marketplaceFilter)
                    .map((mp, idx) => (
                      <TableRow key={`${row.sku}-${mp.marketplace}`}>
                        {idx === 0 && (
                          <TableCell rowSpan={marketplaceFilter === "all" ? row.marketplaces.length : 1} className="font-mono text-xs">
                            {row.sku}
                          </TableCell>
                        )}
                        <TableCell>
                          <span className="text-xs font-medium">{marketplaceNames[mp.marketplace]}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-sm">₽{formatCurrency(mp.current.price)}</span>
                        </TableCell>
                        <TableCell>
                          {mp.current.discountPct ? (
                            <span className="text-xs text-danger font-medium">-{mp.current.discountPct}%</span>
                          ) : (
                            <span className="text-xs text-text-muted">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-text-muted">
                            ₽{formatCurrency(mp.guardrails.minPrice)}
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
                        {idx === 0 && (
                          <>
                            <TableCell rowSpan={marketplaceFilter === "all" ? row.marketplaces.length : 1}>
                              <div>
                                <div className="font-semibold text-sm">{row.stock.availableUnits}</div>
                                <span className={getRiskBadgeClass(row.stock.riskLevel)}>
                                  {row.stock.riskLevel}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell rowSpan={marketplaceFilter === "all" ? row.marketplaces.length : 1}>
                              <span className="text-xs">{row.forecast.daily.toFixed(1)}/д</span>
                            </TableCell>
                          </>
                        )}
                        <TableCell>
                          <div className="text-xs">
                            <div className="font-medium">₽{formatCurrency(mp.recommended.price)}</div>
                            {mp.recommended.discountPct > 0 && (
                              <div className="text-danger">-{mp.recommended.discountPct}%</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {mp.guardrails.blocked && (
                            <Badge variant="danger" className="text-xs">Блок</Badge>
                          )}
                          {mp.guardrails.warnings.length > 0 && !mp.guardrails.blocked && (
                            <span className="text-xs text-warning">⚠️ {mp.guardrails.warnings.length}</span>
                          )}
                          {!mp.guardrails.blocked && mp.guardrails.warnings.length === 0 && (
                            <span className="text-xs text-success">✓</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPriceEditor(row, mp)}
                            className="text-xs"
                          >
                            {lang === "ru" ? "✎" : "✎"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                )}
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
                  <CardTitle>{lang === "ru" ? "Редактор цены" : "Narx muharriri"}</CardTitle>
                  <CardSubtitle>{editor.sku} @ {marketplaceNames[editor.marketplace]}</CardSubtitle>
                </div>
                <button 
                  onClick={closePriceEditor}
                  className="text-text-muted hover:text-text-main text-xl"
                >
                  ✕
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
                      <span className="ml-2 font-semibold">₽{formatCurrency(editor.currentPrice)}</span>
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
                    {lang === "ru" ? "Мин:" : "Min:"} ₽{formatCurrency(editor.minPrice)} | 
                    {lang === "ru" ? " Цель:" : " Maqsad:"} ₽{formatCurrency(editor.targetPrice)}
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

                {editor.newPrice < editor.minPrice && (
                  <div className="p-3 bg-danger/10 border border-danger rounded">
                    <p className="text-sm text-danger font-semibold">
                      ⚠️ {lang === "ru" ? "Цена ниже минимальной!" : "Narx minimaldan past!"}
                    </p>
                  </div>
                )}

                {editor.newDiscount > 30 && (
                  <div className="p-3 bg-warning/10 border border-warning rounded">
                    <p className="text-sm text-warning">
                      ⚠️ {lang === "ru" ? "Очень большая скидка" : "Juda katta chegirma"}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button
                    variant="primary"
                    onClick={addToDraft}
                    className="flex-1"
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
                  ✕
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
                          ✕
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-text-muted text-xs">{lang === "ru" ? "Цена:" : "Narx:"}</span>
                          <span className="ml-2 font-semibold">₽{formatCurrency(item.newPrice)}</span>
                        </div>
                        <div>
                          <span className="text-text-muted text-xs">{lang === "ru" ? "Скидка:" : "Cheg.:"}</span>
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
