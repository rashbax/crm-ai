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
// FOUNDER TASKS
// ============================================

export function getFounderTasks(): FounderTask[] {
  const tasks = readJson<FounderTask>("founder-tasks.json");
  const now = new Date();
  // Auto-calculate overdueDays
  return tasks.map((t) => {
    const s = t.status as string;
    if (s === "done") return t;
    const due = new Date(t.dueDate);
    const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    const noAutoOverride = ["done", "blocked", "waiting", "need_approval"];
    return {
      ...t,
      overdueDays: diff > 0 ? diff : 0,
      status: diff > 0 && !noAutoOverride.includes(s)
        ? "overdue" as const
        : t.status,
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
  return readJson<Incident>("incidents.json");
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
  return readJson<Approval>("approvals.json");
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
