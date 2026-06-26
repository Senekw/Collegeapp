"use server";

// Synthesis server action. Runs the deep-model profile synthesis for the local
// student and returns it in the ActionResult envelope.

import { revalidatePath } from "next/cache";

import { getOrCreateLocalStudent } from "@/lib/data";
import { GeminiConfigError, GeminiError } from "@/lib/gemini/client";
import type { SynthesisResult } from "@/lib/gemini/schemas";
import { synthesizeProfile } from "@/lib/services/synthesis";
import type { ActionResult } from "@/lib/types";

/** Synthesize the local student's profile into a spike assessment. */
export async function synthesizeAction(): Promise<ActionResult<SynthesisResult>> {
  try {
    const student = await getOrCreateLocalStudent();
    const result = await synthesizeProfile(student.id);
    revalidatePath("/");
    revalidatePath("/schools");
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

function friendlyError(err: unknown): string {
  if (err instanceof GeminiConfigError) {
    return "AI synthesis is not configured. Add a Gemini API key to enable it.";
  }
  if (err instanceof GeminiError) {
    return "The AI synthesizer is temporarily unavailable. Please try again in a moment.";
  }
  return err instanceof Error ? err.message : "Something went wrong while synthesizing.";
}
