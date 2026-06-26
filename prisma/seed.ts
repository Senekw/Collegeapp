/**
 * Spike Engine — database seed (§8: NEVER FABRICATE).
 *
 * Run with: npm run db:seed  (tsx prisma/seed.ts)
 *
 * Honesty contract for this file:
 * - We seed exactly ONE clean-slate Student (userId = LOCAL_USER_ID) with
 *   mostly-null fields. We do NOT invent the user's grades/scores/activities.
 * - Schools and Opportunities are REAL, well-known programs. Every row carries a
 *   real official sourceUrl.
 * - Numeric facts (admitRate, GPA/SAT mid-50%, deadlineMonth) are populated ONLY
 *   when verified against an official source at seed-authoring time. When a value
 *   could not be confirmed, it is stored as null and (for Opportunity)
 *   verified=false with deadlineNote = "see official site". A sparse honest
 *   dataset is correct; a full fabricated one is a bug.
 *
 * VERIFICATION NOTES (what was confirmed vs left null):
 *   Schools — admitRate + SAT mid-50% verified via the U.S. Dept. of Education
 *   NCES College Navigator (federal IPEDS data, Fall 2024). SAT mid-50% total is
 *   the sum of the EBRW and Math section 25th/75th percentiles. UC Berkeley is
 *   test-blind for the UC system, so its SAT mid-50% is intentionally null.
 *   GPA mid-50% is left null for all schools (not reliably published per IPEDS).
 *
 *   Opportunities — deadlineMonth verified for: Coca-Cola Scholars (Sept),
 *   QuestBridge NCM (Oct), Regeneron STS (Nov). All other programs have
 *   deadlineMonth = null / verified = false pending confirmation on their
 *   official sites.
 */

import { PrismaClient } from "@prisma/client";
import { serializeArray } from "@/lib/enums";
import { LOCAL_USER_ID } from "@/lib/constants";

const prisma = new PrismaClient();

// SAT section percentiles -> SAT total mid-50% (NCES reports per-section).
// 25th total = EBRW25 + Math25 ; 75th total = EBRW75 + Math75.

interface SchoolSeed {
  name: string;
  admitRate: number | null;
  gpaMid50Low: number | null;
  gpaMid50High: number | null;
  satMid50Low: number | null;
  satMid50High: number | null;
  type: string | null;
  size: number | null;
  strongMajors: string[];
  sourceUrl: string;
}

const SCHOOLS: SchoolSeed[] = [
  {
    name: "Massachusetts Institute of Technology",
    admitRate: 0.05,
    gpaMid50Low: null,
    gpaMid50High: null,
    satMid50Low: 1520, // 740 + 780
    satMid50High: 1580, // 780 + 800
    type: "private",
    size: 4535,
    strongMajors: ["Computer Science", "Engineering", "Mathematics", "Physics"],
    sourceUrl: "https://nces.ed.gov/collegenavigator/?id=166683",
  },
  {
    name: "Stanford University",
    admitRate: 0.04,
    gpaMid50Low: null,
    gpaMid50High: null,
    satMid50Low: 1510, // 740 + 770
    satMid50High: 1580, // 780 + 800
    type: "private",
    size: 7904,
    strongMajors: ["Computer Science", "Engineering", "Biology", "Economics"],
    sourceUrl: "https://nces.ed.gov/collegenavigator/?id=243744",
  },
  {
    name: "University of California, Berkeley",
    admitRate: 0.11,
    gpaMid50Low: null,
    gpaMid50High: null,
    // UC system is test-blind; SAT not considered. Intentionally null.
    satMid50Low: null,
    satMid50High: null,
    type: "public",
    size: 33070,
    strongMajors: ["Computer Science", "Engineering", "Business", "Economics"],
    sourceUrl: "https://nces.ed.gov/collegenavigator/?id=110635",
  },
  {
    name: "Georgia Institute of Technology",
    admitRate: 0.14,
    gpaMid50Low: null,
    gpaMid50High: null,
    satMid50Low: 1370, // 680 + 690
    satMid50High: 1540, // 750 + 790
    type: "public",
    size: 20591,
    strongMajors: ["Computer Science", "Engineering", "Cybersecurity", "Industrial Engineering"],
    sourceUrl: "https://nces.ed.gov/collegenavigator/?id=139755",
  },
  {
    name: "University of Michigan, Ann Arbor",
    admitRate: 0.16,
    gpaMid50Low: null,
    gpaMid50High: null,
    satMid50Low: 1360, // 680 + 680
    satMid50High: 1530, // 750 + 780
    type: "public",
    size: 34454,
    strongMajors: ["Engineering", "Business", "Computer Science", "Public Policy"],
    sourceUrl: "https://nces.ed.gov/collegenavigator/?id=170976",
  },
  {
    name: "University of North Carolina at Chapel Hill",
    admitRate: 0.15,
    gpaMid50Low: null,
    gpaMid50High: null,
    satMid50Low: 1390, // 690 + 700
    satMid50High: 1530, // 750 + 780
    type: "public",
    size: 20885,
    strongMajors: ["Biology", "Business", "Public Health", "Computer Science"],
    sourceUrl: "https://nces.ed.gov/collegenavigator/?id=199120",
  },
  {
    name: "Northeastern University",
    admitRate: 0.05,
    gpaMid50Low: null,
    gpaMid50High: null,
    satMid50Low: 1440, // 710 + 730
    satMid50High: 1540, // 760 + 780
    type: "private",
    size: 17432,
    strongMajors: ["Computer Science", "Engineering", "Business", "Health Sciences"],
    sourceUrl: "https://nces.ed.gov/collegenavigator/?id=167358",
  },
  {
    name: "Williams College",
    admitRate: 0.08,
    gpaMid50Low: null,
    gpaMid50High: null,
    satMid50Low: 1490, // 740 + 750
    satMid50High: 1570, // 780 + 790
    type: "LAC",
    size: 2115,
    strongMajors: ["Economics", "Mathematics", "Political Science", "English"],
    sourceUrl: "https://nces.ed.gov/collegenavigator/?id=168342",
  },
];

interface OpportunitySeed {
  name: string;
  type: string; // OppType enum value
  description: string | null;
  gradeEligibility: number[];
  deadlineMonth: number | null;
  deadlineNote: string | null;
  selectivityNote: string | null;
  sourceUrl: string;
  verified: boolean;
}

const OPPORTUNITIES: OpportunitySeed[] = [
  {
    name: "Research Science Institute (RSI)",
    type: "RESEARCH",
    description:
      "Cost-free six-week summer STEM research program run by the Center for Excellence in Education and held at MIT, the summer before senior year.",
    gradeEligibility: [11],
    deadlineMonth: null,
    deadlineNote: "see official site",
    selectivityNote: "Extremely selective; ~100 students selected from 4,000+ applicants.",
    sourceUrl: "https://www.cee.org/programs/research-science-institute",
    verified: false,
  },
  {
    name: "MIT MITES Summer",
    type: "SUMMER_PROGRAM",
    description:
      "Free, rigorous six-week residential STEM enrichment program at MIT for rising high school seniors, emphasizing students from underrepresented and underserved backgrounds.",
    gradeEligibility: [11],
    deadlineMonth: null,
    deadlineNote: "see official site",
    selectivityNote: "Highly selective.",
    sourceUrl: "https://mites.mit.edu/discover-mites/mites-summer/",
    verified: false,
  },
  {
    name: "Clark Scholars Program",
    type: "RESEARCH",
    description:
      "Intensive seven-week summer research program at Texas Tech University offering hands-on research across disciplines with a stipend.",
    gradeEligibility: [11, 12],
    deadlineMonth: null,
    deadlineNote: "see official site",
    selectivityNote: "Only 12 scholars selected nationally each summer.",
    sourceUrl: "https://www.depts.ttu.edu/honors/academicsandenrichment/affiliatedandhighschool/clarks/",
    verified: false,
  },
  {
    name: "Simons Summer Research Program (Garcia note)",
    type: "RESEARCH",
    description:
      "Stony Brook University summer research mentorship for rising seniors to conduct hands-on, faculty-mentored STEM research. (The Garcia Program at Stony Brook is a related polymer-research track.)",
    gradeEligibility: [11],
    deadlineMonth: null,
    deadlineNote: "see official site",
    selectivityNote: "Selective; rising seniors only.",
    sourceUrl: "https://www.stonybrook.edu/simons/",
    verified: false,
  },
  {
    name: "Summer Science Program (SSP)",
    type: "SUMMER_PROGRAM",
    description:
      "Residential summer program where students complete a real research project in astrophysics, biochemistry, genomics, or synthetic chemistry.",
    gradeEligibility: [10, 11],
    deadlineMonth: null,
    deadlineNote: "see official site",
    selectivityNote: "Selective; primarily rising seniors.",
    sourceUrl: "https://ssp.org/",
    verified: false,
  },
  {
    name: "Regeneron Science Talent Search",
    type: "COMPETITION",
    description:
      "The nation's oldest and most prestigious science and mathematics competition for high school seniors, based on original independent research.",
    gradeEligibility: [12],
    deadlineMonth: 11, // verified: entry deadline in November
    deadlineNote: "Entry deadline in early November.",
    selectivityNote: "~300 scholars and 40 finalists chosen from ~2,000 entrants.",
    sourceUrl: "https://www.societyforscience.org/regeneron-sts/",
    verified: true,
  },
  {
    name: "Coca-Cola Scholars Program",
    type: "SCHOLARSHIP",
    description:
      "Achievement-based scholarship awarding $20,000 to graduating high school seniors who demonstrate leadership, service, and academic excellence.",
    gradeEligibility: [12],
    deadlineMonth: 9, // verified: application closes end of September
    deadlineNote: "Application closes at the end of September.",
    selectivityNote: "~150 scholars from tens of thousands of applicants.",
    sourceUrl: "https://www.coca-colascholarsfoundation.org/apply/",
    verified: true,
  },
  {
    name: "QuestBridge National College Match",
    type: "SCHOLARSHIP",
    description:
      "Program connecting high-achieving, low-income high school seniors with full four-year scholarships to partner colleges.",
    gradeEligibility: [12],
    deadlineMonth: 10, // verified: application deadline October 1
    deadlineNote: "National College Match application deadline in early October.",
    selectivityNote: "Highly selective; targets high-achieving, low-income students.",
    sourceUrl:
      "https://www.questbridge.org/high-school-students/national-college-match",
    verified: true,
  },
  {
    name: "Telluride Association Summer Seminar (TASS)",
    type: "SUMMER_PROGRAM",
    description:
      "Free, transformative summer humanities seminar (formerly TASP) emphasizing critical thinking, discussion, and writing in a college-style setting.",
    gradeEligibility: [10, 11],
    deadlineMonth: null,
    deadlineNote: "see official site",
    selectivityNote: "Highly selective; free of charge.",
    sourceUrl: "https://www.tellurideassociation.org/our-programs/high-school-students/",
    verified: false,
  },
  {
    name: "USA Computing Olympiad (USACO)",
    type: "COMPETITION",
    description:
      "Free online competitive-programming contest series (Bronze through Platinum divisions) that selects the U.S. team for the International Olympiad in Informatics.",
    gradeEligibility: [9, 10, 11, 12],
    deadlineMonth: null,
    deadlineNote: "Multiple contest windows during the school year; see official site.",
    selectivityNote: "Open entry; top performers promote toward the IOI team.",
    sourceUrl: "https://usaco.org/",
    verified: false,
  },
];

async function main(): Promise<void> {
  // --- Idempotency: clear seedable tables. Student is cleared by userId so we
  //     never duplicate the single local profile. School/Opportunity are wiped
  //     and recreated so re-running converges to exactly this dataset. ---
  await prisma.opportunity.deleteMany({});
  await prisma.school.deleteMany({});
  await prisma.student.deleteMany({ where: { userId: LOCAL_USER_ID } });

  // --- ONE clean-slate Student. Mostly null: we do NOT invent the user. ---
  await prisma.student.create({
    data: {
      userId: LOCAL_USER_ID,
      name: null,
      // Neutral starting defaults (NOT accomplishment stats) so the opportunity
      // tracker has a grade to filter by on first preview. The user changes
      // these on the Profile page; every stat below stays null.
      gradeLevel: 11,
      gradYear: 2027,
      gpaUnweighted: null,
      gpaWeighted: null,
      rigor: null,
      satTotal: null,
      actComposite: null,
      intendedMajor: null,
      state: null,
      contextNotes: null,
    },
  });

  // --- Schools ---
  for (const s of SCHOOLS) {
    await prisma.school.create({
      data: {
        name: s.name,
        admitRate: s.admitRate,
        gpaMid50Low: s.gpaMid50Low,
        gpaMid50High: s.gpaMid50High,
        satMid50Low: s.satMid50Low,
        satMid50High: s.satMid50High,
        type: s.type,
        size: s.size,
        strongMajors: serializeArray(s.strongMajors),
        sourceUrl: s.sourceUrl,
      },
    });
  }

  // --- Opportunities ---
  for (const o of OPPORTUNITIES) {
    await prisma.opportunity.create({
      data: {
        name: o.name,
        type: o.type,
        description: o.description,
        gradeEligibility: serializeArray(o.gradeEligibility),
        deadlineMonth: o.deadlineMonth,
        deadlineNote: o.deadlineNote,
        selectivityNote: o.selectivityNote,
        sourceUrl: o.sourceUrl,
        verified: o.verified,
      },
    });
  }

  const [students, schools, opportunities, verifiedOpps] = await Promise.all([
    prisma.student.count({ where: { userId: LOCAL_USER_ID } }),
    prisma.school.count(),
    prisma.opportunity.count(),
    prisma.opportunity.count({ where: { verified: true } }),
  ]);

  console.log(
    `Seed complete: ${students} student, ${schools} schools, ${opportunities} opportunities ` +
      `(${verifiedOpps} with a verified deadline).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
