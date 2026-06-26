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
  // EXTENSION (§6): generalized attribution discount for EVERY category.
  creditMultiplier: z.number().min(0).max(1),
  // EXTENSION (§6): the two-axis selectivity breakdown for THIS activity.
  selectivityBreakdown: z.object({
    level: z.enum([
      "school", "local", "regional", "state", "national", "international", "online", "unknown",
    ]),
    externalFigures: z.array(
      z.object({
        label: z.string(),
        value: z.string(), // string to preserve "~30,000", "2nd of 1,800"
        asOfYear: z.number().int(),
        isFallbackYear: z.boolean(),
        sourceUrl: z.string(),
        sourceQuality: z.enum(["primary", "secondary", "tertiary"]),
      }),
    ),
    studentAttainment: z.string(),
    attendVsAchievementNote: z.string(),
    confidence: z.enum(["none", "low", "medium", "high"]),
  }),
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
  // EXTENSION — Axis A: resolved program enrichment for this activity (or null).
  enrichment: {
    displayName: string;
    level: string;
    asOfYear: number;
    isFallbackYear: boolean;
    applicantCount: number | null;
    acceptedCount: number | null;
    acceptanceRate: number | null;
    participantCount: number | null;
    awardWinnerCount: number | null;
    notableWinners: { what: string; year: number | null; sourceUrl: string | null }[];
    prestigeTier: number | null;
    admissionsImpactNote: string | null;
    attendVsWinNote: string;
    sources: { url: string; year: number | null; quality: string }[];
    confidence: string;
  } | null;
  // EXTENSION — Axis B: the parsed per-category deep dive (DeepDive) or null.
  deepDive: DeepDive | null;
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

// ===========================================================================
// EXTENSION schemas.
// ===========================================================================

// ---- §5 per-category deep dive (Axis B). Discriminated union; used for form
//      validation + the activity action + the scorer payload. NOT a Gemini
//      responseSchema, so the discriminated union needs no converter support.
export const EntrepreneurshipDeepDiveSchema = z.object({
  kind: z.literal("entrepreneurship"),
  productOneLiner: z.string(),
  launched: z.boolean(),
  traction: z.object({
    users: z.string().nullable(),
    revenue: z.string().nullable(),
    other: z.string().nullable(),
  }),
  yourRole: z.string(),
  cofounders: z.number().int().nullable(),
  whatFollowed: z.array(z.string()),
  acceptedVsFunded: z.enum(["attended_event", "accepted_program", "selected_flagship_or_funded", "na"]),
  honestAttribution: z.string(),
});
export const CompetitionDeepDiveSchema = z.object({
  kind: z.literal("competition"),
  competitionName: z.string(),
  level: z.enum(["school", "local", "regional", "state", "national", "international"]),
  event: z.string(),
  projectSummary: z.string(),
  result: z.enum(["participated", "qualified", "finalist", "placed", "won"]),
  placement: z.string().nullable(),
  teamSize: z.number().int().nullable(),
  yourContribution: z.string(),
  whatFollowed: z.array(z.string()),
  honestAttribution: z.string(),
});
export const GenericDeepDiveSchema = z.object({
  kind: z.literal("generic"),
  whatYouDid: z.string(),
  yourRole: z.string(),
  measurableOutcome: z.string().nullable(),
  level: z.enum(["school", "local", "regional", "state", "national", "international", "na"]),
  whatFollowed: z.array(z.string()),
  honestAttribution: z.string(),
});
export const DeepDiveSchema = z.discriminatedUnion("kind", [
  EntrepreneurshipDeepDiveSchema,
  CompetitionDeepDiveSchema,
  GenericDeepDiveSchema,
]);
export type DeepDive = z.infer<typeof DeepDiveSchema>;
export type EntrepreneurshipDeepDive = z.infer<typeof EntrepreneurshipDeepDiveSchema>;
export type CompetitionDeepDive = z.infer<typeof CompetitionDeepDiveSchema>;
export type GenericDeepDive = z.infer<typeof GenericDeepDiveSchema>;

// ---- §7.3 spike rarity calibration (LLM output) ----
export const SpikeCalibrationSchema = z.object({
  tier: z.enum(["EMERGING", "SOLID", "STRONG", "NATIONAL", "EXCEPTIONAL"]),
  rarityAnchor: z.string().nullable(), // archetypeKey matched, or null
  gapToNextTier: z.string(),
  rationale: z.string().max(500),
});
export type SpikeCalibrationResult = z.infer<typeof SpikeCalibrationSchema>;

/** Input payload for the calibration call. */
export interface SpikeCalibrationPayload {
  components: { peak: number; concentration: number; trajectory: number; originality: number };
  dominantTheme: string;
  spikeIndex: number;
  computedTier: string; // the deterministic tier before calibration
  peakActivities: Array<{ title: string; theme: string | null; signal: number; creditMultiplier: number }>;
  archetypes: Array<{
    archetypeKey: string;
    label: string;
    tier: string;
    statBand: string;
    description: string;
    spikeSignature: string;
  }>;
}

// ---- §4.2 web-grounded extraction schemas (the structured second step over
//      grounded text). Every one bakes in: null over invention, year-stamping,
//      source quality. Used as Gemini responseSchemas (no grounding tool here).
const ExtractSourceSchema = z.object({
  url: z.string(),
  publisher: z.string().nullable(),
  year: z.number().int().nullable(),
  quality: z.enum(["primary", "secondary", "tertiary"]),
});

export const ProgramEnrichmentExtractSchema = z.object({
  level: z.enum([
    "school", "local", "regional", "state", "national", "international", "online", "unknown",
  ]),
  asOfYear: z.number().int(),
  isFallbackYear: z.boolean(),
  applicantCount: z.number().int().nullable(),
  acceptedCount: z.number().int().nullable(),
  acceptanceRate: z.number().nullable(),
  participantCount: z.number().int().nullable(),
  awardWinnerCount: z.number().int().nullable(),
  awardLevels: z.array(z.string()),
  notableWinners: z.array(
    z.object({
      what: z.string(), // what they achieved (anonymized; no minor dossiers)
      year: z.number().int().nullable(),
      sourceUrl: z.string().nullable(),
    }),
  ),
  prestigeTier: z.number().int().nullable(), // 1..5
  admissionsImpactNote: z.string().nullable(),
  attendVsWinNote: z.string(),
  sources: z.array(ExtractSourceSchema),
  confidence: z.enum(["none", "low", "medium", "high"]),
});
export type ProgramEnrichmentExtract = z.infer<typeof ProgramEnrichmentExtractSchema>;

export const AdmitDistributionExtractSchema = z.object({
  statType: z.enum(["GPA", "SAT", "ACT", "CLASS_RANK"]),
  buckets: z.array(z.object({ rangeLabel: z.string(), pctOfAdmits: z.number() })),
  asOfYear: z.number().int(),
  isFallbackYear: z.boolean(),
  sources: z.array(ExtractSourceSchema),
  confidence: z.enum(["none", "low", "medium", "high"]),
});
export type AdmitDistributionExtract = z.infer<typeof AdmitDistributionExtractSchema>;

export const ArchetypeExtractSchema = z.object({
  label: z.string(),
  description: z.string(), // anonymized PATTERN
  statBand: z.string(),
  spikeSignature: z.object({
    peak: z.number().int().min(0).max(10),
    concentration: z.number().int().min(0).max(10),
    trajectory: z.number().int().min(0).max(10),
    originality: z.number().int().min(0).max(10),
    note: z.string(),
  }),
  tier: z.enum(["EMERGING", "SOLID", "STRONG", "NATIONAL", "EXCEPTIONAL"]),
  exampleOutcomes: z.string(), // hedged class, no names
  sources: z.array(ExtractSourceSchema),
  confidence: z.enum(["none", "low", "medium", "high"]),
  asOfYear: z.number().int().nullable(),
});
export type ArchetypeExtract = z.infer<typeof ArchetypeExtractSchema>;

export const SPIKE_CALIBRATION_RESPONSE_SCHEMA = zodToGeminiSchema(SpikeCalibrationSchema);
export const PROGRAM_ENRICHMENT_RESPONSE_SCHEMA = zodToGeminiSchema(ProgramEnrichmentExtractSchema);
export const ADMIT_DISTRIBUTION_RESPONSE_SCHEMA = zodToGeminiSchema(AdmitDistributionExtractSchema);
export const ARCHETYPE_RESPONSE_SCHEMA = zodToGeminiSchema(ArchetypeExtractSchema);
