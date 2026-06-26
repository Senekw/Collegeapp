import type {
  Student,
  Activity,
  ResearchDetail,
  ActivityScore,
} from "@prisma/client";

import {
  ACTIVITY_CATEGORY_LABELS,
  ActivityCategorySchema,
  RESEARCH_OUTPUT_LABELS,
  ResearchOutputSchema,
  AUTHORSHIP_LABELS,
  AuthorshipSchema,
} from "@/lib/enums";
import type { ResumeData, ResumeActivity } from "@/lib/types";

/** Activity row enriched with its optional research + score relations. */
export type ActivityWithRelations = Activity & {
  research?: ResearchDetail | null;
  score?: ActivityScore | null;
};

const MONTHS = [
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

function formatMonthYear(date: Date): string {
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return month ? `${month} ${year}` : `${year}`;
}

/**
 * Build a human date range from start/end. Returns null when no start date is
 * entered (we never invent dates). "Present" when there is a start but no end.
 */
function formatDateRange(
  startDate: Date | null,
  endDate: Date | null,
): string | null {
  if (!startDate) return null;
  const start = formatMonthYear(startDate);
  const end = endDate ? formatMonthYear(endDate) : "Present";
  return `${start} – ${end}`;
}

function categoryLabel(raw: string): string {
  const parsed = ActivityCategorySchema.safeParse(raw);
  return parsed.success ? ACTIVITY_CATEGORY_LABELS[parsed.data] : raw;
}

function researchOutputLabel(raw: string): string {
  const parsed = ResearchOutputSchema.safeParse(raw);
  return parsed.success ? RESEARCH_OUTPUT_LABELS[parsed.data] : raw;
}

function authorshipLabel(raw: string): string {
  const parsed = AuthorshipSchema.safeParse(raw);
  return parsed.success ? AUTHORSHIP_LABELS[parsed.data] : raw;
}

/**
 * Sort comparator: tier ascending (1 best), then impact descending. Activities
 * without a score sort after scored ones (nulls last) so the strongest,
 * best-evidenced work appears first on the resume.
 */
function compareActivities(
  a: ResumeActivity,
  b: ResumeActivity,
): number {
  const aTier = a.tier ?? Number.POSITIVE_INFINITY;
  const bTier = b.tier ?? Number.POSITIVE_INFINITY;
  if (aTier !== bTier) return aTier - bTier;

  const aImpact = a.impact ?? Number.NEGATIVE_INFINITY;
  const bImpact = b.impact ?? Number.NEGATIVE_INFINITY;
  return bImpact - aImpact;
}

/**
 * Project the persisted student + activities into the flat ResumeData shape the
 * PDF renderer consumes. Only ENTERED data is surfaced — no fabricated lines.
 */
export function buildResumeData(
  student: Student,
  activities: ActivityWithRelations[],
): ResumeData {
  const resumeActivities: ResumeActivity[] = activities.map((activity) => {
    const score = activity.score ?? null;
    const research = activity.research ?? null;

    return {
      title: activity.title,
      category: categoryLabel(activity.category),
      description: activity.description,
      role: activity.role ?? null,
      dates: formatDateRange(activity.startDate, activity.endDate),
      tier: score ? score.tier : null,
      impact: score ? score.impact : null,
      research: research
        ? {
            outputType: researchOutputLabel(research.outputType),
            authorship: authorshipLabel(research.authorship),
            venue: research.venue ?? null,
          }
        : null,
    };
  });

  resumeActivities.sort(compareActivities);

  return {
    name: student.name ?? null,
    intendedMajor: student.intendedMajor ?? null,
    state: student.state ?? null,
    email: null,
    rigor: student.rigor ?? null,
    gradeLevel: student.gradeLevel ?? null,
    gradYear: student.gradYear ?? null,
    satTotal: student.satTotal ?? null,
    actComposite: student.actComposite ?? null,
    gpaUnweighted: student.gpaUnweighted ?? null,
    gpaWeighted: student.gpaWeighted ?? null,
    activities: resumeActivities,
  };
}
