// Central file-based storage for Founder Control System (T3)
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type {
  SystemUser,
  SkuResponsibility,
  FounderTask,
  GeneralAuditLog,
  AuditEntityType,
  Incident,
  Approval,
  Appeal,
} from "@/types/founder";

const SECURE_DIR = join(process.cwd(), "data", "secure");

function readJson<T>(filename: string): T[] {
  try {
    const raw = readFileSync(join(SECURE_DIR, filename), "utf-8");
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function writeJson<T>(filename: string, data: T[]): void {
  writeFileSync(join(SECURE_DIR, filename), JSON.stringify(data, null, 2), "utf-8");
}

// ============================================
// SYSTEM USERS
// ============================================

export function getSystemUsers(): SystemUser[] {
  return readJson<SystemUser>("system-users.json");
}

export function getSystemUser(id: string): SystemUser | undefined {
  return getSystemUsers().find((u) => u.id === id);
}

// ============================================
// RESPONSIBILITY MATRIX
// ============================================

export function getResponsibilities(): SkuResponsibility[] {
  return readJson<SkuResponsibility>("responsibilities.json");
}

export function saveResponsibility(item: SkuResponsibility): void {
  const all = getResponsibilities();
  const idx = all.findIndex((r) => r.id === item.id);
  if (idx >= 0) {
    all[idx] = item;
  } else {
    all.push(item);
  }
  writeJson("responsibilities.json", all);
}

export function deleteResponsibility(id: string): void {
  const all = getResponsibilities().filter((r) => r.id !== id);
  writeJson("responsibilities.json", all);
}

// ============================================
// AD DECISION OVERRIDES
// ============================================

import type { AdDecisionOverride } from "@/types/automation";

export function getAdDecisionOverrides(): AdDecisionOverride[] {
  return readJson<AdDecisionOverride>("ad-decisions.json");
}

export function saveAdDecisionOverride(override: AdDecisionOverride): void {
  const all = getAdDecisionOverrides();
  const idx = all.findIndex((d) => d.campaignKey === override.campaignKey);
  if (idx >= 0) {
    all[idx] = override;
  } else {
    all.push(override);
  }
  writeJson("ad-decisions.json", all);
}

// ============================================
// FOUNDER TASKS
// ============================================

export function getFounderTasks(): FounderTask[] {
  const tasks = readJson<FounderTask>("founder-tasks.json");
  const now = new Date();
  // Compute signals: isOverdue, isStale — never mutate stored status
  return tasks.map((t) => {
    if (t.status === "done") {
      return { ...t, overdueDays: 0, isOverdue: false, isStale: false };
    }
    const due = new Date(t.dueDate);
    const overdueDays = Math.max(
      0,
      Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
    );
    const isOverdue = overdueDays > 0;
    // Stale: not updated in 3+ days (non-done, non-blocked tasks)
    const lastActivity = new Date(t.updatedAt || t.createdAt);
    const daysSinceActivity = Math.floor(
      (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    );
    // "done" already handled by early return above — only blocked/waiting are quiet by design
    const isStale =
      daysSinceActivity >= 3 &&
      t.status !== "blocked" &&
      t.status !== "waiting";
    return {
      ...t,
      impactLevel: t.impactLevel ?? "simple",
      recurrence: t.recurrence ?? "none",
      overdueDays,
      isOverdue,
      isStale,
    };
  });
}

export function saveFounderTask(task: FounderTask): void {
  const all = readJson<FounderTask>("founder-tasks.json");
  const idx = all.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    all[idx] = task;
  } else {
    all.push(task);
  }
  writeJson("founder-tasks.json", all);
}

export function deleteFounderTask(id: string): void {
  const all = readJson<FounderTask>("founder-tasks.json").filter((t) => t.id !== id);
  writeJson("founder-tasks.json", all);
}

// ============================================
// INCIDENTS (Sprint 2)
// ============================================

export function getIncidents(): Incident[] {
  const raw = readJson<any>("incidents.json");
  const now = new Date();
  const SILENT_HOURS = 12;
  return raw.map((i: any) => {
    // GAP 1: migrate legacy "escalated" status → in_progress + isEscalated: true
    const isEscalated: boolean = i.isEscalated || i.status === "escalated";
    const status = i.status === "escalated" ? "in_progress" : i.status;
    // GAP 5: compute isSilent — not resolved/closed and no update in 12h
    const isActive = status !== "resolved" && status !== "closed";
    const lastActivity = new Date(i.updatedAt || i.createdAt);
    const hoursSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
    const isSilent = isActive && hoursSinceActivity >= SILENT_HOURS;
    return {
      ...i,
      status,
      isEscalated,
      isSilent,
      createdBy: i.createdBy || "system",
      rootCause: i.rootCause || "",
      actionPlan: i.actionPlan || "",
      reopenCount: i.reopenCount ?? 0,
      reopenReasons: i.reopenReasons ?? [],
      linkedTaskIds: i.linkedTaskIds ?? [],
    } as Incident;
  });
}

export function saveIncident(incident: Incident): void {
  const all = getIncidents();
  const idx = all.findIndex((i) => i.id === incident.id);
  if (idx >= 0) {
    all[idx] = incident;
  } else {
    all.push(incident);
  }
  writeJson("incidents.json", all);
}

export function deleteIncident(id: string): void {
  const all = getIncidents().filter((i) => i.id !== id);
  writeJson("incidents.json", all);
}

// ============================================
// APPROVALS (Sprint 2)
// ============================================

export function getApprovals(): Approval[] {
  const raw = readJson<any>("approvals.json");
  const now = new Date();
  const STALE_HOURS = 24; // pending not touched in 24h → reminder signal
  return raw.map((a: any) => {
    // GAP 5: isExpired — pending past expiresAt
    const isExpired = a.status === "pending" && !!a.expiresAt && new Date(a.expiresAt) < now;
    // GAP 7: isStale — pending with no activity for 24h
    const lastActivity = new Date(a.decidedAt || a.requestedAt);
    const hoursSince = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
    const isStale = a.status === "pending" && hoursSince >= STALE_HOURS;
    return {
      ...a,
      priority: a.priority ?? "medium",
      isExpired,
      isStale,
      skuList: a.skuList ?? [],
    } as Approval;
  });
}

export function saveApproval(approval: Approval): void {
  const all = getApprovals();
  const idx = all.findIndex((a) => a.id === approval.id);
  if (idx >= 0) {
    all[idx] = approval;
  } else {
    all.push(approval);
  }
  writeJson("approvals.json", all);
}

export function deleteApproval(id: string): void {
  const all = getApprovals().filter((a) => a.id !== id);
  writeJson("approvals.json", all);
}

// ============================================
// APPEALS / MUROJAATLAR (T3-13)
// ============================================

export function getAppeals(): Appeal[] {
  const appeals = readJson<Appeal>("appeals.json");
  const now = new Date();
  return appeals.map((a) => ({
    ...a,
    slaBreached:
      a.status !== "yopilgan" &&
      a.status !== "javob_berilgan" &&
      now > new Date(a.slaDeadline),
  }));
}

export function saveAppeal(appeal: Appeal): void {
  const all = readJson<Appeal>("appeals.json");
  const idx = all.findIndex((a) => a.id === appeal.id);
  if (idx >= 0) {
    all[idx] = appeal;
  } else {
    all.push(appeal);
  }
  writeJson("appeals.json", all);
}

export function deleteAppeal(id: string): void {
  const all = readJson<Appeal>("appeals.json").filter((a) => a.id !== id);
  writeJson("appeals.json", all);
}

// ============================================
// AUDIT LOG
// ============================================

export function getAuditLogs(): GeneralAuditLog[] {
  return readJson<GeneralAuditLog>("audit-log.json");
}

export function writeAuditLog(
  entityType: AuditEntityType,
  entityId: string,
  fieldName: string,
  oldValue: string,
  newValue: string,
  changedBy: string
): void {
  const all = getAuditLogs();
  const entry: GeneralAuditLog = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entityType,
    entityId,
    fieldName,
    oldValue,
    newValue,
    changedBy,
    changedAt: new Date().toISOString(),
  };
  all.push(entry);
  // Keep last 5000 entries
  const trimmed = all.length > 5000 ? all.slice(all.length - 5000) : all;
  writeJson("audit-log.json", trimmed);
}
