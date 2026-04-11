"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import { translations } from "@/lib/translations";
import type { Language } from "@/types";
import type { AdCampaign, AutomationMode, StockItem, SystemRecommendation } from "@/types/automation";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Input,
  MetricLabel,
  MetricMain,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));

function t(lang: Language, key: string): string {
  return (translations[lang] as Record<string, string>)[key] ?? key;
}

type HealthVariant = "success" | "warning" | "danger" | "default";
type RecVariant = "danger" | "warning" | "default" | "success";

function healthBadgeVariant(health: string): HealthVariant {
  if (health === "active") return "success";
  if (health === "monitoring") return "warning";
  if (health === "wasteful") return "danger";
  if (health === "risky") return "danger";
  return "default";
}

function recBadgeVariant(rec: SystemRecommendation): RecVariant {
  if (rec === "pause") return "danger";
  if (rec === "reduce") return "warning";
  if (rec === "no_scale") return "default";
  return "success";
}

interface SnapshotMeta {
  stocks: number;
  campaigns: number;
  totalAdSpend7d: number;
  budgetSpikes: number;
  performanceDrops: number;
  staleAdAssignments: number;
  pendingAdApprovals: number;
}

export default function AutomationPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [mode, setMode] = useState<AutomationMode>("dry_run");
  const [enabled, setEnabled] = useState(true);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaign[]>([]);
  const [meta, setMeta] = useState<SnapshotMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<string>("");
  const [whyBySku, setWhyBySku] = useState<Record<string, string>>({});
  const [detailsOpenById, setDetailsOpenById] = useState<Record<string, boolean>>({});
  const [whyLoadingSku, setWhyLoadingSku] = useState<string | null>(null);
  const [marketplaceFilter, setMarketplaceFilter] = useState<"all" | "wb" | "ozon">("all");

  // Override modal state
  const [overrideTarget, setOverrideTarget] = useState<AdCampaign | null>(null);
  const [overrideDecision, setOverrideDecision] = useState<SystemRecommendation>("keep");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSaving, setOverrideSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const globalMp = storage.getMarketplace();
      const mp = globalMp === "all" ? marketplaceFilter : globalMp;
      const response = await fetch(`/api/automation?marketplace=${mp}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const stocks = Array.isArray(data?.stockItems) ? (data.stockItems as StockItem[]) : [];
      const ads = Array.isArray(data?.adCampaigns) ? (data.adCampaigns as AdCampaign[]) : [];

      setStockItems(stocks);
      setAdCampaigns(ads);
      setMeta(data?.meta ?? null);
      setWhyBySku({});
      setDetailsOpenById({});
      setLastCheck(new Date().toLocaleTimeString(lang === "ru" ? "ru-RU" : "uz-UZ"));
    } catch (e) {
      console.error(e);
      setError(t(lang, "ads_error"));
      setAdCampaigns([]);
      setStockItems([]);
      setMeta(null);
      setWhyBySku({});
      setDetailsOpenById({});
    } finally {
      setLoading(false);
    }
  }, [marketplaceFilter, lang]);

  useEffect(() => {
    setLang(storage.getLang());
    void loadData();
  }, []);

  useEffect(() => {
    void loadData();
  }, [marketplaceFilter]);

  // Sort campaigns: most critical first
  const sortedCampaigns = useMemo(() => {
    const healthRank = { wasteful: 0, risky: 1, monitoring: 2, active: 3 };
    const recRank = { pause: 0, reduce: 1, no_scale: 2, keep: 3 };
    return [...adCampaigns].sort((a, b) => {
      const hr = (healthRank[a.healthStatus] ?? 3) - (healthRank[b.healthStatus] ?? 3);
      if (hr !== 0) return hr;
      const rr = (recRank[a.systemRecommendation] ?? 3) - (recRank[b.systemRecommendation] ?? 3);
      if (rr !== 0) return rr;
      return (a.stockOnHand ?? 0) - (b.stockOnHand ?? 0);
    });
  }, [adCampaigns]);

  const stats = useMemo(() => ({
    monitored: adCampaigns.length,
    pauseNow: adCampaigns.filter((c) => c.systemRecommendation === "pause").length,
    reduceNow: adCampaigns.filter((c) => c.systemRecommendation === "reduce").length,
    wasteSpend: adCampaigns.filter((c) => c.wasteFlag).reduce((sum, c) => sum + (c.spendToday ?? 0), 0),
    stockConflicts: adCampaigns.filter((c) => c.stockConflict).length,
    budgetSpikes: meta?.budgetSpikes ?? 0,
    perfDrops: meta?.performanceDrops ?? 0,
    staleAssignments: meta?.staleAdAssignments ?? 0,
    pendingApprovals: meta?.pendingAdApprovals ?? 0,
  }), [adCampaigns, meta]);

  const handleExplain = async (lookupSku: string, uiKey: string) => {
    if (detailsOpenById[uiKey]) {
      setDetailsOpenById((prev) => ({ ...prev, [uiKey]: false }));
      return;
    }

    if (whyBySku[uiKey]) {
      setDetailsOpenById((prev) => ({ ...prev, [uiKey]: true }));
      return;
    }

    try {
      setWhyLoadingSku(uiKey);
      const response = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: lookupSku, lang }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data?.explanation) {
        setWhyBySku((prev) => ({ ...prev, [uiKey]: String(data.explanation) }));
        setDetailsOpenById((prev) => ({ ...prev, [uiKey]: true }));
      }
    } catch (err) {
      console.error("Explain request failed:", err);
    } finally {
      setWhyLoadingSku(null);
    }
  };

  const handleOverrideSave = async () => {
    if (!overrideTarget || !overrideReason.trim()) return;
    setOverrideSaving(true);
    try {
      const campaignKey = `${overrideTarget.platform}::${overrideTarget.sku}`;
      const response = await fetch("/api/automation/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignKey,
          actualDecision: overrideDecision,
          decisionReason: overrideReason.trim(),
          systemRecommendation: overrideTarget.systemRecommendation,
          sku: overrideTarget.sku,
        }),
      });
      if (response.ok) {
        setOverrideTarget(null);
        setOverrideReason("");
        void loadData();
      }
    } catch (err) {
      console.error("Override save failed:", err);
    } finally {
      setOverrideSaving(false);
    }
  };

  const healthLabel = (h: string) => t(lang, `ads_health_${h}`);
  const recLabel = (r: SystemRecommendation) => {
    const map: Record<SystemRecommendation, string> = {
      pause: t(lang, "ads_rec_pause"),
      reduce: t(lang, "ads_rec_reduce"),
      no_scale: t(lang, "ads_rec_no_scale"),
      keep: t(lang, "ads_rec_keep"),
    };
    return map[r];
  };

  const trendLabel = (trend?: "up" | "down" | "stable") => {
    if (trend === "up") return t(lang, "ads_trend_up");
    if (trend === "down") return t(lang, "ads_trend_down");
    return t(lang, "ads_trend_stable");
  };

  const trendIcon = (trend?: "up" | "down" | "stable") => {
    if (trend === "up") return "↑";
    if (trend === "down") return "↓";
    return "→";
  };

  const globalMp = typeof window !== "undefined" ? storage.getMarketplace() : "all";
  const showMpTabs = globalMp === "all";
  const showAllColumns = showMpTabs && marketplaceFilter === "all";

  return (
    <Layout>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t(lang, "ads_title")}</h1>
          <p className="page-subtitle">{t(lang, "ads_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={enabled ? "success" : "ghost"} onClick={() => setEnabled((v) => !v)}>
            {enabled ? t(lang, "ads_enabled") : t(lang, "ads_disabled")}
          </Button>
          <Button variant="primary" onClick={() => void loadData()}>
            {t(lang, "ads_refresh")}
          </Button>
        </div>
      </div>

      {/* Marketplace tabs — only if global filter is "all" */}
      {showMpTabs && (
        <div className="flex gap-2 mb-4">
          {(["all", "wb", "ozon"] as const).map((mp) => (
            <Button
              key={mp}
              variant={marketplaceFilter === mp ? "primary" : "ghost"}
              size="sm"
              onClick={() => setMarketplaceFilter(mp)}
            >
              {mp === "all" ? t(lang, "ads_tab_all") : mp === "wb" ? "Wildberries" : "Ozon"}
            </Button>
          ))}
        </div>
      )}

      {/* Mode selector */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-text-main mb-1">{t(lang, "ads_mode")}</h3>
              <p className="text-sm text-text-muted">
                {mode === "manual" ? t(lang, "ads_mode_manual") : mode === "dry_run" ? t(lang, "ads_mode_test") : t(lang, "ads_mode_auto")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant={mode === "manual" ? "primary" : "ghost"} size="sm" onClick={() => setMode("manual")}>
                {t(lang, "ads_mode_manual")}
              </Button>
              <Button variant={mode === "dry_run" ? "primary" : "ghost"} size="sm" onClick={() => setMode("dry_run")}>
                {t(lang, "ads_mode_test")}
              </Button>
              <Button variant={mode === "auto" ? "primary" : "ghost"} size="sm" onClick={() => setMode("auto")}>
                {t(lang, "ads_mode_auto")}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Signal cards — Row 1: main signals */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
        <Card>
          <CardBody>
            <MetricLabel>{t(lang, "ads_monitored")}</MetricLabel>
            <MetricMain>{stats.monitored}</MetricMain>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <MetricLabel>{t(lang, "ads_pause_now")}</MetricLabel>
            <MetricMain className="text-danger">{stats.pauseNow}</MetricMain>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <MetricLabel>{t(lang, "ads_reduce_now")}</MetricLabel>
            <MetricMain className="text-warning">{stats.reduceNow}</MetricMain>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <MetricLabel>{t(lang, "ads_waste_spend")}</MetricLabel>
            <MetricMain className="text-danger">₽{formatMoney(stats.wasteSpend)}</MetricMain>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <MetricLabel>{t(lang, "ads_stock_conflicts")}</MetricLabel>
            <MetricMain className={stats.stockConflicts > 0 ? "text-danger" : "text-success"}>
              {stats.stockConflicts}
            </MetricMain>
          </CardBody>
        </Card>
      </div>

      {/* Signal cards — Row 2: trend + assignment signals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardBody>
            <MetricLabel>{t(lang, "ads_budget_spikes")}</MetricLabel>
            <MetricMain className={stats.budgetSpikes > 0 ? "text-warning" : ""}>
              {stats.budgetSpikes}
            </MetricMain>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <MetricLabel>{t(lang, "ads_perf_drops")}</MetricLabel>
            <MetricMain className={stats.perfDrops > 0 ? "text-danger" : ""}>
              {stats.perfDrops}
            </MetricMain>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <MetricLabel>{t(lang, "ads_stale_assignments")}</MetricLabel>
            <MetricMain className={stats.staleAssignments > 0 ? "text-warning" : ""}>
              {stats.staleAssignments}
            </MetricMain>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <MetricLabel>{t(lang, "ads_pending_approvals")}</MetricLabel>
            <MetricMain className={stats.pendingApprovals > 0 ? "text-warning" : ""}>
              {stats.pendingApprovals}
            </MetricMain>
          </CardBody>
        </Card>
      </div>

      {/* Business rules */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t(lang, "ads_rules_title")}</CardTitle>
          <CardSubtitle>{t(lang, "ads_rules_desc")}</CardSubtitle>
        </CardHeader>
      </Card>

      {error && (
        <Card className="mb-6 border-danger">
          <CardBody><p className="text-sm text-danger">{error}</p></CardBody>
        </Card>
      )}

      {/* Override modal */}
      {overrideTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>{t(lang, "ads_override_title")}</CardTitle>
              <CardSubtitle>{overrideTarget.name} ({overrideTarget.sku})</CardSubtitle>
            </CardHeader>
            <CardBody>
              <div className="mb-3">
                <p className="text-sm text-text-muted mb-2">
                  {lang === "ru" ? "Система рекомендует" : "Tizim tavsiyasi"}: <Badge variant={recBadgeVariant(overrideTarget.systemRecommendation)}>{recLabel(overrideTarget.systemRecommendation)}</Badge>
                </p>
                <div className="flex gap-2 flex-wrap">
                  {(["pause", "reduce", "no_scale", "keep"] as SystemRecommendation[]).map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={overrideDecision === d ? "primary" : "ghost"}
                      onClick={() => setOverrideDecision(d)}
                    >
                      {recLabel(d)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-text-main mb-1">
                  {t(lang, "ads_override_reason")}
                </label>
                <Input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder={lang === "ru" ? "Обоснование решения..." : "Qaror sababi..."}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setOverrideTarget(null)}>
                  {t(lang, "ads_override_cancel")}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleOverrideSave()}
                  disabled={overrideSaving || !overrideReason.trim()}
                >
                  {overrideSaving ? "..." : t(lang, "ads_override_save")}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Decisions table */}
      <Card>
        <CardHeader>
          <CardTitle>{t(lang, "ads_decisions_title")}</CardTitle>
          <CardSubtitle>{t(lang, "ads_last_check")}: {lastCheck || t(lang, "ads_not_run")}</CardSubtitle>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="text-center py-12 text-text-muted">{t(lang, "ads_loading")}</div>
          ) : sortedCampaigns.length === 0 ? (
            <div className="text-center py-12 text-text-muted">{t(lang, "ads_empty")}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t(lang, "ads_col_sku")}</TableHead>
                    <TableHead>{lang === "ru" ? "Товар" : "Tovar"}</TableHead>
                    {showAllColumns && <TableHead>{t(lang, "ads_col_marketplace")}</TableHead>}
                    <TableHead>{t(lang, "ads_col_owner")}</TableHead>
                    <TableHead>{t(lang, "ads_col_stock")}</TableHead>
                    <TableHead>{t(lang, "ads_col_days")}</TableHead>
                    <TableHead>{t(lang, "ads_col_daily_sales")}</TableHead>
                    <TableHead>{t(lang, "ads_col_health")}</TableHead>
                    <TableHead>{t(lang, "ads_col_spend")}</TableHead>
                    <TableHead>{t(lang, "ads_col_conv")}</TableHead>
                    <TableHead>{t(lang, "ads_col_trend")}</TableHead>
                    <TableHead>{t(lang, "ads_col_recommendation")}</TableHead>
                    <TableHead>{t(lang, "ads_col_actual")}</TableHead>
                    <TableHead>{t(lang, "ads_col_reason")}</TableHead>
                    <TableHead>{t(lang, "ads_col_save")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCampaigns.map((camp) => {
                    const daysLeft = camp.daysOfStockLeft ?? 0;
                    const daysDisplay = daysLeft >= 9999 ? "∞" : String(daysLeft);
                    const spendToday = camp.spendToday ?? 0;
                    const spend7d = camp.spend7d ?? 0;
                    const spend14d = camp.spend14d ?? 0;
                    const estimatedSaved7d =
                      camp.systemRecommendation === "pause"
                        ? spendToday * 7
                        : camp.systemRecommendation === "reduce"
                          ? spendToday * 7 * 0.3
                          : 0;

                    // Build reason text in business language
                    let reason = "";
                    const qty = camp.stockOnHand ?? 0;
                    if (camp.systemRecommendation === "pause") {
                      reason = lang === "ru"
                        ? `На складе ${qty} шт — остановить`
                        : `Omborda ${qty} dona — to'xtatish`;
                    } else if (camp.systemRecommendation === "reduce") {
                      if (camp.wasteFlag) {
                        reason = lang === "ru"
                          ? "Расход без заказов — снизить"
                          : "Buyurtmasiz sarf — kamaytirish";
                      } else {
                        reason = lang === "ru"
                          ? `${qty} шт — снизить −30%`
                          : `${qty} dona — 30% kamaytirish`;
                      }
                    } else if (camp.systemRecommendation === "no_scale") {
                      reason = lang === "ru"
                        ? `${qty} шт — не увеличивать`
                        : `${qty} dona — oshirmaslik`;
                    } else {
                      reason = lang === "ru"
                        ? `${qty} шт — ОК`
                        : `${qty} dona — OK`;
                    }

                    const hasOverride = !!camp.actualDecision;
                    const overrideDiffers = hasOverride && camp.actualDecision !== camp.systemRecommendation;

                    return (
                      <TableRow key={camp.id} className={camp.budgetSpike ? "bg-warning/5" : camp.performanceDrop ? "bg-danger/5" : ""}>
                        {/* SKU */}
                        <TableCell className="font-mono text-xs">{camp.sku}</TableCell>

                        {/* Product name */}
                        <TableCell className="text-sm max-w-[180px]">
                          <div className="truncate" title={camp.name}>{camp.name}</div>
                        </TableCell>

                        {/* Marketplace (only in "all" view) */}
                        {showAllColumns && (
                          <TableCell>
                            <Badge variant="default">
                              {camp.platform === "Wildberries" ? "WB" : "Ozon"}
                            </Badge>
                          </TableCell>
                        )}

                        {/* Owner */}
                        <TableCell className="text-xs">
                          {camp.owner || (
                            <span className="text-text-muted italic">{t(lang, "ads_no_owner")}</span>
                          )}
                        </TableCell>

                        {/* Stock */}
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className={qty < 200 ? "text-danger font-semibold" : qty < 500 ? "text-warning" : ""}>
                              {qty}
                            </span>
                            {camp.stockConflict && (
                              <span className="text-danger text-xs" title={t(lang, "ads_stock_conflict")}>⚠</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Days of stock */}
                        <TableCell>
                          <span className={daysLeft < 7 ? "text-danger font-semibold" : daysLeft < 14 ? "text-warning" : ""}>
                            {daysDisplay}
                          </span>
                        </TableCell>

                        {/* Daily sales */}
                        <TableCell className="text-xs">
                          {camp.dailySales ?? 0}
                        </TableCell>

                        {/* Health status */}
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <Badge variant={healthBadgeVariant(camp.healthStatus)}>
                              {healthLabel(camp.healthStatus)}
                            </Badge>
                            {camp.wasteFlag && camp.healthStatus !== "wasteful" && (
                              <Badge variant="danger" className="text-xs">
                                {t(lang, "ads_waste")}
                              </Badge>
                            )}
                            {camp.budgetSpike && (
                              <Badge variant="warning" className="text-xs">
                                {t(lang, "ads_spike")}
                              </Badge>
                            )}
                            {camp.performanceDrop && (
                              <Badge variant="danger" className="text-xs">
                                {t(lang, "ads_drop")}
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Spend */}
                        <TableCell>
                          <div className="text-xs">
                            <div>{t(lang, "ads_today")}: ₽{formatMoney(spendToday)}</div>
                            <div className="text-text-muted">{t(lang, "ads_7d")}: ₽{formatMoney(spend7d)}</div>
                            <div className="text-text-muted">{t(lang, "ads_14d")}: ₽{formatMoney(spend14d)}</div>
                          </div>
                        </TableCell>

                        {/* Conversions */}
                        <TableCell>
                          <div className="text-xs">
                            <div>{t(lang, "ads_today")}: {camp.conversionsToday ?? 0}</div>
                            <div className="text-text-muted">{t(lang, "ads_7d")}: {camp.conversions7d ?? 0}</div>
                          </div>
                        </TableCell>

                        {/* 14d trend */}
                        <TableCell className="text-xs">
                          <span className={
                            camp.spendTrend === "up" ? "text-warning" :
                            camp.spendTrend === "down" ? "text-success" : "text-text-muted"
                          }>
                            {trendIcon(camp.spendTrend)} {trendLabel(camp.spendTrend)}
                          </span>
                        </TableCell>

                        {/* System recommendation */}
                        <TableCell>
                          <Badge variant={recBadgeVariant(camp.systemRecommendation)}>
                            {recLabel(camp.systemRecommendation)}
                          </Badge>
                        </TableCell>

                        {/* Actual decision (override) */}
                        <TableCell>
                          {hasOverride ? (
                            <div className="flex flex-col gap-0.5">
                              <Badge variant={recBadgeVariant(camp.actualDecision!)}>
                                {recLabel(camp.actualDecision!)}
                              </Badge>
                              {overrideDiffers && camp.decisionReason && (
                                <span className="text-xs text-text-muted">{camp.decisionReason}</span>
                              )}
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setOverrideTarget(camp);
                                setOverrideDecision(camp.systemRecommendation);
                                setOverrideReason("");
                              }}
                            >
                              {t(lang, "ads_override")}
                            </Button>
                          )}
                        </TableCell>

                        {/* Reason + AI Why */}
                        <TableCell className="text-xs text-text-muted max-w-[200px]">
                          <div>{reason}</div>
                          <div className="mt-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleExplain(camp.resolvedSku || camp.sku, camp.id)}
                              disabled={whyLoadingSku === camp.id}
                            >
                              {whyLoadingSku === camp.id
                                ? t(lang, "ads_why_loading")
                                : detailsOpenById[camp.id]
                                  ? (lang === "ru" ? "Скрыть" : "Yashirish")
                                  : t(lang, "ads_why")}
                            </Button>
                          </div>
                          {detailsOpenById[camp.id] && whyBySku[camp.id] && (
                            <div className="mt-1 text-xs text-text-main">{whyBySku[camp.id]}</div>
                          )}
                        </TableCell>

                        {/* Estimated savings */}
                        <TableCell className="text-xs">
                          ₽{formatMoney(estimatedSaved7d)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </Layout>
  );
}
