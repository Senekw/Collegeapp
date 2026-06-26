// Profile synthesis orchestration (server-only).
//
// Combines the deterministic aggregate (lib/scoring/aggregate.ts) with the deep
// Gemini model to produce a coherent spike assessment, then persists it.

import { getDeepModel } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { serializeArray } from "@/lib/enums";
import { callStructured } from "@/lib/gemini/client";
import { buildSynthesisSystemPrompt } from "@/lib/gemini/prompts";
import {
  SynthesisSchema,
  SYNTHESIS_RESPONSE_SCHEMA,
  type SynthesisPayload,
  type SynthesisResult,
} from "@/lib/gemini/schemas";
import { aggregateActivities, computeAcademicStrength } from "@/lib/scoring/aggregate";
import { toActivityForAggregate, toStudentMetrics } from "@/lib/data";
import type { Activity, ActivityScore } from "@prisma/client";

type ActivityWithScore = Activity & { score: ActivityScore | null };

/**
 * Synthesize the student's entire profile into a spike assessment via the deep
 * model, conditioned on how much runway the student has left, and upsert the
 * result into ProfileSynthesis.
 */
export async function synthesizeProfile(studentId: string): Promise<SynthesisResult> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) {
    throw new Error(`Student ${studentId} not found.`);
  }

  const activities = (await prisma.activity.findMany({
    where: { studentId },
    include: { score: true },
  })) as ActivityWithScore[];

  const academicStrength = computeAcademicStrength(toStudentMetrics(student));
  const aggregate = aggregateActivities(activities.map(toActivityForAggregate));
  aggregate.academicStrength = academicStrength;

  const yearsRemaining = computeYearsRemaining(student.gradYear, student.gradeLevel);

  const payload: SynthesisPayload = {
    student: {
      gradeLevel: student.gradeLevel,
      gradYear: student.gradYear,
      intendedMajor: student.intendedMajor,
      yearsRemaining,
      academicStrength,
      rigor: student.rigor,
      contextNotes: student.contextNotes,
    },
    activities: activities.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      spikeTheme: a.spikeTheme,
      tier: a.score?.tier ?? null,
      weightedSignal: weightedSignalFor(a.id, aggregate.themes),
      creditMultiplier: a.score?.creditMultiplier ?? null,
      rationale: a.score?.rationale ?? null,
    })),
    aggregate: {
      weightedActivitySignal: aggregate.weightedActivitySignal,
      topTheme: aggregate.topTheme,
      themes: aggregate.themes.map((t) => ({
        theme: t.theme,
        weightedSignal: t.weightedSignal,
        activityIds: t.activityIds,
      })),
    },
  };

  const result = await callStructured<SynthesisResult>({
    model: getDeepModel(),
    systemPrompt: buildSynthesisSystemPrompt(),
    userPayload: payload,
    schema: SynthesisSchema,
    responseSchema: SYNTHESIS_RESPONSE_SCHEMA,
  });

  const data = {
    primarySpike: result.primarySpike.theme,
    spikeStrength: result.primarySpike.strength,
    secondaryThemes: serializeArray(result.secondaryThemes),
    academicStrength: result.academicStrength,
    overallNarrative: result.overallNarrative,
    gaps: serializeArray(result.gaps),
    feasibleMoves: serializeArray(result.feasibleMoves),
  };

  await prisma.profileSynthesis.upsert({
    where: { studentId },
    create: { studentId, ...data },
    update: data,
  });

  return result;
}

/**
 * Years of high school the student has left, used to time-gate feasibleMoves.
 * Prefer gradYear (concrete); fall back to 12 - gradeLevel; null when neither
 * is known.
 */
function computeYearsRemaining(
  gradYear: number | null,
  gradeLevel: number | null,
): number | null {
  if (gradYear !== null) return gradYear - new Date().getFullYear();
  if (gradeLevel !== null) return 12 - gradeLevel;
  return null;
}

/**
 * The aggregate exposes per-theme weighted signal but not per-activity signal
 * directly; an activity sits in exactly one theme cluster, so for the payload we
 * surface its theme's signal as a proxy. (The model uses this only as relative
 * evidence; exact per-activity numbers are not load-bearing here.)
 */
function weightedSignalFor(
  activityId: string,
  themes: { weightedSignal: number; activityIds: string[] }[],
): number {
  for (const theme of themes) {
    if (theme.activityIds.includes(activityId)) return theme.weightedSignal;
  }
  return 0;
}
