import { NextRequest, NextResponse } from "next/server";
import { getAuditLogs } from "@/lib/founder-store";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    let logs = getAuditLogs();

    if (entityType) logs = logs.filter((l) => l.entityType === entityType);
    if (entityId) logs = logs.filter((l) => l.entityId === entityId);

    // Most recent first
    logs.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
    logs = logs.slice(0, limit);

    return NextResponse.json({ logs, total: logs.length });
  } catch (error) {
    console.error("Failed to get audit logs:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
