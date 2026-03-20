// Automation Engine - Core Logic
// This handles stock monitoring, rule evaluation, and decision making

import type {
  StockItem,
  StockStatus,
  AdCampaign,
  AdAction,
  AutomationRule,
  AutomationMode,
  AuditLog,
  AutomationDecision,
  RuleEvaluationResult,
  StockCalculation,
} from "@/types/automation";

// ============================================
// STOCK CALCULATIONS
// ============================================

/**
 * Calculate stock status based on quantity thresholds
 * These thresholds match the ad automation rules:
 * - Critical: < 200 (pause ads)
 * - Low: 200-499 (reduce ads)
 * - Normal: 500-999 (no scale)
 * - Good: >= 1000 (keep ads)
 */
export function calculateStockStatus(qty: number, dailySales: number = 0): StockStatus {
  if (qty === 0) return "critical";
  if (qty < 200) return "critical";
  if (qty < 500) return "low";
  if (qty < 1000) return "normal";
  return "good";
}

/**
 * Calculate days until stockout based on daily sales
 * Returns Infinity if no sales data
 */
export function calculateDaysUntilStockout(qty: number, dailySales: number): number {
  if (dailySales <= 0) return Infinity;
  return Math.floor(qty / dailySales);
}

/**
 * Calculate reorder point (ROP)
 * ROP = (Daily Sales × Lead Time) + Safety Stock
 */
export function calculateReorderPoint(
  dailySales: number,
  leadTime: number,
  safetyStock: number
): number {
  return Math.ceil(dailySales * leadTime + safetyStock);
}

/**
 * Complete stock calculation with all metrics
 */
export function calculateStockMetrics(stock: StockItem): StockCalculation {
  const daysUntilStockout = calculateDaysUntilStockout(stock.qty, stock.dailySales);
  const reorderPoint = calculateReorderPoint(
    stock.dailySales,
    stock.leadTime,
    stock.safetyStock
  );
  const status = calculateStockStatus(stock.qty, stock.dailySales);
  const shouldReorder = stock.qty <= reorderPoint;
  const criticalLevel = status === "critical";

  return {
    daysUntilStockout,
    reorderPoint,
    status,
    shouldReorder,
    criticalLevel,
  };
}

// ============================================
// RULE EVALUATION
// ============================================

/**
 * Evaluate a single rule against stock data
 */
export function evaluateRule(
  rule: AutomationRule,
  stock: StockItem,
  metrics: StockCalculation
): RuleEvaluationResult {
  let triggered = false;
  let reason = "";

  // Check if rule is enabled
  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: false,
      reason: "Rule disabled",
      priority: rule.priority,
      recommendedAction: "keep",
    };
  }

  // Evaluate condition
  const { condition } = rule;
  let value: number;

  switch (condition.type) {
    case "qty_below":
    case "qty_above":
      value = stock.qty;
      break;
    case "days_left_below":
    case "days_left_above":
      value = metrics.daysUntilStockout === Infinity ? 999 : metrics.daysUntilStockout;
      break;
    default:
      value = 0;
  }

  // Check operator
  switch (condition.operator) {
    case "lt":
      triggered = value < condition.value;
      break;
    case "lte":
      triggered = value <= condition.value;
      break;
    case "gt":
      triggered = value > condition.value;
      break;
    case "gte":
      triggered = value >= condition.value;
      break;
    case "eq":
      triggered = value === condition.value;
      break;
  }

  // Build reason
  if (triggered) {
    reason = `${rule.description}: ${value} ${condition.operator} ${condition.value}`;
  }

  // Map rule action to ad action
  let recommendedAction: AdAction = "keep";
  if (triggered) {
    switch (rule.action.type) {
      case "ads_pause":
        recommendedAction = "pause";
        break;
      case "ads_reduce":
        recommendedAction = "reduce";
        break;
      case "ads_resume":
        recommendedAction = "resume";
        break;
      default:
        recommendedAction = "keep";
    }
  }

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    triggered,
    reason,
    priority: rule.priority,
    recommendedAction,
  };
}

/**
 * Evaluate all rules for a stock item
 * Returns triggered rules sorted by priority
 */
export function evaluateAllRules(
  stock: StockItem,
  rules: AutomationRule[]
): RuleEvaluationResult[] {
  const metrics = calculateStockMetrics(stock);
  
  const results = rules
    .map((rule) => evaluateRule(rule, stock, metrics))
    .filter((result) => result.triggered)
    .sort((a, b) => a.priority - b.priority); // Lower priority number = higher priority

  return results;
}

// ============================================
// DECISION MAKING
// ============================================

/**
 * Make automation decision for a stock item
 * Returns the highest priority action to take
 */
export function makeAutomationDecision(
  stock: StockItem,
  rules: AutomationRule[],
  currentAds?: AdCampaign[]
): AutomationDecision {
  const metrics = calculateStockMetrics(stock);
  const triggeredResults = evaluateAllRules(stock, rules);
  const adCampaign = currentAds?.find((campaign) => campaign.sku === stock.sku);
  
  // Build recommended actions from triggered rules
  type ActionSource = "rule" | "stock_cover" | "efficiency";
  type RecommendedAction = { action: AdAction; source: ActionSource; reason: string; impact: string; priority: number; };

  const recommendedActions: RecommendedAction[] = triggeredResults.map((result) => {
    let impact = "";
    let reason = result.reason;

    switch (result.recommendedAction) {
      case "pause":
        impact = "Will save ad spend until stock replenished";
        break;
      case "reduce":
        impact = `Will reduce budget by ${result.priority === 2 ? "30%" : "50%"}`;
        break;
      case "resume":
        impact = "Will resume normal ad operations";
        break;
      default:
        impact = "No action needed";
    }

    return {
      action: result.recommendedAction,
      source: "rule" as ActionSource,
      reason,
      impact,
      priority: result.priority,
    };
  });

  if (adCampaign && adCampaign.status === "active") {
    const daysCover = metrics.daysUntilStockout === Infinity ? 999 : metrics.daysUntilStockout;
    const clicks = Math.max(0, adCampaign.clicks);
    const conversions = Math.max(0, adCampaign.conversions);
    const spend = Math.max(0, adCampaign.spendToday);
    const revenue = Math.max(0, adCampaign.attributedRevenueToday ?? 0);
    const minClicksForEfficiency = 80;

    if (daysCover < 4) {
      recommendedActions.push({
        action: "pause",
        source: "stock_cover" as const,
        reason: `Days of cover is ${daysCover}. Stock is near stockout while ads are still active.`,
        impact: "Stops accelerated stockout risk and prevents pre-OOS ad waste.",
        priority: 0,
      });
    } else if (daysCover < 10) {
      recommendedActions.push({
        action: "reduce",
        source: "stock_cover" as const,
        reason: `Days of cover is ${daysCover}. Reduce demand acceleration for low inventory.`,
        impact: "Cuts ad pressure while retaining limited traffic.",
        priority: 1,
      });
    } else if (daysCover < 21) {
      recommendedActions.push({
        action: "reduce",
        source: "stock_cover" as const,
        reason: `Days of cover is ${daysCover}. Inventory is tightening.`,
        impact: "Reduces spend pace to extend SKU availability.",
        priority: 2,
      });
    }

    if (clicks >= minClicksForEfficiency) {
      const cvr = clicks > 0 ? conversions / clicks : 0;
      const targetAcos = adCampaign.targetAcos ?? 0.3;
      const hasRevenue = revenue > 0;
      const acos = hasRevenue ? spend / revenue : Infinity;

      if (conversions === 0 && clicks >= 120 && spend >= adCampaign.dailyBudget * 0.5) {
        recommendedActions.push({
          action: "reduce",
          source: "efficiency" as const,
          reason: `High spend with no conversions (${clicks} clicks, ${conversions} conv).`,
          impact: "Prevents inefficient spend until campaign relevance improves.",
          priority: 1,
        });
      } else if (hasRevenue && acos > targetAcos * 1.3) {
        recommendedActions.push({
          action: "reduce",
          source: "efficiency" as const,
          reason: `ACOS ${Math.round(acos * 100)}% exceeds target ${Math.round(targetAcos * 100)}%.`,
          impact: "Improves promotion efficiency and protects margin.",
          priority: 1,
        });
      } else if (!hasRevenue && cvr < 0.01 && spend >= adCampaign.dailyBudget * 0.4) {
        recommendedActions.push({
          action: "reduce",
          source: "efficiency" as const,
          reason: `Low CVR ${(cvr * 100).toFixed(2)}% with meaningful spend.`,
          impact: "Reduces likely overpayment for low-quality traffic.",
          priority: 2,
        });
      }
    }
  }

  recommendedActions.sort((a, b) => a.priority - b.priority);

  return {
    id: `DEC-${Date.now()}-${stock.sku}`,
    timestamp: new Date().toISOString(),
    sku: stock.sku,
    productName: stock.name,
    currentQty: stock.qty,
    dailySales: stock.dailySales,
    daysLeft: metrics.daysUntilStockout,
    status: metrics.status,
    triggeredRules: rules.filter((r) => triggeredResults.find((tr) => tr.ruleId === r.id)),
    recommendedActions,
    executed: false,
  };
}

// ============================================
// BATCH PROCESSING
// ============================================

/**
 * Process all stock items and generate decisions
 */
export function processBatch(
  stockItems: StockItem[],
  rules: AutomationRule[],
  mode: AutomationMode = "manual",
  ads: AdCampaign[] = []
): AutomationDecision[] {
  const decisions: AutomationDecision[] = [];

  for (const stock of stockItems) {
    const metrics = calculateStockMetrics(stock);
    const hasAds = ads.some((ad) => ad.sku === stock.sku && ad.status === "active");
    
    // Only process items that need attention
    if (metrics.criticalLevel || metrics.shouldReorder || hasAds) {
      const decision = makeAutomationDecision(stock, rules, ads);
      
      // Only include if there are recommended actions
      if (decision.recommendedActions.length > 0) {
        decisions.push(decision);
      }
    }
  }

  // Sort by priority (most critical first)
  return decisions.sort((a, b) => {
    // Critical items first
    if (a.status === "critical" && b.status !== "critical") return -1;
    if (a.status !== "critical" && b.status === "critical") return 1;
    
    // Then by days left (lowest first)
    return a.daysLeft - b.daysLeft;
  });
}

// ============================================
// AUDIT LOGGING
// ============================================

/**
 * Create audit log entry for an action
 */
export function createAuditLog(
  decision: AutomationDecision,
  action: "ads_paused" | "ads_reduced" | "ads_resumed" | "rule_triggered",
  mode: AutomationMode,
  before: any,
  after: any
): AuditLog {
  const topRule = decision.triggeredRules[0];
  
  return {
    id: `LOG-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action,
    sku: decision.sku,
    productName: decision.productName,
    ruleId: topRule?.id,
    ruleName: topRule?.name,
    reason: decision.recommendedActions[0]?.reason || "Automated action",
    mode,
    before,
    after,
    metadata: {
      daysLeft: decision.daysLeft,
      dailySales: decision.dailySales,
      platform: before.platform,
    },
  };
}

// ============================================
// MONEY SAVINGS CALCULATION
// ============================================

/**
 * Calculate estimated money saved by pausing/reducing ads
 */
export function calculateMoneySaved(
  dailyBudget: number,
  daysUntilRestock: number,
  action: "pause" | "reduce"
): number {
  if (!Number.isFinite(daysUntilRestock) || daysUntilRestock <= 0) return 0;
  const cappedDays = Math.min(daysUntilRestock, 30);

  if (action === "pause") {
    return dailyBudget * cappedDays;
  } else {
    // Reduce by 30%
    return dailyBudget * 0.3 * cappedDays;
  }
}

/**
 * Calculate total savings from all decisions
 */
export function calculateTotalSavings(
  decisions: AutomationDecision[],
  ads: AdCampaign[]
): number {
  let totalSavings = 0;

  for (const decision of decisions) {
    const adCampaign = ads.find((ad) => ad.sku === decision.sku);
    if (!adCampaign) continue;

    const topAction = decision.recommendedActions[0];
    if (!topAction) continue;

    if (topAction.action === "pause" || topAction.action === "reduce") {
      const savings = calculateMoneySaved(
        adCampaign.dailyBudget,
        decision.daysLeft,
        topAction.action
      );
      totalSavings += savings;
    }
  }

  return totalSavings;
}
