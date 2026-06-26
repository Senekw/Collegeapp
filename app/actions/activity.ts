"use server";

// Activity CRUD server actions. Validates input with Zod, enforces the §5.2
// research rule (a research/internship activity with a research block must carry
// a real narrative + authorship), persists the optional ResearchDetail with its
// contribution array serialized, and removes the ResearchDetail when an activity
// is no longer research.
//
// EXTENSION (§5, §11): a non-research activity may carry a per-category deepDive
// (Axis B) — validated against the discriminated DeepDiveSchema arm chosen by
// deepDiveKindForCategory(category) and persisted as a JSON string. On every
// create/update we derive a normalized programKey (rules-first, API-free) from
// the named program (the competition name for COMPETITION, else the title) so
// Axis-A enrichment can later be resolved off it.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getOrCreateLocalStudent } from "@/lib/data";
import { prisma } from "@/lib/db";
import {
  ActivityCategorySchema,
  AuthorshipSchema,
  ContributionAreaSchema,
  RESEARCH_CATEGORIES,
  ResearchOutputSchema,
  deepDiveKindForCategory,
  serializeArray,
} from "@/lib/enums";
import {
  DeepDiveSchema,
  type DeepDive,
} from "@/lib/gemini/schemas";
import { normalizeProgram } from "@/lib/enrich/normalize";
import type { ActionResult } from "@/lib/types";

/** Optional research sub-object on an activity input. */
export interface ResearchInput {
  outputType?: string | null;
  authorship?: string | null;
  contribution?: string[] | null;
  venue?: string | null;
  independence?: number | null;
  narrative?: string | null;
}

/** Raw input from the activity form. */
export interface ActivityInput {
  title: string;
  category: string;
  role?: string | null;
  description: string;
  startDate?: string | null;
  endDate?: string | null;
  hoursPerWeek?: number | null;
  weeksPerYear?: number | null;
  evidenceUrl?: string | null;
  spikeTheme?: string | null;
  /** Optional explicit program/competition name; falls back to the title. */
  programName?: string | null;
  research?: ResearchInput | null;
  /**
   * Optional per-category deep dive (Axis B). A DeepDive-shaped object whose
   * `kind` must match deepDiveKindForCategory(category). Ignored for RESEARCH.
   */
  deepDive?: DeepDive | null;
}

const nullableString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const nullableNumber = z
  .union([z.number(), z.null(), z.undefined()])
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));

const ResearchInputSchema = z.object({
  outputType: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" && v.length > 0 ? v : "NONE"))
    .pipe(ResearchOutputSchema),
  authorship: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" && v.length > 0 ? v : "NONE"))
    .pipe(AuthorshipSchema),
  contribution: z
    .union([z.array(z.string()), z.null(), z.undefined()])
    .transform((v) => (Array.isArray(v) ? v : []))
    .pipe(z.array(ContributionAreaSchema)),
  venue: nullableString,
  independence: nullableNumber.pipe(z.number().int().min(0).max(10).nullable()),
  narrative: nullableString,
});

const ActivityInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  category: z.string().pipe(ActivityCategorySchema),
  role: nullableString,
  description: z.string().trim().min(1, "Description is required."),
  startDate: nullableString,
  endDate: nullableString,
  hoursPerWeek: nullableNumber.pipe(z.number().min(0).max(168).nullable()),
  weeksPerYear: nullableNumber.pipe(z.number().int().min(0).max(52).nullable()),
  evidenceUrl: nullableString,
  spikeTheme: nullableString,
  programName: nullableString,
  research: z
    .union([ResearchInputSchema, z.null(), z.undefined()])
    .transform((v) => v ?? null),
  // The deepDive is validated separately against the category-specific arm so we
  // can return a precise per-arm error; here we only accept any object or null.
  deepDive: z
    .union([z.record(z.string(), z.unknown()), z.null(), z.undefined()])
    .transform((v) => (v && typeof v === "object" ? v : null)),
});

type ParsedActivity = z.infer<typeof ActivityInputSchema>;

/** Create a new activity (plus optional ResearchDetail / deepDive). */
export async function createActivity(
  input: ActivityInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = ActivityInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const researchError = validateResearch(parsed.data);
  if (researchError) return { ok: false, error: researchError };

  const deepDive = resolveDeepDive(parsed.data);
  if (!deepDive.ok) return { ok: false, error: deepDive.error };

  try {
    const student = await getOrCreateLocalStudent();
    const programKey = await deriveProgramKey(parsed.data, deepDive.value);
    const created = await prisma.activity.create({
      data: {
        studentId: student.id,
        ...activityColumns(parsed.data, programKey, deepDive.value),
        ...(isResearchWithBlock(parsed.data)
          ? { research: { create: researchColumns(parsed.data.research!) } }
          : {}),
      },
    });
    revalidatePaths();
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    return { ok: false, error: `Could not create activity: ${message(err)}` };
  }
}

/** Update an existing activity, syncing its ResearchDetail / deepDive to the
 *  new category. */
export async function updateActivity(
  id: string,
  input: ActivityInput,
): Promise<ActionResult> {
  const parsed = ActivityInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const researchError = validateResearch(parsed.data);
  if (researchError) return { ok: false, error: researchError };

  const deepDive = resolveDeepDive(parsed.data);
  if (!deepDive.ok) return { ok: false, error: deepDive.error };

  try {
    const existing = await prisma.activity.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Activity not found." };

    const programKey = await deriveProgramKey(parsed.data, deepDive.value);

    await prisma.activity.update({
      where: { id },
      data: activityColumns(parsed.data, programKey, deepDive.value),
    });

    if (isResearchWithBlock(parsed.data)) {
      const cols = researchColumns(parsed.data.research!);
      await prisma.researchDetail.upsert({
        where: { activityId: id },
        create: { activityId: id, ...cols },
        update: cols,
      });
    } else {
      // No longer a research activity (or no block provided): drop any detail.
      await prisma.researchDetail.deleteMany({ where: { activityId: id } });
    }

    revalidatePaths();
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: `Could not update activity: ${message(err)}` };
  }
}

/** Delete an activity (cascades to its ResearchDetail and ActivityScore). */
export async function deleteActivity(id: string): Promise<ActionResult> {
  try {
    await prisma.activity.delete({ where: { id } });
    revalidatePaths();
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: `Could not delete activity: ${message(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** True when this is a research-category activity AND a research block was sent. */
function isResearchWithBlock(data: ParsedActivity): boolean {
  return (
    RESEARCH_CATEGORIES.includes(data.category) && data.research !== null
  );
}

/**
 * §5.2: a research/internship activity that carries a research block must have a
 * non-empty narrative and a real authorship (not NONE). This blocks "I did
 * research" claims with no honest account of who did the work.
 */
function validateResearch(data: ParsedActivity): string | null {
  if (!isResearchWithBlock(data)) return null;
  const research = data.research!;
  if (research.narrative === null) {
    return "Research activities require a narrative describing who did the work.";
  }
  if (research.authorship === "NONE") {
    return "Research activities require an authorship role.";
  }
  return null;
}

type DeepDiveResolution =
  | { ok: true; value: DeepDive | null }
  | { ok: false; error: string };

/**
 * §5: resolve and validate the deepDive against the arm for this category.
 * RESEARCH uses ResearchDetail, so any deepDive sent on a research activity is
 * ignored (value: null). For entrepreneurship/competition/generic categories a
 * non-null deepDive must parse against its arm, and its discriminant `kind` must
 * match the category — otherwise we reject rather than store an invalid blob.
 */
function resolveDeepDive(data: ParsedActivity): DeepDiveResolution {
  const kind = deepDiveKindForCategory(data.category);
  if (kind === null) {
    // Research arm: never persist a deepDive (ResearchDetail owns this slot).
    return { ok: true, value: null };
  }
  if (data.deepDive === null) {
    // Optional: a non-research activity may have no deep dive yet.
    return { ok: true, value: null };
  }

  const raw = data.deepDive as Record<string, unknown>;
  // Force the discriminant to the category's kind so a mismatched/blank `kind`
  // can't route to the wrong arm; if the caller sent a conflicting kind, reject.
  if (typeof raw.kind === "string" && raw.kind.length > 0 && raw.kind !== kind) {
    return {
      ok: false,
      error: `Deep dive type "${raw.kind}" does not match this category (expected "${kind}").`,
    };
  }

  const parsed = DeepDiveSchema.safeParse({ ...raw, kind });
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  return { ok: true, value: parsed.data };
}

/**
 * Derive a normalized, API-free programKey for Axis-A enrichment. For a
 * COMPETITION we prefer the competition name from the deep dive (or an explicit
 * programName); otherwise we use the explicit programName, then the title. The
 * rules-first normalizer (allowModel:false) never touches the network on save.
 */
async function deriveProgramKey(
  data: ParsedActivity,
  deepDive: DeepDive | null,
): Promise<string | null> {
  let source: string | null = data.programName;

  if (source === null && deepDive !== null && deepDive.kind === "competition") {
    const name = deepDive.competitionName.trim();
    source = name.length > 0 ? name : null;
  }
  if (source === null) {
    const title = data.title.trim();
    source = title.length > 0 ? title : null;
  }
  if (source === null) return null;

  const normalized = await normalizeProgram(source, { allowModel: false });
  return normalized.programKey;
}

function activityColumns(
  data: ParsedActivity,
  programKey: string | null,
  deepDive: DeepDive | null,
) {
  return {
    title: data.title,
    category: data.category,
    role: data.role,
    description: data.description,
    startDate: toDate(data.startDate),
    endDate: toDate(data.endDate),
    hoursPerWeek: data.hoursPerWeek,
    weeksPerYear: data.weeksPerYear,
    evidenceUrl: data.evidenceUrl,
    spikeTheme: data.spikeTheme,
    programKey,
    // Persist deepDive as a JSON string, or clear it when none applies (e.g. the
    // category changed to research).
    deepDive: deepDive === null ? null : JSON.stringify(deepDive),
  };
}

function researchColumns(research: NonNullable<ParsedActivity["research"]>) {
  return {
    outputType: research.outputType,
    authorship: research.authorship,
    contribution: serializeArray(research.contribution),
    venue: research.venue,
    independence: research.independence,
    narrative: research.narrative,
  };
}

/** Parse a date-ish string to a Date, or null when blank/invalid. */
function toDate(raw: string | null): Date | null {
  if (raw === null) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function revalidatePaths(): void {
  revalidatePath("/activities");
  revalidatePath("/");
  revalidatePath("/resume");
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid activity input.";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
