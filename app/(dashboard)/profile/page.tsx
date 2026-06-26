// Profile intake page (Server Component). Loads the single local student and
// hands its current values to the autosave-on-blur form. First step of the
// guided path: profile → activities → score → synthesize → schools → resume.

import { ProfileForm, type ProfileInitial } from "@/components/profile/profile-form";
import { getOrCreateLocalStudent } from "@/lib/data";

// Per-request DB read; not statically prerenderable.
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const student = await getOrCreateLocalStudent();

  const initial: ProfileInitial = {
    name: student.name,
    gradeLevel: student.gradeLevel,
    gradYear: student.gradYear,
    gpaUnweighted: student.gpaUnweighted,
    gpaWeighted: student.gpaWeighted,
    rigor: student.rigor,
    satTotal: student.satTotal,
    actComposite: student.actComposite,
    intendedMajor: student.intendedMajor,
    state: student.state,
    contextNotes: student.contextNotes,
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="text-sm text-muted-foreground">
          Start here. The more accurate this is, the sharper your spike
          assessment and school fit will be. Everything saves as you go.
        </p>
      </header>

      <ProfileForm initial={initial} />
    </div>
  );
}
