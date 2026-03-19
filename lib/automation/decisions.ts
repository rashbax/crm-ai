import type { AdAction, AdCampaign, StockItem } from "@/types/automation";

export type DecisionKind = "pause" | "reduce" | "no_scale" | "keep";
export type DecisionSeverity = "critical" | "low" | "normal" | "good";

export interface AutomationDecisionRow {
  sku: string;
  productName: string;
  qty: number;
  dailySales: number;
  daysLeft: number;
  status: DecisionSeverity;
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
}

function statusByQty(qty: number): DecisionSeverity {
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

export function buildAutomationDecisionRows(stocks: StockItem[], ads: AdCampaign[]): AutomationDecisionRow[] {
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
        action === "pause" ? spendToday * 7 : action === "reduce" ? spendToday * 7 * 0.3 : 0;

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

