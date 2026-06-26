import type { Opportunity } from "@prisma/client";

import { OpportunityRow } from "@/components/opportunities/opportunity-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { getOrCreateLocalStudent } from "@/lib/data";
import { prisma } from "@/lib/db";
import {
  OPP_TYPE_LABELS,
  OppTypeSchema,
  parseIntArray,
  type OppType,
} from "@/lib/enums";

export const dynamic = "force-dynamic";

/**
 * Months from `current` until a recurring `deadlineMonth` window (0..11).
 * A window in the current month is treated as imminent (0). Null months sort
 * last via a large sentinel.
 */
function monthsUntil(deadlineMonth: number | null, currentMonth: number): number {
  if (deadlineMonth === null || deadlineMonth < 1 || deadlineMonth > 12) {
    return Number.POSITIVE_INFINITY;
  }
  return (deadlineMonth - currentMonth + 12) % 12;
}

export default async function OpportunitiesPage() {
  const [student, opportunities] = await Promise.all([
    getOrCreateLocalStudent(),
    prisma.opportunity.findMany(),
  ]);

  const gradeLevel = student.gradeLevel;
  const currentMonth = new Date().getMonth() + 1; // 1..12

  // Filter by grade eligibility. Unknown grade -> show everything.
  const eligible = opportunities.filter((opp) => {
    if (gradeLevel === null) return true;
    return parseIntArray(opp.gradeEligibility).includes(gradeLevel);
  });

  // Sort by deadline proximity (soonest recurring window first).
  const sorted = [...eligible].sort(
    (a, b) =>
      monthsUntil(a.deadlineMonth, currentMonth) -
      monthsUntil(b.deadlineMonth, currentMonth),
  );

  // Group by type, preserving the deadline-proximity order within each group.
  const grouped = new Map<OppType, Opportunity[]>();
  for (const opp of sorted) {
    const parsed = OppTypeSchema.safeParse(opp.type);
    if (!parsed.success) continue; // skip rows with an unrecognized type
    const key = parsed.data;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(opp);
    else grouped.set(key, [opp]);
  }

  const groupKeys = Array.from(grouped.keys());

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Opportunities
        </h1>
        <p className="text-sm text-muted-foreground">
          Programs, fellowships, and competitions that fit your grade, ordered
          by how soon each window opens.
        </p>
      </header>

      <Alert variant="warning">
        <AlertTitle>Always confirm on the official page</AlertTitle>
        <AlertDescription>
          Deadlines shown here are recurring windows, not guaranteed exact
          dates. Only entries marked &ldquo;Verified&rdquo; have a confirmed
          source. Check the official site before you plan around any date.
        </AlertDescription>
      </Alert>

      {gradeLevel === null ? (
        <EmptyState
          title="Set your grade to see matched opportunities"
          description="Add your current grade level on the profile page and we'll filter opportunities to the ones you're eligible for."
        />
      ) : groupKeys.length === 0 ? (
        <EmptyState
          title="No opportunities match your grade yet"
          description={`Nothing on file is currently open to grade ${gradeLevel}. Check back as new programs are added.`}
        />
      ) : (
        <div className="space-y-8">
          {groupKeys.map((type) => {
            const items = grouped.get(type) ?? [];
            return (
              <section key={type} className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {OPP_TYPE_LABELS[type]}
                </h2>
                <div className="space-y-3">
                  {items.map((opp) => (
                    <OpportunityRow key={opp.id} opportunity={opp} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
