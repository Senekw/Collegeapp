"use server";

// Activity CRUD server actions. Validates input with Zod, enforces the §5.2
// research rule (a research/internship activity with a research block must carry
// a real narrative + authorship), persists the optional ResearchDetail with its
// contribution array serialized, and removes the ResearchDetail when an activity
// is no longer research.

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
  serializeArray,
} from "@/lib/enums";
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
  research?: ResearchInput | null;
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
  research: z
    .union([ResearchInputSchema, z.null(), z.undefined()])
    .transform((v) => v ?? null),
});

type ParsedActivity = z.infer<typeof ActivityInputSchema>;

/** Create a new activity (plus optional ResearchDetail). */
export async function createActivity(
  input: ActivityInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = ActivityInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const researchError = validateResearch(parsed.data);
  if (researchError) return { ok: false, error: researchError };

  try {
    const student = await getOrCreateLocalStudent();
    const created = await prisma.activity.create({
      data: {
        studentId: student.id,
        ...activityColumns(parsed.data),
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

/** Update an existing activity, syncing its ResearchDetail to the new category. */
export async function updateActivity(
  id: string,
  input: ActivityInput,
): Promise<ActionResult> {
  const parsed = ActivityInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const researchError = validateResearch(parsed.data);
  if (researchError) return { ok: false, error: researchError };

  try {
    const existing = await prisma.activity.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Activity not found." };

    await prisma.activity.update({
      where: { id },
      data: activityColumns(parsed.data),
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

function activityColumns(data: ParsedActivity) {
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
