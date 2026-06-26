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
