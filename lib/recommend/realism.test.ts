import { describe, expect, it } from "vitest";
import {
  REALISM_CAVEAT,
  computeAcademicFit,
  estimateRealism,
} from "@/lib/recommend/realism";
import { REALISM_BAND_ORDER } from "@/lib/types";
import type { SchoolData, StudentMetrics, SynthesisData } from "@/lib/types";

function student(overrides: Partial<StudentMetrics> = {}): StudentMetrics {
  return {
    gpaUnweighted: 3.9,
    gpaWeighted: 4.4,
    satTotal: 1500,
    actComposite: null,
    intendedMajor: "Computer Science",
    state: "CA",
    gradeLevel: 11,
    gradYear: 2027,
    ...overrides,
  };
}

function school(overrides: Partial<SchoolData> = {}): SchoolData {
  return {
    id: "s1",
    name: "Test University",
    admitRate: 0.3,
    gpaMid50Low: 3.6,
    gpaMid50High: 3.95,
    satMid50Low: 1400,
    satMid50High: 1550,
    type: "private",
    size: 10000,
    strongMajors: ["Computer Science"],
    sourceUrl: null,
    ...overrides,
  };
}

function synthesis(overrides: Partial<SynthesisData> = {}): SynthesisData {
  return {
    primarySpike: "Computer Science research",
    spikeStrength: 9,
    academicStrength: 9,
    secondaryThemes: ["robotics"],
    ...overrides,
  };
}

const bandRank = (b: string) => REALISM_BAND_ORDER.indexOf(b as never);

describe("computeAcademicFit", () => {
  it("returns within when stats land inside the mid-50% band", () => {
    expect(computeAcademicFit(student(), school())).toBe("within");
  });

  it("returns above when stats clear the high end", () => {
    expect(
      computeAcademicFit(student({ gpaUnweighted: 4.0, satTotal: 1580 }), school()),
    ).toBe("above");
  });

  it("returns below when stats are under the low end", () => {
    expect(
      computeAcademicFit(student({ gpaUnweighted: 3.0, satTotal: 1100 }), school()),
    ).toBe("below");
  });

  it("takes the more favorable signal when GPA and SAT disagree", () => {
    // GPA below, SAT above -> above
    expect(
      computeAcademicFit(student({ gpaUnweighted: 3.0, satTotal: 1580 }), school()),
    ).toBe("above");
  });

  it("returns unknown when the school has no stats", () => {
    expect(
      computeAcademicFit(
        student(),
        school({ gpaMid50Low: null, gpaMid50High: null, satMid50Low: null, satMid50High: null }),
      ),
    ).toBe("unknown");
  });
});

describe("estimateRealism — SAFETY-CRITICAL", () => {
  it("sub-10% (0.07) never exceeds Reach for any student/spike", () => {
    const strongStudent = student({ gpaUnweighted: 4.0, satTotal: 1600 });
    const strongSchool = school({ admitRate: 0.07 });
    const r = estimateRealism(strongStudent, strongSchool, synthesis(), 10);
    expect(bandRank(r.band)).toBeLessThanOrEqual(bandRank("Reach"));
    expect(["Hard Reach", "Reach"]).toContain(r.band);
  });

  it("sub-5% (0.04) is ALWAYS Hard Reach, even for a perfect student", () => {
    const perfect = student({ gpaUnweighted: 4.0, satTotal: 1600 });
    const elite = school({ admitRate: 0.04, gpaMid50Low: 3.9, gpaMid50High: 4.0, satMid50Low: 1500, satMid50High: 1580 });
    const r = estimateRealism(perfect, elite, synthesis(), 10);
    expect(r.band).toBe("Hard Reach");
  });

  it("null admit rate -> Unknown with explanation and no per-student percent", () => {
    const r = estimateRealism(student(), school({ admitRate: null }), synthesis(), 8);
    expect(r.band).toBe("Unknown");
    expect(r.baseRate).toBeNull();
    expect(r.rationale.toLowerCase()).toContain("unverified");
  });

  it("caveat is ALWAYS present and equals REALISM_CAVEAT", () => {
    const cases = [
      estimateRealism(student(), school({ admitRate: 0.04 }), synthesis(), 10),
      estimateRealism(student(), school({ admitRate: 0.07 }), synthesis(), 5),
      estimateRealism(student(), school({ admitRate: 0.3 }), null, 0),
      estimateRealism(student(), school({ admitRate: null }), synthesis(), 8),
      estimateRealism(student(), school({ admitRate: 0.8 }), synthesis(), 9),
    ];
    for (const r of cases) {
      expect(r.caveat).toBe(REALISM_CAVEAT);
    }
  });

  it("a high admit-rate school (0.8) with a strong student can reach Likely/Safety", () => {
    const strong = student({ gpaUnweighted: 4.0, satTotal: 1600 });
    const open = school({
      admitRate: 0.8,
      gpaMid50Low: 3.0,
      gpaMid50High: 3.6,
      satMid50Low: 1100,
      satMid50High: 1300,
      strongMajors: ["Computer Science"],
    });
    const r = estimateRealism(strong, open, synthesis(), 10);
    expect(["Likely", "Safety"]).toContain(r.band);
  });

  it("never surfaces a per-student admit percent — rationale cites only the base rate", () => {
    const r = estimateRealism(student(), school({ admitRate: 0.3 }), synthesis(), 8);
    // The only percentage cited should be the published base rate (30%).
    const percentages = r.rationale.match(/\d+(\.\d+)?%/g) ?? [];
    expect(percentages.length).toBe(1);
    expect(percentages[0]).toBe("30%");
  });

  it("rationale cites the base rate as a percent", () => {
    const r = estimateRealism(student(), school({ admitRate: 0.07 }), synthesis(), 5);
    expect(r.rationale).toContain("7.0%");
  });

  it("baseRate is the published admit rate, never modified", () => {
    const r = estimateRealism(student(), school({ admitRate: 0.234 }), synthesis(), 5);
    expect(r.baseRate).toBe(0.234);
  });

  it("academic fit moves the band: above-range student beats below-range student at same school", () => {
    const sch = school({ admitRate: 0.4 });
    const above = estimateRealism(
      student({ gpaUnweighted: 4.0, satTotal: 1600 }),
      sch,
      null,
    );
    const below = estimateRealism(
      student({ gpaUnweighted: 3.0, satTotal: 1100 }),
      sch,
      null,
    );
    expect(bandRank(above.band)).toBeGreaterThanOrEqual(bandRank(below.band));
  });
});
