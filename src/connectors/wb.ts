/**
 * Wildberries Connector
 */

import type {
  MarketplaceConnector,
  TestConnectionResult,
  DateRange,
  WBCredentials,
} from "./types";
import type { OrderEvent, StockState, AdsDaily, PriceState } from "@/src/pricing/types";

const REAL_API = process.env.REAL_API === "1";
const DRY_RUN = process.env.DRY_RUN === "1";

export const wbConnector: MarketplaceConnector = {
  async testConnection(creds: WBCredentials): Promise<TestConnectionResult> {
    if (!creds || !creds.token) {
      return { ok: false, error: "Token is required" };
    }

    if (DRY_RUN) {
      return { ok: true, accountLabel: "Demo WB Account" };
    }

    if (!REAL_API) {
      // Mock mode - simulate success for testing
      return {
        ok: true,
        accountLabel: `WB Account (${creds.token.substring(0, 8)}...)`,
      };
    }

    // TODO: Real WB API call
    // const response = await fetch('https://suppliers-api.wildberries.ru/ping', {
    //   headers: { 'Authorization': creds.token }
    // });
    // if (!response.ok) throw new Error('Connection failed');

    return { ok: true, accountLabel: "WB Account" };
  },

  async fetchOrders(creds: WBCredentials, range?: DateRange): Promise<OrderEvent[]> {
    if (!REAL_API) {
      return []; // Return empty in mock mode
    }

    // TODO: Real WB orders API
    // const response = await fetch('https://suppliers-api.wildberries.ru/api/v3/orders', {
    //   headers: { 'Authorization': creds.token }
    // });
    // const data = await response.json();
    // return normalizeWBOrders(data);

    return [];
  },

  async fetchStocks(creds: WBCredentials): Promise<StockState[]> {
    if (!REAL_API) {
      return [];
    }

    // TODO: Real WB stocks API
    // const response = await fetch('https://suppliers-api.wildberries.ru/api/v3/stocks', {
    //   headers: { 'Authorization': creds.token }
    // });
    // const data = await response.json();
    // return normalizeWBStocks(data);

    return [];
  },

  async fetchAds(creds: WBCredentials, range?: DateRange): Promise<AdsDaily[]> {
    if (!REAL_API) {
      return [];
    }

    // TODO: Real WB ads API
    // const response = await fetch('https://advert-api.wildberries.ru/adv/v1/stat', {
    //   headers: { 'Authorization': creds.token }
    // });
    // const data = await response.json();
    // return normalizeWBAds(data);

    return [];
  },

  async fetchPrices(creds: WBCredentials): Promise<PriceState[]> {
    if (!REAL_API) {
      return [];
    }

    // TODO: Real WB prices API
    // const response = await fetch('https://suppliers-api.wildberries.ru/api/v2/prices', {
    //   headers: { 'Authorization': creds.token }
    // });
    // const data = await response.json();
    // return normalizeWBPrices(data);

    return [];
  },
};
