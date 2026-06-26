/**
 * Spike Index — pure deterministic core (§7.1).
 *
 * NO DB / NO network. Takes plain activity+score shapes and computes the four
 * spike components (peak / concentration / trajectory / originality, each 0..10),
 * the dominant theme, the activities that form the peak, and the raw 0..100
 * spike index BEFORE archetype-anchored tier gating.
 *
 * Design intent: narrowness is a VIRTUE. A single towering, original,
 * verifiable accomplishment should produce a high peak AND a high
 * concentration — we never penalize a thin-but-deep profile.
 */

import type { SpikeCoreResult, SpikeComponents } from "@/lib/types";

/**
 * Minimal per-activity input the spike core needs. `score` is null for
 * unscored activities (they contribute 0 and are excluded from the math).
 */
export interface SpikeActivityInput {
  id: string;
  title: string;
  category: string;
  spikeTheme: string | null;
  startYear: number | null;
  score: {
    tier: number;
    impact: number;
    originality: number;
    initiative: number;
    depth: number;
    selectivity: number;
    spikeAlignment: number;
    creditMultiplier: number;
  } | null;
}

const EMPTY_COMPONENTS: SpikeComponents = {
  peak: 0,
  concentration: 0,
  trajectory: 0,
  originality: 0,
};

/** Per-activity combined signal on a 0..10 scale: credit-discounted blend of impact + selectivity. */
function activitySignal(score: NonNullable<SpikeActivityInput["score"]>): number {
  const blended = 0.5 * score.impact + 0.5 * score.selectivity; // 0..10
  return blended * clamp01(score.creditMultiplier); // discounted by realness/attribution
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function clamp010(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 10) return 10;
  return n;
}

/** The theme bucket for an activity: explicit spikeTheme, else its category. */
function themeOf(a: SpikeActivityInput): string {
  const t = a.spikeTheme;
  if (t !== null && t.trim().length > 0) return t;
  return a.category;
}

export function computeSpikeCore(activities: SpikeActivityInput[]): SpikeCoreResult {
  // Only scored activities participate. Unscored -> signal 0, excluded.
  const scored = activities.filter(
    (a): a is SpikeActivityInput & { score: NonNullable<SpikeActivityInput["score"]> } =>
      a.score !== null,
  );

  // Per-activity signal map (over ALL inputs so unscored ids resolve to 0 if asked).
  const perActivitySignal: Record<string, number> = {};
  for (const a of activities) {
    perActivitySignal[a.id] = a.score === null ? 0 : activitySignal(a.score);
  }

  if (scored.length === 0) {
    return {
      components: { ...EMPTY_COMPONENTS },
      dominantTheme: "",
      peakActivityIds: [],
      perActivitySignal,
      rawSpikeIndex: 0,
    };
  }

  // --- Sum signal per theme to pick the dominant theme ---
  const themeSignal = new Map<string, number>();
  let totalSignal = 0;
  for (const a of scored) {
    const sig = perActivitySignal[a.id] ?? 0;
    totalSignal += sig;
    themeSignal.set(themeOf(a), (themeSignal.get(themeOf(a)) ?? 0) + sig);
  }

  // dominantTheme = theme with the highest summed signal (deterministic tie-break by name).
  let dominantTheme = "";
  let dominantSum = -1;
  for (const [theme, sum] of themeSignal) {
    if (sum > dominantSum || (sum === dominantSum && theme < dominantTheme)) {
      dominantSum = sum;
      dominantTheme = theme;
    }
  }

  const inTheme = scored.filter((a) => themeOf(a) === dominantTheme);

  // --- PEAK: the single MAX per-activity signal in the dominant theme (NOT mean). ---
  let maxSignal = 0;
  for (const a of inTheme) {
    const sig = perActivitySignal[a.id] ?? 0;
    if (sig > maxSignal) maxSignal = sig;
  }
  const peak = clamp010(maxSignal); // signal is already 0..10

  // peakActivityIds: the max activity plus any near-peak in-theme (>=85% of the max).
  const peakThreshold = maxSignal * 0.85;
  const peakActivityIds = inTheme
    .filter((a) => (perActivitySignal[a.id] ?? 0) >= peakThreshold && maxSignal > 0)
    .map((a) => a.id);

  // --- CONCENTRATION: share of total weighted signal in the dominant theme, 0..10.
  //     Narrowness is a virtue: a profile entirely within one theme scores 10. ---
  const concentration =
    totalSignal > 0 ? clamp010((dominantSum / totalSignal) * 10) : 0;

  // --- TRAJECTORY: sustained / escalating signal in the theme across startYear, 0..10. ---
  const trajectory = computeTrajectory(inTheme, perActivitySignal);

  // --- ORIGINALITY: creditMultiplier-weighted mean of per-activity originality in theme, 0..10. ---
  const originality = computeWeightedOriginality(inTheme);

  const components: SpikeComponents = {
    peak: round1(peak),
    concentration: round1(concentration),
    trajectory: round1(trajectory),
    originality: round1(originality),
  };

  const rawSpikeIndex = Math.round(
    (100 *
      (0.4 * components.peak +
        0.2 * components.concentration +
        0.2 * components.trajectory +
        0.2 * components.originality)) /
      10,
  );

  return {
    components,
    dominantTheme,
    peakActivityIds,
    perActivitySignal,
    rawSpikeIndex: clampIndex(rawSpikeIndex),
  };
}

/**
 * Trajectory rewards sustained or escalating signal in the theme over time.
 * - Single in-theme activity (or none with years): use its signal as the level.
 * - Multiple years: blend the sustained presence (avg signal) with an
 *   escalation bonus when later years carry more signal than earlier ones.
 */
function computeTrajectory(
  inTheme: SpikeActivityInput[],
  perActivitySignal: Record<string, number>,
): number {
  if (inTheme.length === 0) return 0;

  const withYear = inTheme
    .filter((a): a is SpikeActivityInput & { startYear: number } => a.startYear !== null)
    .sort((a, b) => a.startYear - b.startYear);

  // Sustained level = mean signal across in-theme activities (0..10).
  let sum = 0;
  for (const a of inTheme) sum += perActivitySignal[a.id] ?? 0;
  const sustained = sum / inTheme.length;

  // Need at least two distinct years to detect escalation.
  if (withYear.length < 2) return clamp010(sustained);

  const firstYear = withYear[0]?.startYear;
  const lastYear = withYear[withYear.length - 1]?.startYear;
  if (firstYear === undefined || lastYear === undefined || firstYear === lastYear) {
    return clamp010(sustained);
  }

  const firstSig = perActivitySignal[withYear[0]!.id] ?? 0;
  const lastSig = perActivitySignal[withYear[withYear.length - 1]!.id] ?? 0;

  // Escalation bonus: up to +2 when the latest signal exceeds the earliest.
  const escalation = lastSig > firstSig ? Math.min(2, lastSig - firstSig) : 0;
  // Span bonus: sustaining the theme across multiple years is itself a trajectory signal.
  const spanBonus = Math.min(1, withYear.length - 1) * 0.5;

  return clamp010(sustained + escalation + spanBonus);
}

/** creditMultiplier-weighted mean of per-activity originality within the theme. */
function computeWeightedOriginality(inTheme: SpikeActivityInput[]): number {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const a of inTheme) {
    if (a.score === null) continue;
    const w = clamp01(a.score.creditMultiplier);
    weightedSum += a.score.originality * w;
    weightTotal += w;
  }
  if (weightTotal === 0) return 0;
  return clamp010(weightedSum / weightTotal);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clampIndex(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}
