import { describe, expect, it } from "vitest";
import { aggregateActivities, computeAcademicStrength } from "@/lib/scoring/aggregate";
import type {
  ActivityForAggregate,
  AggregateScoreInput,
  StudentMetrics,
} from "@/lib/types";

function student(overrides: Partial<StudentMetrics> = {}): StudentMetrics {
  return {
    gpaUnweighted: null,
    gpaWeighted: null,
    satTotal: null,
    actComposite: null,
    intendedMajor: null,
    state: null,
    gradeLevel: null,
    gradYear: null,
    ...overrides,
  };
}

function score(overrides: Partial<AggregateScoreInput> = {}): AggregateScoreInput {
  return {
    tier: 1,
    impact: 8,
    originality: 8,
    initiative: 8,
    depth: 8,
    selectivity: 8,
    spikeAlignment: 8,
    creditMultiplier: null,
    substantiated: true,
    ...overrides,
  };
}

function activity(
  id: string,
  overrides: Partial<ActivityForAggregate> = {},
): ActivityForAggregate {
  return {
    id,
    title: `Activity ${id}`,
    category: "RESEARCH",
    spikeTheme: null,
    score: score(),
    ...overrides,
  };
}

describe("computeAcademicStrength", () => {
  it("maps a near-perfect 1550 SAT / 3.97 GPA close to 10", () => {
    const s = computeAcademicStrength(student({ satTotal: 1550, gpaUnweighted: 3.97 }));
    expect(s).toBe(10);
  });

  it("returns 0 for an empty profile", () => {
    expect(computeAcademicStrength(student())).toBe(0);
  });

  it("takes the max of GPA-derived and test-derived points", () => {
    // Strong GPA, weak SAT -> GPA wins.
    const s = computeAcademicStrength(student({ gpaUnweighted: 3.97, satTotal: 1200 }));
    expect(s).toBe(10);
  });

  it("uses the better of SAT and ACT", () => {
    // weak SAT, strong ACT -> ACT wins
    const s = computeAcademicStrength(student({ satTotal: 1200, actComposite: 35 }));
    expect(s).toBe(10);
  });

  it("returns an integer in 0..10", () => {
    const s = computeAcademicStrength(student({ gpaUnweighted: 3.55, satTotal: 1320 }));
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(10);
  });
});

describe("aggregateActivities", () => {
  it("research creditMultiplier reduces the activity's signal", () => {
    const full = aggregateActivities([
      activity("full", { score: score({ creditMultiplier: null }) }),
    ]);
    const discounted = aggregateActivities([
      activity("disc", { score: score({ creditMultiplier: 0.4 }) }),
    ]);
    expect(discounted.weightedActivitySignal).toBeLessThan(full.weightedActivitySignal);
    // 0.4 multiplier on an otherwise identical activity ~= 40% of the signal.
    expect(discounted.weightedActivitySignal).toBeCloseTo(
      full.weightedActivitySignal * 0.4,
      5,
    );
  });

  it("excludes unscored activities from ranking and signal", () => {
    const result = aggregateActivities([
      activity("scored", { score: score() }),
      activity("unscored", { score: null }),
    ]);
    expect(result.rankedActivityIds).toEqual(["scored"]);
    expect(result.rankedActivityIds).not.toContain("unscored");
  });

  it("returns null topTheme and 0 signal when nothing is scored", () => {
    const result = aggregateActivities([activity("x", { score: null })]);
    expect(result.topTheme).toBeNull();
    expect(result.weightedActivitySignal).toBe(0);
    expect(result.rankedActivityIds).toHaveLength(0);
    expect(result.themes).toHaveLength(0);
  });

  it("clusters by spikeTheme, falling back to category", () => {
    const result = aggregateActivities([
      activity("a", { spikeTheme: "AI Safety", category: "RESEARCH" }),
      activity("b", { spikeTheme: "AI Safety", category: "COMPETITION" }),
      activity("c", { spikeTheme: null, category: "SERVICE" }),
    ]);
    const ai = result.themes.find((t) => t.theme === "AI Safety");
    const service = result.themes.find((t) => t.theme === "SERVICE");
    expect(ai).toBeDefined();
    expect(ai!.activityIds.sort()).toEqual(["a", "b"]);
    expect(service).toBeDefined();
    expect(service!.activityIds).toEqual(["c"]);
  });

  it("ranks activities by individual signal, strongest first", () => {
    const result = aggregateActivities([
      activity("weak", {
        score: score({ tier: 4, impact: 3, originality: 3, initiative: 3, depth: 3, selectivity: 3, spikeAlignment: 3 }),
      }),
      activity("strong", { score: score({ tier: 1 }) }),
    ]);
    expect(result.rankedActivityIds[0]).toBe("strong");
    expect(result.rankedActivityIds[1]).toBe("weak");
  });

  it("topTheme is the strongest cluster and academicStrength is left at 0", () => {
    const result = aggregateActivities([
      activity("a", { spikeTheme: "Strong", score: score({ tier: 1 }) }),
      activity("b", {
        spikeTheme: "Weak",
        score: score({ tier: 4, impact: 2, originality: 2, initiative: 2, depth: 2, selectivity: 2, spikeAlignment: 2 }),
      }),
    ]);
    expect(result.topTheme).toBe("Strong");
    expect(result.academicStrength).toBe(0);
  });

  it("weightedActivitySignal is the sum of per-activity signals", () => {
    const single = aggregateActivities([activity("a")]).weightedActivitySignal;
    const double = aggregateActivities([activity("a"), activity("b", { id: "b" })])
      .weightedActivitySignal;
    expect(double).toBeCloseTo(single * 2, 5);
  });

  it("higher tier yields a higher signal than lower tier, all else equal", () => {
    const tier1 = aggregateActivities([activity("a", { score: score({ tier: 1 }) })])
      .weightedActivitySignal;
    const tier4 = aggregateActivities([activity("a", { score: score({ tier: 4 }) })])
      .weightedActivitySignal;
    expect(tier1).toBeGreaterThan(tier4);
  });
});
