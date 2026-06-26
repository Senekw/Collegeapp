import Link from "next/link";

import { getOrCreateLocalStudent } from "@/lib/data";
import { prisma } from "@/lib/db";
import { LOCAL_USER_ID } from "@/lib/constants";
import { buildResumeData } from "@/lib/resume/data";
import type { ActivityWithRelations } from "@/lib/resume/data";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { ResumePreview } from "@/components/resume/resume-preview";

export const dynamic = "force-dynamic";

/**
 * Resume page — server-loads the local student + activities (with research and
 * score), builds the same ResumeData the PDF route consumes, and renders an
 * on-page HTML preview that mirrors the PDF. A prominent Download PDF link hits
 * /api/resume. Per AC §5.8, every line shown originates from the database; no
 * claim is fabricated.
 */
export default async function ResumePage() {
  const student = await getOrCreateLocalStudent();
  const activities: ActivityWithRelations[] = await prisma.activity.findMany({
    where: { userId: LOCAL_USER_ID, studentId: student.id },
    include: { research: true, score: true },
  });

  const data = buildResumeData(student, activities);

  const hasProfile =
    data.name !== null ||
    data.gpaUnweighted !== null ||
    data.gpaWeighted !== null ||
    data.satTotal !== null ||
    data.actComposite !== null ||
    data.intendedMajor !== null ||
    Boolean(data.rigor);
  const hasActivities = data.activities.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Resume
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            An honest, ATS-friendly resume built only from what you have
            entered. Nothing here is invented — every line comes from your
            profile and activities.
          </p>
        </div>
        {hasProfile || hasActivities ? (
          <a
            href="/api/resume"
            className={cn(buttonVariants({ size: "lg" }), "shrink-0")}
          >
            Download PDF
          </a>
        ) : null}
      </header>

      {!hasProfile && !hasActivities ? (
        <EmptyState
          title="Nothing to put on a resume yet"
          description={
            <>
              Start by filling in your{" "}
              <Link href="/profile" className="font-medium underline">
                profile
              </Link>{" "}
              and adding{" "}
              <Link href="/activities" className="font-medium underline">
                activities
              </Link>
              . Once you have, score them so the strongest work rises to the
              top, then come back here for a clean, downloadable resume.
            </>
          }
        />
      ) : (
        <ResumePreview data={data} />
      )}
    </div>
  );
}
