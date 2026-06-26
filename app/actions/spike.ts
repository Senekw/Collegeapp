"use server";

// Spike assessment server action (§7, §11). Computes (or recomputes) the local
// student's Spike Index + tier + decomposition via the deterministic core and
// the (optional) calibration model, then returns it in the ActionResult
// envelope.
//
// assessSpike is resilient by design: a missing Gemini key or a calibration
// failure falls back to the deterministic tier rather than throwing, so success
// is expected even without a key. We still guard with try/catch for any
// unexpected error (e.g. DB failure).

import { revalidatePath } from "next/cache";

import { getOrCreateLocalStudent } from "@/lib/data";
import { GeminiConfigError, GeminiError } from "@/lib/gemini/client";
import { assessSpike } from "@/lib/spike/assess";
import type { ActionResult, SpikeAssessmentData } from "@/lib/types";

/** Compute (or recompute) the local student's Spike Index assessment. */
export async function computeSpikeAction(
  force?: boolean,
): Promise<ActionResult<SpikeAssessmentData>> {
  try {
    const student = await getOrCreateLocalStudent();
    const data = await assessSpike(student.id, { force: force ?? false });
    revalidatePath("/");
    revalidatePath("/schools");
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

function friendlyError(err: unknown): string {
  if (err instanceof GeminiConfigError) {
    // Should not normally reach here (assessSpike falls back deterministically),
    // but keep a friendly message in case the key is required upstream.
    return "AI calibration is not configured. Add a Gemini API key to enable it.";
  }
  if (err instanceof GeminiError) {
    return "The AI calibrator is temporarily unavailable. Please try again in a moment.";
  }
  return err instanceof Error
    ? err.message
    : "Something went wrong while computing your spike.";
}
