// Activity scoring orchestration (server-only).
//
// Ties the cache (lib/scoring/cache.ts) to the Gemini client. Builds the
// ActivityScoringPayload from Prisma rows, folds in any cached Axis-A program
// enrichment (cache READ only — scoring never grounds), checks the freshness
// cache to avoid redundant model calls (§5.3 — a fresh cache hit returns
// identical numbers with ZERO Gemini calls), and persists every fresh score.

import { getFastModel } from "@/lib/constants";
import { parseSelectivityBreakdown, toResolvedEnrichment } from "@/lib/data";
import { prisma } from "@/lib/db";
import { parseStringArray } from "@/lib/enums";
import { enrichmentContentHash, getProgramEnrichment } from "@/lib/enrich/retrieve";
import { callStructured } from "@/lib/gemini/client";
import { ACTIVITY_SCORING_SYSTEM_PROMPT } from "@/lib/gemini/prompts";
import {
  ActivityScoreSchema,
  ACTIVITY_SCORE_RESPONSE_SCHEMA,
  DeepDiveSchema,
  type ActivityScoreResult,
  type ActivityScoringPayload,
  type DeepDive,
} from "@/lib/gemini/schemas";
import { computeInputHash, getStoredScore, isScoreFresh, storeScore } from "@/lib/scoring/cache";
import type { Activity, ActivityScore, ProgramEnrichment, ResearchDetail } from "@prisma/client";

export interface ScoreActivityOptions {
  /** Bypass the freshness cache and force a fresh Gemini call. */
  force?: boolean;
}

export interface ScoreActivityResult {
  result: ActivityScoreResult;
  fromCache: boolean;
}

/**
 * Score one activity. When a fresh cached score exists and !force, the stored
 * row is reconstructed into an ActivityScoreResult and returned with zero
 * Gemini calls. Otherwise Gemini is called and the result is persisted.
 *
 * Axis-A enrichment is read from cache ONLY (getProgramEnrichment) — scoring is
 * kept fast and key-light, never grounding. If no cached enrichment exists for
 * the activity's programKey, enrichment is null and the "no enrichment" content
 * hash is folded into the cache key.
 */
export async function scoreActivity(
  activityId: string,
  opts?: ScoreActivityOptions,
): Promise<ScoreActivityResult> {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { research: true, score: true, student: true },
  });
  if (!activity) {
    throw new Error(`Activity ${activityId} not found.`);
  }

  // Axis-A enrichment: cache read only (no grounding during scoring).
  const enrichmentRow =
    activity.programKey !== null && activity.programKey.length > 0
      ? await getProgramEnrichment(activity.programKey)
      : null;

  // Axis-B deep dive: parse the stored JSON (safeParse -> null on miss).
  const deepDive = parseDeepDive(activity.deepDive);

  const payload = buildScoringPayload(activity, activity.research, enrichmentRow, deepDive, {
    gradeLevel: activity.student.gradeLevel,
    intendedMajor: activity.student.intendedMajor,
  });

  const enrichmentHash = enrichmentContentHash(enrichmentRow);
  const inputHash = computeInputHash(payload, enrichmentHash);

  const stored = activity.score ?? (await getStoredScore(activityId));
  if (!opts?.force && isScoreFresh(stored, inputHash)) {
    // stored is non-null when isScoreFresh returns true.
    return { result: reconstructResult(stored as ActivityScore), fromCache: true };
  }

  const result = await callStructured<ActivityScoreResult>({
    model: getFastModel(),
    systemPrompt: ACTIVITY_SCORING_SYSTEM_PROMPT,
    userPayload: payload,
    schema: ActivityScoreSchema,
    responseSchema: ACTIVITY_SCORE_RESPONSE_SCHEMA,
  });

  await storeScore({
    activityId,
    inputHash,
    result,
    modelUsed: getFastModel(),
    enrichmentHashUsed: enrichmentHash,
  });
  return { result, fromCache: false };
}

/**
 * Score every activity for a student with bounded concurrency (3) and per-item
 * error isolation: one failing activity never aborts the batch. Returns the
 * count scored vs. failed.
 */
export async function scoreAllActivities(
  studentId: string,
): Promise<{ scored: number; failed: number }> {
  const activities = await prisma.activity.findMany({
    where: { studentId },
    select: { id: true },
  });

  let scored = 0;
  let failed = 0;
  const queue = [...activities];
  const CONCURRENCY = 3;

  async function worker(): Promise<void> {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      try {
        await scoreActivity(next.id);
        scored += 1;
      } catch {
        failed += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, () => worker()),
  );

  return { scored, failed };
}

/**
 * Build the ActivityScoringPayload from Prisma rows. durationMonths is derived
 * from the activity's start/end dates (end defaults to now when ongoing). The
 * research sub-object is included only when a ResearchDetail row exists; the
 * stored UPPERCASE enums are lowered to the enum form the LLM schema expects.
 * Axis-A enrichment is mapped to the lowercase payload shape when present, and
 * the parsed Axis-B deep dive is passed through.
 */
function buildScoringPayload(
  activity: Activity,
  research: ResearchDetail | null,
  enrichmentRow: ProgramEnrichment | null,
  deepDive: DeepDive | null,
  studentContext: { gradeLevel: number | null; intendedMajor: string | null },
): ActivityScoringPayload {
  return {
    activity: {
      title: activity.title,
      category: activity.category,
      role: activity.role,
      description: activity.description,
      hoursPerWeek: activity.hoursPerWeek,
      weeksPerYear: activity.weeksPerYear,
      durationMonths: durationMonths(activity.startDate, activity.endDate),
      evidenceUrl: activity.evidenceUrl,
      spikeTheme: activity.spikeTheme,
    },
    research:
      research === null
        ? null
        : {
            outputType: research.outputType.toLowerCase(),
            authorship: research.authorship.toLowerCase(),
            contribution: parseStringArray(research.contribution),
            venue: research.venue,
            independence: research.independence,
            narrative: research.narrative,
          },
    enrichment: enrichmentRow === null ? null : mapEnrichmentToPayload(enrichmentRow),
    deepDive,
    studentContext: {
      gradeLevel: studentContext.gradeLevel,
      intendedMajor: studentContext.intendedMajor,
    },
  };
}

/**
 * Map a stored ProgramEnrichment row onto the payload.enrichment shape. The DB
 * stores UPPERCASE enums; the LLM schema expects lowercase for level/confidence
 * and lowercase source quality. toResolvedEnrichment handles JSON parsing of
 * notableWinners/sources; we then lower-case the enum-ish fields.
 */
function mapEnrichmentToPayload(
  row: ProgramEnrichment,
): NonNullable<ActivityScoringPayload["enrichment"]> {
  const resolved = toResolvedEnrichment(row);
  return {
    displayName: resolved.displayName,
    level: resolved.level.toLowerCase(),
    asOfYear: resolved.asOfYear,
    isFallbackYear: resolved.isFallbackYear,
    applicantCount: resolved.applicantCount,
    acceptedCount: resolved.acceptedCount,
    acceptanceRate: resolved.acceptanceRate,
    participantCount: resolved.participantCount,
    awardWinnerCount: resolved.awardWinnerCount,
    notableWinners: resolved.notableWinners.map((w) => ({
      what: w.what,
      year: w.year,
      sourceUrl: w.sourceUrl,
    })),
    prestigeTier: resolved.prestigeTier,
    admissionsImpactNote: resolved.admissionsImpactNote,
    attendVsWinNote: resolved.attendVsWinNote,
    sources: resolved.sources.map((s) => ({
      url: s.url,
      year: s.year,
      quality: s.quality.toLowerCase(),
    })),
    confidence: resolved.confidence.toLowerCase(),
  };
}

/**
 * Reconstruct the strict selectivityBreakdown (§6) from the stored JSON column.
 * parseSelectivityBreakdown loosens `level` to `string`; we re-validate against
 * the ActivityScoreSchema member so the cache-hit result is byte-identical in
 * shape to a fresh score. On any miss, returns the schema's neutral default.
 */
function reconstructSelectivityBreakdown(
  raw: string,
): ActivityScoreResult["selectivityBreakdown"] {
  const loose = parseSelectivityBreakdown(raw);
  const parsed = ActivityScoreSchema.shape.selectivityBreakdown.safeParse(loose);
  if (parsed.success) return parsed.data;
  return {
    level: "unknown",
    externalFigures: [],
    studentAttainment: "",
    attendVsAchievementNote: "",
    confidence: "none",
  };
}

/** Parse the Activity.deepDive JSON column into a DeepDive (null on any miss). */
function parseDeepDive(raw: string | null): DeepDive | null {
  if (raw === null || raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = DeepDiveSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/** Months between start and end (end defaults to now). Null when no start. */
function durationMonths(startDate: Date | null, endDate: Date | null): number | null {
  if (startDate === null) return null;
  const end = endDate ?? new Date();
  const months =
    (end.getFullYear() - startDate.getFullYear()) * 12 +
    (end.getMonth() - startDate.getMonth());
  return Math.max(0, months);
}

/**
 * Rebuild an ActivityScoreResult from a stored ActivityScore row. Used on a
 * fresh cache hit so the returned numbers are byte-identical to what was scored,
 * with no Gemini call. The top-level creditMultiplier (§6) comes from its own
 * non-null column and the selectivityBreakdown is parsed from its JSON column.
 * The research arm is not separately persisted on the flat row, so it is
 * reconstructed as null (its figures are not consumed downstream from the cache
 * hit — downstream reads the flat columns + selectivityBreakdown).
 */
function reconstructResult(stored: ActivityScore): ActivityScoreResult {
  return {
    tier: stored.tier,
    scores: {
      impact: stored.impact,
      originality: stored.originality,
      initiative: stored.initiative,
      depth: stored.depth,
      selectivity: stored.selectivity,
      spikeAlignment: stored.spikeAlignment,
    },
    credibility: {
      substantiated: stored.substantiated,
      inflationFlags: parseStringArray(stored.inflationFlags),
    },
    research: null,
    creditMultiplier: stored.creditMultiplier,
    selectivityBreakdown: reconstructSelectivityBreakdown(stored.selectivityBreakdown),
    rationale: stored.rationale,
    followUpQuestions: parseStringArray(stored.followUpQuestions),
  };
}
