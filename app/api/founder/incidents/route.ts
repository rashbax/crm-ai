import { NextRequest, NextResponse } from "next/server";
import {
  getIncidents,
  saveIncident,
  deleteIncident,
  getSystemUsers,
  writeAuditLog,
} from "@/lib/founder-store";
import type { Incident, IncidentRegistryResponse } from "@/types/founder";

// Valid status transitions per T3
const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "escalated"],
  in_progress: ["resolved", "escalated"],
  escalated: ["in_progress", "resolved"],
  resolved: ["closed"],
  closed: [],
};

export async function GET() {
  try {
    const incidents = getIncidents();
    const users = getSystemUsers();

    const stats = {
      total: incidents.length,
      open: incidents.filter((i) => i.status === "open").length,
      inProgress: incidents.filter((i) => i.status === "in_progress").length,
      resolved: incidents.filter((i) => i.status === "resolved").length,
      escalated: incidents.filter((i) => i.status === "escalated").length,
      closed: incidents.filter((i) => i.status === "closed").length,
      critical: incidents.filter((i) => i.severity === "critical").length,
      high: incidents.filter((i) => i.severity === "high").length,
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

    // Delete action
    if (body.action === "delete") {
      if (!body.id) {
        return NextResponse.json({ error: "id majburiy" }, { status: 400 });
      }
      deleteIncident(body.id);
      writeAuditLog("incident", body.id, "deleted", "active", "deleted", body.changedBy || "system");
      return NextResponse.json({ ok: true });
    }

    // Update status action
    if (body.action === "update_status") {
      const incidents = getIncidents();
      const incident = incidents.find((i) => i.id === body.id);
      if (!incident) {
        return NextResponse.json({ error: "Incident topilmadi" }, { status: 404 });
      }

      const newStatus = body.status;
      const allowed = VALID_TRANSITIONS[incident.status] || [];
      if (!allowed.includes(newStatus)) {
        return NextResponse.json(
          { error: `${incident.status} → ${newStatus} o'tish mumkin emas` },
          { status: 400 }
        );
      }

      // T3 rule: Critical incident cannot close without owner
      if (newStatus === "resolved" && incident.severity === "critical" && !incident.ownerId) {
        return NextResponse.json(
          { error: "Critical incident ownersiz yopib bo'lmaydi" },
          { status: 400 }
        );
      }

      const oldStatus = incident.status;
      incident.status = newStatus;
      incident.updatedAt = new Date().toISOString();

      if (newStatus === "resolved") {
        incident.resolvedAt = new Date().toISOString();
      }
      if (newStatus === "escalated") {
        incident.escalatedAt = new Date().toISOString();
      }
      if (body.rootCause) {
        incident.rootCause = body.rootCause;
      }
      if (body.actionPlan) {
        incident.actionPlan = body.actionPlan;
      }

      saveIncident(incident);
      writeAuditLog("incident", incident.id, "status", oldStatus, newStatus, body.changedBy || "system");
      return NextResponse.json({ ok: true, incident });
    }

    // Create / update incident
    const now = new Date().toISOString();

    // Validation per T3
    if (!body.title) {
      return NextResponse.json({ error: "title majburiy" }, { status: 400 });
    }
    if (!body.ownerId) {
      return NextResponse.json({ error: "ownerId majburiy" }, { status: 400 });
    }
    if (!body.dueDate) {
      return NextResponse.json({ error: "dueDate majburiy" }, { status: 400 });
    }
    if (!body.severity) {
      return NextResponse.json({ error: "severity majburiy" }, { status: 400 });
    }
    if (!body.incidentType) {
      return NextResponse.json({ error: "incidentType majburiy" }, { status: 400 });
    }

    const incident: Incident = {
      id: body.id || `inc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      incidentType: body.incidentType,
      marketplace: body.marketplace || "all",
      skuId: body.skuId || undefined,
      title: body.title,
      severity: body.severity,
      status: body.status || "open",
      ownerId: body.ownerId,
      rootCause: body.rootCause || undefined,
      actionPlan: body.actionPlan || undefined,
      createdAt: body.createdAt || now,
      dueDate: body.dueDate,
      resolvedAt: body.resolvedAt || undefined,
      escalatedAt: body.escalatedAt || undefined,
      updatedAt: now,
    };

    const existing = getIncidents().find((i) => i.id === incident.id);
    saveIncident(incident);

    if (existing) {
      // Track field changes in audit
      const fields = ["severity", "ownerId", "status", "rootCause", "actionPlan"] as const;
      fields.forEach((f) => {
        const oldVal = (existing as any)[f] || "";
        const newVal = (incident as any)[f] || "";
        if (oldVal !== newVal) {
          writeAuditLog("incident", incident.id, f, String(oldVal), String(newVal), body.changedBy || "system");
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
