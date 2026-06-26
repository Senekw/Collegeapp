import { z } from "zod";

/**
 * The Zod schemas below are the SINGLE SOURCE OF TRUTH for LLM output (§1).
 * They are used to (a) validate Gemini's response with `.parse()` and
 * (b) derive Gemini's `responseSchema` via `zodToGeminiSchema()`.
 *
 * This file intentionally does NOT import the Gemini SDK so it remains safe to
 * import anywhere (including client form validation) without leaking the SDK
 * into the browser bundle.
 */

// ---------------------------------------------------------------------------
// §4.3 Activity scoring schema
// ---------------------------------------------------------------------------
export const ActivityScoreSchema = z.object({
  tier: z.number().int().min(1).max(4), // 1=national/intl rare distinction ... 4=participation
  scores: z.object({
    impact: z.number().int().min(0).max(10),
    originality: z.number().int().min(0).max(10),
    initiative: z.number().int().min(0).max(10),
    depth: z.number().int().min(0).max(10),
    selectivity: z.number().int().min(0).max(10),
    spikeAlignment: z.number().int().min(0).max(10),
  }),
  credibility: z.object({
    substantiated: z.boolean(),
    inflationFlags: z.array(z.string()),
  }),
  research: z
    .object({
      outputType: z.enum(["none", "poster", "abstract", "preprint", "peer_reviewed"]),
      authorship: z.enum(["none", "contributor", "middle", "co_first", "first", "sole"]),
      contribution: z.array(
        z.enum(["ideation", "design", "data_collection", "analysis", "writing"]),
      ),
      independence: z.number().int().min(0).max(10),
      venueQuality: z.number().int().min(0).max(10),
      creditMultiplier: z.number().min(0).max(1),
    })
    .nullable(), // null when not a research activity
  rationale: z.string().max(400),
  followUpQuestions: z.array(z.string()),
});
export type ActivityScoreResult = z.infer<typeof ActivityScoreSchema>;

// ---------------------------------------------------------------------------
// §4.5 Profile synthesis schema
// ---------------------------------------------------------------------------
export const SynthesisSchema = z.object({
  primarySpike: z.object({
    theme: z.string(),
    strength: z.number().int().min(0).max(10),
    evidenceActivityIds: z.array(z.string()),
  }),
  secondaryThemes: z.array(z.string()),
  academicStrength: z.number().int().min(0).max(10),
  overallNarrative: z.string().max(800),
  gaps: z.array(z.string()),
  feasibleMoves: z.array(
    z.object({
      move: z.string(),
      byGrade: z.number().int(),
      why: z.string(),
    }),
  ),
});
export type SynthesisResult = z.infer<typeof SynthesisSchema>;

// ---------------------------------------------------------------------------
// Payloads sent TO Gemini (typed contract; built by the scoring/synthesis layer)
// ---------------------------------------------------------------------------
export interface ActivityScoringPayload {
  activity: {
    title: string;
    category: string;
    role: string | null;
    description: string;
    hoursPerWeek: number | null;
    weeksPerYear: number | null;
    durationMonths: number | null;
    evidenceUrl: string | null;
    spikeTheme: string | null;
  };
  research: {
    outputType: string;
    authorship: string;
    contribution: string[];
    venue: string | null;
    independence: number | null;
    narrative: string | null;
  } | null;
  studentContext: {
    gradeLevel: number | null;
    intendedMajor: string | null;
  };
}

export interface SynthesisPayload {
  student: {
    gradeLevel: number | null;
    gradYear: number | null;
    intendedMajor: string | null;
    yearsRemaining: number | null;
    academicStrength: number;
    rigor: string | null;
    contextNotes: string | null;
  };
  activities: Array<{
    id: string;
    title: string;
    category: string;
    spikeTheme: string | null;
    tier: number | null;
    weightedSignal: number;
    creditMultiplier: number | null;
    rationale: string | null;
  }>;
  aggregate: {
    weightedActivitySignal: number;
    topTheme: string | null;
    themes: Array<{ theme: string; weightedSignal: number; activityIds: string[] }>;
  };
}

// ---------------------------------------------------------------------------
// Zod -> Gemini responseSchema converter
// ---------------------------------------------------------------------------
/**
 * Structural Gemini Schema shape (OpenAPI 3.0 subset Gemini accepts). Uses
 * string `type` values; the Gemini client casts to the SDK's `Schema` type at
 * the call site so this module stays SDK-free.
 */
export interface GeminiSchema {
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";
  description?: string;
  nullable?: boolean;
  enum?: string[];
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  propertyOrdering?: string[];
}

/**
 * Convert a Zod schema into a Gemini `responseSchema`. Handles exactly the
 * constructs used by the schemas above: object, array, string, number (int vs
 * float), boolean, enum, nullable, optional, default. `propertyOrdering` is
 * emitted for reproducible field order (supports the reproducibility principle).
 */
export function zodToGeminiSchema(schema: z.ZodTypeAny): GeminiSchema {
  if (schema instanceof z.ZodOptional) {
    return zodToGeminiSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodNullable) {
    return { ...zodToGeminiSchema(schema.unwrap()), nullable: true };
  }
  if (schema instanceof z.ZodDefault) {
    return zodToGeminiSchema(schema._def.innerType as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodEffects) {
    return zodToGeminiSchema(schema.innerType() as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, GeminiSchema> = {};
    const required: string[] = [];
    const propertyOrdering: string[] = [];
    for (const [key, field] of Object.entries(shape)) {
      properties[key] = zodToGeminiSchema(field);
      propertyOrdering.push(key);
      // A field is required unless it is explicitly optional. Nullable !== optional.
      if (!(field instanceof z.ZodOptional)) required.push(key);
    }
    return { type: "OBJECT", properties, required, propertyOrdering };
  }
  if (schema instanceof z.ZodArray) {
    return { type: "ARRAY", items: zodToGeminiSchema(schema._def.type as z.ZodTypeAny) };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: "STRING", enum: [...(schema._def.values as string[])] };
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: "BOOLEAN" };
  }
  if (schema instanceof z.ZodNumber) {
    const isInt = schema._def.checks?.some((c) => c.kind === "int") ?? false;
    return { type: isInt ? "INTEGER" : "NUMBER" };
  }
  if (schema instanceof z.ZodString) {
    return { type: "STRING" };
  }
  // Defensive fallback — should not be reached for the schemas in this file.
  return { type: "STRING" };
}

/** Pre-derived response schemas (computed once at module load). */
export const ACTIVITY_SCORE_RESPONSE_SCHEMA = zodToGeminiSchema(ActivityScoreSchema);
export const SYNTHESIS_RESPONSE_SCHEMA = zodToGeminiSchema(SynthesisSchema);
