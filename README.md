# Spike Engine

A single-user college-application strategy platform. It ingests a high-school
student's full profile, uses **Gemini** to *skeptically* score the real signal in
each accomplishment, synthesizes a focused "spike," recommends best-fit schools
with honest **admit-realism bands** (never fake per-student percentages),
surfaces grade-eligible opportunities with **verified-only** deadlines, and
exports a clean résumé.

### v2 extension — measured spike + outlier-aware realism

The platform now scores **every** activity on two separate axes — **program
selectivity** (Axis A, web-grounded via Gemini Google Search with cited,
year-stamped figures and prior-year fallback) and **student attainment** (Axis B,
per-category deep dives that never conflate *attended* with *won* or *accepted*
with *funded*). Those feed a measured, decomposable **Spike Index** (0–100, five
archetype-calibrated tiers, where a single towering original peak can reach the
top and selectivity-without-authorship cannot). Realism is **distribution- and
outlier-aware**: below-band stats read as a documented, **survivorship-flagged
admit tail** — the band ceilings always hold (sub-10% never better than Reach,
sub-5% always Hard Reach), the spike only sets the *tail outlook*, and **no
per-student admit percentage is ever emitted**. Anything web-sourced carries a
`sourceUrl` + `asOfYear` or it is stored `null` with confidence `NONE`.

> **The Axis-A enrichment, admit distributions, and archetype refresh require a
> `GEMINI_API_KEY`** (they use grounded search). Everything else — the Spike
> Index core, the realism bands, the deep-dive forms — works without one; the
> Spike Index computes deterministically and degrades gracefully.

## Non-negotiable principles (these are enforced, not aspirational)

1. **No false precision on admissions.** Never a single per-student admit %.
   Output is a *band* anchored to the school's published base rate. A base admit
   rate `< 10%` is never better than **Reach**; `< 5%` is always **Hard Reach**.
   (`lib/recommend/realism.ts`, unit-tested.)
2. **No fabricated data.** No hardcoded deadline, admit rate, or test range that
   isn't verified from an authoritative source. Unknown → `null` + a visible
   "unverified — check official site" tag. Every `School`/`Opportunity` carries a
   `sourceUrl`.
3. **Skeptical scoring, not flattery.** The LLM finds real signal and flags
   inflation. "Did research" with no output/independent contribution scores low.
4. **Reproducible & auditable.** Scoring runs at low temperature against a fixed
   JSON schema, cached by a hash of its exact input — identical input → identical
   stored score. Every score surfaces its `rationale` + `followUpQuestions`.
5. **The API key never reaches the client.** All Gemini calls run server-side.

## Tech stack

Next.js 14 (App Router) · React 18 · TypeScript (strict) · Tailwind + shadcn-style
UI · Prisma + SQLite · Zod (the LLM-output schema is the single source of truth
and also builds Gemini's `responseSchema`) · `@google/genai` · `@react-pdf/renderer`.

## Quick start

```bash
# 1. Install
npm install

# 2. Create the local SQLite DB + seed it (1 student, 8 schools, 10 opportunities)
npm run db:migrate      # applies prisma/migrations -> creates prisma/dev.db
npm run db:seed

# 3. Run
npm run dev             # http://localhost:3000
```

### Enable the AI (optional but it's the whole point)

The app runs **without** a key — scoring/synthesis just return a friendly
"add a key" message instead of crashing. To turn the AI on, paste your key into
`.env.local` (gitignored):

```
GEMINI_API_KEY=your_key_here
```

Get one at <https://aistudio.google.com/apikey>. Then: fill your **Profile** →
add a few **Activities** → **Score all** → **Recompute synthesis** → see your
**Schools** realism bands, **Dashboard** spike + next moves, and **Résumé**.

> The Opportunities tracker works fully **without** a key.

## Scripts

| script | what |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | `prisma generate` + production build |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run test` | Vitest unit tests for the pure logic (realism, match, aggregate, boundary parsing) |
| `npm run db:migrate` / `db:seed` / `db:reset` | database lifecycle |

## Architecture

```
app/(dashboard)/   dashboard · profile · activities · schools · opportunities · resume
app/api/           score · synthesize · recommend · resume (PDF)  — server-only
app/actions/       server actions (CRUD + scoring/synthesis triggers)
lib/gemini/        server-only Gemini wrapper, prompts, Zod schemas + responseSchema
lib/scoring/       hash-keyed score cache, deterministic aggregation
lib/recommend/     realism banding (safety-critical, pure) + school matching — unit-tested
lib/resume/        @react-pdf/renderer template + data builder
prisma/            schema, migrations, honest seed
```

`realism.ts`, `match.ts`, and `aggregate.ts` are **pure and unit-tested** — they
encode the admissions logic and are inspectable without a DB or network.

## Deployment (Netlify)

The repo is wired for Netlify auto-deploy on push (`netlify.toml` +
`@netlify/plugin-nextjs`). **Caveat:** v1 uses file-based **SQLite**, whose
*writes* don't persist on Netlify's ephemeral serverless filesystem — the build
succeeds and pages render, but mutations won't stick in a deployed environment.
Every query is already scoped by `userId` (seeded as `"local"`), so making the
deploy fully functional later is a datasource swap (SQLite → Postgres) + injecting
a real `userId`, **not** a rewrite. For now, run it locally for the full
experience.

## Out of scope for v1

Auth, multi-user, payments, email/notifications, essay feedback, live admit-data
scraping, Common App integration. The `userId` seam keeps accounts a clean later
addition.
