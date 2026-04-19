import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { saveAdDecisionOverride, saveApproval } from "@/lib/founder-store";
import type { SystemRecommendation } from "@/types/automation";
import type { Approval } from "@/types/founder";

const VALID_DECISIONS: SystemRecommendation[] = ["pause", "reduce", "no_scale", "keep"];

// Rank for escalation: lower = more restrictive
const DECISION_RANK: Record<SystemRecommendation, number> = {
  pause: 0,
  reduce: 1,
  no_scale: 2,
  keep: 3,
};

// If the override is 2+ ranks more permissive than system recommendation,
// it requires founder approval (e.g., system says "pause" but override says "keep")
function requiresApproval(
  systemRec: SystemRecommendation,
  actualDecision: SystemRecommendation
): boolean {
  const sysRank = DECISION_RANK[systemRec];
  const actRank = DECISION_RANK[actualDecision];
  return actRank - sysRank >= 2;
}

export async function POST(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const { campaignKey, actualDecision, decisionReason, systemRecommendation, sku } = body;

    if (!campaignKey || typeof campaignKey !== "string") {
      return NextResponse.json({ error: "campaignKey required" }, { status: 400 });
    }
    if (!VALID_DECISIONS.includes(actualDecision)) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }
    if (!decisionReason || typeof decisionReason !== "string" || decisionReason.trim().length === 0) {
      return NextResponse.json({ error: "Reason required" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Check if this override needs founder approval
    const needsApproval =
      systemRecommendation &&
      VALID_DECISIONS.includes(systemRecommendation) &&
      requiresApproval(systemRecommendation, actualDecision);

    if (needsApproval) {
      const approval: Approval = {
        id: `appr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        entityType: "ads_budget",
        entityId: campaignKey,
        approvalType: "budget_over_limit",
        priority: "high",
        reason: `Переопределение: система рекомендует "${systemRecommendation}", запрошено "${actualDecision}" для ${sku || campaignKey}. Причина: ${decisionReason.trim()}`,
        requestedBy: "manager",
        approverId: "founder",
        status: "pending",
        isExpired: false,
        isStale: false,
        requestedAt: now,
      };
      saveApproval(approval);
    }

    // Save the override (even if approval pending — UI will show pending state)
    saveAdDecisionOverride({
      id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      campaignKey,
      actualDecision,
      decisionReason: decisionReason.trim(),
      decidedBy: "founder",
      decidedAt: now,
    });

    return NextResponse.json({ ok: true, approvalRequired: needsApproval });
  } catch (err) {
    console.error("Error saving ad decision:", err);
    return NextResponse.json({ error: "Failed to save decision" }, { status: 500 });
  }
}
