import { renderToBuffer } from "@react-pdf/renderer";

import { prisma } from "@/lib/db";
import { LOCAL_USER_ID } from "@/lib/constants";
import { buildResumeData } from "@/lib/resume/data";
import { ResumeDoc } from "@/lib/resume/ResumeDoc";

export const dynamic = "force-dynamic";

/**
 * GET /api/resume — renders the local student's profile as an ATS-friendly PDF.
 * Always returns a valid PDF; if no student/activities exist yet, the document
 * is mostly empty rather than an error.
 */
export async function GET(): Promise<Response> {
  const student = await prisma.student.findFirst({
    where: { userId: LOCAL_USER_ID },
    include: {
      activities: {
        include: { research: true, score: true },
      },
    },
  });

  // Synthesize an empty student so the PDF still renders before onboarding.
  const resumeStudent =
    student ??
    ({
      id: "",
      userId: LOCAL_USER_ID,
      name: null,
      gradeLevel: null,
      gradYear: null,
      gpaUnweighted: null,
      gpaWeighted: null,
      rigor: null,
      satTotal: null,
      actComposite: null,
      intendedMajor: null,
      state: null,
      contextNotes: null,
      updatedAt: new Date(),
    } as const);

  const data = buildResumeData(resumeStudent, student?.activities ?? []);
  const buffer = await renderToBuffer(<ResumeDoc data={data} />);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="resume.pdf"',
    },
  });
}
