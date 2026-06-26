// POST /api/score — thin wrapper over the scoring service. Same code path as the
// scoreActivityAction server action; exposed as an endpoint for programmatic use.

import { NextResponse } from "next/server";

import { GeminiConfigError, GeminiError } from "@/lib/gemini/client";
import { scoreActivity } from "@/lib/services/scoring";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const activityId =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).activityId
      : undefined;
  const force =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).force === true
      : false;

  if (typeof activityId !== "string" || activityId.length === 0) {
    return NextResponse.json(
      { ok: false, error: "activityId is required." },
      { status: 400 },
    );
  }

  try {
    const { result, fromCache } = await scoreActivity(activityId, { force });
    return NextResponse.json({ ok: true, data: result, fromCache });
  } catch (err) {
    const status = err instanceof GeminiConfigError ? 503 : err instanceof GeminiError ? 502 : 500;
    return NextResponse.json({ ok: false, error: message(err) }, { status });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Scoring failed.";
}
