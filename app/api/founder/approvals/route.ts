import { NextRequest, NextResponse } from "next/server";
import {
  getApprovals,
  saveApproval,
  deleteApproval,
  getSystemUsers,
  writeAuditLog,
} from "@/lib/founder-store";
import type { Approval, ApprovalQueueResponse } from "@/types/founder";

export async function GET() {
  try {
    const approvals = getApprovals();
    const users = getSystemUsers();

    // Sort: pending first, then by date
    const sorted = [...approvals].sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
    });

    const stats = {
      total: approvals.length,
      pending: approvals.filter((a) => a.status === "pending").length,
      approved: approvals.filter((a) => a.status === "approved").length,
      rejected: approvals.filter((a) => a.status === "rejected").length,
    };

    const response: ApprovalQueueResponse = { approvals: sorted, stats, users };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to get approvals:", error);
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
      deleteApproval(body.id);
      writeAuditLog("approval", body.id, "deleted", "active", "deleted", body.changedBy || "system");
      return NextResponse.json({ ok: true });
    }

    // Decide action (approve / reject)
    if (body.action === "decide") {
      const approvals = getApprovals();
      const approval = approvals.find((a) => a.id === body.id);
      if (!approval) {
        return NextResponse.json({ error: "Approval topilmadi" }, { status: 404 });
      }
      if (approval.status !== "pending") {
        return NextResponse.json({ error: "Faqat pending holatdagi approvalga qaror berish mumkin" }, { status: 400 });
      }

      const decision = body.decision; // "approved" | "rejected"
      if (decision !== "approved" && decision !== "rejected") {
        return NextResponse.json({ error: "decision: approved yoki rejected bo'lishi kerak" }, { status: 400 });
      }

      const oldStatus = approval.status;
      approval.status = decision;
      approval.decidedAt = new Date().toISOString();
      approval.decisionComment = body.decisionComment || undefined;

      saveApproval(approval);
      writeAuditLog("approval", approval.id, "status", oldStatus, decision, body.changedBy || "founder");
      return NextResponse.json({ ok: true, approval });
    }

    // Create new approval request
    const now = new Date().toISOString();

    if (!body.reason) {
      return NextResponse.json({ error: "reason majburiy" }, { status: 400 });
    }
    if (!body.requestedBy) {
      return NextResponse.json({ error: "requestedBy majburiy" }, { status: 400 });
    }
    if (!body.entityType) {
      return NextResponse.json({ error: "entityType majburiy" }, { status: 400 });
    }

    // Default approverId = founder (user-001)
    const users = getSystemUsers();
    const founder = users.find((u) => u.role === "founder");

    const approval: Approval = {
      id: body.id || `appr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      entityType: body.entityType,
      entityId: body.entityId || "",
      approvalType: body.approvalType || "general",
      reason: body.reason,
      requestedBy: body.requestedBy,
      approverId: body.approverId || founder?.id || "user-001",
      status: "pending",
      requestedAt: now,
      decidedAt: undefined,
      decisionComment: undefined,
    };

    saveApproval(approval);
    writeAuditLog("approval", approval.id, "created", "", approval.reason, body.requestedBy);

    return NextResponse.json({ ok: true, approval });
  } catch (error) {
    console.error("Failed to save approval:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
