import { NextRequest, NextResponse } from "next/server";
import {
  getIncidents,
  saveIncident,
  deleteIncident,
  getSystemUsers,
  writeAuditLog,
} from "@/lib/founder-store";
import type { Incident, IncidentStatus, IncidentRegistryResponse } from "@/types/founder";

// GAP 1/2: escalated removed as status (now isEscalated flag); added waiting + reopened
const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ["in_progress", "waiting"],
  in_progress: ["waiting", "resolved"],
  waiting: ["in_progress", "resolved"],
  resolved: ["closed"],
  closed: [],
  reopened: ["in_progress", "waiting"],
};

export async function GET() {
  try {
    const incidents = getIncidents();
    const users = getSystemUsers();

    const stats: IncidentRegistryResponse["stats"] = {
      total: incidents.length,
      open: incidents.filter((i) => i.status === "open").length,
      inProgress: incidents.filter((i) => i.status === "in_progress").length,
      waiting: incidents.filter((i) => i.status === "waiting").length,
      resolved: incidents.filter((i) => i.status === "resolved").length,
      reopened: incidents.filter((i) => i.status === "reopened").length,
      closed: incidents.filter((i) => i.status === "closed").length,
      critical: incidents.filter((i) => i.severity === "critical").length,
      high: incidents.filter((i) => i.severity === "high").length,
      // Signals
      silent: incidents.filter((i) => i.isSilent).length,
      noOwner: incidents.filter(
        (i) => !i.ownerId && i.status !== "resolved" && i.status !== "closed"
      ).length,
      escalated: incidents.filter(
        (i) => i.isEscalated && i.status !== "resolved" && i.status !== "closed"
      ).length,
    };

    const response: IncidentRegistryResponse = { incidents, stats, users };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to get incidents:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── DELETE ──────────────────────────────────────────────────────────────
    if (body.action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id majburiy" }, { status: 400 });
      deleteIncident(body.id);
      writeAuditLog("incident", body.id, "deleted", "active", "deleted", body.changedBy || "system");
      return NextResponse.json({ ok: true });
    }

    // ── UPDATE STATUS ────────────────────────────────────────────────────────
    if (body.action === "update_status") {
      const incidents = getIncidents();
      const incident = incidents.find((i) => i.id === body.id);
      if (!incident) return NextResponse.json({ error: "Incident topilmadi" }, { status: 404 });

      const newStatus: IncidentStatus = body.status;
      const allowed = VALID_TRANSITIONS[incident.status] || [];
      if (!allowed.includes(newStatus)) {
        return NextResponse.json(
          { error: `${incident.status} → ${newStatus} o'tish mumkin emas` },
          { status: 400 }
        );
      }

      // GAP 3: Critical incident must have owner to resolve
      if (newStatus === "resolved" && incident.severity === "critical" && !incident.ownerId) {
        return NextResponse.json({ error: "Kritik muammo ownersiz yopib bo'lmaydi" }, { status: 400 });
      }
      // GAP 4: rootCause mandatory when resolving
      const rootCause = body.rootCause ?? incident.rootCause;
      if (newStatus === "resolved" && !rootCause?.trim()) {
        return NextResponse.json({ error: "Hal qilingan muammo uchun sabab (rootCause) majburiy" }, { status: 400 });
      }
      // GAP 4: actionPlan mandatory when resolving
      const actionPlan = body.actionPlan ?? incident.actionPlan;
      if (newStatus === "resolved" && !actionPlan?.trim()) {
        return NextResponse.json({ error: "Hal qilingan muammo uchun action plan majburiy" }, { status: 400 });
      }

      const oldStatus = incident.status;
      const updated: Incident = {
        ...incident,
        status: newStatus,
        rootCause: rootCause || incident.rootCause,
        actionPlan: actionPlan || incident.actionPlan,
        updatedAt: new Date().toISOString(),
        resolvedAt: newStatus === "resolved" ? new Date().toISOString() : incident.resolvedAt,
        closedAt: newStatus === "closed" ? new Date().toISOString() : incident.closedAt,
        closerId: newStatus === "closed" ? (body.changedBy || incident.closerId) : incident.closerId,
      };

      saveIncident(updated);
      writeAuditLog("incident", incident.id, "status", oldStatus, newStatus, body.changedBy || "system");
      return NextResponse.json({ ok: true, incident: updated });
    }

    // ── ESCALATE / DE-ESCALATE (GAP 1) ──────────────────────────────────────
    if (body.action === "escalate" || body.action === "deescalate") {
      const incidents = getIncidents();
      const incident = incidents.find((i) => i.id === body.id);
      if (!incident) return NextResponse.json({ error: "Incident topilmadi" }, { status: 404 });

      const isEscalated = body.action === "escalate";
      const updated: Incident = {
        ...incident,
        isEscalated,
        escalatedAt: isEscalated ? new Date().toISOString() : incident.escalatedAt,
        updatedAt: new Date().toISOString(),
      };
      saveIncident(updated);
      writeAuditLog(
        "incident", incident.id, "isEscalated",
        String(!isEscalated), String(isEscalated),
        body.changedBy || "system"
      );
      return NextResponse.json({ ok: true, incident: updated });
    }

    // ── REOPEN (GAP 9) ───────────────────────────────────────────────────────
    if (body.action === "reopen") {
      const incidents = getIncidents();
      const incident = incidents.find((i) => i.id === body.id);
      if (!incident) return NextResponse.json({ error: "Incident topilmadi" }, { status: 404 });
      if (incident.status !== "resolved" && incident.status !== "closed") {
        return NextResponse.json({ error: "Faqat hal qilingan yoki yopilgan muammo qayta ochiladi" }, { status: 400 });
      }

      const reason = body.reason || "";
      const updated: Incident = {
        ...incident,
        status: "reopened",
        reopenCount: (incident.reopenCount || 0) + 1,
        reopenReasons: [...(incident.reopenReasons || []), reason],
        updatedAt: new Date().toISOString(),
      };
      saveIncident(updated);
      writeAuditLog("incident", incident.id, "status", incident.status, "reopened", body.changedBy || "system");
      writeAuditLog("incident", incident.id, "reopenReason", "", reason, body.changedBy || "system");
      return NextResponse.json({ ok: true, incident: updated });
    }

    // ── CREATE / UPDATE ──────────────────────────────────────────────────────
    const now = new Date().toISOString();

    // GAP 4: mandatory fields
    if (!body.title?.trim()) return NextResponse.json({ error: "title majburiy" }, { status: 400 });
    if (!body.ownerId) return NextResponse.json({ error: "ownerId majburiy" }, { status: 400 });
    if (!body.dueDate) return NextResponse.json({ error: "dueDate majburiy" }, { status: 400 });
    if (!body.severity) return NextResponse.json({ error: "severity majburiy" }, { status: 400 });
    if (!body.incidentType) return NextResponse.json({ error: "incidentType majburiy" }, { status: 400 });
    if (!body.rootCause?.trim()) return NextResponse.json({ error: "rootCause majburiy" }, { status: 400 });
    if (!body.actionPlan?.trim()) return NextResponse.json({ error: "actionPlan majburiy" }, { status: 400 });

    const incident: Incident = {
      id: body.id || `inc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      incidentType: body.incidentType,
      marketplace: body.marketplace || "all",
      skuId: body.skuId || undefined,
      title: body.title.trim(),
      severity: body.severity,
      status: body.status || "open",
      ownerId: body.ownerId,
      // GAP 3: role fields
      createdBy: body.changedBy || "system",
      reviewerId: body.reviewerId || undefined,
      closerId: body.closerId || undefined,
      // GAP 4: mandatory
      rootCause: body.rootCause.trim(),
      actionPlan: body.actionPlan.trim(),
      // GAP 1: escalation flag
      isEscalated: body.isEscalated || false,
      isSilent: false,
      // GAP 9: reopen tracking
      reopenCount: body.reopenCount || 0,
      reopenReasons: body.reopenReasons || [],
      // GAP 8: linked tasks
      linkedTaskIds: body.linkedTaskIds || [],
      estimatedLoss: body.estimatedLoss || undefined,
      createdAt: body.createdAt || now,
      dueDate: body.dueDate,
      resolvedAt: body.resolvedAt || undefined,
      escalatedAt: body.escalatedAt || undefined,
      closedAt: body.closedAt || undefined,
      updatedAt: now,
    };

    const existing = getIncidents().find((i) => i.id === incident.id);
    saveIncident(incident);

    if (existing) {
      const fields = ["severity", "ownerId", "status", "rootCause", "actionPlan", "isEscalated"] as const;
      fields.forEach((f) => {
        const oldVal = String((existing as any)[f] ?? "");
        const newVal = String((incident as any)[f] ?? "");
        if (oldVal !== newVal) {
          writeAuditLog("incident", incident.id, f, oldVal, newVal, body.changedBy || "system");
        }
      });
    } else {
      writeAuditLog("incident", incident.id, "created", "", incident.title, body.changedBy || "system");
    }

    return NextResponse.json({ ok: true, incident });
  } catch (error) {
    console.error("Failed to save incident:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
