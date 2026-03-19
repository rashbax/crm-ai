import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getAutomationAiSummary } from "@/lib/ai/automationAssistant";

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get("lang") || "ru";
    const result = await getAutomationAiSummary(lang);
    return NextResponse.json(result);
  } catch (err) {
    console.error("AI summary failed:", err);
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}

