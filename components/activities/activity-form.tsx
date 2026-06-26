"use client";

// Add/edit form for a single activity. Builds an ActivityInput and calls the
// supplied onSubmit (create or update server action via the parent). When the
// category is a research/internship category (§5.2), the ResearchDetail
// sub-form is revealed; save is blocked client-side until both an authorship
// role and the "who did the work" narrative are provided, mirroring the
// server's validateResearch guard so the user gets an inline message first.

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
  type ActivityCategory,
} from "@/lib/enums";

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
}

interface ActivityFormProps {
  initial?: ActivityView | null;
  submitting: boolean;
  onSubmit: (values: ActivityFormValues) => void;
  onCancel: () => void;
}

const RESEARCH_CATEGORY_SET = new Set<string>(RESEARCH_CATEGORIES);

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

  const [error, setError] = React.useState<string | null>(null);

  const isResearch = RESEARCH_CATEGORY_SET.has(category);

  function toggleContribution(area: string) {
    setContribution((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
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
