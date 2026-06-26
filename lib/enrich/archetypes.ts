// Anonymized admit-archetype refresh (server-only — Prisma + Gemini).
//
// Archetypes are mostly SEEDED by another slice; this is the REFRESH path that
// re-grounds a single archetype's pattern from public, documented admissions
// data. §1.6 is absolute: archetypes are de-identified PATTERNS — never a named
// private individual (especially a minor). Same §4 two-step grounded flow.

import type { AdmitArchetype } from "@prisma/client";

import { getDeepModel, getGeminiApiKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  ConfidenceSchema,
  SpikeTierSchema,
  SourceQualitySchema,
} from "@/lib/enums";
import {
  callGrounded,
  callStructured,
  GeminiConfigError,
  type GroundingSource,
} from "@/lib/gemini/client";
import {
  ArchetypeExtractSchema,
  ARCHETYPE_RESPONSE_SCHEMA,
  type ArchetypeExtract,
} from "@/lib/gemini/schemas";
import {
  ARCHETYPE_GROUNDED_PROMPT,
  ARCHETYPE_EXTRACT_PROMPT,
} from "@/lib/gemini/prompts";

/** Cache read only — all curated/refreshed archetypes (calibration anchors). */
export async function listArchetypes(): Promise<AdmitArchetype[]> {
  return prisma.admitArchetype.findMany({ orderBy: { archetypeKey: "asc" } });
}

/**
 * Refresh (or create) a single archetype by key from grounded public data and
 * upsert it. `hint` steers the grounded search toward the intended pattern.
 * Cache-first on the key unless `force`. Throws GeminiConfigError when the key
 * is missing.
 */
export async function refreshArchetype(args: {
  archetypeKey: string;
  label: string;
  hint: string;
  force?: boolean;
}): Promise<AdmitArchetype | null> {
  const { archetypeKey, label, hint, force } = args;

  // 1) Cache-first.
  const cached = await prisma.admitArchetype.findUnique({ where: { archetypeKey } });
  if (cached && !force) return cached;

  if (!getGeminiApiKey()) {
    throw new GeminiConfigError(
      "Gemini API key is not configured. Set GEMINI_API_KEY in the environment.",
    );
  }

  const model = getDeepModel();

  // 2) Grounded search for the documented PATTERN (no individuals).
  const grounded = await callGrounded({
    model,
    systemPrompt: ARCHETYPE_GROUNDED_PROMPT,
    userPrompt: JSON.stringify({
      archetypeLabel: label,
      patternHint: hint,
      ask: "Describe the de-identified admit pattern: typical stat band, spike signature, hedged outcome class, with sources. NEVER name a private individual.",
    }),
  });

  // 3) Structured extraction over the grounded notes + real sources.
  const extract = await callStructured<ArchetypeExtract>({
    model,
    systemPrompt: ARCHETYPE_EXTRACT_PROMPT,
    userPayload: {
      archetypeLabel: label,
      patternHint: hint,
      groundedNotes: grounded.text,
      sourceUris: grounded.sources,
      searchQueries: grounded.searchQueries,
    },
    schema: ArchetypeExtractSchema,
    responseSchema: ARCHETYPE_RESPONSE_SCHEMA,
  });

  const mapped = mapExtractToColumns(extract, grounded.sources, label);

  const upserted = await prisma.admitArchetype.upsert({
    where: { archetypeKey },
    update: mapped,
    create: { archetypeKey, ...mapped },
  });

  return upserted;
}

interface StoredSource {
  url: string;
  publisher: string | null;
  year: number | null;
  quality: string; // UPPERCASE
}

/** Map the lowercase extract -> UPPERCASE, JSON-serialized columns. */
function mapExtractToColumns(
  extract: ArchetypeExtract,
  groundedSources: GroundingSource[],
  fallbackLabel: string,
): {
  label: string;
  description: string;
  statBand: string;
  spikeSignature: string;
  tier: string;
  exampleOutcomes: string;
  sources: string;
  confidence: string;
  asOfYear: number | null;
} {
  const confidence = ConfidenceSchema.parse(extract.confidence.toUpperCase());
  const tier = SpikeTierSchema.parse(extract.tier.toUpperCase());
  const label = extract.label.trim().length > 0 ? extract.label.trim() : fallbackLabel;

  // spikeSignature is the dimension profile that defines the archetype.
  const spikeSignature = {
    peak: clamp010(extract.spikeSignature.peak),
    concentration: clamp010(extract.spikeSignature.concentration),
    trajectory: clamp010(extract.spikeSignature.trajectory),
    originality: clamp010(extract.spikeSignature.originality),
    note: extract.spikeSignature.note,
  };

  return {
    label,
    description: extract.description,
    statBand: extract.statBand,
    spikeSignature: JSON.stringify(spikeSignature),
    tier,
    exampleOutcomes: extract.exampleOutcomes,
    sources: JSON.stringify(reconcileSources(extract.sources, groundedSources)),
    confidence,
    asOfYear: typeof extract.asOfYear === "number" && Number.isFinite(extract.asOfYear)
      ? Math.trunc(extract.asOfYear)
      : null,
  };
}

function clamp010(v: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.min(10, Math.max(0, Math.trunc(v)));
}

/** Keep only grounded source URLs; append uncited grounded URIs as TERTIARY. */
function reconcileSources(
  extractSources: ArchetypeExtract["sources"],
  groundedSources: GroundingSource[],
): StoredSource[] {
  const groundedUris = new Set(groundedSources.map((s) => s.uri));
  const out: StoredSource[] = [];
  const seen = new Set<string>();

  for (const s of extractSources) {
    const url = s.url.trim();
    if (url.length === 0 || !groundedUris.has(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      publisher: s.publisher ?? null,
      year: s.year ?? null,
      quality: SourceQualitySchema.parse(s.quality.toUpperCase()),
    });
  }
  for (const g of groundedSources) {
    if (seen.has(g.uri)) continue;
    seen.add(g.uri);
    out.push({ url: g.uri, publisher: g.title, year: null, quality: "TERTIARY" });
  }
  return out;
}
