import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-guard";
import { getAutomationAiAnswer } from "@/lib/ai/automationAssistant";

const schema = z.object({
  question: z.string().min(2),
  lang: z.enum(["ru", "uz"]).optional(),
});

export async function POST(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = schema.parse(body);
    const result = await getAutomationAiAnswer(parsed.question, parsed.lang);
    return NextResponse.json(result);
  } catch (err) {
    console.error("AI ask failed:", err);
    return NextResponse.json({ error: "Failed to answer question" }, { status: 400 });
  }
}

