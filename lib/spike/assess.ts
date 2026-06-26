/**
 * Spike assessment service (§7.4) — server-only.
 *
 * Loads the student's activities + scores, runs the pure deterministic core,
 * gates the tier against anonymized admit archetypes via the calibration LLM,
 * and persists a fully-auditable SpikeAssessment row (1:1 with the student).
 *
 * Caching: an inputHash over the scored activity inputs + ARCHETYPE_SET_VERSION
 * + SPIKE_VERSION. A fresh row with the same hash short-circuits the model call
 * unless `force` is set. On missing API key / calibration failure we fall back
 * to the deterministic tier and never crash.
 *
 * NOTE: server-only — imports @/lib/db and Gemini transport. Never import from a
 * client component.
 */

import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";
import { SPIKE_VERSION, ARCHETYPE_SET_VERSION } from "@/lib/constants";
import {
  SPIKE_TIER_RANGES,
  SpikeTierSchema,
  serializeArray,
  type SpikeTier,
} from "@/lib/enums";
import { toArchetypeData } from "@/lib/data";
import type { SpikeAssessmentData, ArchetypeData } from "@/lib/types";
import type { SpikeCalibrationPayload } from "@/lib/gemini/schemas";

import { computeSpikeCore, type SpikeActivityInput } from "@/lib/spike/core";
import { calibrateSpike } from "@/lib/spike/calibrate";

// This slice is allowed to depend on the enrichment slice's archetype listing.
// It will exist at integration time.
import { listArchetypes } from "@/lib/enrich/archetypes";

/** Map a raw 0..100 spike index onto its tier via the §7.2 band ranges. */
export function deterministicTier(spikeIndex: number): SpikeTier {
  const idx = clampIndex(spikeIndex);
  for (const band of SPIKE_TIER_RANGES) {
    if (idx >= band.min && idx <= band.max) return band.tier;
  }
  // Defensive: ranges cover 0..100, but guard anyway.
  return idx >= 90 ? "EXCEPTIONAL" : "EMERGING";
}

export async function assessSpike(
  studentId: string,
  opts?: { force?: boolean },
): Promise<SpikeAssessmentData> {
  const force = opts?.force ?? false;

  // --- Load activities + scores ---
  const activities = await prisma.activity.findMany({
    where: { studentId },
    include: { score: true },
    orderBy: { updatedAt: "asc" },
  });

  const inputs: SpikeActivityInput[] = activities.map((a) => ({
    id: a.id,
    title: a.title,
    category: a.category,
    spikeTheme: a.spikeTheme,
    startYear: a.startDate ? a.startDate.getUTCFullYear() : null,
    score: a.score
      ? {
          tier: a.score.tier,
          impact: a.score.impact,
          originality: a.score.originality,
          initiative: a.score.initiative,
          depth: a.score.depth,
          selectivity: a.score.selectivity,
          spikeAlignment: a.score.spikeAlignment,
          creditMultiplier: a.score.creditMultiplier,
        }
      : null,
  }));

  const core = computeSpikeCore(inputs);
  const spikeIndex = clampIndex(core.rawSpikeIndex);
  const detTier = deterministicTier(spikeIndex);

  const inputHash = computeInputHash(inputs);

  // --- Cache check ---
  const existing = await prisma.spikeAssessment.findUnique({ where: { studentId } });
  if (
    existing &&
    !force &&
    existing.inputHash === inputHash &&
    existing.spikeVersion === SPIKE_VERSION
  ) {
    return rowToData(existing);
  }

  // --- Load archetypes for calibration ---
  let archetypes: ArchetypeData[] = [];
  try {
    const rows = await listArchetypes();
    archetypes = rows.map(toArchetypeData);
  } catch {
    archetypes = [];
  }

  // --- Calibrate (or fall back to deterministic tier) ---
  let tier: SpikeTier = detTier;
  let rarityAnchor: string | null = null;
  let gapToNextTier = defaultGap(detTier);
  let calibrationRationale: string | null = null;
  let calibrationFailed = false;

  if (archetypes.length > 0) {
    const payload = buildCalibrationPayload(core, spikeIndex, detTier, inputs, archetypes);
    try {
      const result = await calibrateSpike(payload);
      tier = SpikeTierSchema.catch(detTier).parse(result.tier);
      rarityAnchor = result.rarityAnchor;
      gapToNextTier = result.gapToNextTier;
      calibrationRationale = result.rationale;
    } catch {
      // Missing API key / calibration failure -> deterministic tier, don't crash.
      calibrationFailed = true;
      tier = detTier;
      rarityAnchor = null;
      gapToNextTier = defaultGap(detTier);
    }
  }

  // --- Full audit breakdown ---
  const breakdown = {
    inputs: inputs.map((a) => ({
      id: a.id,
      title: a.title,
      theme: a.spikeTheme ?? a.category,
      startYear: a.startYear,
      signal: core.perActivitySignal[a.id] ?? 0,
      creditMultiplier: a.score?.creditMultiplier ?? null,
      scored: a.score !== null,
    })),
    weights: { peak: 0.4, concentration: 0.2, trajectory: 0.2, originality: 0.2 },
    math: {
      components: core.components,
      rawSpikeIndex: core.rawSpikeIndex,
      spikeIndex,
      formula:
        "round(100 * (0.4*peak + 0.2*concentration + 0.2*trajectory + 0.2*originality) / 10)",
    },
    deterministicTier: detTier,
    calibration: {
      used: archetypes.length > 0 && !calibrationFailed,
      failed: calibrationFailed,
      tier,
      rarityAnchor,
      gapToNextTier,
      rationale: calibrationRationale,
    },
    anchor: rarityAnchor,
    versions: {
      spikeVersion: SPIKE_VERSION,
      archetypeSetVersion: ARCHETYPE_SET_VERSION,
    },
  };

  const data = {
    spikeIndex,
    tier,
    dominantTheme: core.dominantTheme,
    peakActivityIds: core.peakActivityIds,
    components: core.components,
    rarityAnchor,
    gapToNextTier,
  } satisfies SpikeAssessmentData;

  // --- Upsert ---
  const peakIdsJson = serializeArray(core.peakActivityIds);
  const componentsJson = JSON.stringify(core.components);
  const breakdownJson = JSON.stringify(breakdown);

  await prisma.spikeAssessment.upsert({
    where: { studentId },
    create: {
      studentId,
      spikeIndex,
      tier,
      dominantTheme: core.dominantTheme,
      peakActivityIds: peakIdsJson,
      components: componentsJson,
      rarityAnchor,
      gapToNextTier,
      breakdown: breakdownJson,
      inputHash,
      spikeVersion: SPIKE_VERSION,
    },
    update: {
      spikeIndex,
      tier,
      dominantTheme: core.dominantTheme,
      peakActivityIds: peakIdsJson,
      components: componentsJson,
      rarityAnchor,
      gapToNextTier,
      breakdown: breakdownJson,
      inputHash,
      spikeVersion: SPIKE_VERSION,
      computedAt: new Date(),
    },
  });

  return data;
}

// ---------------------------------------------------------------------------

function buildCalibrationPayload(
  core: ReturnType<typeof computeSpikeCore>,
  spikeIndex: number,
  computedTier: SpikeTier,
  inputs: SpikeActivityInput[],
  archetypes: ArchetypeData[],
): SpikeCalibrationPayload {
  const byId = new Map(inputs.map((a) => [a.id, a]));
  const peakActivities = core.peakActivityIds.map((id) => {
    const a = byId.get(id);
    return {
      title: a?.title ?? id,
      theme: a ? (a.spikeTheme ?? a.category) : null,
      signal: core.perActivitySignal[id] ?? 0,
      creditMultiplier: a?.score?.creditMultiplier ?? 0,
    };
  });

  return {
    components: core.components,
    dominantTheme: core.dominantTheme,
    spikeIndex,
    computedTier,
    peakActivities,
    archetypes: archetypes.map((a) => ({
      archetypeKey: a.archetypeKey,
      label: a.label,
      tier: a.tier,
      statBand: a.statBand,
      description: a.description,
      spikeSignature: JSON.stringify(a.spikeSignature),
    })),
  };
}

function rowToData(row: {
  spikeIndex: number;
  tier: string;
  dominantTheme: string;
  peakActivityIds: string;
  components: string;
  rarityAnchor: string | null;
  gapToNextTier: string;
}): SpikeAssessmentData {
  return {
    spikeIndex: clampIndex(row.spikeIndex),
    tier: SpikeTierSchema.catch("EMERGING").parse(row.tier),
    dominantTheme: row.dominantTheme,
    peakActivityIds: parsePeakIds(row.peakActivityIds),
    components: parseComponents(row.components),
    rarityAnchor: row.rarityAnchor,
    gapToNextTier: row.gapToNextTier,
  };
}

function parsePeakIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    /* fall through */
  }
  return [];
}

function parseComponents(raw: string): SpikeAssessmentData["components"] {
  const fallback = { peak: 0, concentration: 0, trajectory: 0, originality: 0 };
  try {
    const p: unknown = JSON.parse(raw);
    if (p && typeof p === "object") {
      const o = p as Record<string, unknown>;
      return {
        peak: num(o.peak),
        concentration: num(o.concentration),
        trajectory: num(o.trajectory),
        originality: num(o.originality),
      };
    }
  } catch {
    /* fall through */
  }
  return fallback;
}

function num(v: unknown): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}

/**
 * Stable SHA-256 over the scored inputs (excluding volatile fields) plus the
 * archetype-set + spike versions. Order-independent: inputs sorted by id.
 */
function computeInputHash(inputs: SpikeActivityInput[]): string {
  const normalized = inputs
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((a) => ({
      id: a.id,
      category: a.category,
      spikeTheme: a.spikeTheme,
      startYear: a.startYear,
      score: a.score,
    }));
  const payload = JSON.stringify({
    activities: normalized,
    archetypeSetVersion: ARCHETYPE_SET_VERSION,
    spikeVersion: SPIKE_VERSION,
  });
  return createHash("sha256").update(payload).digest("hex");
}

function defaultGap(tier: SpikeTier): string {
  switch (tier) {
    case "EXCEPTIONAL":
      return "At the top tier — sustain and document the spike's verifiable impact.";
    case "NATIONAL":
      return "Reach Exceptional by adding a singular, externally-verified original accomplishment at large scale.";
    case "STRONG":
      return "Reach National by winning or producing at a recognized national level within your theme.";
    case "SOLID":
      return "Reach Strong by deepening one theme into a sustained, escalating body of work.";
    case "EMERGING":
    default:
      return "Reach Solid by concentrating effort into a single theme and producing tangible output.";
  }
}

function clampIndex(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}
