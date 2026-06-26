// POST /api/synthesize — thin wrapper over the synthesis service for the local
// student. Same code path as the synthesizeAction server action.

import { NextResponse } from "next/server";

import { getOrCreateLocalStudent } from "@/lib/data";
import { GeminiConfigError, GeminiError } from "@/lib/gemini/client";
import { synthesizeProfile } from "@/lib/services/synthesis";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    const student = await getOrCreateLocalStudent();
    const result = await synthesizeProfile(student.id);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    const status = err instanceof GeminiConfigError ? 503 : err instanceof GeminiError ? 502 : 500;
    return NextResponse.json({ ok: false, error: message(err) }, { status });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Synthesis failed.";
}
