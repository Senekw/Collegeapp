import type {
  AcademicFit,
  RealismBand,
  RealismResult,
  SchoolData,
  StudentMetrics,
  SynthesisData,
} from "@/lib/types";
import { REALISM_BAND_ORDER } from "@/lib/types";

/**
 * §5.6 Realism estimation — SAFETY-CRITICAL.
 *
 * This module NEVER produces a per-student admit probability. It maps a
 * school's *published* base admit rate plus a coarse academic/spike fit signal
 * onto a small ordinal ladder of bands, with hard ceilings that no amount of
 * student strength can override at highly selective schools.
 */

/** The fixed uncertainty disclaimer surfaced on every realism result. */
export const REALISM_CAVEAT =
  "Based on published admit rate and academic fit only. Essays, recommendations, institutional priorities, and context are not modeled and dominate outcomes at selective schools. Treat this as orientation, not a prediction.";

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
 * Estimate a realism band for this student/school pair.
 *
 * Algorithm (§5.6):
 *  - baseRate is the school's published admit rate. If null -> "Unknown".
 *  - An internal rawSignal blends baseRate, academicFit, and a bounded spike
 *    boost. rawSignal is NEVER surfaced as a percent.
 *  - HARD CEILINGS override the mapping:
 *      baseRate < 0.05 -> always "Hard Reach"
 *      baseRate < 0.10 -> never better than "Reach"
 *  - caveat is always REALISM_CAVEAT.
 *  - rationale cites the base rate as a %, the academic fit, and spike relevance.
 */
export function estimateRealism(
  student: StudentMetrics,
  school: SchoolData,
  synthesis: SynthesisData | null,
  spikeFit?: number,
): RealismResult {
  const baseRate = school.admitRate;

  if (baseRate === null) {
    return {
      band: "Unknown",
      baseRate: null,
      rationale: `${school.name}'s published admit rate is unverified, so a realism band can't be estimated; treat this as orientation only.`,
      caveat: REALISM_CAVEAT,
    };
  }

  const academicFit = computeAcademicFit(student, school);

  // --- Internal rawSignal on the same 0..1-ish scale as admit rate, but it is
  // an opaque ordinal driver, never reported as a probability. ---
  let rawSignal = baseRate;

  // Academic fit nudges the signal up or down (bounded).
  if (academicFit === "above") rawSignal += 0.12;
  else if (academicFit === "below") rawSignal -= 0.12;
  // "within" and "unknown" leave it unchanged.

  // Bounded modest spike boost from synthesis strength + spike fit.
  const spikeBoost = computeSpikeBoost(synthesis, spikeFit);
  rawSignal += spikeBoost;

  // Clamp into [0, 1] for the mapping step.
  rawSignal = clamp01(rawSignal);

  // --- Map rawSignal -> band ---
  let band = mapSignalToBand(rawSignal);

  // --- HARD CEILINGS override everything ---
  if (baseRate < 0.05) {
    band = "Hard Reach";
  } else if (baseRate < 0.1) {
    // Never better than "Reach": clamp via the ordered ladder so only
    // "Hard Reach" or "Reach" remain possible.
    band = clampBandTo(band, "Reach");
  }

  return {
    band,
    baseRate,
    rationale: buildRationale(school.name, baseRate, academicFit, spikeBoost > 0),
    caveat: REALISM_CAVEAT,
  };
}

/**
 * A small, bounded boost from spike strength (0..10) and spike fit (0..10).
 * Capped so that spike can never vault a student past a hard ceiling, and at
 * most adds ~0.08 to rawSignal.
 */
function computeSpikeBoost(
  synthesis: SynthesisData | null,
  spikeFit?: number,
): number {
  const strength = synthesis ? clampRange(synthesis.spikeStrength, 0, 10) : 0;
  const fit = spikeFit !== undefined ? clampRange(spikeFit, 0, 10) : 0;
  if (strength === 0 && fit === 0) return 0;
  // Average of the two normalized 0..1 signals, scaled to a max of 0.08.
  const normalized = (strength / 10 + fit / 10) / 2;
  return normalized * 0.08;
}

/**
 * Map an opaque internal signal in [0,1] to a band. Thresholds are deliberately
 * conservative — a school is "Target" only with a comfortably double-digit
 * effective signal, and "Likely"/"Safety" require high openness.
 */
function mapSignalToBand(signal: number): Exclude<RealismBand, "Unknown"> {
  if (signal >= 0.55) return "Safety";
  if (signal >= 0.4) return "Likely";
  if (signal >= 0.22) return "Target";
  if (signal >= 0.12) return "Reach";
  return "Hard Reach";
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

function buildRationale(
  schoolName: string,
  baseRate: number,
  academicFit: AcademicFit,
  spikeRelevant: boolean,
): string {
  const pct = formatPct(baseRate);
  const fitPhrase =
    academicFit === "above"
      ? "your stats are above its typical admitted range"
      : academicFit === "within"
        ? "your stats sit within its typical admitted range"
        : academicFit === "below"
          ? "your stats are below its typical admitted range"
          : "its admissions stats aren't available to compare";
  const spikePhrase = spikeRelevant
    ? "and your spike is relevant to its strengths"
    : "and your spike adds little measurable lift here";
  return `${schoolName} admits about ${pct} of applicants, ${fitPhrase}, ${spikePhrase}.`;
}

function formatPct(rate: number): string {
  const pct = rate * 100;
  // Show one decimal for very low rates so 4% vs 4.5% reads honestly.
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

function clamp01(n: number): number {
  return clampRange(n, 0, 1);
}

function clampRange(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
