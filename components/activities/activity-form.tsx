"use client";

// Add/edit form for a single activity. Builds an ActivityFormValues and calls
// the supplied onSubmit (create or update server action via the parent).
//
// §5.2 RESEARCH: when the category is a research/internship category the
// ResearchDetail sub-form is revealed; save is blocked client-side until both an
// authorship role and the "who did the work" narrative are provided, mirroring
// the server's validateResearch guard.
//
// §5 DEEP DIVE: for every other category a per-arm deep dive is revealed, chosen
// by deepDiveKindForCategory(category): entrepreneurship, competition, or
// generic. Each arm has its own required-field guards mirroring the server's
// resolveDeepDive validation so the user gets an inline message first. The deep
// dive is optional — it only validates once the user starts filling it in
// (signalled by the per-arm "primary" field being non-empty).

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RangeSlider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
  AUTHORSHIPS,
  AUTHORSHIP_LABELS,
  CONTRIBUTION_AREAS,
  CONTRIBUTION_AREA_LABELS,
  RESEARCH_CATEGORIES,
  RESEARCH_OUTPUTS,
  RESEARCH_OUTPUT_LABELS,
  deepDiveKindForCategory,
  type ActivityCategory,
  type DeepDiveKind,
} from "@/lib/enums";
import type { DeepDive } from "@/lib/gemini/schemas";

import type { ActivityView } from "./types";

export interface ActivityFormValues {
  title: string;
  category: string;
  role: string | null;
  description: string;
  startDate: string | null;
  endDate: string | null;
  hoursPerWeek: number | null;
  weeksPerYear: number | null;
  evidenceUrl: string | null;
  spikeTheme: string | null;
  research: {
    outputType: string;
    authorship: string;
    contribution: string[];
    venue: string | null;
    independence: number | null;
    narrative: string | null;
  } | null;
  /** Per-category deep dive (Axis B), or null when none applies / left blank. */
  deepDive: DeepDive | null;
}

interface ActivityFormProps {
  initial?: ActivityView | null;
  submitting: boolean;
  onSubmit: (values: ActivityFormValues) => void;
  onCancel: () => void;
}

const RESEARCH_CATEGORY_SET = new Set<string>(RESEARCH_CATEGORIES);

const DEEP_DIVE_LEVEL_OPTIONS = [
  "school",
  "local",
  "regional",
  "state",
  "national",
  "international",
] as const;
const GENERIC_LEVEL_OPTIONS = [...DEEP_DIVE_LEVEL_OPTIONS, "na"] as const;

const COMPETITION_RESULTS = [
  "participated",
  "qualified",
  "finalist",
  "placed",
  "won",
] as const;

const ENTREPRENEURSHIP_OUTCOMES = [
  { value: "na", label: "Not applicable" },
  { value: "attended_event", label: "Attended an event" },
  { value: "accepted_program", label: "Accepted into a program" },
  {
    value: "selected_flagship_or_funded",
    label: "Selected for a flagship / funded",
  },
] as const;

const LEVEL_LABELS: Record<string, string> = {
  school: "School",
  local: "Local",
  regional: "Regional",
  state: "State",
  national: "National",
  international: "International",
  na: "Not applicable",
};

/** Trim a string into string|null. */
function clean(s: string): string | null {
  const t = s.trim();
  return t.length > 0 ? t : null;
}

/** Parse a numeric input into number|null (blank -> null). */
function num(s: string): number | null {
  const t = s.trim();
  if (t.length === 0) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Parse an integer input into integer|null (blank -> null). */
function intOrNull(s: string): number | null {
  const n = num(s);
  return n === null ? null : Math.trunc(n);
}

/** Split a textarea of one-per-line follow-ups into a trimmed string[]. */
function lines(s: string): string[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Join a string[] back into a one-per-line textarea value. */
function joinLines(arr: string[] | undefined): string {
  return arr && arr.length > 0 ? arr.join("\n") : "";
}

export function ActivityForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: ActivityFormProps) {
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [category, setCategory] = React.useState<string>(
    initial?.category ?? "LEADERSHIP",
  );
  const [role, setRole] = React.useState(initial?.role ?? "");
  const [description, setDescription] = React.useState(
    initial?.description ?? "",
  );
  const [startDate, setStartDate] = React.useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = React.useState(initial?.endDate ?? "");
  const [hoursPerWeek, setHoursPerWeek] = React.useState(
    initial?.hoursPerWeek != null ? String(initial.hoursPerWeek) : "",
  );
  const [weeksPerYear, setWeeksPerYear] = React.useState(
    initial?.weeksPerYear != null ? String(initial.weeksPerYear) : "",
  );
  const [evidenceUrl, setEvidenceUrl] = React.useState(
    initial?.evidenceUrl ?? "",
  );
  const [spikeTheme, setSpikeTheme] = React.useState(initial?.spikeTheme ?? "");

  // Research sub-form state.
  const [outputType, setOutputType] = React.useState<string>(
    initial?.research?.outputType ?? "NONE",
  );
  const [authorship, setAuthorship] = React.useState<string>(
    initial?.research?.authorship ?? "NONE",
  );
  const [contribution, setContribution] = React.useState<string[]>(
    initial?.research?.contribution ?? [],
  );
  const [venue, setVenue] = React.useState(initial?.research?.venue ?? "");
  const [independence, setIndependence] = React.useState<number>(
    initial?.research?.independence ?? 5,
  );
  const [narrative, setNarrative] = React.useState(
    initial?.research?.narrative ?? "",
  );

  // ---- Deep dive sub-form state (one set of fields per arm; only the active
  //      arm's fields are read at submit time). ----
  const initialDeep = initial?.deepDive ?? null;

  // entrepreneurship
  const [dProductOneLiner, setDProductOneLiner] = React.useState(
    initialDeep?.kind === "entrepreneurship" ? initialDeep.productOneLiner : "",
  );
  const [dLaunched, setDLaunched] = React.useState(
    initialDeep?.kind === "entrepreneurship" ? initialDeep.launched : false,
  );
  const [dUsers, setDUsers] = React.useState(
    initialDeep?.kind === "entrepreneurship"
      ? (initialDeep.traction.users ?? "")
      : "",
  );
  const [dRevenue, setDRevenue] = React.useState(
    initialDeep?.kind === "entrepreneurship"
      ? (initialDeep.traction.revenue ?? "")
      : "",
  );
  const [dOther, setDOther] = React.useState(
    initialDeep?.kind === "entrepreneurship"
      ? (initialDeep.traction.other ?? "")
      : "",
  );
  const [dEntRole, setDEntRole] = React.useState(
    initialDeep?.kind === "entrepreneurship" ? initialDeep.yourRole : "",
  );
  const [dCofounders, setDCofounders] = React.useState(
    initialDeep?.kind === "entrepreneurship" && initialDeep.cofounders != null
      ? String(initialDeep.cofounders)
      : "",
  );
  const [dEntFollowed, setDEntFollowed] = React.useState(
    initialDeep?.kind === "entrepreneurship"
      ? joinLines(initialDeep.whatFollowed)
      : "",
  );
  const [dAcceptedVsFunded, setDAcceptedVsFunded] = React.useState<string>(
    initialDeep?.kind === "entrepreneurship"
      ? initialDeep.acceptedVsFunded
      : "na",
  );
  const [dEntAttribution, setDEntAttribution] = React.useState(
    initialDeep?.kind === "entrepreneurship"
      ? initialDeep.honestAttribution
      : "",
  );

  // competition
  const [cName, setCName] = React.useState(
    initialDeep?.kind === "competition" ? initialDeep.competitionName : "",
  );
  const [cLevel, setCLevel] = React.useState<string>(
    initialDeep?.kind === "competition" ? initialDeep.level : "regional",
  );
  const [cEvent, setCEvent] = React.useState(
    initialDeep?.kind === "competition" ? initialDeep.event : "",
  );
  const [cProjectSummary, setCProjectSummary] = React.useState(
    initialDeep?.kind === "competition" ? initialDeep.projectSummary : "",
  );
  const [cResult, setCResult] = React.useState<string>(
    initialDeep?.kind === "competition" ? initialDeep.result : "participated",
  );
  const [cPlacement, setCPlacement] = React.useState(
    initialDeep?.kind === "competition" ? (initialDeep.placement ?? "") : "",
  );
  const [cTeamSize, setCTeamSize] = React.useState(
    initialDeep?.kind === "competition" && initialDeep.teamSize != null
      ? String(initialDeep.teamSize)
      : "",
  );
  const [cContribution, setCContribution] = React.useState(
    initialDeep?.kind === "competition" ? initialDeep.yourContribution : "",
  );
  const [cFollowed, setCFollowed] = React.useState(
    initialDeep?.kind === "competition"
      ? joinLines(initialDeep.whatFollowed)
      : "",
  );
  const [cAttribution, setCAttribution] = React.useState(
    initialDeep?.kind === "competition" ? initialDeep.honestAttribution : "",
  );

  // generic
  const [gWhatYouDid, setGWhatYouDid] = React.useState(
    initialDeep?.kind === "generic" ? initialDeep.whatYouDid : "",
  );
  const [gRole, setGRole] = React.useState(
    initialDeep?.kind === "generic" ? initialDeep.yourRole : "",
  );
  const [gOutcome, setGOutcome] = React.useState(
    initialDeep?.kind === "generic"
      ? (initialDeep.measurableOutcome ?? "")
      : "",
  );
  const [gLevel, setGLevel] = React.useState<string>(
    initialDeep?.kind === "generic" ? initialDeep.level : "na",
  );
  const [gFollowed, setGFollowed] = React.useState(
    initialDeep?.kind === "generic" ? joinLines(initialDeep.whatFollowed) : "",
  );
  const [gAttribution, setGAttribution] = React.useState(
    initialDeep?.kind === "generic" ? initialDeep.honestAttribution : "",
  );

  const [error, setError] = React.useState<string | null>(null);

  const isResearch = RESEARCH_CATEGORY_SET.has(category);
  const deepKind: DeepDiveKind | null = isResearch
    ? null
    : deepDiveKindForCategory(category);

  function toggleContribution(area: string) {
    setContribution((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  }

  /**
   * Assemble the active arm's deep dive, returning either a DeepDive, null (left
   * blank — optional), or an error string when a started arm is missing a
   * required field.
   */
  function buildDeepDive():
    | { ok: true; value: DeepDive | null }
    | { ok: false; error: string } {
    if (deepKind === null) return { ok: true, value: null };

    if (deepKind === "entrepreneurship") {
      const oneLiner = clean(dProductOneLiner);
      const yourRole = clean(dEntRole);
      const attribution = clean(dEntAttribution);
      // Treat the arm as "started" once the one-liner is filled in.
      if (oneLiner === null && yourRole === null && attribution === null) {
        return { ok: true, value: null };
      }
      if (oneLiner === null) {
        return { ok: false, error: "Add a one-line description of the product." };
      }
      if (yourRole === null) {
        return { ok: false, error: "Describe your role in the venture." };
      }
      if (attribution === null) {
        return {
          ok: false,
          error: "Add an honest attribution of who did the work.",
        };
      }
      return {
        ok: true,
        value: {
          kind: "entrepreneurship",
          productOneLiner: oneLiner,
          launched: dLaunched,
          traction: {
            users: clean(dUsers),
            revenue: clean(dRevenue),
            other: clean(dOther),
          },
          yourRole,
          cofounders: intOrNull(dCofounders),
          whatFollowed: lines(dEntFollowed),
          acceptedVsFunded: dAcceptedVsFunded as
            | "attended_event"
            | "accepted_program"
            | "selected_flagship_or_funded"
            | "na",
          honestAttribution: attribution,
        },
      };
    }

    if (deepKind === "competition") {
      const name = clean(cName);
      const event = clean(cEvent);
      const summary = clean(cProjectSummary);
      const contributionText = clean(cContribution);
      const attribution = clean(cAttribution);
      if (
        name === null &&
        event === null &&
        summary === null &&
        contributionText === null &&
        attribution === null
      ) {
        return { ok: true, value: null };
      }
      if (name === null) {
        return { ok: false, error: "Add the competition name." };
      }
      if (event === null) {
        return { ok: false, error: "Add the specific event you competed in." };
      }
      if (summary === null) {
        return { ok: false, error: "Summarize your project or entry." };
      }
      if (contributionText === null) {
        return { ok: false, error: "Describe your contribution." };
      }
      if (attribution === null) {
        return {
          ok: false,
          error: "Add an honest attribution of who did the work.",
        };
      }
      return {
        ok: true,
        value: {
          kind: "competition",
          competitionName: name,
          level: cLevel as
            | "school"
            | "local"
            | "regional"
            | "state"
            | "national"
            | "international",
          event,
          projectSummary: summary,
          result: cResult as
            | "participated"
            | "qualified"
            | "finalist"
            | "placed"
            | "won",
          placement: clean(cPlacement),
          teamSize: intOrNull(cTeamSize),
          yourContribution: contributionText,
          whatFollowed: lines(cFollowed),
          honestAttribution: attribution,
        },
      };
    }

    // generic
    const whatYouDid = clean(gWhatYouDid);
    const yourRole = clean(gRole);
    const attribution = clean(gAttribution);
    if (whatYouDid === null && yourRole === null && attribution === null) {
      return { ok: true, value: null };
    }
    if (whatYouDid === null) {
      return { ok: false, error: "Describe what you did." };
    }
    if (yourRole === null) {
      return { ok: false, error: "Describe your role." };
    }
    if (attribution === null) {
      return {
        ok: false,
        error: "Add an honest attribution of who did the work.",
      };
    }
    return {
      ok: true,
      value: {
        kind: "generic",
        whatYouDid,
        yourRole,
        measurableOutcome: clean(gOutcome),
        level: gLevel as
          | "school"
          | "local"
          | "regional"
          | "state"
          | "national"
          | "international"
          | "na",
        whatFollowed: lines(gFollowed),
        honestAttribution: attribution,
      },
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (clean(title) === null) {
      setError("Title is required.");
      return;
    }
    if (clean(description) === null) {
      setError("Description is required.");
      return;
    }

    let research: ActivityFormValues["research"] = null;
    if (isResearch) {
      // §5.2: block save without authorship + narrative.
      if (authorship === "NONE") {
        setError(
          "Research and internship activities need an authorship role — pick where you stood on the work.",
        );
        return;
      }
      if (clean(narrative) === null) {
        setError(
          "Tell us honestly who did most of the work. This narrative is required for research.",
        );
        return;
      }
      research = {
        outputType,
        authorship,
        contribution,
        venue: clean(venue),
        independence,
        narrative: clean(narrative),
      };
    }

    const deep = buildDeepDive();
    if (!deep.ok) {
      setError(deep.error);
      return;
    }

    onSubmit({
      title: title.trim(),
      category,
      role: clean(role),
      description: description.trim(),
      startDate: clean(startDate),
      endDate: clean(endDate),
      hoursPerWeek: num(hoursPerWeek),
      weeksPerYear: num(weeksPerYear),
      evidenceUrl: clean(evidenceUrl),
      spikeTheme: clean(spikeTheme),
      research,
      deepDive: deep.value,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="af-title">Title</Label>
        <Input
          id="af-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Founder, Riverside Robotics Outreach"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="af-category">Category</Label>
          <Select
            id="af-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {ACTIVITY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ACTIVITY_CATEGORY_LABELS[c as ActivityCategory]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="af-role">Role</Label>
          <Input
            id="af-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Founder, Captain, Lead"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="af-description">What you did</Label>
        <Textarea
          id="af-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="In your own words: what you built, led, or contributed, and the result."
          className="min-h-[110px]"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="af-start">Start date</Label>
          <Input
            id="af-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="af-end">End date</Label>
          <Input
            id="af-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Leave blank if this is ongoing.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="af-hours">Hours per week</Label>
          <Input
            id="af-hours"
            type="number"
            min={0}
            max={168}
            step="0.5"
            value={hoursPerWeek}
            onChange={(e) => setHoursPerWeek(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="af-weeks">Weeks per year</Label>
          <Input
            id="af-weeks"
            type="number"
            min={0}
            max={52}
            step="1"
            value={weeksPerYear}
            onChange={(e) => setWeeksPerYear(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="af-evidence">Evidence link</Label>
        <Input
          id="af-evidence"
          type="url"
          value={evidenceUrl}
          onChange={(e) => setEvidenceUrl(e.target.value)}
          placeholder="https://…"
        />
        <p className="text-xs text-muted-foreground">
          Add a link to substantiate this — a publication, repo, award page, or
          news mention. Substantiated entries score higher and avoid inflation
          flags.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="af-spike">Spike theme</Label>
        <Input
          id="af-spike"
          value={spikeTheme}
          onChange={(e) => setSpikeTheme(e.target.value)}
          placeholder="e.g. Computational biology, Civic tech"
        />
        <p className="text-xs text-muted-foreground">
          Optional. The theme this activity advances. The AI may refine it.
        </p>
      </div>

      {isResearch ? (
        <fieldset className="space-y-5 rounded-lg border border-border bg-muted/30 p-4">
          <legend className="px-1 text-sm font-semibold">
            Research detail
          </legend>
          <p className="-mt-2 text-xs text-muted-foreground">
            Research and internship entries are weighted by an honesty-aware
            credit multiplier. Authorship and the work narrative are required.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="af-output">Output type</Label>
              <Select
                id="af-output"
                value={outputType}
                onChange={(e) => setOutputType(e.target.value)}
              >
                {RESEARCH_OUTPUTS.map((o) => (
                  <option key={o} value={o}>
                    {RESEARCH_OUTPUT_LABELS[o]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="af-authorship">
                Authorship <span className="text-destructive">*</span>
              </Label>
              <Select
                id="af-authorship"
                value={authorship}
                onChange={(e) => setAuthorship(e.target.value)}
              >
                {AUTHORSHIPS.map((a) => (
                  <option key={a} value={a}>
                    {AUTHORSHIP_LABELS[a]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Your contributions</Label>
            <div className="flex flex-wrap gap-3">
              {CONTRIBUTION_AREAS.map((area) => {
                const checked = contribution.includes(area);
                return (
                  <label
                    key={area}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={checked}
                      onChange={() => toggleContribution(area)}
                    />
                    {CONTRIBUTION_AREA_LABELS[area]}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="af-venue">Venue</Label>
            <Input
              id="af-venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Journal or conference name"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="af-independence">
                Independence — how much you drove it
              </Label>
              <span className="tabular-nums text-sm text-muted-foreground">
                {independence}/10
              </span>
            </div>
            <RangeSlider
              id="af-independence"
              value={independence}
              onValueChange={setIndependence}
              min={0}
              max={10}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              0 = a mentor drove everything, 10 = you drove it end to end.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="af-narrative">
              Who did most of the work?{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="af-narrative"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="An honest account: what you personally did vs. what supervisors, labmates, or tools did."
              className="min-h-[100px]"
            />
          </div>
        </fieldset>
      ) : null}

      {deepKind === "entrepreneurship" ? (
        <fieldset className="space-y-5 rounded-lg border border-border bg-muted/30 p-4">
          <legend className="px-1 text-sm font-semibold">
            Venture deep dive
          </legend>
          <p className="-mt-2 text-xs text-muted-foreground">
            Optional, but it sharpens the score. Be honest about traction and who
            did the work — inflated claims get flagged.
          </p>

          <div className="space-y-2">
            <Label htmlFor="dd-ent-oneliner">
              Product, in one line{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="dd-ent-oneliner"
              value={dProductOneLiner}
              onChange={(e) => setDProductOneLiner(e.target.value)}
              placeholder="What it is and who it's for."
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={dLaunched}
              onChange={(e) => setDLaunched(e.target.checked)}
            />
            Launched (real users could use it)
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="dd-ent-users">Users</Label>
              <Input
                id="dd-ent-users"
                value={dUsers}
                onChange={(e) => setDUsers(e.target.value)}
                placeholder="e.g. 1,200 signups"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dd-ent-revenue">Revenue</Label>
              <Input
                id="dd-ent-revenue"
                value={dRevenue}
                onChange={(e) => setDRevenue(e.target.value)}
                placeholder="e.g. $3k MRR"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dd-ent-other">Other traction</Label>
              <Input
                id="dd-ent-other"
                value={dOther}
                onChange={(e) => setDOther(e.target.value)}
                placeholder="e.g. press, partners"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dd-ent-role">
                Your role <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dd-ent-role"
                value={dEntRole}
                onChange={(e) => setDEntRole(e.target.value)}
                placeholder="e.g. Sole founder, built the product"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dd-ent-cofounders">Co-founders</Label>
              <Input
                id="dd-ent-cofounders"
                type="number"
                min={0}
                step="1"
                value={dCofounders}
                onChange={(e) => setDCofounders(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dd-ent-status">Selection / funding status</Label>
            <Select
              id="dd-ent-status"
              value={dAcceptedVsFunded}
              onChange={(e) => setDAcceptedVsFunded(e.target.value)}
            >
              {ENTREPRENEURSHIP_OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dd-ent-followed">
              What followed (one per line)
            </Label>
            <Textarea
              id="dd-ent-followed"
              value={dEntFollowed}
              onChange={(e) => setDEntFollowed(e.target.value)}
              placeholder={"Press coverage\nNew partnership\nNext milestone"}
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dd-ent-attribution">
              Honest attribution{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="dd-ent-attribution"
              value={dEntAttribution}
              onChange={(e) => setDEntAttribution(e.target.value)}
              placeholder="What you personally did vs. teammates, mentors, or tools."
              className="min-h-[80px]"
            />
          </div>
        </fieldset>
      ) : null}

      {deepKind === "competition" ? (
        <fieldset className="space-y-5 rounded-lg border border-border bg-muted/30 p-4">
          <legend className="px-1 text-sm font-semibold">
            Competition deep dive
          </legend>
          <p className="-mt-2 text-xs text-muted-foreground">
            Optional. The level and result drive selectivity — be precise and
            honest about your contribution.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dd-comp-name">
                Competition name{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dd-comp-name"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="e.g. Regeneron ISEF"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dd-comp-level">Level</Label>
              <Select
                id="dd-comp-level"
                value={cLevel}
                onChange={(e) => setCLevel(e.target.value)}
              >
                {DEEP_DIVE_LEVEL_OPTIONS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABELS[l] ?? l}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dd-comp-event">
              Event / category <span className="text-destructive">*</span>
            </Label>
            <Input
              id="dd-comp-event"
              value={cEvent}
              onChange={(e) => setCEvent(e.target.value)}
              placeholder="e.g. Computational Biology & Bioinformatics"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dd-comp-summary">
              Project summary <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="dd-comp-summary"
              value={cProjectSummary}
              onChange={(e) => setCProjectSummary(e.target.value)}
              placeholder="What you entered, in a sentence or two."
              className="min-h-[80px]"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="dd-comp-result">Result</Label>
              <Select
                id="dd-comp-result"
                value={cResult}
                onChange={(e) => setCResult(e.target.value)}
              >
                {COMPETITION_RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dd-comp-placement">Placement</Label>
              <Input
                id="dd-comp-placement"
                value={cPlacement}
                onChange={(e) => setCPlacement(e.target.value)}
                placeholder="e.g. 2nd, Top 10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dd-comp-team">Team size</Label>
              <Input
                id="dd-comp-team"
                type="number"
                min={1}
                step="1"
                value={cTeamSize}
                onChange={(e) => setCTeamSize(e.target.value)}
                placeholder="1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dd-comp-contribution">
              Your contribution{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="dd-comp-contribution"
              value={cContribution}
              onChange={(e) => setCContribution(e.target.value)}
              placeholder="What you personally did on the team."
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dd-comp-followed">
              What followed (one per line)
            </Label>
            <Textarea
              id="dd-comp-followed"
              value={cFollowed}
              onChange={(e) => setCFollowed(e.target.value)}
              placeholder={"Advanced to state\nInvited to nationals"}
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dd-comp-attribution">
              Honest attribution{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="dd-comp-attribution"
              value={cAttribution}
              onChange={(e) => setCAttribution(e.target.value)}
              placeholder="What you did vs. teammates, mentors, or tools."
              className="min-h-[80px]"
            />
          </div>
        </fieldset>
      ) : null}

      {deepKind === "generic" ? (
        <fieldset className="space-y-5 rounded-lg border border-border bg-muted/30 p-4">
          <legend className="px-1 text-sm font-semibold">Deep dive</legend>
          <p className="-mt-2 text-xs text-muted-foreground">
            Optional. A measurable outcome and an honest attribution help the
            scorer credit you fairly.
          </p>

          <div className="space-y-2">
            <Label htmlFor="dd-gen-what">
              What you did <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="dd-gen-what"
              value={gWhatYouDid}
              onChange={(e) => setGWhatYouDid(e.target.value)}
              placeholder="Concretely, what you did."
              className="min-h-[80px]"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dd-gen-role">
                Your role <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dd-gen-role"
                value={gRole}
                onChange={(e) => setGRole(e.target.value)}
                placeholder="e.g. Lead organizer"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dd-gen-level">Level</Label>
              <Select
                id="dd-gen-level"
                value={gLevel}
                onChange={(e) => setGLevel(e.target.value)}
              >
                {GENERIC_LEVEL_OPTIONS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABELS[l] ?? l}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dd-gen-outcome">Measurable outcome</Label>
            <Input
              id="dd-gen-outcome"
              value={gOutcome}
              onChange={(e) => setGOutcome(e.target.value)}
              placeholder="e.g. Raised $4k, reached 300 people"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dd-gen-followed">
              What followed (one per line)
            </Label>
            <Textarea
              id="dd-gen-followed"
              value={gFollowed}
              onChange={(e) => setGFollowed(e.target.value)}
              placeholder={"Program expanded\nInvited back next year"}
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dd-gen-attribution">
              Honest attribution{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="dd-gen-attribution"
              value={gAttribution}
              onChange={(e) => setGAttribution(e.target.value)}
              placeholder="What you did vs. others or tools."
              className="min-h-[80px]"
            />
          </div>
        </fieldset>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : initial ? "Save changes" : "Add activity"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
