"use server";

// Enrichment server actions (Axis A). These wrap the server-only lib/enrich
// retrieval in the ActionResult envelope so the activity card can trigger an
// on-demand program-data refresh and a distribution refresh without ever
// importing server-only code into a client component.
//
// Both actions are cache-first inside lib/enrich; passing force re-runs the
// §4 two-step grounded retrieval. A missing Gemini key is mapped to a friendly
// "AI not configured" message rather than a raw crash.

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { StatTypeSchema, type StatType } from "@/lib/enums";
import { GeminiConfigError, GeminiError } from "@/lib/gemini/client";
import {
  resolveProgramEnrichment,
} from "@/lib/enrich/retrieve";
import { resolveDistributionForSchool } from "@/lib/enrich/distribution";
import type { ActionResult } from "@/lib/types";

/**
 * Resolve (cache-first) Axis-A program enrichment for the activity's normalized
 * programKey. Returns the programKey that was enriched so the caller can confirm
 * which program the refresh applied to. `force` re-runs the grounded retrieval.
 */
export async function enrichActivityProgramAction(
  activityId: string,
  force?: boolean,
): Promise<ActionResult<{ programKey: string }>> {
  try {
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      select: { programKey: true, title: true, category: true },
    });
    if (!activity) {
      return { ok: false, error: "Activity not found." };
    }
    if (!activity.programKey) {
      return {
        ok: false,
        error:
          "This activity isn't linked to a named program, so there's no program data to fetch.",
      };
    }

    const enriched = await resolveProgramEnrichment({
      programKey: activity.programKey,
      displayName: activity.title,
      category: activity.category,
      force: force ?? false,
    });
    if (!enriched) {
      return { ok: false, error: "No program data could be resolved." };
    }

    revalidatePath("/activities");
    return { ok: true, data: { programKey: enriched.programKey } };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

/**
 * Optional: refresh a school's admit distribution for one stat type (Axis A).
 * Cache-first inside lib/enrich; surfaced for parity with the program refresh.
 */
export async function refreshDistributionAction(
  schoolId: string,
  statType: StatType,
  force?: boolean,
): Promise<ActionResult<{ statType: StatType }>> {
  const parsedStat = StatTypeSchema.safeParse(statType);
  if (!parsedStat.success) {
    return { ok: false, error: "Unknown stat type." };
  }

  try {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true },
    });
    if (!school) {
      return { ok: false, error: "School not found." };
    }

    await resolveDistributionForSchool({
      schoolId: school.id,
      schoolName: school.name,
      statType: parsedStat.data,
      force: force ?? false,
    });

    revalidatePath("/activities");
    revalidatePath("/recommend");
    return { ok: true, data: { statType: parsedStat.data } };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

/** Map known Gemini failures to friendly copy; fall back generically. */
function friendlyError(err: unknown): string {
  if (err instanceof GeminiConfigError) {
    return "AI is not configured. Add a Gemini API key to fetch program data.";
  }
  if (err instanceof GeminiError) {
    return "The data service is temporarily unavailable. Please try again in a moment.";
  }
  return err instanceof Error ? err.message : "Something went wrong fetching program data.";
}
