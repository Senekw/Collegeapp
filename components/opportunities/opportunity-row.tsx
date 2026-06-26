import * as React from "react";
import type { Opportunity } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { parseIntArray } from "@/lib/enums";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Human label for a 1..12 month, guarded for out-of-range/null values. */
function monthLabel(month: number | null): string | null {
  if (month === null || month < 1 || month > 12) return null;
  return MONTH_LABELS[month - 1] ?? null;
}

/** Render the eligible grade list compactly, e.g. "Grades 10, 11". */
function gradeEligibilityLabel(raw: string): string {
  const grades = parseIntArray(raw).sort((a, b) => a - b);
  if (grades.length === 0) return "All grades";
  if (grades.length === 1) return `Grade ${grades[0]}`;
  return `Grades ${grades.join(", ")}`;
}

export interface OpportunityRowProps {
  opportunity: Opportunity;
}

/**
 * A single opportunity card.
 *
 * §5.7 AC: a concrete deadline window may only be presented as fact when the
 * row is BOTH verified AND has an official sourceUrl. Otherwise we surface the
 * month/note as unverified and warn the reader to confirm on the official site.
 */
export function OpportunityRow({ opportunity }: OpportunityRowProps) {
  const month = monthLabel(opportunity.deadlineMonth);
  const note = opportunity.deadlineNote?.trim() || null;
  const hasSource = Boolean(opportunity.sourceUrl?.trim());
  const isVerified = opportunity.verified === true && hasSource;

  const deadlineText =
    month && note ? `${month} — ${note}` : month ?? note ?? null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {opportunity.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {gradeEligibilityLabel(opportunity.gradeEligibility)}
            </Badge>
            {isVerified ? (
              <Badge variant="success">Verified</Badge>
            ) : (
              <Badge variant="warning">Verify on official site</Badge>
            )}
          </div>
        </div>
        {hasSource ? (
          <a
            href={opportunity.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Official page
          </a>
        ) : null}
      </div>

      {opportunity.description?.trim() ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {opportunity.description}
        </p>
      ) : null}

      <dl className="mt-3 space-y-1.5 text-sm">
        {deadlineText ? (
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium text-foreground">
              {isVerified ? "Deadline:" : "Window (unverified):"}
            </dt>
            <dd className="text-muted-foreground">
              {deadlineText}
              {!isVerified ? (
                <span className="text-amber-700 dark:text-amber-300">
                  {" "}
                  — confirm the exact date on the official site before relying on
                  it.
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
        {opportunity.selectivityNote?.trim() ? (
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium text-foreground">
              Selectivity:
            </dt>
            <dd className="text-muted-foreground">
              {opportunity.selectivityNote}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
