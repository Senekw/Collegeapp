import Link from "next/link";

import { SchoolCard } from "@/components/schools/school-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/db";
import { getOrCreateLocalStudent } from "@/lib/data";
import { recommendSchools } from "@/lib/services/recommend";
import { REALISM_CAVEAT } from "@/lib/recommend/realism";

export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const student = await getOrCreateLocalStudent();

  // Recommendations require a profile synthesis: the spike/major signal is what
  // makes a match "aspirational but plausible" rather than a generic stats sort.
  const synthesis = await prisma.profileSynthesis.findUnique({
    where: { studentId: student.id },
    select: { id: true },
  });

  if (synthesis === null) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <EmptyState
          title="Synthesize your profile first"
          description="School matches are built around your spike and intended major. Add your activities, score them, then run synthesis — recommendations will appear here."
          action={
            <Link href="/profile" className={buttonVariants()}>
              Go to your profile
            </Link>
          }
        />
      </div>
    );
  }

  const matches = await recommendSchools(student.id);

  if (matches.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <EmptyState
          title="No schools to match against yet"
          description="Once school data is available, your top matches will appear here ranked aspirational-but-plausible."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader />

      {/* The realism caveat is fixed across all matches; surface it once, up top. */}
      <Alert variant="warning">
        <AlertTitle>How to read these bands</AlertTitle>
        <AlertDescription>{REALISM_CAVEAT}</AlertDescription>
      </Alert>

      <div className="grid gap-4">
        {matches.map((match) => (
          <SchoolCard key={match.school.id} match={match} />
        ))}
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">School matches</h1>
      <p className="text-sm text-muted-foreground">
        Your top picks, aimed aspirational-but-plausible against published admit
        rates and academic ranges.
      </p>
    </div>
  );
}
