// Shared classification logic used by both the Workflow and the batch HTTP endpoint.

export type RawRow = { id: number; content: string; source: string };

export type ClassifiedResult = {
  product: "workers-ai" | "d1" | "workflows";
  theme: string;
  sentiment: "positive" | "negative" | "neutral";
  sentiment_score: number;
  urgency: number;
  urgency_label: "low" | "medium" | "high" | "critical";
};

const VALID_PRODUCTS = ["workers-ai", "d1", "workflows"] as const;
const VALID_SENTIMENTS = ["positive", "negative", "neutral"] as const;
const VALID_THEMES = [
  "rate-limits", "data-reliability", "documentation", "debugging",
  "developer-experience", "performance", "pricing", "onboarding",
  "feature-request", "integration", "error-handling", "api-design",
  "migration-tooling",
] as const;
const URGENCY_LABELS: Record<number, ClassifiedResult["urgency_label"]> = {
  1: "low", 2: "medium", 3: "high", 4: "critical",
};

const SYSTEM_PROMPT = `You are a feedback classifier for Cloudflare developer products.
Given a piece of user feedback, return a JSON object with exactly these fields:

- product: which Cloudflare product the feedback is about. One of: "workers-ai", "d1", "workflows"
- theme: the main topic in kebab-case. One of: "rate-limits", "data-reliability", "documentation", "debugging", "developer-experience", "performance", "pricing", "onboarding", "feature-request", "integration", "error-handling", "api-design", "migration-tooling"
- sentiment: overall tone. One of: "positive", "negative", "neutral"
- sentiment_score: float from -1.0 (very negative) to 1.0 (very positive)
- urgency: integer 1–4. 1=low (general opinion), 2=medium (friction/inconvenience), 3=high (blocking issue), 4=critical (data loss or outage)
- urgency_label: text for urgency. One of: "low", "medium", "high", "critical"

Return only valid JSON. No explanation.`;

export async function classifyRow(ai: Ai, row: RawRow): Promise<ClassifiedResult> {
  const aiResult = await (ai as any).run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Source: ${row.source}\nFeedback: ${row.content}` },
    ],
    max_tokens: 256,
  });

  const text: string = (aiResult as { response?: string }).response ?? "{}";
  const match = text.match(/\{[\s\S]*\}/);
  const raw = JSON.parse(match?.[0] ?? "{}") as Partial<ClassifiedResult>;

  const urgency = Math.max(1, Math.min(4, Math.round(Number(raw.urgency) || 1)));
  const sentiment_score = Math.max(-1.0, Math.min(1.0, Number(raw.sentiment_score) || 0));

  return {
    product: (VALID_PRODUCTS as readonly string[]).includes(raw.product ?? "")
      ? (raw.product as ClassifiedResult["product"])
      : "workers-ai",
    theme: (VALID_THEMES as readonly string[]).includes(raw.theme ?? "")
      ? (raw.theme as string)
      : "developer-experience",
    sentiment: (VALID_SENTIMENTS as readonly string[]).includes(raw.sentiment ?? "")
      ? (raw.sentiment as ClassifiedResult["sentiment"])
      : "neutral",
    sentiment_score,
    urgency,
    urgency_label: URGENCY_LABELS[urgency],
  };
}

export const INSERT_SQL = `INSERT OR IGNORE INTO feedback_processed
  (id, product, theme, sentiment, sentiment_score, urgency, urgency_label)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;
