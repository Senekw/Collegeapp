// Program-name normalization (server-only by convention — the model fallback
// uses the Gemini client; the rules-first path is pure and safe to call from
// any server context, including the activity SAVE path which stays API-free).
//
// normalizeProgram turns a raw, user-typed program/competition/conference name
// into a stable canonical programKey (+ display name + aliases). It is
// RULES-FIRST: a built-in alias map covers ~well-known programs, and a
// deterministic slugifier handles everything else. The optional low-temp model
// proposal only fires when explicitly opted into AND the rules miss — so the
// default (allowModel=false) never touches the network.

import { z } from "zod";

import { getFastModel } from "@/lib/constants";
import { callStructured, GeminiConfigError } from "@/lib/gemini/client";
import { zodToGeminiSchema } from "@/lib/gemini/schemas";

export interface NormalizedProgram {
  programKey: string;
  displayName: string;
  aliases: string[];
}

/**
 * Canonical entry for a well-known program. `aliases` are the human-facing
 * variants; `match` are the normalized forms we compare an incoming raw name
 * against (always lowercase, slugified) so spelling/spacing/casing differences
 * still resolve to the same key.
 */
interface AliasEntry {
  programKey: string;
  displayName: string;
  aliases: string[];
}

const ALIAS_MAP: AliasEntry[] = [
  {
    programKey: "yc-startup-school",
    displayName: "Y Combinator Startup School",
    aliases: ["YC Startup School", "Startup School", "Y Combinator Startup School"],
  },
  {
    programKey: "hosa-ilc",
    displayName: "HOSA International Leadership Conference",
    aliases: ["HOSA ILC", "HOSA International Leadership Conference", "HOSA ILC Conference"],
  },
  {
    programKey: "rsi",
    displayName: "Research Science Institute (RSI)",
    aliases: ["RSI", "Research Science Institute", "MIT RSI"],
  },
  {
    programKey: "isef",
    displayName: "Regeneron International Science and Engineering Fair (ISEF)",
    aliases: [
      "ISEF",
      "Regeneron ISEF",
      "International Science and Engineering Fair",
      "Intel ISEF",
    ],
  },
  {
    programKey: "regeneron-sts",
    displayName: "Regeneron Science Talent Search (STS)",
    aliases: [
      "Regeneron STS",
      "Science Talent Search",
      "Regeneron Science Talent Search",
      "Intel STS",
      "STS",
    ],
  },
  {
    programKey: "usamo",
    displayName: "USA Mathematical Olympiad (USAMO)",
    aliases: ["USAMO", "USA Mathematical Olympiad", "USA Math Olympiad"],
  },
  {
    programKey: "aime",
    displayName: "American Invitational Mathematics Examination (AIME)",
    aliases: ["AIME", "American Invitational Mathematics Examination"],
  },
  {
    programKey: "mit-primes",
    displayName: "MIT PRIMES",
    aliases: ["MIT PRIMES", "PRIMES", "MIT Program for Research in Mathematics"],
  },
  {
    programKey: "ssp",
    displayName: "Summer Science Program (SSP)",
    aliases: ["SSP", "Summer Science Program"],
  },
  {
    programKey: "tasp",
    displayName: "Telluride Association Summer Seminar (TASS)",
    aliases: ["TASP", "TASS", "Telluride Association Summer Program", "Telluride Association Summer Seminar"],
  },
  {
    programKey: "deca-icdc",
    displayName: "DECA International Career Development Conference (ICDC)",
    aliases: ["DECA ICDC", "DECA International Career Development Conference", "ICDC"],
  },
  {
    programKey: "fbla-nlc",
    displayName: "FBLA National Leadership Conference (NLC)",
    aliases: ["FBLA NLC", "FBLA National Leadership Conference", "FBLA Nationals"],
  },
  {
    programKey: "congressional-app-challenge",
    displayName: "Congressional App Challenge",
    aliases: ["Congressional App Challenge", "CAC"],
  },
  {
    programKey: "first-robotics",
    displayName: "FIRST Robotics Competition (FRC)",
    aliases: ["FIRST Robotics", "FRC", "FIRST Robotics Competition"],
  },
];

/**
 * Deterministic slugifier: lowercase, strip punctuation, collapse whitespace to
 * single hyphens. Used both to build the alias lookup index AND as the fallback
 * key when no alias matches. Never returns an empty string for non-empty input
 * (falls back to "program").
 */
function slugify(raw: string): string {
  const slug = raw
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’`]/g, "") // drop apostrophes so "o'brien" -> "obrien"
    .replace(/[^a-z0-9]+/g, "-") // every other run of non-alnum -> hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
  return slug.length > 0 ? slug : "program";
}

/** Prebuilt index from slugified alias -> entry, for O(1) rules lookup. */
const ALIAS_INDEX: Map<string, AliasEntry> = (() => {
  const index = new Map<string, AliasEntry>();
  for (const entry of ALIAS_MAP) {
    index.set(slugify(entry.programKey), entry);
    for (const alias of entry.aliases) {
      index.set(slugify(alias), entry);
    }
  }
  return index;
})();

// Inline schema for the optional low-temp model proposal. Defined here (not in
// the shared contract) because it is private to this module's fallback path.
const ModelNormalizeSchema = z.object({
  programKey: z.string(),
  displayName: z.string(),
  aliases: z.array(z.string()),
});
type ModelNormalize = z.infer<typeof ModelNormalizeSchema>;
const MODEL_NORMALIZE_RESPONSE_SCHEMA = zodToGeminiSchema(ModelNormalizeSchema);

const MODEL_NORMALIZE_SYSTEM_PROMPT = `You normalize the name of a high-school extracurricular program, competition, or conference into a stable canonical identifier. Return JSON with: programKey (lowercase, hyphenated slug — letters/digits/hyphens only, the kind of stable key you'd reuse across cycles, e.g. "yc-startup-school"), displayName (the program's clean official name), and aliases (other common ways students refer to it, including acronyms and the raw input). Be conservative: if you are unsure what the program is, base the key on a slug of the given name rather than guessing at an unrelated organization. Do not invent a program that does not exist. Output ONLY JSON matching the schema.`;

/**
 * Normalize a raw program name to a canonical { programKey, displayName,
 * aliases }.
 *
 * RULES-FIRST: an alias map (well-known programs) wins; otherwise a
 * deterministic slug is used. The model is only consulted when
 * opts.allowModel === true AND the rules produced only the slug fallback — this
 * keeps the activity SAVE path API-free by default (allowModel defaults false).
 */
export async function normalizeProgram(
  raw: string,
  opts?: { allowModel?: boolean },
): Promise<NormalizedProgram> {
  const trimmed = raw.trim();
  const fallbackName = trimmed.length > 0 ? trimmed : "Program";
  const slug = slugify(fallbackName);

  // 1) Rules: exact alias / key match on the slugified form.
  const hit = ALIAS_INDEX.get(slug);
  if (hit) {
    return {
      programKey: hit.programKey,
      displayName: hit.displayName,
      // Include the raw input in aliases if it's a new variant.
      aliases: dedupeAliases(hit.aliases, fallbackName),
    };
  }

  // 2) Deterministic slug fallback (default path — no network).
  const slugResult: NormalizedProgram = {
    programKey: slug,
    displayName: fallbackName,
    aliases: [fallbackName],
  };

  if (opts?.allowModel !== true) {
    return slugResult;
  }

  // 3) Opt-in model proposal. Low temp, fast model. On any failure (config or
  //    transport) fall back to the deterministic slug — normalization must
  //    never throw and block a save.
  try {
    const proposal = await callStructured<ModelNormalize>({
      model: getFastModel(),
      systemPrompt: MODEL_NORMALIZE_SYSTEM_PROMPT,
      userPayload: { rawName: fallbackName, slugFallback: slug },
      schema: ModelNormalizeSchema,
      responseSchema: MODEL_NORMALIZE_RESPONSE_SCHEMA,
    });
    const proposedKey = slugify(proposal.programKey);
    const displayName =
      proposal.displayName.trim().length > 0 ? proposal.displayName.trim() : fallbackName;
    return {
      programKey: proposedKey.length > 0 ? proposedKey : slug,
      displayName,
      aliases: dedupeAliases(proposal.aliases, fallbackName, displayName),
    };
  } catch (err) {
    if (err instanceof GeminiConfigError) return slugResult;
    return slugResult;
  }
}

/** Merge alias lists, trim, drop empties, and de-duplicate case-insensitively
 *  while preserving first-seen order. */
function dedupeAliases(...groups: (string[] | string)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    const list = Array.isArray(group) ? group : [group];
    for (const item of list) {
      const value = item.trim();
      if (value.length === 0) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}
