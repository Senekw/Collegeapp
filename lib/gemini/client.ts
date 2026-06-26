// Gemini structured-output client (server-only).
//
// Wraps @google/genai v2.x `models.generateContent` for the single shape this
// app needs: send a JSON payload, get back schema-validated JSON. The Gemini
// API key is resolved via resolveGeminiApiKey() (Settings DB, then env) and
// the SDK and process.env (through the constants helper), so it must only ever
// be imported by server code.
//
// SDK API used (confirmed against @google/genai@2.10.0 type defs):
//   new GoogleGenAI({ apiKey })                         -> GoogleGenAIOptions.apiKey
//   client.models.generateContent({ model, contents, config })
//     config: GenerateContentConfig {
//       temperature, responseMimeType, responseSchema (SchemaUnion),
//       systemInstruction (ContentUnion)
//     }
//   response.text            -> string | undefined  (getter)
//   response.usageMetadata   -> { promptTokenCount, candidatesTokenCount,
//                                 totalTokenCount } | undefined

import { GoogleGenAI } from "@google/genai";
import type { ZodType } from "zod";

import { resolveGeminiApiKey } from "@/lib/settings";
import type { GeminiSchema } from "@/lib/gemini/schemas";

/** Thrown when the Gemini API key is missing. Distinct so callers/UI can tell
 *  "not configured" apart from "the model call failed". */
export class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

/** Thrown when a Gemini call fails after all retries, or returns output that
 *  cannot be parsed into the expected schema (even after one repair attempt). */
export class GeminiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "GeminiError";
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

const MAX_TRANSPORT_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

export interface CallStructuredOptions<T> {
  model: string;
  systemPrompt: string;
  userPayload: unknown;
  schema: ZodType<T>;
  responseSchema: GeminiSchema;
}

/**
 * Call Gemini and return parsed, schema-valid JSON of type T.
 *
 * - Retries transient transport failures (429 / 5xx / network) up to 3 times
 *   with exponential backoff.
 * - If the returned text fails to JSON.parse or fails schema.parse, performs
 *   exactly ONE repair round-trip (resending the raw output + the parse error
 *   and asking for schema-valid JSON only). If that also fails, throws
 *   GeminiError.
 */
export async function callStructured<T>(opts: CallStructuredOptions<T>): Promise<T> {
  const { model, systemPrompt, userPayload, schema, responseSchema } = opts;

  const apiKey = await resolveGeminiApiKey();
  if (!apiKey) {
    throw new GeminiConfigError(
      "Gemini API key is not configured. Add one on the Settings page (or set GEMINI_API_KEY in .env.local).",
    );
  }

  const client = new GoogleGenAI({ apiKey });
  const payloadJson = JSON.stringify(userPayload);

  // First attempt: send the payload as-is.
  const firstRaw = await generateWithRetry(client, {
    model,
    systemPrompt,
    contents: payloadJson,
    responseSchema,
  });

  const firstParsed = tryParse(firstRaw, schema);
  if (firstParsed.ok) return firstParsed.value;

  // Repair round-trip: hand the model its own bad output + the error and ask
  // for corrected, schema-valid JSON only.
  const repairContents = buildRepairPrompt(payloadJson, firstRaw, firstParsed.error);
  const repairRaw = await generateWithRetry(client, {
    model,
    systemPrompt,
    contents: repairContents,
    responseSchema,
  });

  const repairParsed = tryParse(repairRaw, schema);
  if (repairParsed.ok) return repairParsed.value;

  throw new GeminiError(
    `Gemini returned output that failed schema validation after one repair attempt: ${repairParsed.error}`,
  );
}

/** A web source returned by Google Search grounding. */
export interface GroundingSource {
  uri: string;
  title: string | null;
}

export interface CallGroundedResult {
  text: string;
  sources: GroundingSource[];
  searchQueries: string[];
}

/**
 * Call Gemini with the Google Search grounding tool and return the grounded
 * free-text answer plus its real source citations. (§4.2)
 *
 * IMPORTANT: the Gemini API does NOT allow combining the googleSearch tool with
 * responseMimeType="application/json" + responseSchema, so this returns TEXT.
 * The enrichment layer pairs this with a separate callStructured() extraction
 * step to turn the grounded text + sources into validated JSON.
 *
 * Citations come from candidates[0].groundingMetadata.groundingChunks[].web
 * (confirmed against the @google/genai@2.x type defs). Retries transient
 * transport failures like callStructured.
 */
export async function callGrounded(opts: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<CallGroundedResult> {
  const { model, systemPrompt, userPrompt } = opts;

  const apiKey = await resolveGeminiApiKey();
  if (!apiKey) {
    throw new GeminiConfigError(
      "Gemini API key is not configured. Add one on the Settings page (or set GEMINI_API_KEY in .env.local).",
    );
  }

  const client = new GoogleGenAI({ apiKey });
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_TRANSPORT_RETRIES; attempt++) {
    const startedAt = performance.now();
    try {
      const response = await client.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          temperature: 0.1,
          systemInstruction: systemPrompt,
          // Enable live Google Search grounding. No responseSchema here.
          tools: [{ googleSearch: {} }],
        },
      });

      const latencyMs = Math.round(performance.now() - startedAt);
      logCall(`${model} (grounded)`, latencyMs, response.usageMetadata);

      const text = response.text ?? "";
      const meta = extractGroundingMetadata(response);
      return { text, sources: meta.sources, searchQueries: meta.searchQueries };
    } catch (err) {
      lastError = err;
      if (err instanceof GeminiError) throw err;
      if (!isRetryable(err) || attempt === MAX_TRANSPORT_RETRIES - 1) break;
      await sleep(BASE_BACKOFF_MS * 2 ** attempt);
    }
  }

  throw new GeminiError(
    `Grounded Gemini call failed for model "${model}" after ${MAX_TRANSPORT_RETRIES} attempt(s).`,
    { cause: lastError },
  );
}

/** Defensively pull grounding chunks (source URIs/titles) + search queries from
 *  a generateContent response. Tolerant of missing fields across SDK versions. */
function extractGroundingMetadata(response: unknown): {
  sources: GroundingSource[];
  searchQueries: string[];
} {
  const sources: GroundingSource[] = [];
  const searchQueries: string[] = [];
  if (typeof response !== "object" || response === null) return { sources, searchQueries };

  const candidates = (response as { candidates?: unknown }).candidates;
  const first = Array.isArray(candidates) ? candidates[0] : undefined;
  if (typeof first !== "object" || first === null) return { sources, searchQueries };

  const gm = (first as { groundingMetadata?: unknown }).groundingMetadata;
  if (typeof gm !== "object" || gm === null) return { sources, searchQueries };

  const chunks = (gm as { groundingChunks?: unknown }).groundingChunks;
  if (Array.isArray(chunks)) {
    const seen = new Set<string>();
    for (const chunk of chunks) {
      const web = (chunk as { web?: { uri?: unknown; title?: unknown } } | null)?.web;
      const uri = typeof web?.uri === "string" ? web.uri : null;
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      sources.push({ uri, title: typeof web?.title === "string" ? web.title : null });
    }
  }

  const queries = (gm as { webSearchQueries?: unknown }).webSearchQueries;
  if (Array.isArray(queries)) {
    for (const q of queries) if (typeof q === "string") searchQueries.push(q);
  }

  return { sources, searchQueries };
}

interface GenerateArgs {
  model: string;
  systemPrompt: string;
  contents: string;
  responseSchema: GeminiSchema;
}

/**
 * Single logical generateContent call with transport-level retry. Returns the
 * raw response text. Throws GeminiError if the model returns no text or all
 * retries are exhausted.
 */
async function generateWithRetry(client: GoogleGenAI, args: GenerateArgs): Promise<string> {
  const { model, systemPrompt, contents, responseSchema } = args;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_TRANSPORT_RETRIES; attempt++) {
    const startedAt = performance.now();
    try {
      const response = await client.models.generateContent({
        model,
        contents,
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
          // GeminiSchema is an OpenAPI-3.0 subset that matches the SDK's
          // Schema/SchemaUnion structurally; cast at the boundary so the rest
          // of the app stays SDK-free.
          responseSchema: responseSchema as unknown as Record<string, unknown>,
          systemInstruction: systemPrompt,
        },
      });

      const latencyMs = Math.round(performance.now() - startedAt);
      logCall(model, latencyMs, response.usageMetadata);

      const text = response.text;
      if (typeof text !== "string" || text.length === 0) {
        // Empty text is not retryable in a useful way; surface it.
        throw new GeminiError(`Gemini returned an empty response for model "${model}".`);
      }
      return text;
    } catch (err) {
      lastError = err;
      // Config/empty errors are not transport-transient; don't retry them.
      if (err instanceof GeminiError) throw err;
      if (!isRetryable(err) || attempt === MAX_TRANSPORT_RETRIES - 1) {
        break;
      }
      await sleep(BASE_BACKOFF_MS * 2 ** attempt);
    }
  }

  throw new GeminiError(
    `Gemini call failed for model "${model}" after ${MAX_TRANSPORT_RETRIES} attempt(s).`,
    { cause: lastError },
  );
}

interface ParseSuccess<T> {
  ok: true;
  value: T;
}
interface ParseFailure {
  ok: false;
  error: string;
}

function tryParse<T>(raw: string, schema: ZodType<T>): ParseSuccess<T> | ParseFailure {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(raw));
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${errMessage(err)}` };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, value: result.data };
}

/**
 * Build the repair-attempt content. We restate the original payload, show the
 * model exactly what it returned, and the validation error, and demand only
 * corrected JSON back.
 */
function buildRepairPrompt(originalPayload: string, badOutput: string, error: string): string {
  return JSON.stringify({
    instruction:
      "Your previous response did not satisfy the required JSON schema. Return ONLY corrected JSON that matches the schema. Do not include any prose, explanation, or markdown fences.",
    validationError: error,
    previousOutput: badOutput,
    originalInput: originalPayload,
  });
}

/** Strip an optional ```json ... ``` fence if the model wrapped its output. */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** Heuristic: retry on rate limits (429), server errors (5xx), and network
 *  failures. We inspect any numeric status/code field plus the message text. */
function isRetryable(err: unknown): boolean {
  const status = extractStatus(err);
  if (status === 429 || (status >= 500 && status <= 599)) return true;

  const msg = errMessage(err).toLowerCase();
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("quota")) return true;
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) {
    return true;
  }
  if (
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("deadline") ||
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("socket")
  ) {
    return true;
  }
  return false;
}

function extractStatus(err: unknown): number {
  if (typeof err !== "object" || err === null) return 0;
  const rec = err as Record<string, unknown>;
  for (const key of ["status", "code", "statusCode"]) {
    const v = rec[key];
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = Number.parseInt(v, 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

interface UsageLike {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

/** Log model id + latency + token usage (when exposed). Never logs the key,
 *  prompt, or payload. */
function logCall(model: string, latencyMs: number, usage: UsageLike | undefined): void {
  const tokens = usage
    ? ` tokens(prompt=${usage.promptTokenCount ?? "?"} out=${usage.candidatesTokenCount ?? "?"} total=${usage.totalTokenCount ?? "?"})`
    : "";
  // eslint-disable-next-line no-console
  console.info(`[gemini] model=${model} latency=${latencyMs}ms${tokens}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
