import { NextRequest, NextResponse } from "next/server";
import {
  getApprovals,
  saveApproval,
  deleteApproval,
  getSystemUsers,
  saveFounderTask,
  writeAuditLog,
} from "@/lib/founder-store";
import type {
  Approval,
  ApprovalQueueResponse,
  ApprovalPriority,
  ApprovalType,
  FounderTask,
  TaskType,
  TaskPriority,
  TaskImpact,
} from "@/types/founder";

// P2: map approval type → task type
const APPROVAL_TO_TASK_TYPE: Record<ApprovalType, TaskType> = {
  price_below_min: "price_update",
  promo_loss_risk: "price_update",
  budget_over_limit: "ads_optimization",
  critical_stock_scale: "supply_order",
  owner_change: "general",
  general: "general",
};

// P2: map approval priority → task impact
const PRIORITY_TO_IMPACT: Record<ApprovalPriority, TaskImpact> = {
  critical: "critical",
  high: "important",
  medium: "simple",
  low: "simple",
};

function buildTaskTitle(approvalType: ApprovalType, skuId?: string, entityId?: string): string {
  const labels: Record<ApprovalType, string> = {
    price_below_min: "Установить цену ниже мин. маржи",
    promo_loss_risk: "Запустить акцию с риском убытка",
    budget_over_limit: "Применить бюджет выше лимита",
    critical_stock_scale: "Выполнить масштабирование при крит. стоке",
    owner_change: "Сменить ответственного",
    general: "Выполнить одобренное действие",
  };
  const base = labels[approvalType] || "Выполнить одобренное действие";
  const ref = skuId || entityId;
  return ref ? `${base}: ${ref}` : base;
}

const PRIORITY_ORDER: ApprovalPriority[] = ["critical", "high", "medium", "low"];

function sortApprovals(list: Approval[]): Approval[] {
  return [...list].sort((a, b) => {
    // Pending first
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    // GAP 4: within pending — critical first, then by expiry, then by date
    if (a.status === "pending" && b.status === "pending") {
      const priA = PRIORITY_ORDER.indexOf(a.priority ?? "medium");
      const priB = PRIORITY_ORDER.indexOf(b.priority ?? "medium");
      if (priA !== priB) return priA - priB;
      // Expiring soonest first
      if (a.expiresAt && b.expiresAt) {
        return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      }
      if (a.expiresAt && !b.expiresAt) return -1;
      if (!a.expiresAt && b.expiresAt) return 1;
    }
    return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
  });
}

export async function GET() {
  try {
    const approvals = getApprovals();
    const users = getSystemUsers();

    const stats: ApprovalQueueResponse["stats"] = {
      total: approvals.length,
      pending: approvals.filter((a) => a.status === "pending").length,
      approved: approvals.filter((a) => a.status === "approved").length,
      rejected: approvals.filter((a) => a.status === "rejected").length,
      // Signals
      expired: approvals.filter((a) => a.isExpired).length,
      stale: approvals.filter((a) => a.isStale).length,
      critical: approvals.filter((a) => a.status === "pending" && a.priority === "critical").length,
    };

    const response: ApprovalQueueResponse = {
      approvals: sortApprovals(approvals),
      stats,
      users,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to get approvals:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── DELETE ──────────────────────────────────────────────────────────────
    if (body.action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id majburiy" }, { status: 400 });
      deleteApproval(body.id);
      writeAuditLog("approval", body.id, "deleted", "active", "deleted", body.changedBy || "system");
      return NextResponse.json({ ok: true });
    }

    // ── DECIDE (approve / reject) ────────────────────────────────────────────
    if (body.action === "decide") {
      const approvals = getApprovals();
      const approval = approvals.find((a) => a.id === body.id);
      if (!approval) return NextResponse.json({ error: "Approval topilmadi" }, { status: 404 });
      if (approval.status !== "pending") {
        return NextResponse.json({ error: "Faqat pending holatdagi approvalga qaror berish mumkin" }, { status: 400 });
      }

      const decision = body.decision as "approved" | "rejected";
      if (decision !== "approved" && decision !== "rejected") {
        return NextResponse.json({ error: "decision: approved yoki rejected bo'lishi kerak" }, { status: 400 });
      }
      // GAP 6: decision comment is mandatory
      if (!body.decisionComment?.trim()) {
        return NextResponse.json({ error: "Qaror izohi (decisionComment) majburiy" }, { status: 400 });
      }

      const now = new Date().toISOString();
      const oldStatus = approval.status;
      const updated: Approval = {
        ...approval,
        status: decision,
        decisionComment: body.decisionComment.trim(),
        decidedAt: now,
        approvedAt: decision === "approved" ? now : approval.approvedAt,
        rejectedAt: decision === "rejected" ? now : approval.rejectedAt,
      };

      saveApproval(updated);
      writeAuditLog("approval", approval.id, "status", oldStatus, decision, body.changedBy || "founder");
      writeAuditLog("approval", approval.id, "decisionComment", "", body.decisionComment, body.changedBy || "founder");

      // P2: auto-create execution task when approved
      let autoTask: FounderTask | null = null;
      if (decision === "approved") {
        const taskNow = new Date().toISOString();
        // Due date: approval expiry or 3 days from now
        const dueDate = approval.expiresAt
          ? new Date(approval.expiresAt).toISOString().split("T")[0]
          : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

        autoTask = {
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: buildTaskTitle(approval.approvalType, approval.skuId, approval.entityId),
          description: [
            approval.reason,
            approval.oldValue ? `Было: ${approval.oldValue}` : "",
            approval.newValue ? `Станет: ${approval.newValue}` : "",
            approval.businessImpact ? `Влияние: ${approval.businessImpact}` : "",
          ].filter(Boolean).join(" | "),
          marketplace: (approval.marketplace as any) || "all",
          skuId: approval.skuId,
          taskType: APPROVAL_TO_TASK_TYPE[approval.approvalType] || "general",
          priority: (approval.priority as TaskPriority),
          impactLevel: PRIORITY_TO_IMPACT[approval.priority] || "simple",
          status: "new",
          assigneeId: approval.requestedBy,
          creatorId: approval.approverId,
          reviewerId: approval.approverId,
          dueDate,
          recurrence: "none",
          linkedApprovalId: approval.id,
          isOverdue: false,
          isStale: false,
          overdueDays: 0,
          createdAt: taskNow,
          updatedAt: taskNow,
        };
        saveFounderTask(autoTask);
        writeAuditLog("task", autoTask.id, "created", "", `Auto from approval ${approval.id}`, body.changedBy || "founder");
      }

      return NextResponse.json({ ok: true, approval: updated, autoTask });
    }

    // ── RESUBMIT (GAP 8): create new approval from rejected parent ──────────
    if (body.action === "resubmit") {
      const approvals = getApprovals();
      const parent = approvals.find((a) => a.id === body.id);
      if (!parent) return NextResponse.json({ error: "Approval topilmadi" }, { status: 404 });
      if (parent.status !== "rejected") {
        return NextResponse.json({ error: "Faqat rad etilgan approvalga qayta yuborish mumkin" }, { status: 400 });
      }

      const now = new Date().toISOString();
      const resubmitted: Approval = {
        ...parent,
        id: `appr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        status: "pending",
        reason: body.reason || parent.reason,
        newValue: body.newValue || parent.newValue,
        businessImpact: body.businessImpact || parent.businessImpact,
        requestedAt: now,
        decidedAt: undefined,
        approvedAt: undefined,
        rejectedAt: undefined,
        decisionComment: undefined,
        isExpired: false,
        isStale: false,
        parentApprovalId: parent.id,
      };

      saveApproval(resubmitted);
      writeAuditLog("approval", resubmitted.id, "created", "", `Resubmit of ${parent.id}`, body.changedBy || "system");
      return NextResponse.json({ ok: true, approval: resubmitted });
    }

    // ── CREATE ───────────────────────────────────────────────────────────────
    const now = new Date().toISOString();

    if (!body.reason?.trim()) return NextResponse.json({ error: "reason majburiy" }, { status: 400 });
    if (!body.requestedBy) return NextResponse.json({ error: "requestedBy majburiy" }, { status: 400 });
    if (!body.entityType) return NextResponse.json({ error: "entityType majburiy" }, { status: 400 });
    // P1: old/new value mandatory per spec §4 + §10
    if (!body.oldValue?.trim()) return NextResponse.json({ error: "oldValue (joriy qiymat) majburiy" }, { status: 400 });
    if (!body.newValue?.trim()) return NextResponse.json({ error: "newValue (yangi qiymat) majburiy" }, { status: 400 });

    const users = getSystemUsers();
    const founder = users.find((u) => u.role === "founder");

    const approval: Approval = {
      id: body.id || `appr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      entityType: body.entityType,
      entityId: body.entityId || "",
      approvalType: body.approvalType || "general",
      // GAP 4: priority
      priority: body.priority || "medium",
      // GAP 1: marketplace + SKU
      marketplace: body.marketplace || undefined,
      skuId: body.skuId || undefined,
      skuList: body.skuList || [],
      // GAP 2: old/new value
      oldValue: body.oldValue || undefined,
      newValue: body.newValue || undefined,
      // GAP 3: business impact
      businessImpact: body.businessImpact || undefined,
      reason: body.reason.trim(),
      requestedBy: body.requestedBy,
      approverId: body.approverId || founder?.id || "user-001",
      status: "pending",
      // GAP 5: expiry
      expiresAt: body.expiresAt || undefined,
      isExpired: false,
      isStale: false,
      requestedAt: now,
      decidedAt: undefined,
      approvedAt: undefined,
      rejectedAt: undefined,
      decisionComment: undefined,
      parentApprovalId: body.parentApprovalId || undefined,
    };

    saveApproval(approval);
    writeAuditLog("approval", approval.id, "created", "", approval.reason, body.requestedBy);

    return NextResponse.json({ ok: true, approval });
  } catch (error) {
    console.error("Failed to save approval:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
