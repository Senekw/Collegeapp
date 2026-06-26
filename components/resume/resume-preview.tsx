import { Card, CardContent } from "@/components/ui/card";
import type { ResumeData, ResumeActivity } from "@/lib/types";

/**
 * On-page HTML preview of the resume. Mirrors lib/resume/ResumeDoc.tsx (the PDF)
 * section-for-section: header, Academics, Activities ordered by tier/impact with
 * honest research output + authorship. Pure presentation — only surfaces data
 * already projected by buildResumeData, so it cannot show a claim absent from
 * the database (AC §5.8).
 */

function buildContactParts(data: ResumeData): string[] {
  const parts: string[] = [];
  if (data.gradeLevel !== null) parts.push(`Grade ${data.gradeLevel}`);
  if (data.gradYear !== null) parts.push(`Class of ${data.gradYear}`);
  if (data.intendedMajor) parts.push(`Intended Major: ${data.intendedMajor}`);
  if (data.state) parts.push(data.state);
  return parts;
}

function buildAcademicRows(
  data: ResumeData,
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (data.gpaUnweighted !== null) {
    rows.push({
      label: "GPA (Unweighted)",
      value: data.gpaUnweighted.toFixed(2),
    });
  }
  if (data.gpaWeighted !== null) {
    rows.push({ label: "GPA (Weighted)", value: data.gpaWeighted.toFixed(2) });
  }
  if (data.satTotal !== null) {
    rows.push({ label: "SAT", value: String(data.satTotal) });
  }
  if (data.actComposite !== null) {
    rows.push({ label: "ACT", value: String(data.actComposite) });
  }
  if (data.rigor) {
    rows.push({ label: "Course Rigor", value: data.rigor });
  }
  return rows;
}

function buildResearchLine(
  research: ResumeActivity["research"],
): string | null {
  if (!research) return null;
  const parts: string[] = [research.outputType, research.authorship];
  if (research.venue) parts.push(research.venue);
  return `Research: ${parts.join(" • ")}`;
}

function PreviewSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 border-b border-border pb-1 text-xs font-bold uppercase tracking-widest text-foreground">
      {children}
    </h2>
  );
}

function ActivityEntry({ activity }: { activity: ResumeActivity }) {
  const metaParts: string[] = [];
  if (activity.role) metaParts.push(activity.role);
  metaParts.push(activity.category);
  const researchLine = buildResearchLine(activity.research);

  return (
    <div className="break-inside-avoid">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-bold text-foreground">{activity.title}</h3>
        {activity.dates ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {activity.dates}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{metaParts.join(" — ")}</p>
      {activity.description ? (
        <p className="mt-0.5 text-sm text-foreground">{activity.description}</p>
      ) : null}
      {researchLine ? (
        <p className="mt-1 text-xs italic text-foreground/80">{researchLine}</p>
      ) : null}
    </div>
  );
}

export function ResumePreview({ data }: { data: ResumeData }) {
  const contactParts = buildContactParts(data);
  const academicRows = buildAcademicRows(data);

  return (
    <Card>
      <CardContent className="space-y-6 p-8">
        <header>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {data.name ?? "Student Resume"}
          </h2>
          {contactParts.length > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {contactParts.join("  •  ")}
            </p>
          ) : null}
          {data.email ? (
            <p className="text-sm text-muted-foreground">{data.email}</p>
          ) : null}
        </header>

        <section>
          <PreviewSectionTitle>Academics</PreviewSectionTitle>
          {academicRows.length > 0 ? (
            <dl className="space-y-1">
              {academicRows.map((row) => (
                <div key={row.label} className="text-sm">
                  <dt className="inline font-bold text-foreground">
                    {row.label}:{" "}
                  </dt>
                  <dd className="inline text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              No academic information entered.
            </p>
          )}
        </section>

        <section>
          <PreviewSectionTitle>Activities</PreviewSectionTitle>
          {data.activities.length > 0 ? (
            <div className="space-y-4">
              {data.activities.map((activity, index) => (
                <ActivityEntry key={index} activity={activity} />
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              No activities entered yet.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
