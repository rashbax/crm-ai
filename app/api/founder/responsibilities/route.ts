import { NextRequest, NextResponse } from "next/server";
import {
  getResponsibilities,
  saveResponsibility,
  deleteResponsibility,
  getSystemUsers,
  writeAuditLog,
} from "@/lib/founder-store";
import type { SkuResponsibility } from "@/types/founder";

export async function GET() {
  try {
    const matrix = getResponsibilities();
    const users = getSystemUsers();
    const noOwnerCount = matrix.filter(
      (r) => !r.marketplaceOwnerId && !r.adsOwnerId && !r.contentOwnerId && !r.supplyOwnerId
    ).length;
    return NextResponse.json({
      matrix,
      users,
      skuCount: matrix.length,
      noOwnerCount,
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

    // Create or update
    const now = new Date().toISOString();
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
      active: body.active !== false,
      createdAt: body.createdAt || now,
      updatedAt: now,
    };

    // Audit log for changes
    if (body.id) {
      const existing = getResponsibilities().find((r) => r.id === body.id);
      if (existing) {
        const fields: (keyof SkuResponsibility)[] = [
          "marketplaceOwnerId", "adsOwnerId", "contentOwnerId", "supplyOwnerId", "reviewerId", "backupOwnerId",
        ];
        for (const f of fields) {
          if (String(existing[f]) !== String(item[f])) {
            writeAuditLog("responsibility", item.id, f, String(existing[f]), String(item[f]), body.changedBy || "system");
          }
        }
      }
    }

    saveResponsibility(item);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    console.error("Failed to save responsibility:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
