// School recommendation orchestration (server-only).
//
// Pure ranking, no LLM: load the student + schools + (optional) synthesis +
// (optional) spike assessment + per-school admitted-class distributions, map
// them to the plain domain shapes, and rank with lib/recommend/match.

import { prisma } from "@/lib/db";
import { rankSchools } from "@/lib/recommend/match";
import {
  toAdmitDistributionData,
  toSchoolData,
  toSpikeAssessmentData,
  toStudentMetrics,
  toSynthesisData,
} from "@/lib/data";
import type { AdmitDistributionData, SchoolMatch } from "@/lib/types";

/**
 * Top-5 "aspirational but plausible" school matches for the student. No LLM.
 *
 * Realism is now distribution- and spike-aware: we load the student's spike
 * assessment (may be null) and every school's admitted-class stat distributions,
 * then hand them to the pure `rankSchools`.
 */
export async function recommendSchools(studentId: string): Promise<SchoolMatch[]> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { synthesis: true, spikeAssessment: true },
  });
  if (!student) {
    throw new Error(`Student ${studentId} not found.`);
  }

  const schools = await prisma.school.findMany();

  // Per-school admitted-class distributions, keyed by school id.
  const distributionRows = await prisma.admitDistribution.findMany({
    where: { schoolId: { in: schools.map((s) => s.id) } },
  });

  const distributionsBySchoolId: Record<string, AdmitDistributionData[]> = {};
  for (const row of distributionRows) {
    const list = distributionsBySchoolId[row.schoolId] ?? [];
    list.push(toAdmitDistributionData(row));
    distributionsBySchoolId[row.schoolId] = list;
  }

  return rankSchools(
    toStudentMetrics(student),
    schools.map(toSchoolData),
    toSynthesisData(student.synthesis),
    toSpikeAssessmentData(student.spikeAssessment),
    distributionsBySchoolId,
    5,
  );
}
