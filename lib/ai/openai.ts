interface GenerateTextOptions {
  system: string;
  prompt: string;
  model?: string;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function generateAiText(options: GenerateTextOptions): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const model = options.model || process.env.OPENAI_MODEL || "gpt-5-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: options.system },
        { role: "user", content: options.prompt },
      ],
      reasoning: { effort: "medium" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };

  const outputText = payload.output_text?.trim();
  if (outputText) return outputText;

  const fromOutput =
    payload.output
      ?.flatMap((item) => item.content || [])
      .map((part) => (part.type === "output_text" || part.type === "text" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim() || "";

  if (!fromOutput) throw new Error("OpenAI API returned empty output");
  return fromOutput;
}
