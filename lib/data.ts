// Data mappers + local-student bootstrap (server-only).
//
// This module is the single place that turns Prisma rows into the plain domain
// shapes the pure logic modules (realism / match / aggregate) consume. It
// imports the Prisma client, so it must only ever be imported by server code.

import { LOCAL_USER_ID } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { parseStringArray } from "@/lib/enums";
import type {
  ActivityForAggregate,
  SchoolData,
  StudentMetrics,
  SynthesisData,
} from "@/lib/types";
import type {
  Activity,
  ActivityScore,
  ProfileSynthesis,
  School,
  Student,
} from "@prisma/client";

/**
 * Fetch the single local student, creating a clean-slate row if none exists.
 * v1 is single-user; every row is scoped to LOCAL_USER_ID.
 */
export async function getOrCreateLocalStudent(): Promise<Student> {
  const existing = await prisma.student.findFirst({
    where: { userId: LOCAL_USER_ID },
  });
  if (existing) return existing;
  return prisma.student.create({ data: { userId: LOCAL_USER_ID } });
}

/** Map a Student row to the StudentMetrics shape the pure logic consumes. */
export function toStudentMetrics(s: Student): StudentMetrics {
  return {
    gpaUnweighted: s.gpaUnweighted,
    gpaWeighted: s.gpaWeighted,
    satTotal: s.satTotal,
    actComposite: s.actComposite,
    intendedMajor: s.intendedMajor,
    state: s.state,
    gradeLevel: s.gradeLevel,
    gradYear: s.gradYear,
  };
}

/** Map a School row to SchoolData (strongMajors parsed from its JSON column). */
export function toSchoolData(s: School): SchoolData {
  return {
    id: s.id,
    name: s.name,
    admitRate: s.admitRate,
    gpaMid50Low: s.gpaMid50Low,
    gpaMid50High: s.gpaMid50High,
    satMid50Low: s.satMid50Low,
    satMid50High: s.satMid50High,
    type: s.type,
    size: s.size,
    strongMajors: parseStringArray(s.strongMajors),
    sourceUrl: s.sourceUrl,
  };
}

/**
 * Map a ProfileSynthesis row to SynthesisData, or null when no synthesis
 * exists yet. secondaryThemes is parsed from its JSON column.
 */
export function toSynthesisData(p: ProfileSynthesis | null): SynthesisData | null {
  if (p === null) return null;
  return {
    primarySpike: p.primarySpike,
    spikeStrength: p.spikeStrength,
    academicStrength: p.academicStrength,
    secondaryThemes: parseStringArray(p.secondaryThemes),
  };
}

/**
 * Map an Activity (with its optional score relation) to the minimal shape the
 * aggregator needs. An unscored activity carries score: null.
 */
export function toActivityForAggregate(
  a: Activity & { score: ActivityScore | null },
): ActivityForAggregate {
  return {
    id: a.id,
    title: a.title,
    category: a.category,
    spikeTheme: a.spikeTheme,
    score:
      a.score === null
        ? null
        : {
            tier: a.score.tier,
            impact: a.score.impact,
            originality: a.score.originality,
            initiative: a.score.initiative,
            depth: a.score.depth,
            selectivity: a.score.selectivity,
            spikeAlignment: a.score.spikeAlignment,
            creditMultiplier: a.score.creditMultiplier,
            substantiated: a.score.substantiated,
          },
  };
}
