// Activity-score cache (server-only).
//
// The expensive part of scoring is the Gemini call, so we cache results keyed by
// a hash of the EXACT input that was scored (the ActivityScoringPayload, the
// resolved enrichment content, and the rubric version). If none of the activity
// input, the consumed enrichment, or the rubric changed, the stored score is
// still valid and we skip the model call. The hash is computed over a CANONICAL
// JSON form (recursively sorted keys) so logically-identical payloads with
// different key ordering produce the same hash.

import { createHash } from "node:crypto";

import { RUBRIC_VERSION } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { serializeArray } from "@/lib/enums";
import type { ActivityScoreResult, ActivityScoringPayload } from "@/lib/gemini/schemas";
import type { ActivityScore } from "@prisma/client";

/**
 * Compute the cache key for an activity-scoring input. SHA-256 over canonical
 * JSON of { payload, enrichmentHash, rubricVersion }. Stable across key
 * ordering. The enrichmentHash folds in the scoring-relevant content of the
 * ProgramEnrichment consumed (or the constant "no enrichment" hash) so a
 * re-enrichment that changes a figure invalidates the cached score.
 */
export function computeInputHash(payload: ActivityScoringPayload, enrichmentHash: string): string {
  const canonical = canonicalize({ payload, enrichmentHash, rubricVersion: RUBRIC_VERSION });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Fetch the stored score row for an activity, if any. */
export function getStoredScore(activityId: string): Promise<ActivityScore | null> {
  return prisma.activityScore.findUnique({ where: { activityId } });
}

/**
 * A stored score is fresh iff it exists and its recorded inputHash matches the
 * hash of the current input (same activity input + same enrichment + same
 * rubric version).
 */
export function isScoreFresh(stored: ActivityScore | null, inputHash: string): boolean {
  return stored !== null && stored.inputHash === inputHash;
}

export interface StoreScoreArgs {
  activityId: string;
  inputHash: string;
  result: ActivityScoreResult;
  modelUsed: string;
  enrichmentHashUsed: string;
}

/**
 * Upsert the scored result into ActivityScore, mapping the nested Gemini result
 * onto the flat columns. Writes the TOP-LEVEL non-null creditMultiplier (§6),
 * the selectivityBreakdown JSON, and the enrichmentHashUsed audit field.
 * JSON-string array columns go through serializeArray.
 */
export function storeScore(args: StoreScoreArgs): Promise<ActivityScore> {
  const { activityId, inputHash, result, modelUsed, enrichmentHashUsed } = args;

  const data = {
    inputHash,
    tier: result.tier,
    impact: result.scores.impact,
    originality: result.scores.originality,
    initiative: result.scores.initiative,
    depth: result.scores.depth,
    selectivity: result.scores.selectivity,
    spikeAlignment: result.scores.spikeAlignment,
    substantiated: result.credibility.substantiated,
    inflationFlags: serializeArray(result.credibility.inflationFlags),
    creditMultiplier: result.creditMultiplier,
    selectivityBreakdown: JSON.stringify(result.selectivityBreakdown),
    enrichmentHashUsed,
    rationale: result.rationale,
    followUpQuestions: serializeArray(result.followUpQuestions),
    modelUsed,
  };

  return prisma.activityScore.upsert({
    where: { activityId },
    create: { activityId, ...data },
    update: data,
  });
}

/**
 * Deterministic JSON serialization: objects have their keys sorted recursively;
 * arrays preserve order (order is semantically meaningful in the payload).
 * `undefined` object values are dropped (they never serialize to JSON anyway).
 */
function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const v = obj[key];
      if (v === undefined) continue;
      out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}
