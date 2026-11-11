// LLM provider abstraction (plan Section 4.1). Google Gemini free tier over REST, JSON output validated with zod.
//
// Quota safety (PROGRESS decisions): retry 429/5xx with backoff, then fall back to GEMINI_FALLBACK_MODEL.
// If both fail and DEMO_MODE=true, return the caller's sample output, labelled "sample" so the UI can say so.

import { z } from "zod";

export type LlmSource = "live" | "sample";

export interface LlmImage {
  mimeType: string;
  /** Base64 without the data: prefix. */
  base64: string;
}

export interface LlmResult<T> {
  data: T;
  /** Model id that answered, or "sample-output" when the sample was used. */
  model: string;
  source: LlmSource;
  /** Why the sample was used, when it was. */
  note?: string;
}

export interface GenerateJsonOptions<S extends z.ZodType> {
  system: string;
  prompt: string;
  schema: S;
  images?: LlmImage[];
  /** Returned (and labelled) only when Gemini is unavailable and DEMO_MODE=true. */
  sample: z.infer<S>;
}

class RetryableError extends Error {}

// A model that just hung or kept failing is skipped for a few minutes (gemini-3.8-flash hung for 60s+ on 2026-11-11).
const UNHEALTHY_MS = 5 * 60_000;
const unhealthyUntil = new Map<string, number>();

// Each free-tier model has its own quota, so a chain of models multiplies the free capacity for judging.
const DEFAULT_CHAIN = "gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest,gemini-3.8-flash";

/** Models in the order to try: GEMINI_MODEL first, then GEMINI_FALLBACK_MODELS (comma-separated). */
export function modelChain(): string[] {
  const list = [process.env.GEMINI_MODEL, ...(process.env.GEMINI_FALLBACK_MODELS ?? process.env.GEMINI_FALLBACK_MODEL ?? DEFAULT_CHAIN).split(",")]
    .map((m) => m?.trim())
    .filter((m): m is string => Boolean(m));
  return [...new Set(list)];
}

class QuotaError extends Error {}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Strips a ```json fence if the model added one. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

async function callGemini(model: string, system: string, userText: string, images: LlmImage[]): Promise<string> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: "user",
          parts: [
            ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.base64 } })),
            { text: userText },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(images.length ? 45_000 : 30_000),
  });
  if (response.status === 429) throw new QuotaError(`${model} is rate-limited or out of free quota (HTTP 429)`);
  if (response.status >= 500) {
    throw new RetryableError(`${model} returned HTTP ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(`${model} returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const json = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const candidate = json.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  if (!text) {
    throw new RetryableError(`${model} returned no text (${candidate?.finishReason ?? json.promptFeedback?.blockReason ?? "unknown"})`);
  }
  return text;
}

export async function generateJson<S extends z.ZodType>(options: GenerateJsonOptions<S>): Promise<LlmResult<z.infer<S>>> {
  const sampleResult = (note: string): LlmResult<z.infer<S>> => {
    if (process.env.DEMO_MODE !== "true") throw new Error(`Gemini unavailable: ${note}`);
    return { data: options.sample, model: "sample-output", source: "sample", note };
  };
  if (!process.env.GEMINI_API_KEY) return sampleResult("GEMINI_API_KEY is not set");

  const userText =
    `${options.prompt}\n\nRespond with only a JSON object that matches this JSON Schema:\n` +
    JSON.stringify(z.toJSONSchema(options.schema));
  const errors: string[] = [];
  const models = modelChain();
  // Skip a model that failed in the last few minutes, unless every model has.
  const healthy = models.filter((model) => (unhealthyUntil.get(model) ?? 0) < Date.now());

  for (const model of healthy.length ? healthy : models) {
    let ok = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await callGemini(model, options.system, userText, options.images ?? []);
        const parsed = options.schema.safeParse(extractJson(text));
        if (parsed.success) {
          unhealthyUntil.delete(model);
          return { data: parsed.data, model, source: "live" };
        }
        ok = true; // the model answers; only this output was off
        errors.push(`${model}: output did not match the schema (${parsed.error.issues[0]?.message ?? "invalid"})`);
      } catch (error) {
        errors.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof QuotaError) break; // no point retrying a spent quota: next model
        // A hung request (timeout) or a 4xx other than 429 will not improve on retry: move to the next model.
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        if (timedOut || (!(error instanceof RetryableError) && !(error instanceof SyntaxError))) break;
        await sleep(1500 * 2 ** attempt);
      }
    }
    if (!ok) unhealthyUntil.set(model, Date.now() + UNHEALTHY_MS);
  }
  console.error("[llm] falling back to sample output:", errors.join(" | "));
  return sampleResult(errors.at(-1) ?? "unknown error");
}

/** The model label written to AuditEvent.model. */
export function auditModel(result: LlmResult<unknown>): string {
  return result.source === "live" ? result.model : "sample-output (Gemini unavailable)";
}
