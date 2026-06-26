import { describe, it, expect } from "vitest";
import { computeSpikeCore, type SpikeActivityInput } from "@/lib/spike/core";

function mkScore(
  over: Partial<NonNullable<SpikeActivityInput["score"]>> = {},
): NonNullable<SpikeActivityInput["score"]> {
  return {
    tier: 1,
    impact: 5,
    originality: 5,
    initiative: 5,
    depth: 5,
    selectivity: 5,
    spikeAlignment: 5,
    creditMultiplier: 1,
    ...over,
  };
}

function mkActivity(over: Partial<SpikeActivityInput> = {}): SpikeActivityInput {
  return {
    id: over.id ?? "a",
    title: over.title ?? "Activity",
    category: over.category ?? "RESEARCH",
    spikeTheme: over.spikeTheme ?? null,
    startYear: over.startYear ?? null,
    score: over.score === undefined ? mkScore() : over.score,
  };
}

describe("computeSpikeCore", () => {
  it("empty input -> all-zero result", () => {
    const r = computeSpikeCore([]);
    expect(r.components).toEqual({
      peak: 0,
      concentration: 0,
      trajectory: 0,
      originality: 0,
    });
    expect(r.dominantTheme).toBe("");
    expect(r.peakActivityIds).toEqual([]);
    expect(r.rawSpikeIndex).toBe(0);
    expect(r.perActivitySignal).toEqual({});
  });

  it("unscored activities contribute 0 and are excluded", () => {
    const r = computeSpikeCore([
      mkActivity({ id: "scored", spikeTheme: "AI", score: mkScore({ impact: 10, selectivity: 10 }) }),
      mkActivity({ id: "unscored", spikeTheme: "Music", score: null }),
    ]);
    expect(r.perActivitySignal["unscored"]).toBe(0);
    expect(r.dominantTheme).toBe("AI"); // music theme has zero signal -> excluded
    // full concentration: all signal is in the single scored theme
    expect(r.components.concentration).toBe(10);
  });

  it("a single towering peak with thin breadth yields HIGH peak + HIGH concentration (narrowness not penalized)", () => {
    const r = computeSpikeCore([
      // one towering, fully-credited, in-theme accomplishment
      mkActivity({
        id: "peak",
        spikeTheme: "Robotics",
        score: mkScore({ impact: 10, selectivity: 10, originality: 10, creditMultiplier: 1 }),
      }),
      // a couple of tiny unrelated dabbles
      mkActivity({ id: "tiny1", spikeTheme: "Debate", score: mkScore({ impact: 1, selectivity: 1 }) }),
    ]);
    expect(r.dominantTheme).toBe("Robotics");
    expect(r.components.peak).toBe(10); // MAX in theme, not mean
    expect(r.components.concentration).toBeGreaterThanOrEqual(8); // narrow profile rewarded
    expect(r.peakActivityIds).toContain("peak");
  });

  it("selectivity-heavy but low-creditMultiplier activities are discounted", () => {
    const full = computeSpikeCore([
      mkActivity({ id: "x", spikeTheme: "Bio", score: mkScore({ impact: 8, selectivity: 10, creditMultiplier: 1 }) }),
    ]);
    const discounted = computeSpikeCore([
      mkActivity({ id: "x", spikeTheme: "Bio", score: mkScore({ impact: 8, selectivity: 10, creditMultiplier: 0.2 }) }),
    ]);
    // creditMultiplier scales the per-activity signal -> peak and index drop sharply.
    expect(discounted.perActivitySignal["x"]!).toBeCloseTo((full.perActivitySignal["x"]! * 0.2), 5);
    expect(discounted.components.peak).toBeLessThan(full.components.peak);
    expect(discounted.rawSpikeIndex).toBeLessThan(full.rawSpikeIndex);
  });

  it("dominantTheme = theme with the highest summed signal", () => {
    const r = computeSpikeCore([
      mkActivity({ id: "ai1", spikeTheme: "AI", score: mkScore({ impact: 6, selectivity: 6 }) }),
      mkActivity({ id: "ai2", spikeTheme: "AI", score: mkScore({ impact: 6, selectivity: 6 }) }),
      // a single bigger activity in another theme, but less total than the two AI ones combined
      mkActivity({ id: "art1", spikeTheme: "Art", score: mkScore({ impact: 7, selectivity: 7 }) }),
    ]);
    expect(r.dominantTheme).toBe("AI"); // 6+6 = 12 > 7
  });

  it("falls back to category when spikeTheme is null/blank", () => {
    const r = computeSpikeCore([
      mkActivity({ id: "a", category: "ENTREPRENEURSHIP", spikeTheme: null, score: mkScore({ impact: 8, selectivity: 8 }) }),
      mkActivity({ id: "b", category: "ENTREPRENEURSHIP", spikeTheme: "  ", score: mkScore({ impact: 8, selectivity: 8 }) }),
    ]);
    expect(r.dominantTheme).toBe("ENTREPRENEURSHIP");
    expect(r.components.concentration).toBe(10);
  });

  it("weighted-index formula matches 100*(0.4*peak+0.2*conc+0.2*traj+0.2*orig)/10", () => {
    const r = computeSpikeCore([
      mkActivity({ id: "a", spikeTheme: "T", startYear: 2022, score: mkScore({ impact: 8, selectivity: 8, originality: 6 }) }),
      mkActivity({ id: "b", spikeTheme: "T", startYear: 2024, score: mkScore({ impact: 9, selectivity: 9, originality: 7 }) }),
    ]);
    const c = r.components;
    const expected = Math.round(
      (100 * (0.4 * c.peak + 0.2 * c.concentration + 0.2 * c.trajectory + 0.2 * c.originality)) / 10,
    );
    expect(r.rawSpikeIndex).toBe(expected);
  });

  it("escalating signal across years lifts trajectory above a flat single-year profile", () => {
    const escalating = computeSpikeCore([
      mkActivity({ id: "a", spikeTheme: "T", startYear: 2022, score: mkScore({ impact: 4, selectivity: 4 }) }),
      mkActivity({ id: "b", spikeTheme: "T", startYear: 2024, score: mkScore({ impact: 9, selectivity: 9 }) }),
    ]);
    const flatSingle = computeSpikeCore([
      mkActivity({ id: "a", spikeTheme: "T", startYear: 2022, score: mkScore({ impact: 9, selectivity: 9 }) }),
    ]);
    expect(escalating.components.trajectory).toBeGreaterThan(0);
    expect(flatSingle.components.trajectory).toBeGreaterThan(0);
  });

  it("rawSpikeIndex is clamped 0..100", () => {
    const r = computeSpikeCore([
      mkActivity({ id: "a", spikeTheme: "T", startYear: 2022, score: mkScore({ impact: 10, selectivity: 10, originality: 10 }) }),
      mkActivity({ id: "b", spikeTheme: "T", startYear: 2024, score: mkScore({ impact: 10, selectivity: 10, originality: 10 }) }),
    ]);
    expect(r.rawSpikeIndex).toBeGreaterThanOrEqual(0);
    expect(r.rawSpikeIndex).toBeLessThanOrEqual(100);
  });
});
