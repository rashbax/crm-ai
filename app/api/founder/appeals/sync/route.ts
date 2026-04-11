import { NextResponse } from "next/server";
import path from "path";
import { getAppeals, saveAppeal, getSystemUsers, writeAuditLog } from "@/lib/founder-store";
import { getConnector } from "@/src/connectors";
import { decryptCredentials } from "@/lib/encryption";
import { getCredentialsForDataType } from "@/src/integrations/capabilities";
import type { ReviewItem } from "@/src/pricing/types";
import type { Appeal, AppealType, AppealSentiment, MarketplaceId } from "@/types/founder";

const CONNECTIONS_FILE = path.join(process.cwd(), "data", "secure", "connections.json");

function readConnections(): any[] {
  try {
    const { readFileSync } = require("fs");
    const raw = readFileSync(CONNECTIONS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return data?.connections || [];
  } catch {
    return [];
  }
}

function resolveCreds(raw: Record<string, string> | string | undefined): Record<string, string> | null {
  if (!raw) return null;
  if (typeof raw === "string") return decryptCredentials(raw);
  return raw;
}

function reviewToAppealType(review: ReviewItem): AppealType {
  if (review.type === "question") return "savol";
  if (review.type === "feedback") return "sharh";
  return "sharh"; // reviews map to sharh
}

function reviewToSentiment(review: ReviewItem): AppealSentiment {
  if (review.rating !== undefined) {
    if (review.rating <= 2) return "negative";
    if (review.rating >= 4) return "positive";
    return "neutral";
  }
  return "neutral";
}

function mapMarketplaceId(mp: string): MarketplaceId {
  if (mp === "ozon") return "Ozon";
  if (mp === "wb") return "WB";
  return "Ozon";
}

// SLA hours
const SLA_HOURS: Record<AppealType, number> = {
  shikoyat: 4,
  sharh: 8,
  savol: 24,
  buyurtma: 12,
};

function calcSlaDeadline(appealType: AppealType, sentiment: AppealSentiment, fromDate?: string): string {
  let hours = SLA_HOURS[appealType];
  if (appealType === "sharh" && sentiment === "negative") {
    hours = 8;
  } else if (appealType === "sharh") {
    hours = 24;
  }
  const base = fromDate ? new Date(fromDate) : new Date();
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export async function POST() {
  try {
    const connections = readConnections();
    const enabled = connections.filter((c: any) => c?.enabled);

    if (enabled.length === 0) {
      return NextResponse.json({ ok: false, error: "No enabled connections" }, { status: 400 });
    }

    const existingAppeals = getAppeals();
    const existingIds = new Set(existingAppeals.map((a) => a.id));
    const users = getSystemUsers();
    const defaultOwnerId = users.find((u) => u.role === "founder")?.id || users[0]?.id || "system";

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const connection of enabled) {
      const marketplaceId = connection.marketplaceId;
      const connector = getConnector(marketplaceId);
      if (!connector || !connector.fetchReviews) {
        continue;
      }

      try {
        const creds = resolveCreds(getCredentialsForDataType(connection, "orders")) || {}; // reuse orders creds, fallback to empty for demo mode

        const reviews = await connector.fetchReviews(creds as any);

        for (const review of reviews) {
          // Use review source ID to create a stable appeal ID
          const appealId = `appeal-${review.id}`;

          if (existingIds.has(appealId)) {
            skipped++;
            continue;
          }

          const appealType = reviewToAppealType(review);
          const sentiment = reviewToSentiment(review);
          const now = new Date().toISOString();

          const appeal: Appeal = {
            id: appealId,
            marketplace: mapMarketplaceId(marketplaceId),
            appealType,
            customerName: review.author || "Покупатель",
            message: review.text,
            orderId: undefined,
            skuId: review.sku || undefined,
            status: review.answer ? "javob_berilgan" : "yangi",
            priority: sentiment === "negative" ? "high" : "medium",
            sentiment,
            ownerId: defaultOwnerId,
            tags: review.rating ? [`${review.rating}/5`] : [],
            slaDeadline: calcSlaDeadline(appealType, sentiment, review.createdAt),
            slaBreached: false,
            replies: review.answer
              ? [
                  {
                    id: `reply-sync-${review.id}`,
                    text: review.answer,
                    repliedBy: defaultOwnerId,
                    repliedAt: review.answeredAt || now,
                    outcome: "resolved" as const,
                  },
                ]
              : [],
            createdAt: review.createdAt || now,
            updatedAt: now,
          };

          saveAppeal(appeal);
          existingIds.add(appealId);
          writeAuditLog("appeal", appealId, "synced", "", `${marketplaceId}:${review.type}`, "system");
          imported++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${marketplaceId}: ${msg}`);
      }
    }

    return NextResponse.json({
      ok: true,
      imported,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Review sync failed:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
