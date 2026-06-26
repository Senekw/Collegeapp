// POST /api/enrich-program — resolve Axis-A program enrichment on demand. Accepts
// either a direct { programKey } (with optional displayName/category) or an
// { activityId } to resolve the programKey/displayName/category from the row.
// Cache-first inside lib/enrich; force re-runs the §4 grounded retrieval.

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { GeminiConfigError, GeminiError } from "@/lib/gemini/client";
import { resolveProgramEnrichment } from "@/lib/enrich/retrieve";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const obj =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const force = obj.force === true;
  const activityId =
    typeof obj.activityId === "string" && obj.activityId.length > 0
      ? obj.activityId
      : null;
  const directKey =
    typeof obj.programKey === "string" && obj.programKey.length > 0
      ? obj.programKey
      : null;

  try {
    // Resolve the (programKey, displayName, category) tuple to enrich.
    let programKey = directKey;
    let displayName =
      typeof obj.displayName === "string" && obj.displayName.length > 0
        ? obj.displayName
        : programKey ?? "";
    let category =
      typeof obj.category === "string" && obj.category.length > 0
        ? obj.category
        : "OTHER";

    if (activityId) {
      const activity = await prisma.activity.findUnique({
        where: { id: activityId },
        select: { programKey: true, title: true, category: true },
      });
      if (!activity) {
        return NextResponse.json(
          { ok: false, error: "Activity not found." },
          { status: 404 },
        );
      }
      if (!activity.programKey) {
        return NextResponse.json(
          { ok: false, error: "Activity is not linked to a named program." },
          { status: 400 },
        );
      }
      programKey = activity.programKey;
      displayName = activity.title;
      category = activity.category;
    }

    if (!programKey) {
      return NextResponse.json(
        { ok: false, error: "programKey or activityId is required." },
        { status: 400 },
      );
    }

    const enriched = await resolveProgramEnrichment({
      programKey,
      displayName: displayName.length > 0 ? displayName : programKey,
      category,
      force,
    });
    if (!enriched) {
      return NextResponse.json(
        { ok: false, error: "No program data could be resolved." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: enriched });
  } catch (err) {
    const status =
      err instanceof GeminiConfigError
        ? 503
        : err instanceof GeminiError
          ? 502
          : 500;
    return NextResponse.json({ ok: false, error: message(err) }, { status });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Enrichment failed.";
}
