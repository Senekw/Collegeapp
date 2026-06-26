// Axis-A program enrichment retrieval (server-only — imports the Prisma client
// and the Gemini client). Cache-first, web-grounded on a miss.
//
// resolveProgramEnrichment reads the (programKey, cycleYear) cache and, on a
// miss (or force), runs the §4 TWO-STEP grounded retrieval: (1) a grounded web
// search for sourced facts, then (2) a structured extraction over that text.
// It then applies the §4.3 fallback ladder, classifies/reconciles sources per
// §1, and UPSERTs a ProgramEnrichment row. A genuine miss is stored honestly:
// confidence NONE with null figures — never a fabricated number or source.

import crypto from "node:crypto";

import type { ProgramEnrichment } from "@prisma/client";

import { getDeepModel, getGeminiApiKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  ProgramLevelSchema,
  ConfidenceSchema,
  SourceQualitySchema,
  serializeArray,
} from "@/lib/enums";
import {
  callGrounded,
  callStructured,
  GeminiConfigError,
  type GroundingSource,
} from "@/lib/gemini/client";
import {
  ProgramEnrichmentExtractSchema,
  PROGRAM_ENRICHMENT_RESPONSE_SCHEMA,
  type ProgramEnrichmentExtract,
} from "@/lib/gemini/schemas";
import {
  PROGRAM_ENRICHMENT_GROUNDED_PROMPT,
  PROGRAM_ENRICHMENT_EXTRACT_PROMPT,
} from "@/lib/gemini/prompts";

/** Cache read only — returns the row for (programKey, cycleYear) or null. */
export async function getProgramEnrichment(
  programKey: string,
  cycleYear?: number,
): Promise<ProgramEnrichment | null> {
  const year = cycleYear ?? new Date().getFullYear();
  return prisma.programEnrichment.findUnique({
    where: { programKey_cycleYear: { programKey, cycleYear: year } },
  });
}

/**
 * Resolve enrichment for a program, cache-first. Returns the cached row unless
 * `force`. On a miss, runs grounded retrieval + extraction, applies the
 * fallback ladder, and upserts. Throws GeminiConfigError when the key is
 * missing (callers catch and degrade). Other model/transport errors propagate
 * as GeminiError.
 */
export async function resolveProgramEnrichment(args: {
  programKey: string;
  displayName: string;
  category: string;
  cycleYear?: number;
  force?: boolean;
}): Promise<ProgramEnrichment | null> {
  const { programKey, displayName, category, force } = args;
  const cycleYear = args.cycleYear ?? new Date().getFullYear();

  // 1) Cache-first.
  const cached = await getProgramEnrichment(programKey, cycleYear);
  if (cached && !force) return cached;

  // 2) A grounded retrieval requires the key up front; fail fast & distinctly.
  if (!getGeminiApiKey()) {
    throw new GeminiConfigError(
      "Gemini API key is not configured. Set GEMINI_API_KEY in the environment.",
    );
  }

  const model = getDeepModel();

  // 3) Step one — grounded web search (TEXT + real sources).
  const userPrompt = JSON.stringify({
    program: displayName,
    programKey,
    category,
    requestedCycleYear: cycleYear,
    ask: "Find sourced applicant/accepted/participant/award figures, prestige, and how admissions officers regard this program. Always state the year of each figure and its source.",
  });
  const grounded = await callGrounded({
    model,
    systemPrompt: PROGRAM_ENRICHMENT_GROUNDED_PROMPT,
    userPrompt,
  });

  // 4) Step two — structured extraction over the grounded notes + real sources.
  const extract = await callStructured<ProgramEnrichmentExtract>({
    model,
    systemPrompt: PROGRAM_ENRICHMENT_EXTRACT_PROMPT,
    userPayload: {
      program: displayName,
      category,
      requestedCycleYear: cycleYear,
      groundedNotes: grounded.text,
      sourceUris: grounded.sources,
      searchQueries: grounded.searchQueries,
    },
    schema: ProgramEnrichmentExtractSchema,
    responseSchema: PROGRAM_ENRICHMENT_RESPONSE_SCHEMA,
  });

  // 5) Map the extract -> DB columns, reconciling sources against the REAL
  //    grounded URIs and applying the fallback ladder, then upsert.
  const mapped = mapExtractToColumns(extract, grounded.sources, cycleYear);

  const upserted = await prisma.programEnrichment.upsert({
    where: { programKey_cycleYear: { programKey, cycleYear } },
    update: {
      displayName,
      category,
      ...mapped,
      modelUsed: model,
    },
    create: {
      programKey,
      cycleYear,
      displayName,
      category,
      ...mapped,
      modelUsed: model,
    },
  });

  return upserted;
}

/** A reconciled source row as stored in the `sources` JSON column. */
interface StoredSource {
  url: string;
  publisher: string | null;
  year: number | null;
  quality: string; // UPPERCASE SourceQuality
}

/**
 * Turn the lowercase extract into the UPPERCASE, JSON-serialized column shape.
 * Enforces §1/§4.3: figures only survive with a real year; sources are
 * reconciled against the actual grounded URIs and graded; a genuine miss
 * (confidence none / no usable data) is stored with nulls. Never fabricates.
 */
function mapExtractToColumns(
  extract: ProgramEnrichmentExtract,
  groundedSources: GroundingSource[],
  cycleYear: number,
): {
  aliases: string;
  level: string;
  asOfYear: number;
  isFallbackYear: boolean;
  applicantCount: number | null;
  acceptedCount: number | null;
  acceptanceRate: number | null;
  participantCount: number | null;
  awardWinnerCount: number | null;
  awardLevels: string;
  notableWinners: string;
  prestigeTier: number | null;
  admissionsImpactNote: string | null;
  attendVsWinNote: string;
  sources: string;
  confidence: string;
} {
  const confidence = ConfidenceSchema.parse(extract.confidence.toUpperCase());
  const level = ProgramLevelSchema.parse(extract.level.toUpperCase());

  // Reconcile the extract's claimed sources with the REAL grounded URIs. We
  // keep the extract's quality grade + year (the model graded each), but only
  // for URLs the grounding tool actually returned, plus include any grounded
  // URI the model omitted (graded conservatively as TERTIARY) so the audit
  // trail reflects what was actually searched. Never invent a URL.
  const sources = reconcileSources(extract.sources, groundedSources);

  // §4.3 fallback ladder. The extract self-reports asOfYear/isFallbackYear; a
  // genuine miss (confidence NONE) is stored with nulls regardless.
  const genuineMiss = confidence === "NONE";

  const asOfYear = Number.isFinite(extract.asOfYear) ? extract.asOfYear : cycleYear;
  const isFallbackYear = genuineMiss ? false : extract.isFallbackYear || asOfYear < cycleYear;

  const notableWinners = extract.notableWinners.map((w) => ({
    what: w.what,
    year: w.year ?? null,
    sourceUrl: w.sourceUrl ?? null,
  }));

  return {
    aliases: serializeArray([]), // aliases are owned by normalize(); not re-derived here
    level,
    asOfYear,
    isFallbackYear,
    applicantCount: genuineMiss ? null : nullableInt(extract.applicantCount),
    acceptedCount: genuineMiss ? null : nullableInt(extract.acceptedCount),
    acceptanceRate: genuineMiss ? null : nullableRate(extract.acceptanceRate),
    participantCount: genuineMiss ? null : nullableInt(extract.participantCount),
    awardWinnerCount: genuineMiss ? null : nullableInt(extract.awardWinnerCount),
    awardLevels: serializeArray(genuineMiss ? [] : extract.awardLevels),
    notableWinners: JSON.stringify(genuineMiss ? [] : notableWinners),
    prestigeTier: genuineMiss ? null : nullablePrestige(extract.prestigeTier),
    admissionsImpactNote: extract.admissionsImpactNote ?? null,
    attendVsWinNote: extract.attendVsWinNote,
    sources: JSON.stringify(sources),
    confidence,
  };
}

/**
 * Keep only sources whose URL the grounding tool actually returned, carrying
 * the model's quality grade + year. Append any grounded URI the model did not
 * cite (graded TERTIARY) so the row records every URL truly consulted. A
 * single TERTIARY is harmless here; the confidence gating already happened in
 * extraction (§4.2 rule 4). Never adds a URL that wasn't grounded.
 */
function reconcileSources(
  extractSources: ProgramEnrichmentExtract["sources"],
  groundedSources: GroundingSource[],
): StoredSource[] {
  const groundedUris = new Set(groundedSources.map((s) => s.uri));
  const out: StoredSource[] = [];
  const seen = new Set<string>();

  for (const s of extractSources) {
    const url = s.url.trim();
    if (url.length === 0) continue;
    if (!groundedUris.has(url)) continue; // never keep an un-grounded (possibly invented) URL
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      publisher: s.publisher ?? null,
      year: s.year ?? null,
      quality: SourceQualitySchema.parse(s.quality.toUpperCase()),
    });
  }

  // Record any grounded URI the model didn't explicitly cite.
  for (const g of groundedSources) {
    if (seen.has(g.uri)) continue;
    seen.add(g.uri);
    out.push({ url: g.uri, publisher: g.title, year: null, quality: "TERTIARY" });
  }

  return out;
}

function nullableInt(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
}
function nullableRate(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  // Acceptance rate is a 0..1 fraction; clamp defensively, never invent.
  return Math.min(1, Math.max(0, v));
}
function nullablePrestige(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const t = Math.trunc(v);
  return t >= 1 && t <= 5 ? t : null;
}

/**
 * Stable SHA-256 over the CONTENT fields of an enrichment row that affect
 * scoring. Feeds the score cache key so a re-enrichment that changes a
 * scoring-relevant figure invalidates cached scores, while cosmetic changes
 * (enrichedAt, modelUsed, displayName) do not. A null enrichment hashes to a
 * single constant so "no enrichment" is a stable, distinct cache state.
 */
export function enrichmentContentHash(p: ProgramEnrichment | null): string {
  if (p === null) return sha256(JSON.stringify({ enrichment: null }));

  // Canonical, stable key order over ONLY the scoring-relevant content fields.
  const canonical = {
    acceptanceRate: p.acceptanceRate,
    acceptedCount: p.acceptedCount,
    applicantCount: p.applicantCount,
    asOfYear: p.asOfYear,
    attendVsWinNote: p.attendVsWinNote,
    awardWinnerCount: p.awardWinnerCount,
    confidence: p.confidence,
    isFallbackYear: p.isFallbackYear,
    level: p.level,
    participantCount: p.participantCount,
    prestigeTier: p.prestigeTier,
  };
  return sha256(JSON.stringify(canonical));
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
