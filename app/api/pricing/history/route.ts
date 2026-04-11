import { requireAuth } from '@/lib/auth-guard';
/**
 * API Route: /api/pricing/history
 * GET - Get price change history (optionally filtered by sku)
 * POST - Record a price change
 */

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { PriceChangeEntry } from "@/src/pricing/types";
import type { ApprovalType } from "@/types/founder";
import { saveApproval, getApprovals } from "@/lib/founder-store";
import { calculateMinPrice } from "@/src/pricing/calculator";
import { readJsonFile } from "@/src/integrations/storage";
import type { FeesConfig, CogsState, PriceState } from "@/src/pricing/types";

const HISTORY_FILE = path.join(process.cwd(), "data", "canonical", "priceHistory.json");
const PRICES_FILE = path.join(process.cwd(), "data", "canonical", "prices.json");
const COGS_FILE = path.join(process.cwd(), "data", "canonical", "cogs.json");
const FEES_FILE = path.join(process.cwd(), "data", "canonical", "fees.json");

async function loadHistory(): Promise<PriceChangeEntry[]> {
  try {
    const data = await fs.readFile(HISTORY_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveHistory(history: PriceChangeEntry[]): Promise<void> {
  const dir = path.dirname(HISTORY_FILE);
  try { await fs.access(dir); } catch { await fs.mkdir(dir, { recursive: true }); }
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// Approval threshold: price drop > 15% or price below min triggers founder approval
const BIG_DROP_PCT = 0.15;

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get("sku");
    const marketplace = url.searchParams.get("marketplace");

    let history = await loadHistory();

    if (sku) {
      history = history.filter((h) => h.sku === sku);
    }
    if (marketplace) {
      history = history.filter((h) => h.marketplace === marketplace);
    }

    // Sort by most recent first
    history.sort((a, b) => b.changedAt.localeCompare(a.changedAt));

    return NextResponse.json({ history });
  } catch (err) {
    console.error("Error loading price history:", err);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;
  try {
    const body = await request.json();
    const { sku, marketplace, oldPrice, newPrice, oldDiscount, newDiscount, reason, changedBy } = body;

    if (!sku || !marketplace || !reason) {
      return NextResponse.json(
        { error: "sku, marketplace, and reason are required" },
        { status: 400 }
      );
    }

    // Check if approval is needed
    let approvalNeeded = false;
    let approvalType: ApprovalType = "price_below_min";
    let approvalId: string | undefined;

    // Check for big price drop (>15%)
    if (oldPrice > 0 && newPrice > 0) {
      const dropPct = (oldPrice - newPrice) / oldPrice;
      if (dropPct > BIG_DROP_PCT) {
        approvalNeeded = true;
        approvalType = "price_below_min";
      }
    }

    // T3-09: Aggressive promo → founder approval (discount >30%)
    const AGGRESSIVE_PROMO_PCT = 30;
    if (newDiscount > AGGRESSIVE_PROMO_PCT) {
      approvalNeeded = true;
      approvalType = "promo_loss_risk";
    }

    // Check if new price is below break-even
    try {
      const canonicalFees = await readJsonFile<FeesConfig[]>(FEES_FILE, []);
      const feeConfig = canonicalFees.find((f: any) => f.marketplace === marketplace);
      const canonicalCogs = await readJsonFile<CogsState[]>(COGS_FILE, []);
      const prices = await readJsonFile<PriceState[]>(PRICES_FILE, []);

      // Find COGS for this SKU
      let cogsCost = canonicalCogs.find((c: any) => c.sku === sku)?.cogs;
      if (!cogsCost) {
        const priceState = prices.find((p: any) => p.sku === sku);
        cogsCost = priceState?.costPrice || undefined;
      }

      if (feeConfig && cogsCost && newPrice > 0) {
        const minPrice = calculateMinPrice(cogsCost, feeConfig);
        if (newPrice < minPrice) {
          approvalNeeded = true;
          approvalType = "price_below_min";
        }
      }
    } catch {
      // Cannot check, proceed without approval
    }

    // Create approval if needed
    if (approvalNeeded) {
      approvalId = uuidv4();
      saveApproval({
        id: approvalId,
        entityType: newDiscount > AGGRESSIVE_PROMO_PCT ? "promo" : "price",
        entityId: `${sku}::${marketplace}`,
        approvalType,
        reason: newDiscount > AGGRESSIVE_PROMO_PCT
          ? `Aggressive promo: ${oldDiscount || 0}% → ${newDiscount}%. Price: ${oldPrice} → ${newPrice}. ${reason}`
          : `Price change: ${oldPrice} → ${newPrice}. ${reason}`,
        requestedBy: changedBy || "system",
        approverId: "user-001", // founder
        status: "pending",
        requestedAt: new Date().toISOString(),
      });
    }

    // Record history
    const entry: PriceChangeEntry = {
      id: uuidv4(),
      sku,
      marketplace,
      oldPrice: oldPrice || 0,
      newPrice: newPrice || 0,
      oldDiscount,
      newDiscount,
      reason,
      changedBy: changedBy || "system",
      changedAt: new Date().toISOString(),
      approvalId,
      approvalStatus: approvalNeeded ? "pending" : undefined,
    };

    const history = await loadHistory();
    history.push(entry);
    await saveHistory(history);

    return NextResponse.json({
      ok: true,
      entry,
      approvalNeeded,
      approvalId,
    });
  } catch (err) {
    console.error("Error recording price change:", err);
    return NextResponse.json({ error: "Failed to record change" }, { status: 500 });
  }
}
