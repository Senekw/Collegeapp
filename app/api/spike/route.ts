// POST /api/spike — thin wrapper over the spike assessment service for the local
// student. Same code path as the computeSpikeAction server action.
//
// assessSpike falls back to a deterministic tier when the Gemini key is missing
// or calibration fails, so a 2xx is expected even without a key; we only map a
// genuine error to a non-2xx status.

import { NextResponse } from "next/server";

import { getOrCreateLocalStudent } from "@/lib/data";
import { GeminiConfigError, GeminiError } from "@/lib/gemini/client";
import { assessSpike } from "@/lib/spike/assess";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    const student = await getOrCreateLocalStudent();
    const data = await assessSpike(student.id);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const status =
      err instanceof GeminiConfigError ? 503 : err instanceof GeminiError ? 502 : 500;
    return NextResponse.json({ ok: false, error: message(err) }, { status });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Spike assessment failed.";
}
