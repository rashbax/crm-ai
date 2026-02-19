/**
 * Uzum Connector
 * NOTE: Uzum uses token as Authorization header WITHOUT "Bearer " prefix
 */

import type {
  MarketplaceConnector,
  TestConnectionResult,
  DateRange,
  UzumCredentials,
} from "./types";
import type { OrderEvent, StockState, AdsDaily, PriceState } from "@/src/pricing/types";

const REAL_API = process.env.REAL_API === "1";
const DRY_RUN = process.env.DRY_RUN === "1";

export const uzumConnector: MarketplaceConnector = {
  async testConnection(creds: UzumCredentials): Promise<TestConnectionResult> {
    if (!creds || !creds.token) {
      return { ok: false, error: "Token is required" };
    }

    if (DRY_RUN) {
      return { ok: true, accountLabel: "Demo Uzum Account" };
    }

    if (!REAL_API) {
      return {
        ok: true,
        accountLabel: `Uzum Account (${creds.token.substring(0, 8)}...)`,
      };
    }

    // TODO: Real Uzum API call
    // IMPORTANT: Uzum uses token WITHOUT "Bearer " prefix
    // const response = await fetch('https://api.uzum.uz/v1/account', {
    //   headers: { 'Authorization': creds.token } // No "Bearer "!
    // });
    // if (!response.ok) throw new Error('Connection failed');

    return { ok: true, accountLabel: "Uzum Account" };
  },

  async fetchOrders(creds: UzumCredentials, range?: DateRange): Promise<OrderEvent[]> {
    if (!REAL_API) {
      return [];
    }

    // TODO: Real Uzum orders API
    return [];
  },

  async fetchStocks(creds: UzumCredentials): Promise<StockState[]> {
    if (!REAL_API) {
      return [];
    }

    // TODO: Real Uzum stocks API
    return [];
  },

  async fetchAds(creds: UzumCredentials, range?: DateRange): Promise<AdsDaily[]> {
    if (!REAL_API) {
      return [];
    }

    // TODO: Real Uzum ads API
    return [];
  },

  async fetchPrices(creds: UzumCredentials): Promise<PriceState[]> {
    if (!REAL_API) {
      return [];
    }

    // TODO: Real Uzum prices API
    return [];
  },
};
