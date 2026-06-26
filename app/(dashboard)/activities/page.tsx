// Activities page (Server Component). Loads every activity for the local
// student with its optional research detail and cached score, maps each Prisma
// row into a plain, serializable ActivityView, and hands the list to the client
// island that owns the add/edit/delete/score interactions.
//
// EXTENSION (§6/§11): the cached score's selectivityBreakdown JSON and the
// activity's deepDive JSON are parsed HERE on the server (via the @/lib/data and
// @/lib/gemini/schemas helpers) so the client island only ever receives plain
// data — no server-only import crosses the boundary. The matching
// ProgramEnrichment row (by programKey, current cycle) supplies enrichedAt.

import { getOrCreateLocalStudent, parseSelectivityBreakdown } from "@/lib/data";
import { prisma } from "@/lib/db";
import { parseStringArray } from "@/lib/enums";
import { DeepDiveSchema, type DeepDive } from "@/lib/gemini/schemas";

import { ActivitiesClient } from "@/components/activities/activities-client";
import type { ActivityView } from "@/components/activities/types";

export const dynamic = "force-dynamic";

/** Format a Prisma Date column as yyyy-mm-dd (or null) for a date input. */
function toDateInput(d: Date | null): string | null {
  if (d === null) return null;
  const iso = d.toISOString();
  return iso.slice(0, 10);
}

/** Defensively parse the stored deepDive JSON into a DeepDive (or null). */
function parseDeepDive(raw: string | null): DeepDive | null {
  if (raw === null || raw.length === 0) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = DeepDiveSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export default async function ActivitiesPage() {
  const student = await getOrCreateLocalStudent();

  const rows = await prisma.activity.findMany({
    where: { studentId: student.id },
    include: { research: true, score: true },
    orderBy: { updatedAt: "desc" },
  });

  // Resolve enrichedAt for any named programs in one batched query (current
  // cycle). Keyed by programKey for O(1) lookup while mapping rows.
  const cycleYear = new Date().getFullYear();
  const programKeys = Array.from(
    new Set(rows.map((a) => a.programKey).filter((k): k is string => k !== null)),
  );
  const enrichments =
    programKeys.length > 0
      ? await prisma.programEnrichment.findMany({
          where: { programKey: { in: programKeys }, cycleYear },
          select: { programKey: true, enrichedAt: true },
        })
      : [];
  const enrichedAtByKey = new Map<string, string>();
  for (const e of enrichments) {
    enrichedAtByKey.set(e.programKey, e.enrichedAt.toISOString());
  }

  const activities: ActivityView[] = rows.map((a) => ({
    id: a.id,
    title: a.title,
    category: a.category,
    role: a.role,
    description: a.description,
    startDate: toDateInput(a.startDate),
    endDate: toDateInput(a.endDate),
    hoursPerWeek: a.hoursPerWeek,
    weeksPerYear: a.weeksPerYear,
    evidenceUrl: a.evidenceUrl,
    spikeTheme: a.spikeTheme,
    programKey: a.programKey,
    research: a.research
      ? {
          outputType: a.research.outputType,
          authorship: a.research.authorship,
          contribution: parseStringArray(a.research.contribution),
          venue: a.research.venue,
          independence: a.research.independence,
          narrative: a.research.narrative,
        }
      : null,
    deepDive: parseDeepDive(a.deepDive),
    score: a.score
      ? {
          tier: a.score.tier,
          impact: a.score.impact,
          originality: a.score.originality,
          initiative: a.score.initiative,
          depth: a.score.depth,
          selectivity: a.score.selectivity,
          spikeAlignment: a.score.spikeAlignment,
          substantiated: a.score.substantiated,
          inflationFlags: parseStringArray(a.score.inflationFlags),
          creditMultiplier: a.score.creditMultiplier,
          rationale: a.score.rationale,
          followUpQuestions: parseStringArray(a.score.followUpQuestions),
          selectivityBreakdown: parseSelectivityBreakdown(
            a.score.selectivityBreakdown,
          ),
        }
      : null,
    enrichedAt:
      a.programKey !== null
        ? enrichedAtByKey.get(a.programKey) ?? null
        : null,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Activities</h1>
        <p className="text-sm text-muted-foreground">
          Catalog what you&apos;ve done, then let the AI score each one. Honest,
          substantiated entries score best.
        </p>
      </header>
      <ActivitiesClient activities={activities} />
    </div>
  );
}
