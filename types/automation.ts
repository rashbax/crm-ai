// Automation Engine Types
// This file defines all types for the stock monitoring and ads automation system

// ============================================
// STOCK MONITORING TYPES
// ============================================

export type StockStatus = "critical" | "low" | "normal" | "good";

export interface StockItem {
  id: string;
  sku: string;
  name: string;
  marketplace: "Ozon" | "Wildberries";
  qty: number;
  dailySales: number;
  rop: number; // Reorder Point
  leadTime: number; // days
  safetyStock: number;
  lastUpdated: string;
  status: StockStatus;
}

// ============================================
// ADS MANAGEMENT TYPES
// ============================================

export type AdPlatform = "Ozon" | "Wildberries";
export type AdStatus = "active" | "paused" | "archived";
export type AdAction = "pause" | "reduce" | "keep" | "resume";
export type AdHealthStatus = "active" | "monitoring" | "wasteful" | "risky";
export type SystemRecommendation = "pause" | "reduce" | "no_scale" | "keep";

export interface AdCampaign {
  id: string;
  sku: string;
  resolvedSku?: string;
  name: string;
  platform: AdPlatform;
  status: AdStatus;
  healthStatus: AdHealthStatus;
  systemRecommendation: SystemRecommendation;
  actualDecision?: SystemRecommendation;
  decisionReason?: string;
  dailyBudget: number;
  currentBudget: number;
  spendToday: number;
  attributedRevenueToday?: number;
  targetAcos?: number;
  spend7d?: number;
  spend14d?: number;
  conversionsToday?: number;
  conversions7d?: number;
  revenue7d?: number;
  impressions: number;
  clicks: number;
  conversions: number;
  lastUpdated: string;
  owner?: string;
  stockOnHand?: number;
  dailySales?: number;
  daysOfStockLeft?: number;
  stockConflict?: boolean;
  wasteFlag?: boolean;
  budgetSpike?: boolean;
  performanceDrop?: boolean;
  spendTrend?: "up" | "down" | "stable";
}

// ============================================
// AUTOMATION RULES TYPES
// ============================================

export type RuleCondition = "qty_below" | "qty_above" | "days_left_below" | "days_left_above";
export type RuleAction = "ads_pause" | "ads_reduce" | "ads_no_scale" | "ads_resume" | "send_alert";

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  priority: number; // Lower = higher priority
  enabled: boolean;
  condition: {
    type: RuleCondition;
    value: number;
    operator: "lt" | "lte" | "gt" | "gte" | "eq";
  };
  action: {
    type: RuleAction;
    params?: {
      budgetChange?: number; // Percentage change (-30, +20, etc)
      alertEmail?: string;
      message?: string;
    };
  };
}

// ============================================
// AUTOMATION MODES
// ============================================

export type AutomationMode = "manual" | "dry_run" | "auto";

export interface AutomationConfig {
  mode: AutomationMode;
  enabled: boolean;
  checkInterval: number; // minutes
  rules: AutomationRule[];
  alertEmail?: string;
  slackWebhook?: string;
}

// ============================================
// AUDIT LOG TYPES
// ============================================

export type AuditLogAction = 
  | "rule_triggered"
  | "ads_paused"
  | "ads_reduced"
  | "ads_resumed"
  | "budget_changed"
  | "alert_sent"
  | "stock_updated"
  | "manual_override";

export interface AuditLog {
  id: string;
  timestamp: string;
  action: AuditLogAction;
  sku: string;
  productName: string;
  ruleId?: string;
  ruleName?: string;
  reason: string;
  mode: AutomationMode;
  before: {
    qty?: number;
    adStatus?: AdStatus;
    dailyBudget?: number;
  };
  after: {
    qty?: number;
    adStatus?: AdStatus;
    dailyBudget?: number;
  };
  metadata?: {
    daysLeft?: number;
    dailySales?: number;
    platform?: AdPlatform;
    [key: string]: any;
  };
}

// ============================================
// DECISION TYPES
// ============================================

export interface AutomationDecision {
  id: string;
  timestamp: string;
  sku: string;
  productName: string;
  currentQty: number;
  dailySales: number;
  daysLeft: number;
  status: StockStatus;
  triggeredRules: AutomationRule[];
  recommendedActions: {
    action: AdAction;
    source: "rule" | "stock_cover" | "efficiency";
    reason: string;
    impact: string;
    priority: number;
  }[];
  aiExplanation?: string;
  executed: boolean;
  executedAt?: string;
}

// ============================================
// ALERT TYPES
// ============================================

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  sku: string;
  productName: string;
  title: string;
  message: string;
  actionRequired: boolean;
  resolved: boolean;
  resolvedAt?: string;
}

// ============================================
// DASHBOARD STATS TYPES
// ============================================

export interface AutomationStats {
  totalProducts: number;
  activeRules: number;
  todayDecisions: number;
  moneySaved: number; // Estimated savings
  criticalAlerts: number;
  pausedAds: number;
  reducedAds: number;
  lastCheck: string;
}

// ============================================
// API INTEGRATION TYPES
// ============================================

export interface MarketplaceApiConfig {
  platform: "Ozon" | "Wildberries";
  apiKey: string;
  clientId: string;
  enabled: boolean;
  rateLimitPerMinute: number;
  lastSync: string;
}

export interface StockUpdatePayload {
  sku: string;
  qty: number;
  dailySales: number;
  timestamp: string;
  source: "api" | "manual" | "import";
}

export interface AdUpdatePayload {
  campaignId: string;
  action: "pause" | "resume" | "change_budget";
  newBudget?: number;
  reason: string;
  timestamp: string;
}

// ============================================
// HELPER FUNCTIONS TYPES
// ============================================

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  reason: string;
  priority: number;
  recommendedAction: AdAction;
}

export interface StockCalculation {
  daysUntilStockout: number;
  reorderPoint: number;
  status: StockStatus;
  shouldReorder: boolean;
  criticalLevel: boolean;
}

// ============================================
// AD DECISION OVERRIDE TYPES
// ============================================

export interface AdDecisionOverride {
  id: string;
  campaignKey: string; // marketplace::sku
  actualDecision: SystemRecommendation;
  decisionReason: string;
  decidedBy: string;
  decidedAt: string;
}

// All types are exported inline above
