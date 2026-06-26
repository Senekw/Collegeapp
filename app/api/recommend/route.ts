// POST /api/recommend — thin wrapper over the recommendation service for the
// local student. Pure ranking, no LLM. Same code path as recommendAction.

import { NextResponse } from "next/server";

import { getOrCreateLocalStudent } from "@/lib/data";
import { recommendSchools } from "@/lib/services/recommend";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    const student = await getOrCreateLocalStudent();
    const matches = await recommendSchools(student.id);
    return NextResponse.json({ ok: true, data: matches });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Recommendation failed." },
      { status: 500 },
    );
  }
}
