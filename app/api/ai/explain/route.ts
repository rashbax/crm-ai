import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-guard";
import { getAutomationAiExplanation } from "@/lib/ai/automationAssistant";

const schema = z.object({
  sku: z.string().min(1),
  lang: z.enum(["ru", "uz"]).optional(),
});

export async function POST(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = schema.parse(body);
    const result = await getAutomationAiExplanation(parsed.sku, parsed.lang);
    return NextResponse.json(result);
  } catch (err) {
    console.error("AI explain failed:", err);
    return NextResponse.json({ error: "Failed to explain decision" }, { status: 400 });
  }
}

