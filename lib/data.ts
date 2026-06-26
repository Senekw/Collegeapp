// Data mappers + local-student bootstrap (server-only).
//
// This module is the single place that turns Prisma rows into the plain domain
// shapes the pure logic modules (realism / match / aggregate) consume. It
// imports the Prisma client, so it must only ever be imported by server code.

import { z } from "zod";

import { LOCAL_USER_ID } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  ConfidenceSchema,
  ProgramLevelSchema,
  SourceQualitySchema,
  SpikeTierSchema,
  StatTypeSchema,
  parseIntArray,
  parseJson,
  parseStringArray,
} from "@/lib/enums";
import type {
  ActivityForAggregate,
  AdmitDistributionData,
  ArchetypeData,
  EnrichmentSource,
  ResolvedEnrichment,
  SchoolData,
  SelectivityBreakdown,
  SpikeAssessmentData,
  SpikeComponents,
  StudentMetrics,
  SynthesisData,
} from "@/lib/types";
import type {
  Activity,
  ActivityScore,
  AdmitArchetype,
  AdmitDistribution,
  ProfileSynthesis,
  ProgramEnrichment,
  School,
  SpikeAssessment,
  Student,
} from "@prisma/client";

/**
 * Fetch the single local student, creating a clean-slate row if none exists.
 * v1 is single-user; every row is scoped to LOCAL_USER_ID.
 */
export async function getOrCreateLocalStudent(): Promise<Student> {
  const existing = await prisma.student.findFirst({
    where: { userId: LOCAL_USER_ID },
  });
  if (existing) return existing;
  return prisma.student.create({ data: { userId: LOCAL_USER_ID } });
}

/** Map a Student row to the StudentMetrics shape the pure logic consumes. */
export function toStudentMetrics(s: Student): StudentMetrics {
  return {
    gpaUnweighted: s.gpaUnweighted,
    gpaWeighted: s.gpaWeighted,
    satTotal: s.satTotal,
    actComposite: s.actComposite,
    intendedMajor: s.intendedMajor,
    state: s.state,
    gradeLevel: s.gradeLevel,
    gradYear: s.gradYear,
  };
}

/** Map a School row to SchoolData (strongMajors parsed from its JSON column). */
export function toSchoolData(s: School): SchoolData {
  return {
    id: s.id,
    name: s.name,
    admitRate: s.admitRate,
    gpaMid50Low: s.gpaMid50Low,
    gpaMid50High: s.gpaMid50High,
    satMid50Low: s.satMid50Low,
    satMid50High: s.satMid50High,
    type: s.type,
    size: s.size,
    strongMajors: parseStringArray(s.strongMajors),
    sourceUrl: s.sourceUrl,
  };
}

/**
 * Map a ProfileSynthesis row to SynthesisData, or null when no synthesis
 * exists yet. secondaryThemes is parsed from its JSON column.
 */
export function toSynthesisData(p: ProfileSynthesis | null): SynthesisData | null {
  if (p === null) return null;
  return {
    primarySpike: p.primarySpike,
    spikeStrength: p.spikeStrength,
    academicStrength: p.academicStrength,
    secondaryThemes: parseStringArray(p.secondaryThemes),
  };
}

/**
 * Map an Activity (with its optional score relation) to the minimal shape the
 * aggregator needs. An unscored activity carries score: null.
 */
export function toActivityForAggregate(
  a: Activity & { score: ActivityScore | null },
): ActivityForAggregate {
  return {
    id: a.id,
    title: a.title,
    category: a.category,
    spikeTheme: a.spikeTheme,
    score:
      a.score === null
        ? null
        : {
            tier: a.score.tier,
            impact: a.score.impact,
            originality: a.score.originality,
            initiative: a.score.initiative,
            depth: a.score.depth,
            selectivity: a.score.selectivity,
            spikeAlignment: a.score.spikeAlignment,
            creditMultiplier: a.score.creditMultiplier,
            substantiated: a.score.substantiated,
          },
  };
}

// ===========================================================================
// EXTENSION mappers. All parse JSON columns defensively (malformed -> safe).
// ===========================================================================

/** Defensive parse of a stored sources JSON column to EnrichmentSource[]. */
function parseSources(raw: string | null | undefined): EnrichmentSource[] {
  const arr = parseJson(
    raw,
    z.array(
      z.object({
        url: z.string(),
        publisher: z.string().nullish(),
        year: z.number().nullish(),
        quality: z.string().optional(),
      }),
    ),
    [] as { url: string; publisher?: string | null; year?: number | null; quality?: string }[],
  );
  return arr.map((s) => {
    const q = SourceQualitySchema.safeParse(String(s.quality ?? "").toUpperCase());
    return {
      url: s.url,
      publisher: s.publisher ?? null,
      year: s.year ?? null,
      quality: q.success ? q.data : "TERTIARY",
    };
  });
}

/** Axis A — parse a ProgramEnrichment row to the resolved shape used everywhere. */
export function toResolvedEnrichment(p: ProgramEnrichment): ResolvedEnrichment {
  return {
    programKey: p.programKey,
    displayName: p.displayName,
    aliases: parseStringArray(p.aliases),
    category: p.category,
    level: ProgramLevelSchema.catch("UNKNOWN").parse(p.level),
    cycleYear: p.cycleYear,
    asOfYear: p.asOfYear,
    isFallbackYear: p.isFallbackYear,
    applicantCount: p.applicantCount,
    acceptedCount: p.acceptedCount,
    acceptanceRate: p.acceptanceRate,
    participantCount: p.participantCount,
    awardWinnerCount: p.awardWinnerCount,
    awardLevels: parseStringArray(p.awardLevels),
    notableWinners: parseJson(
      p.notableWinners,
      z.array(
        z.object({
          what: z.string(),
          year: z.number().nullish(),
          sourceUrl: z.string().nullish(),
        }),
      ),
      [],
    ).map((w) => ({ what: w.what, year: w.year ?? null, sourceUrl: w.sourceUrl ?? null })),
    prestigeTier: p.prestigeTier,
    admissionsImpactNote: p.admissionsImpactNote,
    attendVsWinNote: p.attendVsWinNote,
    sources: parseSources(p.sources),
    confidence: ConfidenceSchema.catch("NONE").parse(p.confidence),
    enrichedAt: p.enrichedAt,
  };
}

/** Parse the ActivityScore.selectivityBreakdown JSON column (§6). */
export function parseSelectivityBreakdown(raw: string | null | undefined): SelectivityBreakdown {
  const empty: SelectivityBreakdown = {
    level: "unknown",
    externalFigures: [],
    studentAttainment: "",
    attendVsAchievementNote: "",
    confidence: "none",
  };
  return parseJson(
    raw,
    z.object({
      level: z.string(),
      externalFigures: z.array(
        z.object({
          label: z.string(),
          value: z.string(),
          asOfYear: z.number(),
          isFallbackYear: z.boolean(),
          sourceUrl: z.string(),
          sourceQuality: z.enum(["primary", "secondary", "tertiary"]),
        }),
      ),
      studentAttainment: z.string(),
      attendVsAchievementNote: z.string(),
      confidence: z.enum(["none", "low", "medium", "high"]),
    }),
    empty,
  );
}

/** Per school/stat/year admit distribution row -> domain shape. */
export function toAdmitDistributionData(d: AdmitDistribution): AdmitDistributionData {
  const sources = parseSources(d.sources);
  return {
    statType: StatTypeSchema.catch("GPA").parse(d.statType),
    buckets: parseJson(
      d.buckets,
      z.array(z.object({ rangeLabel: z.string(), pctOfAdmits: z.number() })),
      [],
    ),
    asOfYear: d.asOfYear,
    isFallbackYear: d.isFallbackYear,
    sourceUrl: sources[0]?.url ?? null,
    confidence: ConfidenceSchema.catch("NONE").parse(d.confidence),
  };
}

const ComponentsSchema = z.object({
  peak: z.number(),
  concentration: z.number(),
  trajectory: z.number(),
  originality: z.number(),
});
const EMPTY_COMPONENTS: SpikeComponents = { peak: 0, concentration: 0, trajectory: 0, originality: 0 };

/** SpikeAssessment row -> domain shape (null when not computed yet). */
export function toSpikeAssessmentData(s: SpikeAssessment | null): SpikeAssessmentData | null {
  if (s === null) return null;
  return {
    spikeIndex: s.spikeIndex,
    tier: SpikeTierSchema.catch("EMERGING").parse(s.tier),
    dominantTheme: s.dominantTheme,
    peakActivityIds: parseStringArray(s.peakActivityIds),
    components: parseJson(s.components, ComponentsSchema, EMPTY_COMPONENTS),
    rarityAnchor: s.rarityAnchor,
    gapToNextTier: s.gapToNextTier,
  };
}

/** Anonymized archetype row -> domain shape. */
export function toArchetypeData(a: AdmitArchetype): ArchetypeData {
  return {
    archetypeKey: a.archetypeKey,
    label: a.label,
    description: a.description,
    statBand: a.statBand,
    spikeSignature: parseJson(
      a.spikeSignature,
      ComponentsSchema.extend({ note: z.string().optional() }),
      { ...EMPTY_COMPONENTS },
    ),
    tier: SpikeTierSchema.catch("EMERGING").parse(a.tier),
    exampleOutcomes: a.exampleOutcomes,
    sources: parseSources(a.sources),
    confidence: ConfidenceSchema.catch("NONE").parse(a.confidence),
    asOfYear: a.asOfYear,
  };
}

/** parseIntArray re-export kept handy for grade-eligibility callers. */
export { parseIntArray };
