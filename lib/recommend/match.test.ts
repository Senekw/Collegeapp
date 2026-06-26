import { describe, expect, it } from "vitest";
import { computeSpikeFit, rankSchools, scoreSchoolMatch } from "@/lib/recommend/match";
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
    strongMajors: ["Computer Science", "Engineering"],
    sourceUrl: null,
    ...overrides,
  };
}

function synthesis(overrides: Partial<SynthesisData> = {}): SynthesisData {
  return {
    primarySpike: "Computer Science research",
    spikeStrength: 9,
    academicStrength: 9,
    secondaryThemes: ["robotics engineering"],
    ...overrides,
  };
}

describe("computeSpikeFit", () => {
  it("scores strong overlap high (case-insensitive)", () => {
    const fit = computeSpikeFit(
      synthesis({ primarySpike: "computer science", secondaryThemes: ["engineering"] }),
      school({ strongMajors: ["Computer Science", "Engineering"] }),
    );
    expect(fit).toBeGreaterThan(5);
  });

  it("is 0 when there is no overlap", () => {
    const fit = computeSpikeFit(
      synthesis({ primarySpike: "classical music", secondaryThemes: ["violin"] }),
      school({ strongMajors: ["Biology", "Chemistry"] }),
    );
    expect(fit).toBe(0);
  });

  it("is 0 when the school has no strong majors", () => {
    expect(computeSpikeFit(synthesis(), school({ strongMajors: [] }))).toBe(0);
  });

  it("is 0 when synthesis is null", () => {
    expect(computeSpikeFit(null, school())).toBe(0);
  });

  it("stays within 0..10", () => {
    const fit = computeSpikeFit(
      synthesis({ primarySpike: "computer science engineering", secondaryThemes: [] }),
      school({ strongMajors: ["Computer Science Engineering"] }),
    );
    expect(fit).toBeGreaterThanOrEqual(0);
    expect(fit).toBeLessThanOrEqual(10);
  });
});

describe("scoreSchoolMatch", () => {
  it("flags missing data honestly", () => {
    const m = scoreSchoolMatch(
      student(),
      school({ admitRate: null, strongMajors: [] }),
      synthesis(),
    );
    expect(m.missing).toContain("admit rate unknown");
    expect(m.missing).toContain("strong majors unknown");
  });

  it("includes academicFit, spikeFit and realism", () => {
    const m = scoreSchoolMatch(student(), school(), synthesis());
    expect(m.academicFit).toBe("within");
    expect(m.spikeFit).toBeGreaterThan(0);
    expect(m.realism.caveat).toBeTruthy();
    expect(m.why.length).toBeGreaterThan(0);
  });
});

describe("rankSchools", () => {
  const schools: SchoolData[] = [
    school({ id: "a", name: "Alpha", admitRate: 0.4, strongMajors: ["Computer Science"] }),
    school({ id: "b", name: "Bravo", admitRate: 0.2, strongMajors: ["Biology"] }),
    school({ id: "c", name: "Charlie", admitRate: 0.6, strongMajors: ["Computer Science", "Engineering"] }),
    school({ id: "d", name: "Delta", admitRate: 0.5, strongMajors: ["History"] }),
    school({ id: "e", name: "Echo", admitRate: 0.35, strongMajors: ["Engineering"] }),
    school({ id: "f", name: "Foxtrot", admitRate: 0.45, strongMajors: ["Computer Science"] }),
  ];

  it("returns at most `limit` matches", () => {
    expect(rankSchools(student(), schools, synthesis(), 3)).toHaveLength(3);
    expect(rankSchools(student(), schools, synthesis(), 5)).toHaveLength(5);
  });

  it("never returns more than the number of input schools", () => {
    expect(rankSchools(student(), schools.slice(0, 2), synthesis(), 5)).toHaveLength(2);
  });

  it("orders by fitScore descending", () => {
    const ranked = rankSchools(student(), schools, synthesis(), 6);
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1]!.fitScore).toBeGreaterThanOrEqual(ranked[i]!.fitScore);
    }
  });

  it("ranks a spike-aligned within-range school above an off-spike one", () => {
    const ranked = rankSchools(student(), schools, synthesis(), 6);
    const csMatch = ranked.find((m) => m.school.id === "a");
    const histMatch = ranked.find((m) => m.school.id === "d");
    expect(csMatch).toBeDefined();
    expect(histMatch).toBeDefined();
    expect(csMatch!.fitScore).toBeGreaterThan(histMatch!.fitScore);
  });

  it("handles limit of 0 gracefully", () => {
    expect(rankSchools(student(), schools, synthesis(), 0)).toHaveLength(0);
  });
});
