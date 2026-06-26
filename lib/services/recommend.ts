// School recommendation orchestration (server-only).
//
// Pure ranking, no LLM: load the student + schools + (optional) synthesis, map
// them to the plain domain shapes, and rank with lib/recommend/match.

import { prisma } from "@/lib/db";
import { rankSchools } from "@/lib/recommend/match";
import {
  toSchoolData,
  toStudentMetrics,
  toSynthesisData,
} from "@/lib/data";
import type { SchoolMatch } from "@/lib/types";

/** Top-5 "aspirational but plausible" school matches for the student. No LLM. */
export async function recommendSchools(studentId: string): Promise<SchoolMatch[]> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { synthesis: true },
  });
  if (!student) {
    throw new Error(`Student ${studentId} not found.`);
  }

  const schools = await prisma.school.findMany();

  return rankSchools(
    toStudentMetrics(student),
    schools.map(toSchoolData),
    toSynthesisData(student.synthesis),
    5,
  );
}
