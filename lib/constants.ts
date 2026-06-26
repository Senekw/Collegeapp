/**
 * Cross-cutting constants and configurable norm bands.
 *
 * RUBRIC_VERSION participates in the score cache key (§4.2). Bump it whenever
 * the scoring rubric/prompt or the ActivityScoreSchema changes so that every
 * cached score is deliberately recomputed on next scoring.
 */
export const RUBRIC_VERSION = "1.0.0";

/** v1 is single-user. All rows are scoped to this id (the §1 seam). */
export const LOCAL_USER_ID = "local";

/** Server-only Gemini config readers. Never import these into a client component. */
export function getGeminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}
export function getFastModel(): string {
  return process.env.GEMINI_MODEL_FAST?.trim() || "gemini-2.5-flash";
}
export function getDeepModel(): string {
  return process.env.GEMINI_MODEL_DEEP?.trim() || "gemini-2.5-pro";
}

/**
 * Academic norm bands used by the deterministic academicStrength calc
 * (lib/scoring/aggregate.ts). These are coarse orientation anchors for a
 * competitive-college applicant pool — NOT admissions truth. Tunable in one
 * place so the logic stays pure and testable.
 */
export interface AcademicNormBands {
  /** Unweighted GPA thresholds (4.0 scale) mapped to a 0..10 contribution. */
  gpaUnweighted: { value: number; points: number }[];
  /** SAT total thresholds (400..1600) mapped to a 0..10 contribution. */
  satTotal: { value: number; points: number }[];
  /** ACT composite thresholds (1..36) mapped to a 0..10 contribution. */
  actComposite: { value: number; points: number }[];
}

export const ACADEMIC_NORM_BANDS: AcademicNormBands = {
  gpaUnweighted: [
    { value: 3.95, points: 10 },
    { value: 3.85, points: 9 },
    { value: 3.7, points: 8 },
    { value: 3.5, points: 6 },
    { value: 3.3, points: 5 },
    { value: 3.0, points: 4 },
    { value: 0.0, points: 2 },
  ],
  satTotal: [
    { value: 1550, points: 10 },
    { value: 1500, points: 9 },
    { value: 1450, points: 8 },
    { value: 1400, points: 7 },
    { value: 1300, points: 5 },
    { value: 1200, points: 4 },
    { value: 0, points: 2 },
  ],
  actComposite: [
    { value: 35, points: 10 },
    { value: 34, points: 9 },
    { value: 32, points: 8 },
    { value: 30, points: 7 },
    { value: 28, points: 5 },
    { value: 25, points: 4 },
    { value: 0, points: 2 },
  ],
};
