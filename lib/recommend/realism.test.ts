import { describe, expect, it } from "vitest";
import {
  REALISM_CAVEAT,
  SURVIVORSHIP_NOTE,
  computeAcademicFit,
  estimateRealism,
} from "@/lib/recommend/realism";
import { REALISM_BAND_ORDER } from "@/lib/types";
import type {
  AdmitDistributionData,
  SchoolData,
  SpikeAssessmentData,
  StudentMetrics,
} from "@/lib/types";
import type { SpikeTier } from "@/lib/enums";

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

function spikeAssessment(
  tier: SpikeTier,
  overrides: Partial<SpikeAssessmentData> = {},
): SpikeAssessmentData {
  return {
    spikeIndex: 95,
    tier,
    dominantTheme: "Computer Science research",
    peakActivityIds: ["a1"],
    components: { peak: 9, concentration: 9, trajectory: 9, originality: 9 },
    rarityAnchor: "top national olympiad medalist",
    gapToNextTier: "already at the top tier",
    ...overrides,
  };
}

function gpaDistribution(
  overrides: Partial<AdmitDistributionData> = {},
): AdmitDistributionData {
  return {
    statType: "GPA",
    buckets: [
      { rangeLabel: "<3.7", pctOfAdmits: 0.1 },
      { rangeLabel: "3.7-3.9", pctOfAdmits: 0.3 },
      { rangeLabel: ">=3.9", pctOfAdmits: 0.6 },
    ],
    asOfYear: 2024,
    isFallbackYear: false,
    sourceUrl: "https://example.edu/cds",
    confidence: "HIGH",
    ...overrides,
  };
}

const bandRank = (b: string) => REALISM_BAND_ORDER.indexOf(b as never);

/** Pull every `NN%` or `NN.N%` token from a string. */
function percentTokens(s: string): string[] {
  return s.match(/\d+(\.\d+)?%/g) ?? [];
}

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
  it("sub-10% (0.07) never exceeds Reach, EVEN WITH an EXCEPTIONAL spike", () => {
    const strongStudent = student({ gpaUnweighted: 4.0, satTotal: 1600 });
    const strongSchool = school({
      admitRate: 0.07,
      gpaMid50Low: 3.8,
      gpaMid50High: 4.0,
      satMid50Low: 1500,
      satMid50High: 1580,
    });
    const r = estimateRealism(
      strongStudent,
      strongSchool,
      spikeAssessment("EXCEPTIONAL"),
      [],
    );
    expect(bandRank(r.band)).toBeLessThanOrEqual(bandRank("Reach"));
    expect(["Hard Reach", "Reach"]).toContain(r.band);
  });

  it("sub-5% (0.04) is ALWAYS Hard Reach, even for a perfect student with an EXCEPTIONAL spike", () => {
    const perfect = student({ gpaUnweighted: 4.0, satTotal: 1600 });
    const elite = school({
      admitRate: 0.04,
      gpaMid50Low: 3.9,
      gpaMid50High: 4.0,
      satMid50Low: 1500,
      satMid50High: 1580,
    });
    const r = estimateRealism(perfect, elite, spikeAssessment("EXCEPTIONAL"), []);
    expect(r.band).toBe("Hard Reach");
  });

  it("null admit rate -> Unknown, basis unknown, tailOutlook na, no per-student percent", () => {
    const r = estimateRealism(
      student(),
      school({ admitRate: null }),
      spikeAssessment("NATIONAL"),
      [],
    );
    expect(r.band).toBe("Unknown");
    expect(r.baseRate).toBeNull();
    expect(r.distributionPlacement.basis).toBe("unknown");
    expect(r.distributionPlacement.percentileOfAdmitsAtOrBelow).toBeNull();
    expect(r.tailOutlook).toBe("na");
    expect(r.rationale.toLowerCase()).toContain("unverified");
  });

  it("missing distribution -> basis mid50 or unknown, NEVER a fabricated percentile", () => {
    const withBands = estimateRealism(student(), school(), null, []);
    expect(withBands.distributionPlacement.basis).toBe("mid50");
    expect(withBands.distributionPlacement.percentileOfAdmitsAtOrBelow).toBeNull();

    const noBands = estimateRealism(
      student(),
      school({ gpaMid50Low: null, gpaMid50High: null, satMid50Low: null, satMid50High: null }),
      null,
      [],
    );
    expect(noBands.distributionPlacement.basis).toBe("unknown");
    expect(noBands.distributionPlacement.percentileOfAdmitsAtOrBelow).toBeNull();
  });

  it("caveat is ALWAYS present and starts with REALISM_CAVEAT", () => {
    const cases = [
      estimateRealism(student(), school({ admitRate: 0.04 }), spikeAssessment("EXCEPTIONAL"), []),
      estimateRealism(student(), school({ admitRate: 0.07 }), spikeAssessment("STRONG"), []),
      estimateRealism(student(), school({ admitRate: 0.3 }), null, []),
      estimateRealism(student(), school({ admitRate: null }), spikeAssessment("NATIONAL"), []),
      estimateRealism(student(), school({ admitRate: 0.8 }), spikeAssessment("SOLID"), []),
    ];
    for (const r of cases) {
      expect(r.caveat.startsWith(REALISM_CAVEAT)).toBe(true);
      expect(r.caveat).toBeTruthy();
    }
  });

  it("SURVIVORSHIP_NOTE is present whenever tailOutlook !== na, and absent otherwise", () => {
    // Below band at a sub-10% school with EXCEPTIONAL spike -> tail in play.
    const below = student({ gpaUnweighted: 3.4, satTotal: 1300 });
    const tail = estimateRealism(
      below,
      school({ admitRate: 0.07, gpaMid50Low: 3.8, gpaMid50High: 4.0, satMid50Low: 1500, satMid50High: 1580 }),
      spikeAssessment("EXCEPTIONAL"),
      [gpaDistribution()],
    );
    expect(tail.tailOutlook).not.toBe("na");
    expect(tail.caveat).toContain(SURVIVORSHIP_NOTE.trim());

    // Within band -> na -> no survivorship note.
    const within = estimateRealism(student(), school(), spikeAssessment("EXCEPTIONAL"), []);
    expect(within.tailOutlook).toBe("na");
    expect(within.caveat).toBe(REALISM_CAVEAT);
  });

  it("emits no per-student admit % — only the base rate and distribution percentile may appear", () => {
    const r = estimateRealism(
      student(),
      school({ admitRate: 0.3 }),
      spikeAssessment("STRONG"),
      [],
    );
    // mid50 basis: the only percent should be the base rate.
    const pcts = percentTokens(r.rationale);
    expect(pcts).toContain("30%");
    expect(pcts.length).toBe(1);
  });

  it("a real GPA distribution yields basis distribution with a computed percentile", () => {
    // Student GPA 3.9 -> only the >=3.9 bucket is NOT strictly below; buckets
    // entirely at/below 3.9 are "<3.7" (0.1) and "3.7-3.9" (0.3) -> 0.4.
    const r = estimateRealism(
      student({ gpaUnweighted: 3.9 }),
      school({ admitRate: 0.3 }),
      null,
      [gpaDistribution()],
    );
    expect(r.distributionPlacement.basis).toBe("distribution");
    expect(r.distributionPlacement.percentileOfAdmitsAtOrBelow).toBeCloseTo(0.4, 5);
    expect(r.distributionPlacement.asOfYear).toBe(2024);
    expect(r.distributionPlacement.sourceUrl).toBe("https://example.edu/cds");
    expect(r.rationale).toContain("40%");
    expect(r.rationale).toContain("2024");
  });

  it("EXCEPTIONAL spike below band at a sub-10% school => band Hard Reach BUT tailOutlook narrow_but_credible", () => {
    const below = student({ gpaUnweighted: 3.3, satTotal: 1250 });
    const r = estimateRealism(
      below,
      school({ admitRate: 0.06, gpaMid50Low: 3.8, gpaMid50High: 4.0, satMid50Low: 1500, satMid50High: 1580 }),
      spikeAssessment("EXCEPTIONAL"),
      [gpaDistribution()],
    );
    expect(r.band).toBe("Hard Reach");
    expect(r.tailOutlook).toBe("narrow_but_credible");
    expect(r.caveat).toContain(SURVIVORSHIP_NOTE.trim());
  });

  it("NATIONAL spike below band -> narrow_but_credible (weaker), spikeTierUsed recorded", () => {
    const below = student({ gpaUnweighted: 3.3, satTotal: 1250 });
    const r = estimateRealism(
      below,
      school({ admitRate: 0.06, gpaMid50Low: 3.8, gpaMid50High: 4.0, satMid50Low: 1500, satMid50High: 1580 }),
      spikeAssessment("NATIONAL"),
      [],
    );
    expect(r.band).toBe("Hard Reach");
    expect(r.tailOutlook).toBe("narrow_but_credible");
    expect(r.spikeTierUsed).toBe("NATIONAL");
  });

  it("below band with no/weak spike -> very_long", () => {
    const below = student({ gpaUnweighted: 3.3, satTotal: 1250 });
    const r = estimateRealism(
      below,
      school({ admitRate: 0.06, gpaMid50Low: 3.8, gpaMid50High: 4.0, satMid50Low: 1500, satMid50High: 1580 }),
      spikeAssessment("SOLID"),
      [],
    );
    expect(r.tailOutlook).toBe("very_long");
  });

  it("baseRate is the published admit rate, never modified", () => {
    const r = estimateRealism(student(), school({ admitRate: 0.234 }), null, []);
    expect(r.baseRate).toBe(0.234);
  });

  it("spikeTierUsed is null when there is no spike assessment", () => {
    const r = estimateRealism(student(), school(), null, []);
    expect(r.spikeTierUsed).toBeNull();
  });

  it("a high admit-rate school (0.8) with a strong above-range student reaches Likely/Safety", () => {
    const strong = student({ gpaUnweighted: 4.0, satTotal: 1600 });
    const open = school({
      admitRate: 0.8,
      gpaMid50Low: 3.0,
      gpaMid50High: 3.6,
      satMid50Low: 1100,
      satMid50High: 1300,
    });
    const r = estimateRealism(strong, open, spikeAssessment("STRONG"), []);
    expect(["Likely", "Safety"]).toContain(r.band);
  });

  it("rationale cites the base rate as a percent (one decimal for sub-10%)", () => {
    const r = estimateRealism(student(), school({ admitRate: 0.07 }), null, []);
    expect(r.rationale).toContain("7.0%");
  });

  it("academic fit moves the band: above-range beats below-range at the same school", () => {
    const sch = school({ admitRate: 0.4 });
    const above = estimateRealism(
      student({ gpaUnweighted: 4.0, satTotal: 1600 }),
      sch,
      null,
      [],
    );
    const belowRes = estimateRealism(
      student({ gpaUnweighted: 3.0, satTotal: 1100 }),
      sch,
      null,
      [],
    );
    expect(bandRank(above.band)).toBeGreaterThanOrEqual(bandRank(belowRes.band));
  });
});
