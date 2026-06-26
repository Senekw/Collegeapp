import type { BadgeProps } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  AcademicFit,
  DistributionPlacement,
  RealismBand,
  SchoolMatch,
  TailOutlook,
} from "@/lib/types";

/**
 * Map a realism band to a Badge variant.
 *  - Hard Reach / Reach -> destructive (red-ish)
 *  - Target            -> warning (amber)
 *  - Likely / Safety   -> success (green)
 *  - Unknown           -> secondary (gray)
 */
function bandVariant(band: RealismBand): BadgeProps["variant"] {
  switch (band) {
    case "Hard Reach":
    case "Reach":
      return "destructive";
    case "Target":
      return "warning";
    case "Likely":
    case "Safety":
      return "success";
    case "Unknown":
    default:
      return "secondary";
  }
}

/** Format a 0..1 base admit rate as a percent, or an honest "unverified" flag. */
function formatAdmitRate(rate: number | null): string {
  if (rate === null) return "admit rate unverified";
  // One decimal under 10% so 4% vs 4.5% reads honestly; whole number above.
  const pct = rate * 100;
  return pct < 10 ? `${pct.toFixed(1)}% admit rate` : `${Math.round(pct)}% admit rate`;
}

/** Human phrase for academic fit, anchored to published mid-50% ranges. */
function academicFitLabel(fit: AcademicFit): string {
  switch (fit) {
    case "below":
      return "Your stats fall below";
    case "within":
      return "Your stats land within";
    case "above":
      return "Your stats clear";
    case "unknown":
    default:
      return "Academic fit unclear for";
  }
}

function formatGpaRange(low: number | null, high: number | null): string | null {
  if (low === null || high === null) return null;
  return `GPA ${low.toFixed(2)}–${high.toFixed(2)}`;
}

function formatSatRange(low: number | null, high: number | null): string | null {
  if (low === null || high === null) return null;
  return `SAT ${low}–${high}`;
}

/**
 * Honest, NEVER per-student admit probability. When a real admitted-class
 * distribution placed the student, surface "~X% of recent admits at/below your
 * stats (YYYY, source)" with a source link; otherwise note the mid-50% read or
 * that the distribution is unverified.
 */
function PlacementLine({
  placement,
}: {
  placement: DistributionPlacement;
}) {
  if (
    placement.basis === "distribution" &&
    placement.percentileOfAdmitsAtOrBelow !== null
  ) {
    const pct = Math.round(placement.percentileOfAdmitsAtOrBelow * 100);
    const year = placement.asOfYear !== null ? `, ${placement.asOfYear}` : "";
    return (
      <p className="text-sm text-muted-foreground">
        ~{pct}% of recent admits had stats at or below yours{year}
        {placement.sourceUrl !== null ? (
          <>
            {" ("}
            <a
              href={placement.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              source
            </a>
            {")"}
          </>
        ) : null}
        .
      </p>
    );
  }

  if (placement.basis === "mid50") {
    return (
      <p className="text-sm text-muted-foreground">
        Placement is a mid-50% range fit only; no admitted-class distribution is
        available.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Admitted-class distribution unverified.
    </p>
  );
}

/**
 * Surface the tail outlook honestly, only when it is meaningful (!= "na").
 * When the tail IS invoked, §8.7/§11 require the survivorship-bias note to
 * appear here — realism.caveat already carries it, so render the full per-card
 * caveat alongside the outlook phrase.
 */
function TailOutlookLine({
  tailOutlook,
  caveat,
}: {
  tailOutlook: TailOutlook;
  caveat: string;
}) {
  if (tailOutlook === "na") return null;
  const text =
    tailOutlook === "narrow_but_credible"
      ? "Narrow but credible tail for your spike tier."
      : "Very long odds from below the typical range.";
  return (
    <div className="rounded-md border border-warning/40 bg-warning/5 p-2.5">
      <p className="text-sm font-medium text-foreground">{text}</p>
      <p className="mt-1 text-xs text-muted-foreground">{caveat}</p>
    </div>
  );
}

export function SchoolCard({ match }: { match: SchoolMatch }) {
  const { school, realism, academicFit, missing, why } = match;
  const gpaRange = formatGpaRange(school.gpaMid50Low, school.gpaMid50High);
  const satRange = formatSatRange(school.satMid50Low, school.satMid50High);
  const ranges = [gpaRange, satRange].filter((r): r is string => r !== null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-lg">{school.name}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatAdmitRate(realism.baseRate)}
          </p>
        </div>
        <Badge variant={bandVariant(realism.band)} className="shrink-0">
          {realism.band}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Academic-fit signal, with the school's published mid-50% range when present. */}
        <p className="text-sm text-foreground">
          {academicFitLabel(academicFit)}{" "}
          {ranges.length > 0 ? (
            <span className="text-muted-foreground">{ranges.join(" · ")}</span>
          ) : (
            <span className="text-muted-foreground">
              this school&rsquo;s published range
            </span>
          )}
          .
        </p>

        {/* One-line "why this school for your spike." */}
        <p className="text-sm text-muted-foreground">{why}</p>

        {/* Distribution placement (never a per-student admit %). */}
        <PlacementLine placement={realism.distributionPlacement} />

        {/* Tail outlook + survivorship-flagged caveat, surfaced only when meaningful. */}
        <TailOutlookLine tailOutlook={realism.tailOutlook} caveat={realism.caveat} />

        {/* Per-school realism rationale (cites baseRate + placement; never a per-student %). */}
        <p className="text-sm text-muted-foreground">{realism.rationale}</p>

        {/* Honest data-completeness flags instead of inventing numbers. */}
        {missing.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {missing.map((flag) => (
              <li key={flag}>
                <Badge variant="outline" className="font-normal">
                  {flag}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Source link, only when present. */}
        {school.sourceUrl ? (
          <a
            href={school.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            View source data
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
