// Activity scoring orchestration (server-only).
//
// Ties the cache (lib/scoring/cache.ts) to the Gemini client. Builds the
// ActivityScoringPayload from Prisma rows, checks the freshness cache to avoid
// redundant model calls (§5.3 — a fresh cache hit returns identical numbers with
// ZERO Gemini calls), and persists every fresh score.

import { getFastModel } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { parseStringArray } from "@/lib/enums";
import { callStructured } from "@/lib/gemini/client";
import { ACTIVITY_SCORING_SYSTEM_PROMPT } from "@/lib/gemini/prompts";
import {
  ActivityScoreSchema,
  ACTIVITY_SCORE_RESPONSE_SCHEMA,
  type ActivityScoreResult,
  type ActivityScoringPayload,
} from "@/lib/gemini/schemas";
import { computeInputHash, getStoredScore, isScoreFresh, storeScore } from "@/lib/scoring/cache";
import type { Activity, ActivityScore, ResearchDetail } from "@prisma/client";

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

  const payload = buildScoringPayload(activity, activity.research, {
    gradeLevel: activity.student.gradeLevel,
    intendedMajor: activity.student.intendedMajor,
  });
  const inputHash = computeInputHash(payload);

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

  await storeScore({ activityId, inputHash, result, modelUsed: getFastModel() });
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
 */
function buildScoringPayload(
  activity: Activity,
  research: ResearchDetail | null,
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
    studentContext: {
      gradeLevel: studentContext.gradeLevel,
      intendedMajor: studentContext.intendedMajor,
    },
  };
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
 * with no Gemini call. The research sub-object is reconstructed minimally (only
 * the creditMultiplier is persisted on the flat row); when no creditMultiplier
 * was stored the activity was non-research and research is null.
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
    research:
      stored.creditMultiplier === null
        ? null
        : {
            outputType: "none",
            authorship: "none",
            contribution: [],
            independence: 0,
            venueQuality: 0,
            creditMultiplier: stored.creditMultiplier,
          },
    rationale: stored.rationale,
    followUpQuestions: parseStringArray(stored.followUpQuestions),
  };
}
