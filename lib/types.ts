/**
 * Shared domain types — the contract between the pure logic modules
 * (realism / match / aggregate), the server actions, and the UI.
 *
 * The pure modules take these plain shapes (NOT Prisma rows) so they stay
 * testable with zero DB/network. Server actions map Prisma rows -> these shapes.
 */

// ---------- Realism (§5.6) ----------
export type RealismBand =
  | "Hard Reach"
  | "Reach"
  | "Target"
  | "Likely"
  | "Safety"
  | "Unknown";

/** Ordered weakest->strongest chance for the student. "Unknown" sits outside the ladder. */
export const REALISM_BAND_ORDER: Exclude<RealismBand, "Unknown">[] = [
  "Hard Reach",
  "Reach",
  "Target",
  "Likely",
  "Safety",
];

export type AcademicFit = "below" | "within" | "above" | "unknown";

export interface RealismResult {
  band: RealismBand;
  /** The school's published base admit rate (0..1) or null if unknown. Never a per-student %. */
  baseRate: number | null;
  /** One sentence citing baseRate + academicFit + spike relevance. */
  rationale: string;
  /** Always present. The fixed uncertainty disclaimer. */
  caveat: string;
}

// ---------- Inputs to the pure modules ----------
export interface StudentMetrics {
  gpaUnweighted: number | null;
  gpaWeighted: number | null;
  satTotal: number | null;
  actComposite: number | null;
  intendedMajor: string | null;
  state: string | null;
  gradeLevel: number | null;
  gradYear: number | null;
}

export interface SchoolData {
  id: string;
  name: string;
  admitRate: number | null;
  gpaMid50Low: number | null;
  gpaMid50High: number | null;
  satMid50Low: number | null;
  satMid50High: number | null;
  type: string | null;
  size: number | null;
  strongMajors: string[];
  sourceUrl: string | null;
}

export interface SynthesisData {
  primarySpike: string;
  spikeStrength: number; // 0..10
  academicStrength: number; // 0..10
  secondaryThemes: string[];
}

// ---------- Match (§5.5) ----------
export interface SchoolMatch {
  school: SchoolData;
  academicFit: AcademicFit;
  /** Alignment of the student's spike/major with the school's strong majors, 0..10. */
  spikeFit: number;
  /** Internal ranking score; higher = better aim given "aspirational but plausible". */
  fitScore: number;
  /** One-line "why this school for your spike." */
  why: string;
  /** Honest data-completeness flags surfaced on the card (e.g. "admit rate unknown"). */
  missing: string[];
  realism: RealismResult;
}

// ---------- Aggregate (§4.5) ----------
/** Minimal per-activity shape the aggregator needs (score may be null = unscored). */
export interface ActivityForAggregate {
  id: string;
  title: string;
  category: string;
  spikeTheme: string | null;
  score: AggregateScoreInput | null;
}

export interface AggregateScoreInput {
  tier: number;
  impact: number;
  originality: number;
  initiative: number;
  depth: number;
  selectivity: number;
  spikeAlignment: number;
  /** Research-only authorship/independence discount (0..1); null for non-research. */
  creditMultiplier: number | null;
  substantiated: boolean;
}

export interface ThemeCluster {
  theme: string;
  activityIds: string[];
  /** Sum of credit-weighted activity signal in this theme. */
  weightedSignal: number;
}

export interface AggregateResult {
  /** 0..10 deterministic academic strength from GPA/rigor/tests vs. norms. */
  academicStrength: number;
  /** Credit-weighted total activity signal (research weighted by creditMultiplier). */
  weightedActivitySignal: number;
  /** Activity ids ordered by individual weighted signal, strongest first. */
  rankedActivityIds: string[];
  /** Spike-theme clusters, strongest first. */
  themes: ThemeCluster[];
  /** Convenience: the strongest theme name, or null if no scored activities. */
  topTheme: string | null;
}

// ---------- Feasible moves / synthesis (parsed JSON shapes) ----------
export interface FeasibleMove {
  move: string;
  byGrade: number;
  why: string;
}

// ---------- Server action result envelope ----------
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ---------- Resume (§5.8) ----------
export interface ResumeActivity {
  title: string;
  category: string; // human label
  role: string | null;
  description: string;
  dates: string | null; // pre-formatted date range
  tier: number | null;
  impact: number | null;
  research: {
    outputType: string; // human label
    authorship: string; // human label
    venue: string | null;
  } | null;
}

export interface ResumeData {
  name: string | null;
  gradeLevel: number | null;
  gradYear: number | null;
  intendedMajor: string | null;
  state: string | null;
  email: string | null;
  gpaUnweighted: number | null;
  gpaWeighted: number | null;
  satTotal: number | null;
  actComposite: number | null;
  rigor: string | null;
  /** Already ordered by tier/impact, strongest first. */
  activities: ResumeActivity[];
}
