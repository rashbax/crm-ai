import { requireAuth } from '@/lib/auth-guard';
/**
 * API Route: GET /api/integrations/enabled
 * Returns enabled connections - single source of truth for all pages
 */

import { NextResponse } from "next/server";
import { getEnabledConnections, hasEnabledConnections } from "@/src/integrations/enabled";

export async function GET() {
	const { error } = await requireAuth();
	if (error) return error;
  try {
    const isDryRun = process.env.DRY_RUN === "1";
    const enabledConnections = await getEnabledConnections();
    const hasConnections = await hasEnabledConnections();

    const mode = isDryRun || !hasConnections ? "demo" : "live";
    const warnings: string[] = [];

    if (isDryRun) {
      warnings.push("Running in DEMO mode - no real API connections");
    }

    if (!hasConnections && !isDryRun) {
      warnings.push("No connections configured - showing demo data");
    }

    return NextResponse.json({
      mode,
      warnings,
      enabledConnections,
    });
  } catch (error) {
    console.error("Error getting enabled connections:", error);
    return NextResponse.json(
      { error: "Failed to load enabled connections" },
      { status: 500 }
    );
  }
}
