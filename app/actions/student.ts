"use server";

// Student profile server action. Validates input, coerces blank/NaN numeric
// fields to null (the DB stores "not provided" as null, never as 0), upserts the
// single local student, and revalidates every page that reads the profile.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getOrCreateLocalStudent } from "@/lib/data";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/types";

/** Raw input from the profile form. Numeric fields may arrive as "" or NaN. */
export interface StudentInput {
  name?: string | null;
  gradeLevel?: number | null;
  gradYear?: number | null;
  gpaUnweighted?: number | null;
  gpaWeighted?: number | null;
  rigor?: string | null;
  satTotal?: number | null;
  actComposite?: number | null;
  intendedMajor?: string | null;
  state?: string | null;
  contextNotes?: string | null;
}

/** Coerce "", whitespace, NaN, and undefined to null; otherwise pass through. */
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

const StudentInputSchema = z.object({
  name: nullableString,
  gradeLevel: nullableNumber.pipe(
    z.number().int().min(9).max(12).nullable(),
  ),
  gradYear: nullableNumber.pipe(
    z.number().int().min(2000).max(2100).nullable(),
  ),
  gpaUnweighted: nullableNumber.pipe(z.number().min(0).max(5).nullable()),
  gpaWeighted: nullableNumber.pipe(z.number().min(0).max(6).nullable()),
  rigor: nullableString,
  satTotal: nullableNumber.pipe(z.number().int().min(400).max(1600).nullable()),
  actComposite: nullableNumber.pipe(z.number().int().min(1).max(36).nullable()),
  intendedMajor: nullableString,
  state: nullableString,
  contextNotes: nullableString,
});

/** Upsert the local student profile. */
export async function upsertStudent(input: StudentInput): Promise<ActionResult> {
  const parsed = StudentInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  try {
    const student = await getOrCreateLocalStudent();
    await prisma.student.update({
      where: { id: student.id },
      data: parsed.data,
    });
  } catch (err) {
    return { ok: false, error: `Could not save profile: ${message(err)}` };
  }

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/schools");
  revalidatePath("/resume");
  return { ok: true, data: undefined };
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid profile input.";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
