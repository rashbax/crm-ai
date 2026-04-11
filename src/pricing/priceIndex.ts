import type { PriceIndexPair } from "./types";

export type OzonPriceIndexState = "NONE" | "GOOD" | "MODERATE" | "BAD";

export interface OzonPriceIndexResult {
  state: OzonPriceIndexState;
  ratios: number[];
  usedPairs: PriceIndexPair[];
}

const OZON_GREEN_MAX_RATIO = 1.03;
const OZON_RED_MIN_RATIO = 1.1;
const OZON_MAX_PAIRS = 3;

function isValidPair(pair: PriceIndexPair | null | undefined): pair is PriceIndexPair {
  if (!pair) return false;
  if (!Number.isFinite(pair.ownPrice) || pair.ownPrice <= 0) return false;
  if (!Number.isFinite(pair.marketPrice) || pair.marketPrice <= 0) return false;
  return true;
}

export function selectOzonPricePairs(pairs: PriceIndexPair[]): PriceIndexPair[] {
  return pairs
    .filter(isValidPair)
    .sort((a, b) => (b.orders || 0) - (a.orders || 0))
    .slice(0, OZON_MAX_PAIRS);
}

/**
 * Map real Ozon color_index string to our state.
 * Ozon returns: "GREEN", "YELLOW", "RED", "WITHOUT_INDEX"
 */
export function mapOzonColorIndex(colorIndex: string | undefined): OzonPriceIndexState | null {
  if (!colorIndex) return null;
  const upper = colorIndex.toUpperCase();
  if (upper === "GREEN") return "GOOD";
  if (upper === "YELLOW") return "MODERATE";
  if (upper === "RED") return "BAD";
  if (upper === "WITHOUT_INDEX") return "NONE";
  return null;
}

export function evaluateOzonPriceIndex(
  pairs: PriceIndexPair[],
  ozonColorIndex?: string
): OzonPriceIndexResult {
  const usedPairs = selectOzonPricePairs(pairs);

  // If we have real Ozon color_index, use it as the authoritative state
  const realState = mapOzonColorIndex(ozonColorIndex);
  if (realState !== null && usedPairs.length > 0) {
    const ratios = usedPairs.map((pair) => pair.ownPrice / pair.marketPrice);
    return { state: realState, ratios, usedPairs };
  }
  if (realState !== null && usedPairs.length === 0) {
    return { state: realState, ratios: [], usedPairs: [] };
  }

  // Fallback: calculate from pairs
  if (usedPairs.length === 0) {
    return { state: "NONE", ratios: [], usedPairs: [] };
  }

  const ratios = usedPairs.map((pair) => pair.ownPrice / pair.marketPrice);
  const allGreen = ratios.every((ratio) => ratio <= OZON_GREEN_MAX_RATIO);
  const allRed = ratios.every((ratio) => ratio > OZON_RED_MIN_RATIO);

  if (allGreen) {
    return { state: "GOOD", ratios, usedPairs };
  }
  if (allRed) {
    return { state: "BAD", ratios, usedPairs };
  }
  return { state: "MODERATE", ratios, usedPairs };
}
