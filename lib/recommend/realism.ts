import type {
  AcademicFit,
  AdmitBucket,
  AdmitDistributionData,
  DistributionPlacement,
  RealismBand,
  RealismResult,
  SchoolData,
  SpikeAssessmentData,
  StudentMetrics,
  TailOutlook,
} from "@/lib/types";
import { REALISM_BAND_ORDER } from "@/lib/types";
import type { SpikeTier } from "@/lib/enums";

/**
 * §8 Realism estimation — SAFETY-CRITICAL (supersedes v1 §5.6).
 *
 * This module NEVER produces a per-student admit probability. It maps a
 * school's *published* base admit rate plus a coarse academic/spike fit signal
 * and (when available) the admitted-class stat distribution onto a small
 * ordinal ladder of bands, with HARD CEILINGS that no amount of student
 * strength can override at highly selective schools. The spike only ever
 * influences the *tail outlook* of a below-band profile — never the band at a
 * sub-10% school.
 *
 * DETERMINISTIC. NO LLM. NO invented numbers or sources.
 */

/** The fixed uncertainty disclaimer surfaced on every realism result. */
export const REALISM_CAVEAT =
  "Based on published admit rate and academic fit only. Essays, recommendations, institutional priorities, and context are not modeled and dominate outcomes at selective schools. Treat this as orientation, not a prediction.";

/**
 * Appended to the caveat whenever a tail outlook is in play. The visible
 * exemplars at the admit tail are, by construction, the ones who got in — so
 * any "credible tail" reasoning is shaped by selection/survivorship bias.
 */
export const SURVIVORSHIP_NOTE =
  " Note: the admit tail is small, and the visible exemplars are the ones who succeeded — selection and survivorship bias mean an apparent path in is far rarer than it looks.";

/**
 * Compare the student's GPA/SAT against the school's mid-50% bands.
 * - "above" when the student clears the high end of the available stat(s)
 * - "below" when the student is under the low end
 * - "within" when inside the band
 * - "unknown" when the school has no usable stats to compare against
 *
 * GPA and SAT can disagree; we take the more favorable signal (a strong test
 * can offset a softer GPA and vice versa), which mirrors how holistic review
 * treats either-or strength.
 */
export function computeAcademicFit(
  student: StudentMetrics,
  school: SchoolData,
): AcademicFit {
  const signals: AcademicFit[] = [];

  if (
    student.gpaUnweighted !== null &&
    school.gpaMid50Low !== null &&
    school.gpaMid50High !== null
  ) {
    signals.push(bandFor(student.gpaUnweighted, school.gpaMid50Low, school.gpaMid50High));
  }

  if (
    student.satTotal !== null &&
    school.satMid50Low !== null &&
    school.satMid50High !== null
  ) {
    signals.push(bandFor(student.satTotal, school.satMid50Low, school.satMid50High));
  }

  if (signals.length === 0) return "unknown";

  // Take the most favorable signal: above > within > below.
  if (signals.includes("above")) return "above";
  if (signals.includes("within")) return "within";
  return "below";
}

function bandFor(value: number, low: number, high: number): AcademicFit {
  if (value < low) return "below";
  if (value > high) return "above";
  return "within";
}

/**
 * Estimate a distribution/outlier-aware realism band for this student/school
 * pair (§8). NEVER a per-student admit %.
 *
 * Algorithm:
 *  1. baseRate = school.admitRate. Null -> "Unknown" (placement basis
 *     "unknown", tailOutlook "na").
 *  2. Placement: prefer a real admitted-class distribution (GPA preferred,
 *     else any). Compute the fraction of admits at/below the student's stat by
 *     summing bucket pctOfAdmits for buckets at/below. Else fall back to a
 *     three-way mid-50% read (percentile null). Else "unknown".
 *  3. Band with HARD CEILINGS: baseRate<0.05 -> "Hard Reach"; baseRate<0.10 ->
 *     never better than "Reach" (clamped via REALISM_BAND_ORDER); else map
 *     academicFit -> band.
 *  4. Spike influence scaled by (1 - selectivity): at baseRate<0.10 the spike
 *     CANNOT change the band (ceilings hold) and only sets the tail; at higher
 *     admit rates a strong spike may nudge a below-band profile from Hard Reach
 *     toward Reach (bounded, never to Target on stretch schools).
 *  5. tailOutlook (only meaningful when stats are below band).
 *  6. rationale: deterministic template citing baseRate %, placement, spike
 *     tier, and gap.
 *  7. caveat = REALISM_CAVEAT, + SURVIVORSHIP_NOTE when tailOutlook !== "na".
 */
export function estimateRealism(
  student: StudentMetrics,
  school: SchoolData,
  spike: SpikeAssessmentData | null,
  distributions: AdmitDistributionData[],
): RealismResult {
  const baseRate = school.admitRate;
  const spikeTierUsed: SpikeTier | null = spike?.tier ?? null;

  // --- (1) No base rate -> Unknown ---
  if (baseRate === null) {
    return {
      band: "Unknown",
      baseRate: null,
      distributionPlacement: {
        percentileOfAdmitsAtOrBelow: null,
        basis: "unknown",
        asOfYear: null,
        sourceUrl: null,
      },
      tailOutlook: "na",
      spikeTierUsed,
      rationale: `${school.name}'s published admit rate is unverified, so a realism band can't be estimated; treat this as orientation only.`,
      caveat: REALISM_CAVEAT,
    };
  }

  const academicFit = computeAcademicFit(student, school);

  // --- (2) Distribution placement ---
  const distributionPlacement = computePlacement(student, school, distributions);

  // --- (3) Base band from academic fit, then HARD CEILINGS ---
  let band = mapFitToBand(academicFit);

  // --- (4) Spike influence, scaled by (1 - selectivity) ---
  // Only a *below-band* profile can be nudged, and only at higher admit rates.
  const isBelowBand = academicFit === "below";
  if (
    isBelowBand &&
    baseRate >= 0.1 &&
    band === "Hard Reach" &&
    isStrongSpike(spike)
  ) {
    const selectivity = 1 - baseRate; // 0..1, higher = more selective
    // The push is bounded by (1 - selectivity): only meaningful at genuinely
    // open schools. We allow at most a single-step lift Hard Reach -> Reach,
    // and NEVER to Target on stretch schools.
    if ((1 - selectivity) >= 0.2) {
      band = clampBandTo("Reach", "Reach");
    }
  }

  // HARD CEILINGS override everything (including any spike nudge).
  if (baseRate < 0.05) {
    band = "Hard Reach";
  } else if (baseRate < 0.1) {
    band = clampBandTo(band, "Reach");
  }

  // --- (5) Tail outlook (only when stats are below band) ---
  const tailOutlook = computeTailOutlook(
    isBelowBand,
    spike,
    distributionPlacement.percentileOfAdmitsAtOrBelow,
  );

  // --- (6) Rationale ---
  const rationale = buildRationale(
    school.name,
    baseRate,
    distributionPlacement,
    spikeTierUsed,
    band,
    academicFit,
    tailOutlook,
  );

  // --- (7) Caveat ---
  const caveat =
    tailOutlook !== "na" ? REALISM_CAVEAT + SURVIVORSHIP_NOTE : REALISM_CAVEAT;

  return {
    band,
    baseRate,
    distributionPlacement,
    tailOutlook,
    spikeTierUsed,
    rationale,
    caveat,
  };
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * Compute where the student's stat sits within the admitted class.
 *
 * Prefers a real GPA distribution; else any provided distribution; computes
 * `percentileOfAdmitsAtOrBelow` by summing bucket pctOfAdmits for every bucket
 * whose range is at or below the student's stat. If no usable distribution,
 * falls back to a three-way mid-50% read (percentile stays null), and finally
 * to "unknown".
 */
function computePlacement(
  student: StudentMetrics,
  school: SchoolData,
  distributions: AdmitDistributionData[],
): DistributionPlacement {
  const dist = pickDistribution(distributions);

  if (dist !== null) {
    const studentStat = studentStatFor(student, dist.statType);
    if (studentStat !== null) {
      const pct = percentileFromBuckets(dist.buckets, studentStat);
      if (pct !== null) {
        return {
          percentileOfAdmitsAtOrBelow: pct,
          basis: "distribution",
          asOfYear: dist.asOfYear,
          sourceUrl: dist.sourceUrl,
        };
      }
    }
  }

  // Fall back to mid-50% three-way read when the school has usable bands.
  const fit = computeAcademicFit(student, school);
  if (fit !== "unknown") {
    return {
      percentileOfAdmitsAtOrBelow: null,
      basis: "mid50",
      asOfYear: null,
      sourceUrl: null,
    };
  }

  return {
    percentileOfAdmitsAtOrBelow: null,
    basis: "unknown",
    asOfYear: null,
    sourceUrl: null,
  };
}

/** Prefer a GPA distribution with usable buckets; else the first usable one. */
function pickDistribution(
  distributions: AdmitDistributionData[],
): AdmitDistributionData | null {
  const usable = distributions.filter((d) => d.buckets.length > 0);
  const gpa = usable.find((d) => d.statType === "GPA");
  if (gpa !== undefined) return gpa;
  return usable[0] ?? null;
}

function studentStatFor(
  student: StudentMetrics,
  statType: AdmitDistributionData["statType"],
): number | null {
  switch (statType) {
    case "GPA":
      return student.gpaUnweighted;
    case "SAT":
      return student.satTotal;
    case "ACT":
      return student.actComposite;
    default:
      return null;
  }
}

/**
 * Sum pctOfAdmits over every bucket whose range is entirely at or below the
 * student's stat. Bucket rangeLabels are parsed from forms like ">=3.9",
 * "3.8-3.9", "<3.8", "3.9+". Returns null if no bucket could be parsed.
 */
function percentileFromBuckets(
  buckets: AdmitBucket[],
  studentStat: number,
): number | null {
  let total = 0;
  let parsedAny = false;

  for (const bucket of buckets) {
    const range = parseRangeLabel(bucket.rangeLabel);
    if (range === null) continue;
    parsedAny = true;
    // A bucket counts as "at or below" the student when the student's stat is
    // at or above the bucket's upper bound (the whole bucket sits below them).
    if (studentStat >= range.high) {
      total += bucket.pctOfAdmits;
    }
  }

  if (!parsedAny) return null;
  return clamp01(total);
}

interface ParsedRange {
  low: number; // -Infinity for "< x"
  high: number; // +Infinity for ">= x"
}

/** Parse a bucket label into a numeric [low, high]. Returns null if unparseable. */
function parseRangeLabel(label: string): ParsedRange | null {
  const raw = label.trim();

  // ">=3.9", "≥3.9", "3.9+"
  let m = raw.match(/^(?:>=|≥)\s*(\d+(?:\.\d+)?)$/);
  if (m && m[1] !== undefined) return { low: Number(m[1]), high: Number.POSITIVE_INFINITY };
  m = raw.match(/^(\d+(?:\.\d+)?)\s*\+$/);
  if (m && m[1] !== undefined) return { low: Number(m[1]), high: Number.POSITIVE_INFINITY };

  // ">3.9"
  m = raw.match(/^>\s*(\d+(?:\.\d+)?)$/);
  if (m && m[1] !== undefined) return { low: Number(m[1]), high: Number.POSITIVE_INFINITY };

  // "<3.8", "≤3.8", "<=3.8"
  m = raw.match(/^(?:<=|≤)\s*(\d+(?:\.\d+)?)$/);
  if (m && m[1] !== undefined) return { low: Number.NEGATIVE_INFINITY, high: Number(m[1]) };
  m = raw.match(/^<\s*(\d+(?:\.\d+)?)$/);
  if (m && m[1] !== undefined) return { low: Number.NEGATIVE_INFINITY, high: Number(m[1]) };

  // "3.8-3.9", "3.8 - 3.9", "3.8–3.9"
  m = raw.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (m && m[1] !== undefined && m[2] !== undefined) {
    return { low: Number(m[1]), high: Number(m[2]) };
  }

  // Bare number -> treat as a point.
  m = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (m && m[1] !== undefined) {
    const n = Number(m[1]);
    return { low: n, high: n };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Band mapping
// ---------------------------------------------------------------------------

/** Map academic fit to a starting band (before ceilings/spike). */
function mapFitToBand(fit: AcademicFit): Exclude<RealismBand, "Unknown"> {
  switch (fit) {
    case "above":
      return "Likely";
    case "within":
      return "Target";
    case "below":
      return "Hard Reach";
    case "unknown":
      return "Reach";
  }
}

/** A spike is "strong" enough to influence the tail/nudge at NATIONAL+. */
function isStrongSpike(spike: SpikeAssessmentData | null): boolean {
  if (spike === null) return false;
  return spike.tier === "NATIONAL" || spike.tier === "EXCEPTIONAL";
}

/** Clamp a band so it is no stronger than `ceiling` on the realism ladder. */
function clampBandTo(
  band: Exclude<RealismBand, "Unknown">,
  ceiling: Exclude<RealismBand, "Unknown">,
): Exclude<RealismBand, "Unknown"> {
  const bandIdx = REALISM_BAND_ORDER.indexOf(band);
  const ceilingIdx = REALISM_BAND_ORDER.indexOf(ceiling);
  return bandIdx > ceilingIdx ? ceiling : band;
}

// ---------------------------------------------------------------------------
// Tail outlook
// ---------------------------------------------------------------------------

/**
 * The tail outlook is only meaningful for a below-band profile. With an
 * EXCEPTIONAL spike and a real nonzero placement, the tail is
 * "narrow_but_credible"; a NATIONAL spike also yields "narrow_but_credible"
 * (weaker wording handled in the rationale); otherwise "very_long". When the
 * profile is within/above band, it is "na".
 */
function computeTailOutlook(
  isBelowBand: boolean,
  spike: SpikeAssessmentData | null,
  percentile: number | null,
): TailOutlook {
  if (!isBelowBand) return "na";
  if (spike === null) return "very_long";

  if (spike.tier === "EXCEPTIONAL" && percentile !== null && percentile > 0) {
    return "narrow_but_credible";
  }
  if (spike.tier === "NATIONAL") {
    return "narrow_but_credible";
  }
  if (spike.tier === "EXCEPTIONAL") {
    // EXCEPTIONAL but no concrete nonzero placement to anchor on.
    return "narrow_but_credible";
  }
  return "very_long";
}

// ---------------------------------------------------------------------------
// Rationale
// ---------------------------------------------------------------------------

function buildRationale(
  schoolName: string,
  baseRate: number,
  placement: DistributionPlacement,
  spikeTier: SpikeTier | null,
  band: Exclude<RealismBand, "Unknown"> | RealismBand,
  academicFit: AcademicFit,
  tailOutlook: TailOutlook,
): string {
  const pct = formatPct(baseRate);

  const placementPhrase = buildPlacementPhrase(placement, academicFit);

  const spikePhrase =
    spikeTier !== null
      ? `Your spike reads as ${spikeTier.toLowerCase()}`
      : "No spike assessment is factored in";

  const tailPhrase =
    tailOutlook === "narrow_but_credible"
      ? spikeTier === "EXCEPTIONAL"
        ? "There is a narrow but credible tail for outlier profiles like this one."
        : "There is a narrow tail here, though a long shot."
      : tailOutlook === "very_long"
        ? "Any path in from below the typical range is a very long shot."
        : `This lands as a ${band} given the gap between your profile and its band.`;

  return `${schoolName} admits about ${pct} of applicants. ${placementPhrase} ${spikePhrase}. ${tailPhrase}`;
}

function buildPlacementPhrase(
  placement: DistributionPlacement,
  academicFit: AcademicFit,
): string {
  if (
    placement.basis === "distribution" &&
    placement.percentileOfAdmitsAtOrBelow !== null
  ) {
    const p = Math.round(placement.percentileOfAdmitsAtOrBelow * 100);
    const year = placement.asOfYear !== null ? ` (${placement.asOfYear})` : "";
    const src = placement.sourceUrl !== null ? `, ${placement.sourceUrl}` : "";
    return `About ${p}% of recent admits had stats at or below yours${year}${src}.`;
  }

  // mid50 / unknown: describe the qualitative fit only — never a percentile.
  switch (academicFit) {
    case "above":
      return "Your stats clear its typical admitted range.";
    case "within":
      return "Your stats sit within its typical admitted range.";
    case "below":
      return "Your stats are below its typical admitted range.";
    case "unknown":
      return "Its admitted-class stats aren't available to compare against.";
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function formatPct(rate: number): string {
  const pct = rate * 100;
  // Show one decimal for very low rates so 4% vs 4.5% reads honestly.
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
