import { requireAuth } from "@/lib/auth-guard";
import { NextRequest, NextResponse } from "next/server";
import { loadAutomationSnapshot } from "@/lib/automation/snapshot";

export async function GET(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const snapshot = await loadAutomationSnapshot();
    const marketplace = request.nextUrl.searchParams.get("marketplace")?.toLowerCase();

    // Filter by marketplace if specified (not "all")
    if (marketplace && marketplace !== "all") {
      const mpFilter = marketplace === "wb" ? "Wildberries" : marketplace === "ozon" ? "Ozon" : null;
      if (mpFilter) {
        snapshot.stockItems = snapshot.stockItems.filter((s) => s.marketplace === mpFilter);
        snapshot.adCampaigns = snapshot.adCampaigns.filter((a) => a.platform === mpFilter);
        snapshot.meta.stocks = snapshot.stockItems.length;
        snapshot.meta.campaigns = snapshot.adCampaigns.length;
        snapshot.meta.totalAdSpend7d = Math.round(
          snapshot.adCampaigns.reduce((sum, a) => sum + (a.spend7d ?? 0), 0)
        );
      }
    }

    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("Error in automation API:", err);
    return NextResponse.json({ error: "Failed to load automation data" }, { status: 500 });
  }
}
