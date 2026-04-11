import { NextRequest, NextResponse } from "next/server";
import {
  getAppeals,
  saveAppeal,
  deleteAppeal,
  getSystemUsers,
  writeAuditLog,
} from "@/lib/founder-store";
import type { Appeal, AppealType, AppealReply, AppealRegistryResponse } from "@/types/founder";

// SLA hours per appeal type
const SLA_HOURS: Record<AppealType, number> = {
  shikoyat: 4,
  sharh: 8,
  savol: 24,
  buyurtma: 12,
};

// Valid status transitions per T3-13
const VALID_TRANSITIONS: Record<string, string[]> = {
  yangi: ["jarayonda", "kutyapti"],
  jarayonda: ["javob_berilgan", "kutyapti"],
  kutyapti: ["jarayonda"],
  javob_berilgan: ["yopilgan", "yangi"],
  yopilgan: ["yangi"],
};

function calcSlaDeadline(appealType: AppealType, sentiment: string, fromDate?: string): string {
  let hours = SLA_HOURS[appealType];
  // Negative reviews get tighter SLA
  if (appealType === "sharh" && sentiment === "negative") {
    hours = 8;
  } else if (appealType === "sharh") {
    hours = 24;
  }
  const base = fromDate ? new Date(fromDate) : new Date();
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export async function GET() {
  try {
    const appeals = getAppeals();
    const users = getSystemUsers();

    const active = appeals.filter((a) => a.status !== "yopilgan");
    const stats = {
      total: appeals.length,
      yangi: appeals.filter((a) => a.status === "yangi").length,
      jarayonda: appeals.filter((a) => a.status === "jarayonda").length,
      kutyapti: appeals.filter((a) => a.status === "kutyapti").length,
      javob_berilgan: appeals.filter((a) => a.status === "javob_berilgan").length,
      yopilgan: appeals.filter((a) => a.status === "yopilgan").length,
      slaBreached: active.filter((a) => a.slaBreached).length,
      negative: active.filter((a) => a.sentiment === "negative").length,
    };

    const response: AppealRegistryResponse = { appeals, stats, users };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to get appeals:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Delete action
    if (body.action === "delete") {
      if (!body.id) {
        return NextResponse.json({ error: "id majburiy" }, { status: 400 });
      }
      deleteAppeal(body.id);
      writeAuditLog("appeal", body.id, "deleted", "active", "deleted", body.changedBy || "system");
      return NextResponse.json({ ok: true });
    }

    // Update status action
    if (body.action === "update_status") {
      const appeals = getAppeals();
      const appeal = appeals.find((a) => a.id === body.id);
      if (!appeal) {
        return NextResponse.json({ error: "Murojaat topilmadi" }, { status: 404 });
      }

      const newStatus = body.status;
      const allowed = VALID_TRANSITIONS[appeal.status] || [];
      if (!allowed.includes(newStatus)) {
        return NextResponse.json(
          { error: `${appeal.status} → ${newStatus} o'tish mumkin emas` },
          { status: 400 }
        );
      }

      const oldStatus = appeal.status;
      appeal.status = newStatus;
      appeal.updatedAt = new Date().toISOString();

      if (newStatus === "yopilgan") {
        appeal.closedAt = new Date().toISOString();
      }
      if (newStatus === "yangi" && oldStatus === "yopilgan") {
        appeal.closedAt = undefined;
      }

      saveAppeal(appeal);
      writeAuditLog("appeal", appeal.id, "status", oldStatus, newStatus, body.changedBy || "system");
      return NextResponse.json({ ok: true, appeal });
    }

    // Reply action
    if (body.action === "reply") {
      const appeals = getAppeals();
      const appeal = appeals.find((a) => a.id === body.id);
      if (!appeal) {
        return NextResponse.json({ error: "Murojaat topilmadi" }, { status: 404 });
      }
      if (!body.text) {
        return NextResponse.json({ error: "Javob matni majburiy" }, { status: 400 });
      }

      const reply: AppealReply = {
        id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: body.text,
        repliedBy: body.repliedBy || "system",
        repliedAt: new Date().toISOString(),
        outcome: body.outcome || "pending",
      };

      appeal.replies = [...(appeal.replies || []), reply];
      const oldStatus = appeal.status;
      appeal.status = "javob_berilgan";
      appeal.updatedAt = new Date().toISOString();

      saveAppeal(appeal);
      writeAuditLog("appeal", appeal.id, "reply", oldStatus, "javob_berilgan", body.repliedBy || "system");
      return NextResponse.json({ ok: true, appeal });
    }

    // Escalate action
    if (body.action === "escalate") {
      const appeals = getAppeals();
      const appeal = appeals.find((a) => a.id === body.id);
      if (!appeal) {
        return NextResponse.json({ error: "Murojaat topilmadi" }, { status: 404 });
      }

      appeal.escalatedTo = body.escalatedTo || "founder";
      appeal.escalatedAt = new Date().toISOString();
      appeal.updatedAt = new Date().toISOString();

      saveAppeal(appeal);
      writeAuditLog("appeal", appeal.id, "escalated", "", appeal.escalatedTo, body.changedBy || "system");
      return NextResponse.json({ ok: true, appeal });
    }

    // Create / update appeal
    const now = new Date().toISOString();

    if (!body.customerName) {
      return NextResponse.json({ error: "customerName majburiy" }, { status: 400 });
    }
    if (!body.message) {
      return NextResponse.json({ error: "message majburiy" }, { status: 400 });
    }
    if (!body.marketplace) {
      return NextResponse.json({ error: "marketplace majburiy" }, { status: 400 });
    }
    if (!body.appealType) {
      return NextResponse.json({ error: "appealType majburiy" }, { status: 400 });
    }
    if (!body.ownerId) {
      return NextResponse.json({ error: "ownerId majburiy" }, { status: 400 });
    }

    const appeal: Appeal = {
      id: body.id || `appeal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      marketplace: body.marketplace,
      appealType: body.appealType,
      customerName: body.customerName,
      message: body.message,
      orderId: body.orderId || undefined,
      skuId: body.skuId || undefined,
      status: body.status || "yangi",
      priority: body.priority || "medium",
      sentiment: body.sentiment || "neutral",
      ownerId: body.ownerId,
      tags: body.tags || [],
      slaDeadline: body.slaDeadline || calcSlaDeadline(body.appealType, body.sentiment || "neutral", body.createdAt),
      slaBreached: false,
      replies: body.replies || [],
      escalatedTo: body.escalatedTo || undefined,
      escalatedAt: body.escalatedAt || undefined,
      createdAt: body.createdAt || now,
      updatedAt: now,
      closedAt: body.closedAt || undefined,
    };

    const existing = getAppeals().find((a) => a.id === appeal.id);
    saveAppeal(appeal);

    if (existing) {
      const fields = ["priority", "ownerId", "status", "sentiment", "appealType"] as const;
      fields.forEach((f) => {
        const oldVal = (existing as any)[f] || "";
        const newVal = (appeal as any)[f] || "";
        if (oldVal !== newVal) {
          writeAuditLog("appeal", appeal.id, f, String(oldVal), String(newVal), body.changedBy || "system");
        }
      });
    } else {
      writeAuditLog("appeal", appeal.id, "created", "", appeal.customerName, body.changedBy || "system");
    }

    return NextResponse.json({ ok: true, appeal });
  } catch (error) {
    console.error("Failed to save appeal:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
