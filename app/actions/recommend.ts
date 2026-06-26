"use server";

// Recommendation server action. Pure ranking (no LLM), wrapped in the
// ActionResult envelope.

import { revalidatePath } from "next/cache";

import { getOrCreateLocalStudent } from "@/lib/data";
import { recommendSchools } from "@/lib/services/recommend";
import type { ActionResult, SchoolMatch } from "@/lib/types";

/** Rank schools for the local student. */
export async function recommendAction(): Promise<ActionResult<SchoolMatch[]>> {
  try {
    const student = await getOrCreateLocalStudent();
    const matches = await recommendSchools(student.id);
    revalidatePath("/schools");
    return { ok: true, data: matches };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not load recommendations.",
    };
  }
}
