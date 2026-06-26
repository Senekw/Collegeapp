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

// =========================================================================
// EXTENSION (§9, §10): anonymized AdmitArchetype calibration anchors.
//
// HONESTY CONTRACT for archetypes:
// - These are ANONYMIZED PATTERNS, never named private individuals (§1.6). No
//   row names, references, or otherwise identifies a specific minor or private
//   applicant. Each describes a *shape* of profile that recurs in the admissions
//   discourse.
// - These are CALIBRATION ANCHORS, not measured facts. They illustrate where a
//   tier "feels like" it sits on the spike scale. We do NOT fabricate precise
//   admit statistics: statBand uses honest ranges, exampleOutcomes is hedged
//   ("admitted to several sub-10% schools") and acknowledges survivorship bias,
//   and confidence is LOW or NONE — never HIGH. asOfYear is null because these
//   are timeless patterns, not a single documented cycle.
// - spikeSignature is a JSON.stringify of { peak, concentration, trajectory,
//   originality, note } where the four dimensions are 0..10 illustrative levels.
// - sources point to GENERAL, real, public references where the *pattern* (not a
//   person) is discussed, or null with confidence NONE. We never invent a URL.
// =========================================================================

interface SpikeSignatureSeed {
  peak: number; // 0..10 height of the single strongest achievement
  concentration: number; // 0..10 how focused the profile is on one theme
  trajectory: number; // 0..10 growth/escalation over time
  originality: number; // 0..10 how unusual/self-originated the work is
  note: string;
}

interface ArchetypeSeed {
  archetypeKey: string;
  label: string;
  description: string;
  statBand: string;
  spikeSignature: SpikeSignatureSeed;
  tier: string; // SpikeTier value (UPPERCASE)
  exampleOutcomes: string;
  sources: { url: string; publisher: string; note: string }[]; // may be empty
  confidence: string; // "LOW" | "NONE"
  asOfYear: number | null;
}

const ARCHETYPES: ArchetypeSeed[] = [
  {
    archetypeKey: "singular-mass-impact-founder",
    label: "Singular original mass-impact founder",
    description:
      "Student independently started a venture or initiative that grew to genuine, measurable scale and served thousands of people beyond their own school or town (pattern: a self-originated food-rescue / community-logistics nonprofit that redistributes surplus at real volume). The work is unmistakably theirs, escalates year over year, and is original rather than a chapter of an existing program.",
    statBand: "GPA 3.8-4.0 unweighted, test high-band (or test-optional)",
    spikeSignature: {
      peak: 10,
      concentration: 9,
      trajectory: 10,
      originality: 10,
      note: "Rare top-of-scale anchor: one self-originated venture at real-world scale, clearly student-driven.",
    },
    tier: "EXCEPTIONAL",
    exampleOutcomes:
      "Profiles of this shape are over-represented among admits to several sub-10% schools, but this is survivorship-biased anecdote, not a guaranteed outcome — most strong applicants to those schools are still denied.",
    sources: [],
    confidence: "NONE",
    asOfYear: null,
  },
  {
    archetypeKey: "deep-research-output-mid-stats",
    label: "Deep research-output spike with mid stats",
    description:
      "Student pursued one research line for multiple years and produced a real, externally validated output (a first-author or co-first-author publication in a recognized venue, or a top placement at a national research competition) while carrying academically solid-but-not-perfect grades and scores. The depth and the concrete output, not the GPA, carry the profile.",
    statBand: "GPA 3.7-3.9 unweighted, test mid-band",
    spikeSignature: {
      peak: 9,
      concentration: 9,
      trajectory: 8,
      originality: 8,
      note: "Depth-over-breadth anchor: an externally validated research output offsets non-perfect stats.",
    },
    tier: "EXCEPTIONAL",
    exampleOutcomes:
      "This shape appears among admits to highly selective STEM programs despite mid-band stats; treat as an illustrative pattern, not a promise — outcomes vary widely and many comparable applicants are denied.",
    sources: [
      {
        url: "https://www.societyforscience.org/regeneron-sts/",
        publisher: "Society for Science",
        note: "General reference for what a top national research-competition placement is (pattern, not a person).",
      },
    ],
    confidence: "LOW",
    asOfYear: null,
  },
  {
    archetypeKey: "national-competition-winner",
    label: "National-competition winner",
    description:
      "Student reached a national-level placement (finalist or medalist) in a recognized, broadly competitive academic olympiad or competition. The achievement is externally verifiable and nationally benchmarked, but the profile is built around the competition rather than an original self-directed body of work.",
    statBand: "GPA 3.8-4.0 unweighted, test high-band",
    spikeSignature: {
      peak: 9,
      concentration: 8,
      trajectory: 7,
      originality: 6,
      note: "Externally benchmarked national achievement; less self-originated than the founder/research anchors.",
    },
    tier: "NATIONAL",
    exampleOutcomes:
      "National-competition winners are well represented among admits to selective schools, but admission is never guaranteed by a single award — acknowledge survivorship bias.",
    sources: [
      {
        url: "https://usaco.org/",
        publisher: "USA Computing Olympiad",
        note: "Example of a national competition structure (pattern reference, not a named winner).",
      },
    ],
    confidence: "LOW",
    asOfYear: null,
  },
  {
    archetypeKey: "regional-narrow-spike",
    label: "Strong-but-narrow regional spike",
    description:
      "Student is clearly committed to one theme and has earned real recognition at the regional or state level (a regional award, a state placement, a local leadership role with documented impact), but has not yet broken through to national-level validation. Focused and credible, with a ceiling that is regional rather than national so far.",
    statBand: "GPA 3.7-3.9 unweighted, test mid-to-high band",
    spikeSignature: {
      peak: 7,
      concentration: 8,
      trajectory: 6,
      originality: 6,
      note: "Genuine focus and regional recognition; not yet nationally benchmarked.",
    },
    tier: "STRONG",
    exampleOutcomes:
      "Profiles of this shape are competitive at many selective schools but are mid-pack at the most selective; outcomes depend heavily on the rest of the application.",
    sources: [],
    confidence: "NONE",
    asOfYear: null,
  },
  {
    archetypeKey: "well-rounded-broad-flat",
    label: "Broad-but-flat well-rounded profile",
    description:
      "Student is involved in many activities and holds several leadership titles, but no single thread reaches standout depth or external validation. Strong all-around and reliable, with breadth substituting for a defined spike. Common, capable, and hard to distinguish at the very top of the selectivity range.",
    statBand: "GPA 3.8-4.0 unweighted, test high-band",
    spikeSignature: {
      peak: 5,
      concentration: 3,
      trajectory: 5,
      originality: 4,
      note: "Breadth without a peak: many activities, no single dominant, externally validated thread.",
    },
    tier: "SOLID",
    exampleOutcomes:
      "Broad well-rounded profiles see strong outcomes at selective-but-not-elite schools and variable outcomes at sub-10% schools, where a defined spike is typically what differentiates admits.",
    sources: [],
    confidence: "NONE",
    asOfYear: null,
  },
  {
    archetypeKey: "emerging-early-grade",
    label: "Emerging early-grade profile",
    description:
      "Younger student (9th-10th grade) showing early signal in one direction — a promising start on a project, an early competition entry, a self-initiated effort — but without the time-in-grade to have produced validated output yet. Trajectory is the story; the ceiling is still open.",
    statBand: "GPA 3.7-4.0 unweighted, test not-yet-taken or early-band",
    spikeSignature: {
      peak: 4,
      concentration: 6,
      trajectory: 7,
      originality: 6,
      note: "Early but directional: limited output so far, with room and time to escalate.",
    },
    tier: "EMERGING",
    exampleOutcomes:
      "Too early to map to admit outcomes; this anchor exists to place a promising-but-young profile on the scale, not to predict results.",
    sources: [],
    confidence: "NONE",
    asOfYear: null,
  },
];

async function main(): Promise<void> {
  // --- Idempotency: clear seedable tables. Student is cleared by userId so we
  //     never duplicate the single local profile. School/Opportunity are wiped
  //     and recreated so re-running converges to exactly this dataset. ---
  await prisma.opportunity.deleteMany({});
  await prisma.school.deleteMany({});
  await prisma.admitArchetype.deleteMany({});
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

  // --- AdmitArchetype calibration anchors (anonymized PATTERNS only) ---
  for (const a of ARCHETYPES) {
    await prisma.admitArchetype.create({
      data: {
        archetypeKey: a.archetypeKey,
        label: a.label,
        description: a.description,
        statBand: a.statBand,
        spikeSignature: JSON.stringify(a.spikeSignature),
        tier: a.tier,
        exampleOutcomes: a.exampleOutcomes,
        sources: JSON.stringify(a.sources),
        confidence: a.confidence,
        asOfYear: a.asOfYear,
      },
    });
  }

  const [students, schools, opportunities, verifiedOpps, archetypes] = await Promise.all([
    prisma.student.count({ where: { userId: LOCAL_USER_ID } }),
    prisma.school.count(),
    prisma.opportunity.count(),
    prisma.opportunity.count({ where: { verified: true } }),
    prisma.admitArchetype.count(),
  ]);

  console.log(
    `Seed complete: ${students} student, ${schools} schools, ${opportunities} opportunities ` +
      `(${verifiedOpps} with a verified deadline), ${archetypes} admit archetypes.`,
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
