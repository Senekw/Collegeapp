import { ACADEMIC_NORM_BANDS } from "@/lib/constants";
import type {
  ActivityForAggregate,
  AggregateResult,
  AggregateScoreInput,
  StudentMetrics,
  ThemeCluster,
} from "@/lib/types";

/**
 * §4.5 Deterministic aggregation.
 *
 * Pure math over already-scored activities: derive a credit-weighted signal per
 * activity, cluster by spike theme, rank, and compute a deterministic academic
 * strength from norm bands. No DB, no network.
 */

/**
 * Deterministic academic strength 0..10 from GPA + tests vs ACADEMIC_NORM_BANDS.
 * Test contribution is the max of SAT-derived and ACT-derived points; overall
 * strength is the max of the GPA-derived and test-derived contributions. No
 * data -> 0. Result is an integer.
 */
export function computeAcademicStrength(student: StudentMetrics): number {
  let best = 0;
  let hasData = false;

  if (student.gpaUnweighted !== null) {
    hasData = true;
    best = Math.max(best, bandPoints(student.gpaUnweighted, ACADEMIC_NORM_BANDS.gpaUnweighted));
  }
  if (student.satTotal !== null) {
    hasData = true;
    best = Math.max(best, bandPoints(student.satTotal, ACADEMIC_NORM_BANDS.satTotal));
  }
  if (student.actComposite !== null) {
    hasData = true;
    best = Math.max(best, bandPoints(student.actComposite, ACADEMIC_NORM_BANDS.actComposite));
  }

  if (!hasData) return 0;
  return Math.round(clampRange(best, 0, 10));
}

/**
 * Pick the points for the first band (sorted high->low by value) whose `value`
 * is <= the student's value. Returns 0 if the value is below every band.
 */
function bandPoints(value: number, bands: { value: number; points: number }[]): number {
  for (const band of bands) {
    if (value >= band.value) return band.points;
  }
  return 0;
}

/**
 * Aggregate scored activities:
 *  - per-activity weightedSignal = blend of the 6 dims + tier, * creditMultiplier
 *  - cluster by spikeTheme (fallback to category) into ThemeCluster[]
 *  - rankedActivityIds: scored activities, strongest signal first
 *  - weightedActivitySignal: sum of all per-activity signals
 *  - topTheme: strongest cluster, or null if nothing scored
 *  - academicStrength is left at 0 here; callers fill it via computeAcademicStrength
 *
 * Unscored activities (score === null) contribute 0 and are excluded from
 * ranking and clustering.
 */
export function aggregateActivities(
  activities: ActivityForAggregate[],
): AggregateResult {
  const signals = new Map<string, number>();
  const clusters = new Map<string, ThemeCluster>();
  let weightedActivitySignal = 0;

  for (const activity of activities) {
    if (activity.score === null) continue; // unscored: contributes 0, excluded.

    const signal = activitySignal(activity.score);
    signals.set(activity.id, signal);
    weightedActivitySignal += signal;

    const theme = (activity.spikeTheme ?? "").trim() || activity.category;
    const existing = clusters.get(theme);
    if (existing) {
      existing.activityIds.push(activity.id);
      existing.weightedSignal += signal;
    } else {
      clusters.set(theme, {
        theme,
        activityIds: [activity.id],
        weightedSignal: signal,
      });
    }
  }

  const rankedActivityIds = [...signals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);

  const themes = [...clusters.values()].sort(
    (a, b) => b.weightedSignal - a.weightedSignal || a.theme.localeCompare(b.theme),
  );

  const topTheme = themes.length > 0 ? themes[0]!.theme : null;

  return {
    academicStrength: 0, // callers fill this in via computeAcademicStrength.
    weightedActivitySignal: round2(weightedActivitySignal),
    rankedActivityIds,
    themes: themes.map((t) => ({ ...t, weightedSignal: round2(t.weightedSignal) })),
    topTheme,
  };
}

/**
 * A single activity's credit-weighted signal.
 *
 * Blend the six 0..10 quality dimensions (their mean) with a tier weight
 * (tier 1 strongest .. tier 4 weakest), then apply the research credit
 * multiplier when present (authorship/independence discount, 0..1).
 */
function activitySignal(score: AggregateScoreInput): number {
  const dims =
    score.impact +
    score.originality +
    score.initiative +
    score.depth +
    score.selectivity +
    score.spikeAlignment;
  const dimMean = dims / 6; // 0..10

  // Tier 1 -> 1.0, tier 2 -> 0.85, tier 3 -> 0.7, tier 4 -> 0.55.
  const tier = clampRange(score.tier, 1, 4);
  const tierWeight = 1 - (tier - 1) * 0.15;

  let signal = dimMean * tierWeight;

  // Research credit discount (only when a multiplier is present).
  if (score.creditMultiplier !== null) {
    signal *= clampRange(score.creditMultiplier, 0, 1);
  }

  return signal;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampRange(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
