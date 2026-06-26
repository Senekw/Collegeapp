// Dashboard ("/") — the strategic at-a-glance view.
//
// Server Component. Reads the local student's synthesis (primary spike, gaps,
// time-gated feasible moves), the top recommended schools (base admit % +
// realism band), and the next grade-eligible opportunity deadlines. Strong
// empty states guide the path: profile -> activities -> score -> synthesize ->
// schools/opportunities. A "needs recompute" banner appears when the profile
// or its activities changed after the synthesis was last computed.

import Link from "next/link";
import { z } from "zod";

// Reads per-request DB state (and avoids touching the DB at build time, which
// keeps the build green where no migrated DB exists, e.g. Netlify).
export const dynamic = "force-dynamic";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreBar } from "@/components/ui/score-bar";
import { SpikePanel } from "@/components/dashboard/spike-panel";
import { getOrCreateLocalStudent, toSpikeAssessmentData } from "@/lib/data";
import { prisma } from "@/lib/db";
import { OPP_TYPE_LABELS, OppTypeSchema, parseIntArray, parseJson } from "@/lib/enums";
import { recommendSchools } from "@/lib/services/recommend";
import type { RealismBand, SchoolMatch } from "@/lib/types";

// feasibleMoves is a JSON column; parse it defensively at the boundary.
const FeasibleMoveSchema = z.object({
  move: z.string(),
  byGrade: z.number(),
  why: z.string(),
});
const FeasibleMovesSchema = z.array(FeasibleMoveSchema);

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Map a realism band to a Badge variant + label. Calmer = stronger chances. */
function realismBadge(band: RealismBand): {
  variant: "default" | "secondary" | "outline" | "destructive" | "warning" | "success";
  label: string;
} {
  switch (band) {
    case "Hard Reach":
      return { variant: "destructive", label: "Hard Reach" };
    case "Reach":
      return { variant: "warning", label: "Reach" };
    case "Target":
      return { variant: "default", label: "Target" };
    case "Likely":
      return { variant: "success", label: "Likely" };
    case "Safety":
      return { variant: "success", label: "Safety" };
    default:
      return { variant: "outline", label: "Unknown" };
  }
}

/** Format a base admit rate (0..1) as a whole-number %. Never per-student. */
function formatAdmitRate(rate: number | null): string {
  if (rate === null) return "Admit rate unknown";
  return `${Math.round(rate * 100)}% admit rate`;
}

const ACADEMIC_FIT_LABEL: Record<string, string> = {
  below: "Academics below mid-50%",
  within: "Academics within mid-50%",
  above: "Academics above mid-50%",
  unknown: "Academic fit unknown",
};

export default async function DashboardPage() {
  const student = await getOrCreateLocalStudent();

  // Synthesis + activity timestamps drive the "needs recompute" indicator.
  // The spike assessment (1:1 with the student) powers the Spike Panel.
  const [synthesis, activityCount, latestActivity, spikeRow] = await Promise.all([
    prisma.profileSynthesis.findUnique({ where: { studentId: student.id } }),
    prisma.activity.count({ where: { studentId: student.id } }),
    prisma.activity.findFirst({
      where: { studentId: student.id },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.spikeAssessment.findUnique({ where: { studentId: student.id } }),
  ]);

  const spike = toSpikeAssessmentData(spikeRow);

  // Resolve the peak activities' titles (in peakActivityIds order) for display.
  let peakTitles: string[] = [];
  if (spike !== null && spike.peakActivityIds.length > 0) {
    const peakActivities = await prisma.activity.findMany({
      where: { id: { in: spike.peakActivityIds }, studentId: student.id },
      select: { id: true, title: true },
    });
    const titleById = new Map(peakActivities.map((a) => [a.id, a.title]));
    peakTitles = spike.peakActivityIds
      .map((id) => titleById.get(id))
      .filter((t): t is string => typeof t === "string");
  }

  // Recommendations + opportunities only matter once a synthesis exists, but
  // recommendSchools is pure/cheap so we run it whenever there's a synthesis.
  const schools: SchoolMatch[] = synthesis ? await recommendSchools(student.id) : [];

  // Next grade-eligible opportunities, soonest deadline month first.
  const currentGrade = student.gradeLevel;
  const allOpps = await prisma.opportunity.findMany();
  const eligibleOpps = allOpps
    .filter((o) => {
      if (currentGrade === null) return true;
      const grades = parseIntArray(o.gradeEligibility);
      return grades.length === 0 || grades.includes(currentGrade);
    })
    .sort((a, b) => {
      const am = a.deadlineMonth ?? 13;
      const bm = b.deadlineMonth ?? 13;
      return am - bm;
    })
    .slice(0, 5);

  const needsRecompute =
    synthesis !== null &&
    (student.updatedAt > synthesis.updatedAt ||
      (latestActivity !== null && latestActivity.updatedAt > synthesis.updatedAt));

  const feasibleMoves = synthesis
    ? parseJson(synthesis.feasibleMoves, FeasibleMovesSchema, [])
    : [];
  const gaps = synthesis
    ? parseJson(synthesis.gaps, z.array(z.string()), [])
    : [];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Your spike, your aim, and your next moves — at a glance.
        </p>
      </header>

      {needsRecompute ? (
        <Alert variant="warning">
          <AlertTitle>Your synthesis is out of date</AlertTitle>
          <AlertDescription>
            Your profile or activities changed after this analysis was last run.{" "}
            <Link href="/profile" className="font-medium underline underline-offset-2">
              Re-synthesize
            </Link>{" "}
            to refresh your spike, gaps, and recommendations.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* --- Spike Index panel (§7, §11) — decomposition always shown --- */}
      <section>
        <SpikePanel spike={spike} peakTitles={peakTitles} />
      </section>

      {/* --- Strategic payload: synthesis panel (§5.4) --- */}
      <section>
        {synthesis === null ? (
          <Card>
            <CardContent className="py-2">
              <EmptyState
                title="No profile analysis yet"
                description={
                  activityCount === 0
                    ? "Add your activities first, then run a synthesis to surface your spike, gaps, and next moves."
                    : "Run a synthesis to surface your spike, gaps, and time-gated next moves."
                }
                action={
                  <Link
                    href={activityCount === 0 ? "/activities" : "/profile"}
                    className="text-sm font-medium text-primary underline underline-offset-4"
                  >
                    {activityCount === 0 ? "Add activities" : "Run synthesis"}
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Your spike</CardTitle>
                  <Badge variant="secondary">
                    {synthesis.primarySpike || "Undefined spike"}
                  </Badge>
                </div>
                <CardDescription>{synthesis.overallNarrative}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScoreBar label="Spike strength" value={synthesis.spikeStrength} />
                <ScoreBar label="Academic strength" value={synthesis.academicStrength} />
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Gaps — prominent. */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">What&apos;s missing</CardTitle>
                  <CardDescription>
                    Close these to strengthen your spike.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {gaps.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No gaps flagged — keep building depth.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {gaps.map((gap, i) => (
                        <li
                          key={`gap-${i}`}
                          className="flex gap-2 text-sm text-foreground"
                        >
                          <span aria-hidden className="text-muted-foreground">
                            •
                          </span>
                          <span>{gap}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Time-gated feasible moves — each shows byGrade. */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Your next moves</CardTitle>
                  <CardDescription>
                    Time-gated steps, soonest deadline first.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {feasibleMoves.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No moves suggested yet.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {[...feasibleMoves]
                        .sort((a, b) => a.byGrade - b.byGrade)
                        .map((m, i) => (
                          <li key={`move-${i}`} className="space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {m.move}
                              </span>
                              <Badge variant="outline" className="shrink-0">
                                by grade {m.byGrade}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{m.why}</p>
                          </li>
                        ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </section>

      {/* --- Recommended schools --- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Where to aim</h2>
          {schools.length > 0 ? (
            <Link
              href="/schools"
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              All schools
            </Link>
          ) : null}
        </div>

        {schools.length === 0 ? (
          <Card>
            <CardContent className="py-2">
              <EmptyState
                title="No school recommendations yet"
                description={
                  synthesis === null
                    ? "Run a synthesis first — recommendations are matched to your spike and academics."
                    : "Add schools to your list to see how they fit your spike and academics."
                }
                action={
                  <Link
                    href={synthesis === null ? "/profile" : "/schools"}
                    className="text-sm font-medium text-primary underline underline-offset-4"
                  >
                    {synthesis === null ? "Run synthesis" : "Browse schools"}
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {schools.map((match) => {
              const rb = realismBadge(match.realism.band);
              return (
                <Card key={match.school.id}>
                  <CardContent className="space-y-2 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-medium">{match.school.name}</h3>
                      <Badge variant={rb.variant}>{rb.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{match.why}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatAdmitRate(match.school.admitRate)}</span>
                      <span>
                        {ACADEMIC_FIT_LABEL[match.academicFit] ??
                          "Academic fit unknown"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* --- Next grade-eligible opportunity deadlines --- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Upcoming opportunities
          </h2>
          {eligibleOpps.length > 0 ? (
            <Link
              href="/opportunities"
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              All opportunities
            </Link>
          ) : null}
        </div>

        {eligibleOpps.length === 0 ? (
          <Card>
            <CardContent className="py-2">
              <EmptyState
                title="No opportunities to show"
                description={
                  currentGrade === null
                    ? "Set your grade level on your profile to see opportunities you can apply to."
                    : "No grade-eligible opportunities are loaded yet."
                }
                action={
                  <Link
                    href={currentGrade === null ? "/profile" : "/opportunities"}
                    className="text-sm font-medium text-primary underline underline-offset-4"
                  >
                    {currentGrade === null ? "Complete profile" : "Browse opportunities"}
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {eligibleOpps.map((opp) => {
              const typeLabel =
                OppTypeSchema.safeParse(opp.type).success
                  ? OPP_TYPE_LABELS[OppTypeSchema.parse(opp.type)]
                  : opp.type;
              const monthLabel =
                opp.deadlineMonth !== null &&
                opp.deadlineMonth >= 1 &&
                opp.deadlineMonth <= 12
                  ? MONTHS[opp.deadlineMonth - 1]
                  : null;
              const deadline =
                opp.deadlineNote ?? (monthLabel ? `${monthLabel} (recurring)` : "Date TBD");
              return (
                <Card key={opp.id}>
                  <CardContent className="space-y-1 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-medium">{opp.name}</h3>
                      <Badge variant="outline">{typeLabel}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Deadline: {deadline}</span>
                      {opp.selectivityNote ? <span>{opp.selectivityNote}</span> : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
