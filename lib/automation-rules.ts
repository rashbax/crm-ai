// Default Automation Rules
// These are the core rules that prevent money waste on low-stock items

import type { AutomationRule } from "@/types/automation";

/**
 * Default automation rules for stock → ads management
 * Priority: Lower number = higher priority (executed first)
 */
export const DEFAULT_AUTOMATION_RULES: AutomationRule[] = [
  {
    id: "RULE-001",
    name: "Critical Stock - Pause Ads",
    description: "Pause all ads when stock falls below 200 units",
    priority: 1, // HIGHEST PRIORITY
    enabled: true,
    condition: {
      type: "qty_below",
      value: 200,
      operator: "lt",
    },
    action: {
      type: "ads_pause",
      params: {
        message: "Stock critically low. Ads paused to prevent wasted spend on out-of-stock items.",
      },
    },
  },
  {
    id: "RULE-002",
    name: "Low Stock - Reduce Ads Budget",
    description: "Reduce ad budget by 30% when stock is between 200-499 units",
    priority: 2,
    enabled: true,
    condition: {
      type: "qty_below",
      value: 500,
      operator: "lt",
    },
    action: {
      type: "ads_reduce",
      params: {
        budgetChange: -30, // Reduce by 30%
        message: "Stock running low. Reducing ad spend to extend inventory availability.",
      },
    },
  },
  {
    id: "RULE-003",
    name: "Normal Stock - No Scaling",
    description: "Maintain current ad budget when stock is 500-999 units (no scaling up)",
    priority: 3,
    enabled: true,
    condition: {
      type: "qty_below",
      value: 1000,
      operator: "lt",
    },
    action: {
      type: "ads_no_scale",
      params: {
        message: "Stock at normal levels. Maintaining current ad spend without scaling.",
      },
    },
  },
  {
    id: "RULE-004",
    name: "Good Stock - Resume Ads",
    description: "Resume normal ad operations when stock is 1000+ units",
    priority: 4,
    enabled: true,
    condition: {
      type: "qty_above",
      value: 999,
      operator: "gte",
    },
    action: {
      type: "ads_resume",
      params: {
        message: "Stock replenished. Resuming normal ad operations and budget.",
      },
    },
  },
  {
    id: "RULE-005",
    name: "Urgent Restock Alert",
    description: "Send alert when days until stockout is less than 7 days",
    priority: 2,
    enabled: true,
    condition: {
      type: "days_left_below",
      value: 7,
      operator: "lt",
    },
    action: {
      type: "send_alert",
      params: {
        message: "URGENT: Less than 7 days of stock remaining. Reorder immediately!",
      },
    },
  },
  {
    id: "RULE-006",
    name: "Restock Warning",
    description: "Send warning when days until stockout is less than 14 days",
    priority: 3,
    enabled: true,
    condition: {
      type: "days_left_below",
      value: 14,
      operator: "lt",
    },
    action: {
      type: "send_alert",
      params: {
        message: "WARNING: Less than 2 weeks of stock remaining. Plan reorder soon.",
      },
    },
  },
];

/**
 * Get active rules only
 */
export function getActiveRules(): AutomationRule[] {
  return DEFAULT_AUTOMATION_RULES.filter((rule) => rule.enabled);
}

/**
 * Get rule by ID
 */
export function getRuleById(id: string): AutomationRule | undefined {
  return DEFAULT_AUTOMATION_RULES.find((rule) => rule.id === id);
}

/**
 * Get rules by priority range
 */
export function getRulesByPriority(minPriority: number, maxPriority: number): AutomationRule[] {
  return DEFAULT_AUTOMATION_RULES.filter(
    (rule) => rule.priority >= minPriority && rule.priority <= maxPriority
  );
}

/**
 * Rule descriptions for UI
 */
export const RULE_DESCRIPTIONS = {
  "RULE-001": {
    short: "Critical Stock → Pause Ads",
    long: "When inventory drops below 200 units, all advertising campaigns are automatically paused to prevent spending money on products that will soon be out of stock.",
    impact: "High savings potential. Prevents wasted ad spend on unavailable products.",
    example: "Product has 150 units left → Ads paused → Saves ~₽3,500/week",
  },
  "RULE-002": {
    short: "Low Stock → Reduce Budget",
    long: "When inventory is between 200-499 units, ad budgets are reduced by 30% to slow down sales velocity and extend product availability.",
    impact: "Medium savings. Balances sales with inventory availability.",
    example: "Product has 350 units → Budget reduced 30% → Extends stock by ~3 days",
  },
  "RULE-003": {
    short: "Normal Stock → No Scaling",
    long: "When inventory is 500-999 units, ad campaigns continue at current levels without any scaling up to maintain steady stock levels.",
    impact: "Maintains stability. Prevents over-acceleration of sales.",
    example: "Product has 750 units → No changes → Steady sales pace maintained",
  },
  "RULE-004": {
    short: "Good Stock → Resume Ads",
    long: "When inventory reaches 1000+ units, all advertising campaigns are restored to normal operations and previous budget levels.",
    impact: "Maximizes sales potential when stock is healthy.",
    example: "Product restocked to 1200 units → Ads resumed → Full sales potential",
  },
  "RULE-005": {
    short: "7 Days Alert",
    long: "Urgent notification when stock will run out in less than 7 days based on current sales velocity.",
    impact: "Prevents stockouts through early warning.",
    example: "Product: 210 units, 30 sold/day → 7 days left → Alert sent",
  },
  "RULE-006": {
    short: "14 Days Warning",
    long: "Warning notification when stock will run out in less than 14 days, giving time to arrange reorder.",
    impact: "Proactive inventory management.",
    example: "Product: 400 units, 30 sold/day → 13 days left → Warning sent",
  },
};

/**
 * Get rule description
 */
export function getRuleDescription(ruleId: string): typeof RULE_DESCRIPTIONS[keyof typeof RULE_DESCRIPTIONS] | undefined {
  return RULE_DESCRIPTIONS[ruleId as keyof typeof RULE_DESCRIPTIONS];
}

/**
 * Export default rules
 */
export default DEFAULT_AUTOMATION_RULES;
