/**
 * Shared domain types — the contract between the pure logic modules
 * (realism / match / aggregate / spike), the server actions, and the UI.
 *
 * The pure modules take these plain shapes (NOT Prisma rows) so they stay
 * testable with zero DB/network. Server actions map Prisma rows -> these shapes.
 */

import type {
  SpikeTier,
  ProgramLevel,
  SourceQuality,
  Confidence,
  StatType,
} from "@/lib/enums";

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

/** Outcome for a below-band profile given the spike (§8.5). "na" when in/above band. */
export type TailOutlook = "narrow_but_credible" | "very_long" | "na";

/** Where the student's stat sits within the admitted-class distribution (§8). */
export interface DistributionPlacement {
  /** Fraction (0..1) of recent admits with stats at or below the student's. Null when unknown. */
  percentileOfAdmitsAtOrBelow: number | null;
  /** distribution = real admit buckets; mid50 = three-way vs mid-50%; unknown = no stats. */
  basis: "distribution" | "mid50" | "unknown";
  asOfYear: number | null;
  sourceUrl: string | null;
}

/**
 * Distribution/outlier-aware realism (§8, supersedes v1 §5.6). Still NEVER a
 * per-student admit %. The band is ceiling-bound; the spike only sets the tail.
 */
export interface RealismResult {
  band: RealismBand;
  /** The school's published base admit rate (0..1) or null if unknown. Never a per-student %. */
  baseRate: number | null;
  distributionPlacement: DistributionPlacement;
  tailOutlook: TailOutlook;
  /** The spike tier that informed the tail outlook, or null when no spike assessment. */
  spikeTierUsed: SpikeTier | null;
  /** Deterministic template citing baseRate, placement, spike tier, and gap. No model. */
  rationale: string;
  /** Always present; appends a survivorship-bias note when tailOutlook !== "na". */
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

// ===========================================================================
// EXTENSION types.
// ===========================================================================

// ---- Web sources (shared) ----
export interface EnrichmentSource {
  url: string;
  publisher: string | null;
  year: number | null;
  quality: SourceQuality;
}

// ---- Axis A: resolved program enrichment (parsed from ProgramEnrichment row) ----
export interface NotableWinner {
  what: string;
  year: number | null;
  sourceUrl: string | null;
}
export interface ResolvedEnrichment {
  programKey: string;
  displayName: string;
  aliases: string[];
  category: string;
  level: ProgramLevel;
  cycleYear: number;
  asOfYear: number;
  isFallbackYear: boolean;
  applicantCount: number | null;
  acceptedCount: number | null;
  acceptanceRate: number | null;
  participantCount: number | null;
  awardWinnerCount: number | null;
  awardLevels: string[];
  notableWinners: NotableWinner[];
  prestigeTier: number | null;
  admissionsImpactNote: string | null;
  attendVsWinNote: string;
  sources: EnrichmentSource[];
  confidence: Confidence;
  enrichedAt: Date;
}

// ---- Parsed ActivityScore.selectivityBreakdown (for the activity card) ----
export interface ExternalFigure {
  label: string;
  value: string;
  asOfYear: number;
  isFallbackYear: boolean;
  sourceUrl: string;
  sourceQuality: "primary" | "secondary" | "tertiary";
}
export interface SelectivityBreakdown {
  level: string;
  externalFigures: ExternalFigure[];
  studentAttainment: string;
  attendVsAchievementNote: string;
  confidence: "none" | "low" | "medium" | "high";
}

// ---- Admit distribution (parsed AdmitDistribution row) ----
export interface AdmitBucket {
  rangeLabel: string;
  pctOfAdmits: number; // 0..1
}
export interface AdmitDistributionData {
  statType: StatType;
  buckets: AdmitBucket[];
  asOfYear: number;
  isFallbackYear: boolean;
  sourceUrl: string | null;
  confidence: Confidence;
}

// ---- Spike Index (§7) ----
export interface SpikeComponents {
  peak: number; // 0..10
  concentration: number; // 0..10
  trajectory: number; // 0..10
  originality: number; // 0..10
}
/** Pure deterministic core output (lib/spike/core.ts). */
export interface SpikeCoreResult {
  components: SpikeComponents;
  dominantTheme: string;
  peakActivityIds: string[];
  /** Per-activity combined signal, keyed by activity id (for peak display + payloads). */
  perActivitySignal: Record<string, number>;
  /** round(100 * weighted components / 10) before tier gating. */
  rawSpikeIndex: number;
}
/** Full computed assessment (parsed SpikeAssessment row / spike service result). */
export interface SpikeAssessmentData {
  spikeIndex: number; // 0..100
  tier: SpikeTier;
  dominantTheme: string;
  peakActivityIds: string[];
  components: SpikeComponents;
  rarityAnchor: string | null;
  gapToNextTier: string;
}

// ---- Anonymized archetype (parsed AdmitArchetype row) ----
export interface ArchetypeData {
  archetypeKey: string;
  label: string;
  description: string;
  statBand: string;
  spikeSignature: SpikeComponents & { note?: string };
  tier: SpikeTier;
  exampleOutcomes: string;
  sources: EnrichmentSource[];
  confidence: Confidence;
  asOfYear: number | null;
}
