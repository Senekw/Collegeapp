// Axis-A admit-stat distribution retrieval (server-only — Prisma + Gemini).
//
// resolveDistributionForSchool fetches the DISTRIBUTION of an admitted class's
// academic stats (GPA / SAT / ACT / class rank) for a school, cache-first, and
// upserts an AdmitDistribution row. Same §4 two-step grounded pattern as
// program enrichment: grounded web search, then structured extraction over the
// grounded text. Buckets and sources come straight from the data — never
// invented; a genuine miss is stored as confidence NONE with empty buckets.

import type { AdmitDistribution } from "@prisma/client";

import { getDeepModel } from "@/lib/constants";
import { resolveGeminiApiKey } from "@/lib/settings";
import { prisma } from "@/lib/db";
import {
  ConfidenceSchema,
  StatTypeSchema,
  SourceQualitySchema,
  type StatType,
} from "@/lib/enums";
import {
  callGrounded,
  callStructured,
  GeminiConfigError,
  type GroundingSource,
} from "@/lib/gemini/client";
import {
  AdmitDistributionExtractSchema,
  ADMIT_DISTRIBUTION_RESPONSE_SCHEMA,
  type AdmitDistributionExtract,
} from "@/lib/gemini/schemas";
import {
  DISTRIBUTION_GROUNDED_PROMPT,
  DISTRIBUTION_EXTRACT_PROMPT,
} from "@/lib/gemini/prompts";

/** Cache read only — every stored distribution row for a school. */
export async function getDistributionsForSchool(
  schoolId: string,
): Promise<AdmitDistribution[]> {
  return prisma.admitDistribution.findMany({
    where: { schoolId },
    orderBy: [{ statType: "asc" }, { asOfYear: "desc" }],
  });
}

/**
 * Resolve one (school, statType) distribution, cache-first. The cache key is
 * (schoolId, statType, asOfYear); since the precise published year is unknown
 * until extraction, we first look for ANY recent row of this stat type and
 * return it unless `force`. On a miss, runs grounded retrieval + extraction and
 * upserts keyed on the extracted asOfYear. Throws GeminiConfigError when the
 * key is missing.
 */
export async function resolveDistributionForSchool(args: {
  schoolId: string;
  schoolName: string;
  statType: "GPA" | "SAT" | "ACT" | "CLASS_RANK";
  asOfYear?: number;
  force?: boolean;
}): Promise<AdmitDistribution | null> {
  const { schoolId, schoolName, statType, force } = args;
  const requestedYear = args.asOfYear ?? new Date().getFullYear();

  // 1) Cache-first. If a specific asOfYear was requested, honor it exactly;
  //    otherwise return the most recent stored row for this stat type.
  if (args.asOfYear !== undefined) {
    const exact = await prisma.admitDistribution.findUnique({
      where: {
        schoolId_statType_asOfYear: { schoolId, statType, asOfYear: args.asOfYear },
      },
    });
    if (exact && !force) return exact;
  } else {
    const recent = await prisma.admitDistribution.findFirst({
      where: { schoolId, statType },
      orderBy: { asOfYear: "desc" },
    });
    if (recent && !force) return recent;
  }

  if (!(await resolveGeminiApiKey())) {
    throw new GeminiConfigError(
      "Gemini API key is not configured. Set GEMINI_API_KEY in the environment.",
    );
  }

  const model = getDeepModel();

  // 2) Grounded web search for the distribution.
  const grounded = await callGrounded({
    model,
    systemPrompt: DISTRIBUTION_GROUNDED_PROMPT,
    userPrompt: JSON.stringify({
      school: schoolName,
      statType,
      requestedYear,
      ask: "Find the distribution of admitted (or enrolled) students across bands for this stat, e.g. from the Common Data Set. State the year and source of each figure.",
    }),
  });

  // 3) Structured extraction over the grounded notes + real sources.
  const extract = await callStructured<AdmitDistributionExtract>({
    model,
    systemPrompt: DISTRIBUTION_EXTRACT_PROMPT,
    userPayload: {
      school: schoolName,
      statType,
      requestedYear,
      groundedNotes: grounded.text,
      sourceUris: grounded.sources,
      searchQueries: grounded.searchQueries,
    },
    schema: AdmitDistributionExtractSchema,
    responseSchema: ADMIT_DISTRIBUTION_RESPONSE_SCHEMA,
  });

  const mapped = mapExtractToColumns(extract, grounded.sources, statType, requestedYear);

  const upserted = await prisma.admitDistribution.upsert({
    where: {
      schoolId_statType_asOfYear: {
        schoolId,
        statType: mapped.statType,
        asOfYear: mapped.asOfYear,
      },
    },
    update: {
      buckets: mapped.buckets,
      isFallbackYear: mapped.isFallbackYear,
      sources: mapped.sources,
      confidence: mapped.confidence,
    },
    create: {
      schoolId,
      statType: mapped.statType,
      asOfYear: mapped.asOfYear,
      buckets: mapped.buckets,
      isFallbackYear: mapped.isFallbackYear,
      sources: mapped.sources,
      confidence: mapped.confidence,
    },
  });

  return upserted;
}

interface StoredSource {
  url: string;
  publisher: string | null;
  year: number | null;
  quality: string; // UPPERCASE
}

/** Map the lowercase extract -> UPPERCASE, JSON-serialized columns. Buckets and
 *  sources are never invented; a genuine miss yields empty buckets + NONE. */
function mapExtractToColumns(
  extract: AdmitDistributionExtract,
  groundedSources: GroundingSource[],
  requestedStatType: StatType,
  requestedYear: number,
): {
  statType: StatType;
  asOfYear: number;
  isFallbackYear: boolean;
  buckets: string;
  sources: string;
  confidence: string;
} {
  const confidence = ConfidenceSchema.parse(extract.confidence.toUpperCase());
  // The model echoes statType; trust the requested one as the cache key anchor
  // if they disagree (we asked for exactly this stat).
  const statType = StatTypeSchema.safeParse(extract.statType).success
    ? StatTypeSchema.parse(extract.statType)
    : requestedStatType;

  const genuineMiss = confidence === "NONE";
  const asOfYear = Number.isFinite(extract.asOfYear) ? extract.asOfYear : requestedYear;
  const isFallbackYear = genuineMiss ? false : extract.isFallbackYear || asOfYear < requestedYear;

  // Buckets: keep only well-formed rows with a 0..1 fraction; never fabricate.
  const buckets = genuineMiss
    ? []
    : extract.buckets
        .filter(
          (b) =>
            typeof b.pctOfAdmits === "number" &&
            Number.isFinite(b.pctOfAdmits) &&
            b.rangeLabel.trim().length > 0,
        )
        .map((b) => ({
          rangeLabel: b.rangeLabel.trim(),
          pctOfAdmits: Math.min(1, Math.max(0, b.pctOfAdmits)),
        }));

  return {
    statType,
    asOfYear,
    isFallbackYear,
    buckets: JSON.stringify(buckets),
    sources: JSON.stringify(reconcileSources(extract.sources, groundedSources)),
    confidence,
  };
}

/** Keep only sources whose URL was actually grounded; append uncited grounded
 *  URIs as TERTIARY. Never adds an un-grounded URL. */
function reconcileSources(
  extractSources: AdmitDistributionExtract["sources"],
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
