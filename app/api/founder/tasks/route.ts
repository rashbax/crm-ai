import { NextRequest, NextResponse } from "next/server";
import {
  getFounderTasks,
  saveFounderTask,
  deleteFounderTask,
  getSystemUsers,
  writeAuditLog,
} from "@/lib/founder-store";
import type { FounderTask, TaskStatus } from "@/types/founder";

// Validate status transitions
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  new: ["in_progress", "blocked", "waiting"],
  in_progress: ["waiting", "blocked", "need_approval", "done"],
  waiting: ["in_progress", "blocked"],
  blocked: ["in_progress", "waiting"],
  need_approval: ["in_progress", "done"],
  done: [],
  overdue: ["in_progress", "blocked", "waiting"],
};

function validateTransition(from: TaskStatus, to: TaskStatus): string | null {
  if (from === to) return null;
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    return `Cannot transition from "${from}" to "${to}"`;
  }

  // T3 rule: waiting/blocked require reason
  if (to === "waiting") return null; // reason checked below
  if (to === "blocked") return null; // reason checked below
  // T3 rule: done requires proof
  if (to === "done") return null; // proof checked below

  return null;
}

export async function GET() {
  try {
    const tasks = getFounderTasks();
    const users = getSystemUsers();

    const stats = {
      total: tasks.length,
      new: tasks.filter((t) => t.status === "new").length,
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      waiting: tasks.filter((t) => t.status === "waiting").length,
      blocked: tasks.filter((t) => t.status === "blocked").length,
      needApproval: tasks.filter((t) => t.status === "need_approval").length,
      done: tasks.filter((t) => t.status === "done").length,
      overdue: tasks.filter((t) => t.status === "overdue").length,
    };

    return NextResponse.json({ tasks, stats, users });
  } catch (error) {
    console.error("Failed to get tasks:", error);
    return NextResponse.json({ error: "Failed to load tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "delete") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      deleteFounderTask(id);
      writeAuditLog("task", id, "deleted", "active", "deleted", body.changedBy || "system");
      return NextResponse.json({ ok: true });
    }

    if (action === "update_status") {
      const { id, status: newStatus, reason, proofType, proofValue, changedBy } = body;
      const tasks = getFounderTasks();
      const task = tasks.find((t) => t.id === id);
      if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

      // Validate transition
      const err = validateTransition(task.status, newStatus);
      if (err) return NextResponse.json({ error: err }, { status: 400 });

      // T3 discipline rules
      if (newStatus === "waiting" && !reason) {
        return NextResponse.json({ error: "waitingReason majburiy" }, { status: 400 });
      }
      if (newStatus === "blocked" && !reason) {
        return NextResponse.json({ error: "blockedReason majburiy" }, { status: 400 });
      }
      if (newStatus === "done" && !proofValue) {
        return NextResponse.json({ error: "proof bo'lishi shart" }, { status: 400 });
      }

      const oldStatus = task.status;
      task.status = newStatus;
      task.updatedAt = new Date().toISOString();

      if (newStatus === "waiting") task.waitingReason = reason;
      if (newStatus === "blocked") task.blockedReason = reason;
      if (newStatus === "done") {
        task.proofType = proofType || "text";
        task.proofValue = proofValue;
        task.completedAt = new Date().toISOString();
      }

      saveFounderTask(task);
      writeAuditLog("task", id, "status", oldStatus, newStatus, changedBy || "system");
      return NextResponse.json({ ok: true, task });
    }

    // Create or update task
    const now = new Date().toISOString();

    // T3 rules: task must have owner and deadline
    if (!body.assigneeId) {
      return NextResponse.json({ error: "Ownersiz task bo'lmaydi" }, { status: 400 });
    }
    if (!body.dueDate) {
      return NextResponse.json({ error: "Deadlinesiz task bo'lmaydi" }, { status: 400 });
    }

    const task: FounderTask = {
      id: body.id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: body.title || "",
      description: body.description || "",
      marketplace: body.marketplace || "all",
      skuId: body.skuId || undefined,
      taskType: body.taskType || "general",
      priority: body.priority || "medium",
      status: body.status || "new",
      assigneeId: body.assigneeId,
      creatorId: body.creatorId || "system",
      reviewerId: body.reviewerId || "",
      dueDate: body.dueDate,
      blockedReason: body.blockedReason,
      waitingReason: body.waitingReason,
      proofType: body.proofType,
      proofValue: body.proofValue,
      createdAt: body.createdAt || now,
      updatedAt: now,
      completedAt: body.completedAt,
      overdueDays: 0,
    };

    saveFounderTask(task);

    if (!body.id) {
      writeAuditLog("task", task.id, "created", "", task.title, body.changedBy || "system");
    }

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    console.error("Failed to save task:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
