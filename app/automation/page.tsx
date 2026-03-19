"use client";

import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import type { Language } from "@/types";
import type { AdCampaign, AdAction, AutomationMode, StockItem } from "@/types/automation";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSubtitle,
  CardTitle,
  MetricLabel,
  MetricMain,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";

type DecisionKind = "pause" | "reduce" | "no_scale" | "keep";
type RowSeverity = "critical" | "low" | "normal" | "good";

type DecisionRow = {
  sku: string;
  productName: string;
  qty: number;
  dailySales: number;
  daysLeft: number;
  status: RowSeverity;
  adStatus: string;
  spendToday: number;
  spend7d: number;
  conversionsToday: number;
  conversions7d: number;
  decision: DecisionKind;
  action: AdAction;
  reason: string;
  estimatedSaved7d: number;
  wasteFlag: boolean;
};

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));

function statusByQty(qty: number): RowSeverity {
  if (qty < 200) return "critical";
  if (qty < 500) return "low";
  if (qty < 1000) return "normal";
  return "good";
}

function baseDecisionByQty(qty: number): DecisionKind {
  if (qty < 200) return "pause";
  if (qty < 500) return "reduce";
  if (qty < 1000) return "no_scale";
  return "keep";
}

function normalizeAction(kind: DecisionKind): AdAction {
  if (kind === "pause") return "pause";
  if (kind === "reduce") return "reduce";
  return "keep";
}

function buildDecisionRows(stocks: StockItem[], ads: AdCampaign[]): DecisionRow[] {
  const adBySku = new Map(ads.map((ad) => [ad.sku, ad]));

  return stocks
    .map((stock) => {
      const ad = adBySku.get(stock.sku);
      const baseDecision = baseDecisionByQty(stock.qty);
      const status = statusByQty(stock.qty);
      const daysLeft = stock.dailySales > 0 ? Math.floor(stock.qty / stock.dailySales) : Infinity;

      const spendToday = ad?.spendToday ?? 0;
      const spend7d = ad?.spend7d ?? 0;
      const conversionsToday = ad?.conversionsToday ?? 0;
      const conversions7d = ad?.conversions7d ?? ad?.conversions ?? 0;
      const hasActiveAds = ad?.status === "active";

      const spendingWithoutSalesToday = hasActiveAds && spendToday > 0 && conversionsToday === 0;
      const spendingWithoutSales7d = hasActiveAds && spend7d > 0 && conversions7d === 0;
      const wasteFlag = Boolean(spendingWithoutSalesToday || spendingWithoutSales7d);

      let decision = baseDecision;
      let reason = "";

      if (baseDecision === "pause") {
        reason = "qty < 200: STOP (PAUSE)";
      } else if (baseDecision === "reduce") {
        reason = "qty 200-499: REDUCE -30%";
      } else if (baseDecision === "no_scale") {
        reason = "qty 500-999: NO SCALE";
      } else {
        reason = "qty >= 1000: KEEP";
      }

      if (wasteFlag) {
        if (baseDecision === "keep" || baseDecision === "no_scale") {
          decision = "reduce";
          reason = "Ads spending without sales: REDUCE";
        } else if (baseDecision === "reduce") {
          reason = "Low stock + spending without sales: keep REDUCE";
        } else {
          reason = "Critical stock + spending without sales: PAUSE";
        }
      }

      const action = normalizeAction(decision);
      const estimatedSaved7d =
        action === "pause"
          ? spendToday * 7
          : action === "reduce"
            ? spendToday * 7 * 0.3
            : 0;

      return {
        sku: stock.sku,
        productName: stock.name,
        qty: stock.qty,
        dailySales: stock.dailySales,
        daysLeft,
        status,
        adStatus: ad?.status ?? "none",
        spendToday,
        spend7d,
        conversionsToday,
        conversions7d,
        decision,
        action,
        reason,
        estimatedSaved7d,
        wasteFlag,
      };
    })
    .sort((a, b) => {
      const rank = { pause: 0, reduce: 1, no_scale: 2, keep: 3 };
      if (rank[a.decision] !== rank[b.decision]) return rank[a.decision] - rank[b.decision];
      return a.qty - b.qty;
    });
}

export default function AutomationPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [mode, setMode] = useState<AutomationMode>("dry_run");
  const [enabled, setEnabled] = useState(true);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaign[]>([]);
  const [rows, setRows] = useState<DecisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<string>("");
  const [whyBySku, setWhyBySku] = useState<Record<string, string>>({});
  const [whyLoadingSku, setWhyLoadingSku] = useState<string | null>(null);

  const labels = useMemo(
    () => ({
      title: lang === "ru" ? "Ads Control" : "Reklama nazorati",
      subtitle:
        lang === "ru"
          ? "Client logic: STOP/REDUCE/NO SCALE/KEEP + budget waste watch"
          : "Mijoz logikasi: STOP/REDUCE/NO SCALE/KEEP + byudjet yeb qo'yishni nazorat",
      check: lang === "ru" ? "Refresh" : "Yangilash",
      enabled: lang === "ru" ? "Enabled" : "Yoqilgan",
      disabled: lang === "ru" ? "Disabled" : "O'chirilgan",
      modeTitle: lang === "ru" ? "Mode" : "Rejim",
      modeManual: lang === "ru" ? "MANUAL" : "QO'LDA",
      modeDry: lang === "ru" ? "TEST" : "TEST",
      modeAuto: lang === "ru" ? "AUTO" : "AVTO",
      monitored: lang === "ru" ? "SKU monitored" : "Nazoratdagi SKU",
      pauseNow: lang === "ru" ? "PAUSE now" : "Darhol PAUSE",
      reduceNow: lang === "ru" ? "REDUCE now" : "Hozir REDUCE",
      spendRisk: lang === "ru" ? "Risk spend today" : "Bugungi xavfli spend",
      decisionTitle: lang === "ru" ? "SKU decisions" : "SKU bo'yicha qarorlar",
      ruleTitle: lang === "ru" ? "Client business rules" : "Mijoz biznes qoidalari",
      lastCheck: lang === "ru" ? "Last check" : "Oxirgi tekshiruv",
      notRun: lang === "ru" ? "not run" : "bajarilmagan",
      loading: lang === "ru" ? "Loading..." : "Yuklanmoqda...",
      empty: lang === "ru" ? "No data" : "Hali ma'lumot yo'q",
      colSku: "SKU",
      colQty: lang === "ru" ? "Stock" : "Qoldiq",
      colDays: lang === "ru" ? "Days" : "Kun",
      colAds: lang === "ru" ? "Ads" : "Reklama",
      colSpend: "Spend",
      colConv: lang === "ru" ? "Conversions" : "Konversiya",
      colDecision: lang === "ru" ? "Decision" : "Qaror",
      colReason: lang === "ru" ? "Reason" : "Sabab",
      colSave: lang === "ru" ? "Save 7d" : "7 kun tejam",
      actionPause: "PAUSE",
      actionReduce: "REDUCE -30%",
      actionNoScale: "NO SCALE",
      actionKeep: "KEEP",
      wasteFlag: lang === "ru" ? "WASTE" : "YEB QO'YAPTI",
      error: lang === "ru" ? "Failed to load automation API" : "automation API yuklanmadi",
      why: lang === "ru" ? "Why?" : "Nega?",
      whyLoading: lang === "ru" ? "Explaining..." : "Izohlanmoqda...",
    }),
    [lang]
  );

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/automation", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const stocks = Array.isArray(data?.stockItems) ? (data.stockItems as StockItem[]) : [];
      const ads = Array.isArray(data?.adCampaigns) ? (data.adCampaigns as AdCampaign[]) : [];

      setStockItems(stocks);
      setAdCampaigns(ads);
      setRows(buildDecisionRows(stocks, ads));
      setWhyBySku({});
      setLastCheck(new Date().toLocaleTimeString(lang === "ru" ? "ru-RU" : "uz-UZ"));
    } catch (e) {
      console.error(e);
      setError(labels.error);
      setRows([]);
      setStockItems([]);
      setAdCampaigns([]);
      setWhyBySku({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLang(storage.getLang());
    void loadData();
  }, []);

  const stats = {
    monitored: rows.length,
    pauseNow: rows.filter((r) => r.decision === "pause").length,
    reduceNow: rows.filter((r) => r.decision === "reduce").length,
    spendRisk: rows
      .filter((r) => r.wasteFlag)
      .reduce((sum, row) => sum + row.spendToday, 0),
  };

  const decisionLabel = (decision: DecisionKind) => {
    if (decision === "pause") return labels.actionPause;
    if (decision === "reduce") return labels.actionReduce;
    if (decision === "no_scale") return labels.actionNoScale;
    return labels.actionKeep;
  };

  const handleExplain = async (sku: string) => {
    try {
      setWhyLoadingSku(sku);
      const response = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, lang }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data?.explanation) {
        setWhyBySku((prev) => ({ ...prev, [sku]: String(data.explanation) }));
      }
    } catch (error) {
      console.error("Explain request failed:", error);
    } finally {
      setWhyLoadingSku(null);
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{labels.title}</h1>
          <p className="page-subtitle">{labels.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={enabled ? "success" : "ghost"} onClick={() => setEnabled((v) => !v)}>
            {enabled ? labels.enabled : labels.disabled}
          </Button>
          <Button variant="primary" onClick={() => void loadData()}>{labels.check}</Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardBody>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-text-main mb-1">{labels.modeTitle}</h3>
              <p className="text-sm text-text-muted">{mode === "manual" ? labels.modeManual : mode === "dry_run" ? labels.modeDry : labels.modeAuto}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant={mode === "manual" ? "primary" : "ghost"} size="sm" onClick={() => setMode("manual")}>{labels.modeManual}</Button>
              <Button variant={mode === "dry_run" ? "primary" : "ghost"} size="sm" onClick={() => setMode("dry_run")}>{labels.modeDry}</Button>
              <Button variant={mode === "auto" ? "primary" : "ghost"} size="sm" onClick={() => setMode("auto")}>{labels.modeAuto}</Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card><CardBody><MetricLabel>{labels.monitored}</MetricLabel><MetricMain>{stats.monitored}</MetricMain></CardBody></Card>
        <Card><CardBody><MetricLabel>{labels.pauseNow}</MetricLabel><MetricMain className="text-danger">{stats.pauseNow}</MetricMain></CardBody></Card>
        <Card><CardBody><MetricLabel>{labels.reduceNow}</MetricLabel><MetricMain className="text-warning">{stats.reduceNow}</MetricMain></CardBody></Card>
        <Card><CardBody><MetricLabel>{labels.spendRisk}</MetricLabel><MetricMain className="text-danger">RUB {formatMoney(stats.spendRisk)}</MetricMain></CardBody></Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{labels.ruleTitle}</CardTitle>
          <CardSubtitle>qty &lt; 200 = PAUSE | 200-499 = REDUCE -30% | 500-999 = NO SCALE | 1000+ = KEEP</CardSubtitle>
        </CardHeader>
      </Card>

      {error && (
        <Card className="mb-6 border-danger">
          <CardBody><p className="text-sm text-danger">{error}</p></CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{labels.decisionTitle}</CardTitle>
          <CardSubtitle>{labels.lastCheck}: {lastCheck || labels.notRun}</CardSubtitle>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="text-center py-12 text-text-muted">{labels.loading}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-text-muted">{labels.empty}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{labels.colSku}</TableHead>
                  <TableHead>{labels.colQty}</TableHead>
                  <TableHead>{labels.colDays}</TableHead>
                  <TableHead>{labels.colAds}</TableHead>
                  <TableHead>{labels.colSpend}</TableHead>
                  <TableHead>{labels.colConv}</TableHead>
                  <TableHead>{labels.colDecision}</TableHead>
                  <TableHead>{labels.colReason}</TableHead>
                  <TableHead>{labels.colSave}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.sku}>
                    <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{row.qty}</span>
                        <StatusPill status={row.status}>{row.status.toUpperCase()}</StatusPill>
                      </div>
                    </TableCell>
                    <TableCell>{row.daysLeft === Infinity ? "INF" : row.daysLeft}</TableCell>
                    <TableCell>
                      <Badge variant={row.adStatus === "active" ? "success" : "default"}>{row.adStatus.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>Today: RUB {formatMoney(row.spendToday)}</div>
                      <div className="text-xs text-text-muted">7d: RUB {formatMoney(row.spend7d)}</div>
                    </TableCell>
                    <TableCell>
                      <div>Today: {row.conversionsToday}</div>
                      <div className="text-xs text-text-muted">7d: {row.conversions7d}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.decision === "pause" ? "danger" : row.decision === "reduce" ? "warning" : "default"}>
                        {decisionLabel(row.decision)}
                      </Badge>
                      {row.wasteFlag && <Badge variant="danger" className="ml-2">{labels.wasteFlag}</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-text-muted max-w-xs">
                      <div>{row.reason}</div>
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleExplain(row.sku)}
                          disabled={whyLoadingSku === row.sku}
                        >
                          {whyLoadingSku === row.sku ? labels.whyLoading : labels.why}
                        </Button>
                      </div>
                      {whyBySku[row.sku] && <div className="mt-2 text-xs text-text-main">{whyBySku[row.sku]}</div>}
                    </TableCell>
                    <TableCell>RUB {formatMoney(row.estimatedSaved7d)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </Layout>
  );
}
