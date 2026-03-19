import type { Marketplace, PricingRules } from "./types";

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

const MARKETPLACE_RULES: Partial<Record<Marketplace, Partial<PricingRules>>> = {
  ozon: {
    indexThresholds: {
      badMaxMarginPct: 0.05,
      moderateMaxMarginPct: 0.12,
      goodMaxMarginPct: 0.22,
    },
  },
  wb: {
    indexThresholds: {
      badMaxMarginPct: 0.05,
      moderateMaxMarginPct: 0.11,
      goodMaxMarginPct: 0.2,
    },
  },
  uzum: {
    indexThresholds: {
      badMaxMarginPct: 0.04,
      moderateMaxMarginPct: 0.1,
      goodMaxMarginPct: 0.18,
    },
  },
  ym: {
    indexThresholds: {
      badMaxMarginPct: 0.05,
      moderateMaxMarginPct: 0.12,
      goodMaxMarginPct: 0.21,
    },
  },
};

function mergeRules(base: PricingRules, override?: Partial<PricingRules>): PricingRules {
  return {
    indexThresholds: {
      badMaxMarginPct:
        override?.indexThresholds?.badMaxMarginPct ?? base.indexThresholds.badMaxMarginPct,
      moderateMaxMarginPct:
        override?.indexThresholds?.moderateMaxMarginPct ?? base.indexThresholds.moderateMaxMarginPct,
      goodMaxMarginPct:
        override?.indexThresholds?.goodMaxMarginPct ?? base.indexThresholds.goodMaxMarginPct,
    },
    guardrails: {
      lowMarginBlockPct:
        override?.guardrails?.lowMarginBlockPct ?? base.guardrails.lowMarginBlockPct,
    },
  };
}

export function getPricingRules(marketplace: Marketplace): PricingRules {
  return mergeRules(DEFAULT_RULES, MARKETPLACE_RULES[marketplace]);
}

export function getPricingRulesMap(): Record<Marketplace, PricingRules> {
  return {
    wb: getPricingRules("wb"),
    ozon: getPricingRules("ozon"),
    uzum: getPricingRules("uzum"),
    ym: getPricingRules("ym"),
  };
}

