import { requireAuth } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { loadAutomationSnapshot } from "@/lib/automation/snapshot";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const snapshot = await loadAutomationSnapshot();
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("Error in automation API:", err);
    return NextResponse.json({ error: "Failed to load automation data" }, { status: 500 });
  }
}
