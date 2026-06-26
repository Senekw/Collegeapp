"use server";

// Scoring server actions. Wrap the scoring service in the ActionResult envelope,
// translating Gemini config/transport failures into friendly, retryable messages
// so the UI can distinguish "not configured" from "try again".

import { revalidatePath } from "next/cache";

import { getOrCreateLocalStudent } from "@/lib/data";
import { GeminiConfigError, GeminiError } from "@/lib/gemini/client";
import type { ActivityScoreResult } from "@/lib/gemini/schemas";
import { scoreActivity, scoreAllActivities } from "@/lib/services/scoring";
import type { ActionResult } from "@/lib/types";

/** Score a single activity. */
export async function scoreActivityAction(
  activityId: string,
  force?: boolean,
): Promise<ActionResult<ActivityScoreResult>> {
  try {
    const { result } = await scoreActivity(activityId, { force: force ?? false });
    revalidateScored();
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

/** Score every activity for the local student. */
export async function scoreAllAction(): Promise<
  ActionResult<{ scored: number; failed: number }>
> {
  try {
    const student = await getOrCreateLocalStudent();
    const counts = await scoreAllActivities(student.id);
    revalidateScored();
    return { ok: true, data: counts };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

function revalidateScored(): void {
  revalidatePath("/activities");
  revalidatePath("/");
}

/** Map known Gemini failures to friendly, retryable copy; fall back generically. */
function friendlyError(err: unknown): string {
  if (err instanceof GeminiConfigError) {
    return "AI scoring is not configured. Add a Gemini API key to enable scoring.";
  }
  if (err instanceof GeminiError) {
    return "The AI scorer is temporarily unavailable. Please try again in a moment.";
  }
  return err instanceof Error ? err.message : "Something went wrong while scoring.";
}
