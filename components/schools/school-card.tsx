import type { BadgeProps } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AcademicFit, RealismBand, SchoolMatch } from "@/lib/types";

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

/** Format a 0..1 admit rate as a whole-number percent, e.g. 0.073 -> "7%". */
function formatAdmitRate(rate: number | null): string {
  if (rate === null) return "admit rate unverified";
  return `${Math.round(rate * 100)}% admit rate`;
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

        {/* Per-school realism rationale (cites baseRate + fit; never a per-student %). */}
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
