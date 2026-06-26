import type {
  AcademicFit,
  AdmitDistributionData,
  SchoolData,
  SchoolMatch,
  SpikeAssessmentData,
  StudentMetrics,
  SynthesisData,
} from "@/lib/types";
import { computeAcademicFit, estimateRealism } from "@/lib/recommend/realism";

/**
 * §8 School matching (realism wiring updated for the distribution/spike-aware
 * estimateRealism).
 *
 * Pure ranking logic: given a student, a set of schools, the (optional) profile
 * synthesis, the (optional) spike assessment, and per-school admitted-class
 * distributions, score each school for "aspirational but plausible" fit and
 * rank. Realism is delegated to lib/recommend/realism.ts.
 */

/**
 * Token overlap between the student's academic/spike vocabulary and the
 * school's strong majors, scored 0..10. Case-insensitive, word-token based.
 * Returns 0 when there is nothing to compare.
 */
export function computeSpikeFit(
  synthesis: SynthesisData | null,
  school: SchoolData,
): number {
  const schoolTokens = tokenize(school.strongMajors.join(" "));
  if (schoolTokens.size === 0) return 0;

  const studentParts: string[] = [];
  if (synthesis) {
    studentParts.push(synthesis.primarySpike, ...synthesis.secondaryThemes);
  }
  const studentTokens = tokenize(studentParts.join(" "));
  if (studentTokens.size === 0) return 0;

  let hits = 0;
  for (const token of studentTokens) {
    if (schoolTokens.has(token)) hits += 1;
  }
  if (hits === 0) return 0;

  // Jaccard-ish: overlap relative to the student's vocabulary, scaled to 0..10.
  const ratio = hits / studentTokens.size;
  return clampRange(Math.round(ratio * 10), 0, 10);
}

/**
 * Build the full SchoolMatch for one school, including academic fit, spike fit,
 * a fitScore that favors aspirational-but-plausible reach/target schools, a
 * one-line `why`, honest `missing` data flags, and realism.
 */
export function scoreSchoolMatch(
  student: StudentMetrics,
  school: SchoolData,
  synthesis: SynthesisData | null,
  spike: SpikeAssessmentData | null,
  distributions: AdmitDistributionData[],
): SchoolMatch {
  const academicFit = computeAcademicFit(student, school);
  const spikeFit = computeSpikeFit(synthesis, school);
  const realism = estimateRealism(student, school, spike, distributions);
  const missing = collectMissing(school);
  const fitScore = computeFitScore(academicFit, spikeFit, school);
  const why = buildWhy(school, academicFit, spikeFit, synthesis);

  return { school, academicFit, spikeFit, fitScore, why, missing, realism };
}

/**
 * Rank schools by fitScore descending, skewing toward reach/target (the
 * fitScore itself encodes that skew), and return the top `limit`. Each school's
 * admitted-class distributions are looked up by id (default []).
 */
export function rankSchools(
  student: StudentMetrics,
  schools: SchoolData[],
  synthesis: SynthesisData | null,
  spike: SpikeAssessmentData | null,
  distributionsBySchoolId: Record<string, AdmitDistributionData[]>,
  limit = 5,
): SchoolMatch[] {
  return schools
    .map((school) =>
      scoreSchoolMatch(
        student,
        school,
        synthesis,
        spike,
        distributionsBySchoolId[school.id] ?? [],
      ),
    )
    .sort((a, b) => b.fitScore - a.fitScore || a.school.name.localeCompare(b.school.name))
    .slice(0, Math.max(0, limit));
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * fitScore favors "aspirational but plausible". A school where the student is
 * *within* range (a true target) scores highest; *above* (likely safety) and
 * *below* (long reach) score lower but still surface. Spike alignment and a
 * selectivity-prestige nudge add to genuinely aspirational targets.
 */
function computeFitScore(
  academicFit: AcademicFit,
  spikeFit: number,
  school: SchoolData,
): number {
  let score = 0;

  // Academic-fit base: peak at "within" (aim at the meat of the range).
  switch (academicFit) {
    case "within":
      score += 6;
      break;
    case "above":
      score += 3;
      break;
    case "below":
      score += 2;
      break;
    case "unknown":
      score += 3;
      break;
  }

  // Spike alignment contributes up to ~3 points.
  score += (spikeFit / 10) * 3;

  // Aspirational nudge: more selective schools (lower admit rate) get a small
  // bump so the list skews reach/target rather than collapsing to safeties,
  // but only when the student is at least within/above range.
  if (school.admitRate !== null && (academicFit === "within" || academicFit === "above")) {
    const selectivity = 1 - school.admitRate; // 0..1, higher = more selective
    score += selectivity * 1.5;
  }

  return Math.round(score * 100) / 100;
}

function collectMissing(school: SchoolData): string[] {
  const missing: string[] = [];
  if (school.admitRate === null) missing.push("admit rate unknown");
  if (school.gpaMid50Low === null || school.gpaMid50High === null)
    missing.push("GPA range unknown");
  if (school.satMid50Low === null || school.satMid50High === null)
    missing.push("SAT range unknown");
  if (school.strongMajors.length === 0) missing.push("strong majors unknown");
  return missing;
}

function buildWhy(
  school: SchoolData,
  academicFit: AcademicFit,
  spikeFit: number,
  synthesis: SynthesisData | null,
): string {
  const fitPhrase =
    academicFit === "within"
      ? "your stats land squarely in its range"
      : academicFit === "above"
        ? "your stats clear its typical range"
        : academicFit === "below"
          ? "a reach on stats, but worth a shot"
          : "stats fit is unclear without published ranges";

  if (spikeFit >= 5 && synthesis) {
    return `${fitPhrase}, and ${school.name}'s strengths align with your ${synthesis.primarySpike} spike.`;
  }
  if (school.strongMajors.length > 0) {
    return `${fitPhrase}; explore whether ${school.name}'s ${school.strongMajors[0]} strength fits your goals.`;
  }
  return `${fitPhrase} at ${school.name}.`;
}

const STOP_WORDS = new Set([
  "and",
  "of",
  "the",
  "in",
  "for",
  "to",
  "a",
  "an",
  "with",
  "studies",
  "general",
]);

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    const token = raw.trim();
    if (token.length >= 2 && !STOP_WORDS.has(token)) tokens.add(token);
  }
  return tokens;
}

function clampRange(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
