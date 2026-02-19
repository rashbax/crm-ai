/**
 * Yandex Market Connector
 */

import type {
  MarketplaceConnector,
  TestConnectionResult,
  DateRange,
  YMCredentials,
} from "./types";
import type { OrderEvent, StockState, AdsDaily, PriceState } from "@/src/pricing/types";

const REAL_API = process.env.REAL_API === "1";
const DRY_RUN = process.env.DRY_RUN === "1";

export const ymConnector: MarketplaceConnector = {
  async testConnection(creds: YMCredentials): Promise<TestConnectionResult> {
    if (!creds || !creds.apiKey) {
      return { ok: false, error: "API key is required" };
    }

    if (DRY_RUN) {
      return { ok: true, accountLabel: "Demo YM Account" };
    }

    if (!REAL_API) {
      return {
        ok: true,
        accountLabel: `YM Account (${creds.apiKey.substring(0, 8)}...)`,
      };
    }

    // TODO: Real Yandex Market API call
    // const response = await fetch('https://api.partner.market.yandex.ru/v2/campaigns', {
    //   headers: { 'Authorization': `OAuth ${creds.apiKey}` }
    // });
    // if (!response.ok) throw new Error('Connection failed');

    return { ok: true, accountLabel: "YM Account" };
  },

  async fetchOrders(creds: YMCredentials, range?: DateRange): Promise<OrderEvent[]> {
    if (!REAL_API) {
      return [];
    }

    // TODO: Real YM orders API
    return [];
  },

  async fetchStocks(creds: YMCredentials): Promise<StockState[]> {
    if (!REAL_API) {
      return [];
    }

    // TODO: Real YM stocks API
    return [];
  },

  async fetchAds(creds: YMCredentials, range?: DateRange): Promise<AdsDaily[]> {
    if (!REAL_API) {
      return [];
    }

    // TODO: Real YM ads API
    return [];
  },

  async fetchPrices(creds: YMCredentials): Promise<PriceState[]> {
    if (!REAL_API) {
      return [];
    }

    // TODO: Real YM prices API
    return [];
  },
};
