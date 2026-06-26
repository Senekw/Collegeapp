import { z } from "zod";

/**
 * Canonical enum values. SQLite stores these as plain strings (see
 * prisma/schema.prisma); these Zod enums are the single enforcement point at
 * every boundary. Label maps drive the UI without leaking raw constants into
 * components.
 */

// ---- ActivityCategory ----
export const ACTIVITY_CATEGORIES = [
  "RESEARCH",
  "LEADERSHIP",
  "COMPETITION",
  "CREATIVE",
  "SERVICE",
  "WORK",
  "INTERNSHIP",
  "CLUB",
  "ENTREPRENEURSHIP",
  "OTHER",
] as const;
export const ActivityCategorySchema = z.enum(ACTIVITY_CATEGORIES);
export type ActivityCategory = z.infer<typeof ActivityCategorySchema>;
export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  RESEARCH: "Research",
  LEADERSHIP: "Leadership",
  COMPETITION: "Competition",
  CREATIVE: "Creative",
  SERVICE: "Service",
  WORK: "Work",
  INTERNSHIP: "Internship",
  CLUB: "Club",
  ENTREPRENEURSHIP: "Entrepreneurship",
  OTHER: "Other",
};

/** Categories that should reveal the ResearchDetail sub-form (§5.2). */
export const RESEARCH_CATEGORIES: ActivityCategory[] = ["RESEARCH", "INTERNSHIP"];

// ---- ResearchOutput ----
export const RESEARCH_OUTPUTS = [
  "NONE",
  "POSTER",
  "ABSTRACT",
  "PREPRINT",
  "PEER_REVIEWED",
] as const;
export const ResearchOutputSchema = z.enum(RESEARCH_OUTPUTS);
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;
export const RESEARCH_OUTPUT_LABELS: Record<ResearchOutput, string> = {
  NONE: "No output yet",
  POSTER: "Poster",
  ABSTRACT: "Abstract",
  PREPRINT: "Preprint",
  PEER_REVIEWED: "Peer-reviewed",
};

// ---- Authorship ----
export const AUTHORSHIPS = [
  "NONE",
  "CONTRIBUTOR",
  "MIDDLE",
  "CO_FIRST",
  "FIRST",
  "SOLE",
] as const;
export const AuthorshipSchema = z.enum(AUTHORSHIPS);
export type Authorship = z.infer<typeof AuthorshipSchema>;
export const AUTHORSHIP_LABELS: Record<Authorship, string> = {
  NONE: "Not an author",
  CONTRIBUTOR: "Contributor / acknowledged",
  MIDDLE: "Middle author",
  CO_FIRST: "Co-first author",
  FIRST: "First author",
  SOLE: "Sole author",
};

// ---- Research contribution areas ----
export const CONTRIBUTION_AREAS = [
  "ideation",
  "design",
  "data_collection",
  "analysis",
  "writing",
] as const;
export const ContributionAreaSchema = z.enum(CONTRIBUTION_AREAS);
export type ContributionArea = z.infer<typeof ContributionAreaSchema>;
export const CONTRIBUTION_AREA_LABELS: Record<ContributionArea, string> = {
  ideation: "Ideation",
  design: "Design",
  data_collection: "Data collection",
  analysis: "Analysis",
  writing: "Writing",
};

// ---- OppType ----
export const OPP_TYPES = [
  "SUMMER_PROGRAM",
  "RESEARCH",
  "FELLOWSHIP",
  "SCHOLARSHIP",
  "COMPETITION",
] as const;
export const OppTypeSchema = z.enum(OPP_TYPES);
export type OppType = z.infer<typeof OppTypeSchema>;
export const OPP_TYPE_LABELS: Record<OppType, string> = {
  SUMMER_PROGRAM: "Summer Program",
  RESEARCH: "Research",
  FELLOWSHIP: "Fellowship",
  SCHOLARSHIP: "Scholarship",
  COMPETITION: "Competition",
};

// ===========================================================================
// EXTENSION enums (Axis A enrichment, distributions, archetypes, spike).
// DB stores UPPERCASE; the LLM schemas in lib/gemini/schemas.ts use the
// lowercase variants and are mapped at the boundary.
// ===========================================================================

// ---- ProgramLevel ----
export const PROGRAM_LEVELS = [
  "SCHOOL", "LOCAL", "REGIONAL", "STATE", "NATIONAL", "INTERNATIONAL", "ONLINE", "UNKNOWN",
] as const;
export const ProgramLevelSchema = z.enum(PROGRAM_LEVELS);
export type ProgramLevel = z.infer<typeof ProgramLevelSchema>;
export const PROGRAM_LEVEL_LABELS: Record<ProgramLevel, string> = {
  SCHOOL: "School", LOCAL: "Local", REGIONAL: "Regional", STATE: "State",
  NATIONAL: "National", INTERNATIONAL: "International", ONLINE: "Online", UNKNOWN: "Unknown",
};

/** Lowercase level used inside deepDive (no online/unknown). */
export const DEEP_DIVE_LEVELS = [
  "school", "local", "regional", "state", "national", "international", "na",
] as const;
export const DeepDiveLevelSchema = z.enum(DEEP_DIVE_LEVELS);

/** Lowercase level used inside selectivityBreakdown (adds online/unknown). */
export const SELECTIVITY_LEVELS = [
  "school", "local", "regional", "state", "national", "international", "online", "unknown",
] as const;
export const SelectivityLevelSchema = z.enum(SELECTIVITY_LEVELS);

// ---- SourceQuality ----
export const SOURCE_QUALITIES = ["PRIMARY", "SECONDARY", "TERTIARY"] as const;
export const SourceQualitySchema = z.enum(SOURCE_QUALITIES);
export type SourceQuality = z.infer<typeof SourceQualitySchema>;
export const SourceQualityLowerSchema = z.enum(["primary", "secondary", "tertiary"]);
export const SOURCE_QUALITY_LABELS: Record<SourceQuality, string> = {
  PRIMARY: "Official", SECONDARY: "Reputable press", TERTIARY: "Forum / anecdote",
};

// ---- Confidence ----
export const CONFIDENCES = ["NONE", "LOW", "MEDIUM", "HIGH"] as const;
export const ConfidenceSchema = z.enum(CONFIDENCES);
export type Confidence = z.infer<typeof ConfidenceSchema>;
export const ConfidenceLowerSchema = z.enum(["none", "low", "medium", "high"]);
export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  NONE: "No data", LOW: "Low", MEDIUM: "Medium", HIGH: "High",
};

// ---- StatType ----
export const STAT_TYPES = ["GPA", "SAT", "ACT", "CLASS_RANK"] as const;
export const StatTypeSchema = z.enum(STAT_TYPES);
export type StatType = z.infer<typeof StatTypeSchema>;
export const STAT_TYPE_LABELS: Record<StatType, string> = {
  GPA: "GPA", SAT: "SAT", ACT: "ACT", CLASS_RANK: "Class rank",
};

// ---- SpikeTier ----
export const SPIKE_TIERS = ["EMERGING", "SOLID", "STRONG", "NATIONAL", "EXCEPTIONAL"] as const;
export const SpikeTierSchema = z.enum(SPIKE_TIERS);
export type SpikeTier = z.infer<typeof SpikeTierSchema>;
export const SPIKE_TIER_LABELS: Record<SpikeTier, string> = {
  EMERGING: "Emerging", SOLID: "Solid", STRONG: "Strong",
  NATIONAL: "National", EXCEPTIONAL: "Exceptional",
};
/** Inclusive spikeIndex floor for each tier (§7.2). */
export const SPIKE_TIER_RANGES: { tier: SpikeTier; min: number; max: number }[] = [
  { tier: "EMERGING", min: 0, max: 39 },
  { tier: "SOLID", min: 40, max: 59 },
  { tier: "STRONG", min: 60, max: 74 },
  { tier: "NATIONAL", min: 75, max: 89 },
  { tier: "EXCEPTIONAL", min: 90, max: 100 },
];

// ---- deepDive kind selection ----
export const DEEP_DIVE_KINDS = ["entrepreneurship", "competition", "generic"] as const;
export type DeepDiveKind = (typeof DEEP_DIVE_KINDS)[number];
/** Which deepDive arm a category uses. RESEARCH uses ResearchDetail (returns null). */
export function deepDiveKindForCategory(category: string): DeepDiveKind | null {
  switch (category) {
    case "RESEARCH":
      return null; // handled by ResearchDetail
    case "ENTREPRENEURSHIP":
      return "entrepreneurship";
    case "COMPETITION":
      return "competition";
    default:
      return "generic";
  }
}

// ---------------------------------------------------------------------------
// JSON-array boundary helpers. SQLite has no array columns, so small arrays are
// stored as JSON strings. Parse/serialize ONLY here, never inline in components.
// All parsers are defensive: malformed/empty input yields a safe default.
// ---------------------------------------------------------------------------

/** Parse a JSON string[] column. Returns [] on null/empty/invalid. */
export function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

/** Parse a JSON number[] column (e.g. grade eligibility). Returns [] on failure. */
export function parseIntArray(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      : [];
  } catch {
    return [];
  }
}

/** Parse a JSON string[] then validate each entry against a Zod enum. */
export function parseEnumArray<T extends string>(
  raw: string | null | undefined,
  schema: z.ZodType<T>,
): T[] {
  return parseStringArray(raw)
    .map((v) => schema.safeParse(v))
    .filter((r): r is z.SafeParseSuccess<T> => r.success)
    .map((r) => r.data);
}

/** Serialize any array to the JSON string form stored in SQLite. */
export function serializeArray(arr: readonly unknown[]): string {
  return JSON.stringify(arr ?? []);
}

/** Parse a typed JSON object/array column with a Zod schema and a fallback. */
export function parseJson<T>(raw: string | null | undefined, schema: z.ZodType<T>, fallback: T): T {
  if (!raw) return fallback;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}
