import { NextRequest, NextResponse } from "next/server";
import {
  getResponsibilities,
  saveResponsibility,
  deleteResponsibility,
  getSystemUsers,
  getFounderTasks,
  getIncidents,
  writeAuditLog,
} from "@/lib/founder-store";
import type { SkuResponsibility, AssignmentStatus } from "@/types/founder";

// Default authority limits per role (spec §7)
const DEFAULT_AUTHORITY: Record<string, string> = {
  marketplaceOwnerId: "Kundalik operatsiya va odatiy tasklar",
  adsOwnerId: "Kelishilgan limit ichida kampaniya va byudjet",
  contentOwnerId: "Kontent yangilash va listing tuzatish",
  supplyOwnerId: "Stock xavfi bo'yicha standart tasklar",
  reviewerId: "Yopilgan ish va muhim o'zgarishni tekshirish",
  backupOwnerId: "Asosiy egasi yo'qligida barcha vakolatlar",
};

export async function GET() {
  try {
    const matrix = getResponsibilities();
    const users = getSystemUsers();
    const allTasks = getFounderTasks();
    const allIncidents = getIncidents();

    const noOwnerCount = matrix.filter(
      (r) => !r.marketplaceOwnerId && !r.adsOwnerId && !r.contentOwnerId && !r.supplyOwnerId
    ).length;

    // GAP 10: Signals — per-person SKU load
    const OVERLOAD_THRESHOLD = 5; // >5 SKUs for one person is overload
    const roleFields = ["marketplaceOwnerId", "adsOwnerId", "contentOwnerId", "supplyOwnerId"] as const;

    const skuCountPerUser: Record<string, number> = {};
    for (const r of matrix) {
      for (const field of roleFields) {
        const uid = r[field];
        if (uid) skuCountPerUser[uid] = (skuCountPerUser[uid] || 0) + 1;
      }
    }

    const overloadedUsers = Object.entries(skuCountPerUser)
      .filter(([, count]) => count > OVERLOAD_THRESHOLD)
      .map(([userId, skuCount]) => ({
        userId,
        userName: users.find((u) => u.id === userId)?.name || userId,
        skuCount,
      }));

    // GAP 10: critical SKUs without backup (no backupOwnerId)
    const noBackupCount = matrix.filter(
      (r) => r.assignmentStatus === "active" && !r.backupOwnerId
    ).length;

    // GAP 7: Manager workload per user
    const managerWorkload = users
      .filter((u) => u.role === "manager" || u.role === "reviewer")
      .map((u) => {
        const ownedSkus = matrix.filter((r) =>
          roleFields.some((f) => r[f] === u.id)
        ).length;

        const riskySkus = matrix.filter((r) =>
          roleFields.some((f) => r[f] === u.id)
        ).length; // simplified — full risky logic in dashboard

        const openIncidents = allIncidents.filter(
          (i) => i.ownerId === u.id && i.status !== "resolved" && i.status !== "closed"
        ).length;

        const overdueTasks = allTasks.filter(
          (t) => t.assigneeId === u.id && t.isOverdue
        ).length;

        return {
          userId: u.id,
          userName: u.name,
          role: u.role,
          skuCount: ownedSkus,
          openIncidents,
          overdueTasks,
        };
      });

    return NextResponse.json({
      matrix,
      users,
      skuCount: matrix.length,
      noOwnerCount,
      noBackupCount,
      overloadedUsers,
      managerWorkload,
    });
  } catch (error) {
    console.error("Failed to get responsibilities:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "delete") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      deleteResponsibility(id);
      writeAuditLog("responsibility", id, "deleted", "active", "deleted", body.changedBy || "system");
      return NextResponse.json({ ok: true });
    }

    const now = new Date().toISOString();
    const assignmentStatus: AssignmentStatus = body.assignmentStatus || "active";

    const item: SkuResponsibility = {
      id: body.id || `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      skuId: body.skuId || "",
      marketplace: body.marketplace || "WB",
      marketplaceOwnerId: body.marketplaceOwnerId || "",
      adsOwnerId: body.adsOwnerId || "",
      contentOwnerId: body.contentOwnerId || "",
      supplyOwnerId: body.supplyOwnerId || "",
      reviewerId: body.reviewerId || "",
      backupOwnerId: body.backupOwnerId || "",
      // GAP 1: startDate
      startDate: body.startDate || now.slice(0, 10),
      // GAP 2: 4-state assignmentStatus
      assignmentStatus,
      // GAP 3: authority limit
      authorityLimit: body.authorityLimit || DEFAULT_AUTHORITY["marketplaceOwnerId"],
      // GAP 4: notes
      notes: body.notes || undefined,
      // Legacy active derived from status
      active: assignmentStatus === "active" || assignmentStatus === "backup_active",
      createdAt: body.createdAt || now,
      updatedAt: now,
    };

    // Audit log for field changes
    if (body.id) {
      const existing = getResponsibilities().find((r) => r.id === body.id);
      if (existing) {
        const fields: (keyof SkuResponsibility)[] = [
          "marketplaceOwnerId", "adsOwnerId", "contentOwnerId", "supplyOwnerId",
          "reviewerId", "backupOwnerId", "assignmentStatus", "authorityLimit", "startDate",
        ];
        for (const f of fields) {
          if (String(existing[f] ?? "") !== String(item[f] ?? "")) {
            writeAuditLog("responsibility", item.id, f, String(existing[f] ?? ""), String(item[f] ?? ""), body.changedBy || "system");
          }
        }
      }
    } else {
      writeAuditLog("responsibility", item.id, "created", "", item.skuId, body.changedBy || "system");
    }

    saveResponsibility(item);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    console.error("Failed to save responsibility:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
