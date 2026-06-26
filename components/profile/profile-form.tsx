"use client";

// Profile intake form. Every field autosaves on blur (§5.1) via upsertStudent,
// showing a subtle per-form Saving/Saved/Error indicator. Grade level drives the
// downstream time horizon, so it's surfaced prominently. A "Recompute synthesis"
// button re-runs the deep-model synthesis with inline pending/error feedback.

import * as React from "react";
import { Check, Loader2, AlertCircle, RefreshCw } from "lucide-react";

import { synthesizeAction } from "@/app/actions/synthesis";
import { upsertStudent, type StudentInput } from "@/app/actions/student";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Shape of the editable profile, mirrored from the Student row. */
export interface ProfileInitial {
  name: string | null;
  gradeLevel: number | null;
  gradYear: number | null;
  gpaUnweighted: number | null;
  gpaWeighted: number | null;
  rigor: string | null;
  satTotal: number | null;
  actComposite: number | null;
  intendedMajor: string | null;
  state: string | null;
  contextNotes: string | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** All text/number field keys that map 1:1 onto StudentInput. */
type FieldKey = keyof ProfileInitial;

const NUMERIC_FIELDS: ReadonlySet<FieldKey> = new Set<FieldKey>([
  "gradeLevel",
  "gradYear",
  "gpaUnweighted",
  "gpaWeighted",
  "satTotal",
  "actComposite",
]);

/** Convert the local form state into the StudentInput the action expects. */
function toInput(values: ProfileInitial): StudentInput {
  return {
    name: values.name,
    gradeLevel: values.gradeLevel,
    gradYear: values.gradYear,
    gpaUnweighted: values.gpaUnweighted,
    gpaWeighted: values.gpaWeighted,
    rigor: values.rigor,
    satTotal: values.satTotal,
    actComposite: values.actComposite,
    intendedMajor: values.intendedMajor,
    state: values.state,
    contextNotes: values.contextNotes,
  };
}

export function ProfileForm({ initial }: { initial: ProfileInitial }) {
  const [values, setValues] = React.useState<ProfileInitial>(initial);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Track the last persisted snapshot so a blur with no change skips the save.
  const persisted = React.useRef<ProfileInitial>(initial);

  const [synthPending, setSynthPending] = React.useState(false);
  const [synthError, setSynthError] = React.useState<string | null>(null);
  const [synthOk, setSynthOk] = React.useState(false);

  function setField(key: FieldKey, raw: string) {
    setValues((prev) => {
      if (NUMERIC_FIELDS.has(key)) {
        const trimmed = raw.trim();
        const num = trimmed === "" ? null : Number(trimmed);
        return {
          ...prev,
          [key]: trimmed === "" || Number.isNaN(num) ? null : num,
        };
      }
      return { ...prev, [key]: raw.length > 0 ? raw : null };
    });
  }

  async function save(next: ProfileInitial) {
    setSaveState("saving");
    setSaveError(null);
    const res = await upsertStudent(toInput(next));
    if (res.ok) {
      persisted.current = next;
      setSaveState("saved");
    } else {
      setSaveState("error");
      setSaveError(res.error);
    }
  }

  // Blur handler: only persist when this field's value actually changed.
  function handleBlur(key: FieldKey) {
    const current = values[key];
    if (current === persisted.current[key]) return;
    void save(values);
  }

  // Grade level uses a native select that should save immediately on change.
  function handleGradeChange(raw: string) {
    const next: ProfileInitial = {
      ...values,
      gradeLevel: raw === "" ? null : Number(raw),
    };
    setValues(next);
    if (next.gradeLevel !== persisted.current.gradeLevel) {
      void save(next);
    }
  }

  async function handleSynthesize() {
    setSynthPending(true);
    setSynthError(null);
    setSynthOk(false);
    const res = await synthesizeAction();
    setSynthPending(false);
    if (res.ok) {
      setSynthOk(true);
    } else {
      setSynthError(res.error);
    }
  }

  return (
    <div className="space-y-6">
      <SaveIndicator state={saveState} error={saveError} />

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
          <CardDescription>
            Who you are and where you are in high school. Your grade level sets
            the time horizon for every recommendation.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" htmlFor="name">
            <Input
              id="name"
              value={values.name ?? ""}
              placeholder="Your name"
              onChange={(e) => setField("name", e.target.value)}
              onBlur={() => handleBlur("name")}
            />
          </Field>

          <Field
            label="Grade level"
            htmlFor="gradeLevel"
            hint="Drives your time horizon"
          >
            <Select
              id="gradeLevel"
              value={values.gradeLevel === null ? "" : String(values.gradeLevel)}
              onChange={(e) => handleGradeChange(e.target.value)}
            >
              <option value="">Select grade</option>
              <option value="9">9th grade</option>
              <option value="10">10th grade</option>
              <option value="11">11th grade</option>
              <option value="12">12th grade</option>
            </Select>
          </Field>

          <Field label="Graduation year" htmlFor="gradYear">
            <Input
              id="gradYear"
              type="number"
              inputMode="numeric"
              value={values.gradYear ?? ""}
              placeholder="e.g. 2027"
              onChange={(e) => setField("gradYear", e.target.value)}
              onBlur={() => handleBlur("gradYear")}
            />
          </Field>

          <Field label="Intended major" htmlFor="intendedMajor">
            <Input
              id="intendedMajor"
              value={values.intendedMajor ?? ""}
              placeholder="e.g. Computer Science"
              onChange={(e) => setField("intendedMajor", e.target.value)}
              onBlur={() => handleBlur("intendedMajor")}
            />
          </Field>

          <Field label="State" htmlFor="state">
            <Input
              id="state"
              value={values.state ?? ""}
              placeholder="e.g. CA"
              onChange={(e) => setField("state", e.target.value)}
              onBlur={() => handleBlur("state")}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Academics</CardTitle>
          <CardDescription>
            Leave a field blank if it does not apply yet. Blanks are stored as
            &ldquo;not provided,&rdquo; never as zero.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field
            label="GPA (unweighted)"
            htmlFor="gpaUnweighted"
            hint="0–4.0 scale"
          >
            <Input
              id="gpaUnweighted"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={values.gpaUnweighted ?? ""}
              placeholder="e.g. 3.92"
              onChange={(e) => setField("gpaUnweighted", e.target.value)}
              onBlur={() => handleBlur("gpaUnweighted")}
            />
          </Field>

          <Field
            label="GPA (weighted)"
            htmlFor="gpaWeighted"
            hint="Optional, school scale"
          >
            <Input
              id="gpaWeighted"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={values.gpaWeighted ?? ""}
              placeholder="e.g. 4.45"
              onChange={(e) => setField("gpaWeighted", e.target.value)}
              onBlur={() => handleBlur("gpaWeighted")}
            />
          </Field>

          <Field label="SAT total" htmlFor="satTotal" hint="400–1600">
            <Input
              id="satTotal"
              type="number"
              inputMode="numeric"
              value={values.satTotal ?? ""}
              placeholder="e.g. 1480"
              onChange={(e) => setField("satTotal", e.target.value)}
              onBlur={() => handleBlur("satTotal")}
            />
          </Field>

          <Field label="ACT composite" htmlFor="actComposite" hint="1–36">
            <Input
              id="actComposite"
              type="number"
              inputMode="numeric"
              value={values.actComposite ?? ""}
              placeholder="e.g. 33"
              onChange={(e) => setField("actComposite", e.target.value)}
              onBlur={() => handleBlur("actComposite")}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              label="Course rigor"
              htmlFor="rigor"
              hint="Free text — the AI summarizes it"
            >
              <Textarea
                id="rigor"
                rows={3}
                value={values.rigor ?? ""}
                placeholder="e.g. 5 APs taken (CS, Calc BC, Physics C, US History, Lang), 4 more planned senior year."
                onChange={(e) => setField("rigor", e.target.value)}
                onBlur={() => handleBlur("rigor")}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Context</CardTitle>
          <CardDescription>
            Optional. Anything that frames your story — first-gen, work hours,
            family responsibilities, or constraints on your time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field label="Context notes" htmlFor="contextNotes" hideLabel>
            <Textarea
              id="contextNotes"
              rows={4}
              value={values.contextNotes ?? ""}
              placeholder="e.g. First-generation student; work ~15 hrs/week to help at home."
              onChange={(e) => setField("contextNotes", e.target.value)}
              onBlur={() => handleBlur("contextNotes")}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recompute synthesis</CardTitle>
          <CardDescription>
            Re-run the AI assessment of your spike after updating your profile or
            activities. This uses the deep model and may take a few seconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {synthError ? (
            <Alert variant="destructive">
              <AlertTitle>Synthesis failed</AlertTitle>
              <AlertDescription>{synthError}</AlertDescription>
            </Alert>
          ) : null}
          {synthOk ? (
            <Alert variant="success">
              <AlertTitle>Synthesis updated</AlertTitle>
              <AlertDescription>
                Your spike assessment has been refreshed. See it on the
                dashboard and Schools pages.
              </AlertDescription>
            </Alert>
          ) : null}
          <Button onClick={handleSynthesize} disabled={synthPending}>
            {synthPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Synthesizing…
              </>
            ) : (
              <>
                <RefreshCw className="size-4" />
                Recompute synthesis
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SaveIndicator({
  state,
  error,
}: {
  state: SaveState;
  error: string | null;
}) {
  if (state === "idle") {
    return (
      <p className="text-xs text-muted-foreground">
        Changes save automatically when you leave a field.
      </p>
    );
  }
  if (state === "saving") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Saving…
      </p>
    );
  }
  if (state === "saved") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        Saved
      </p>
    );
  }
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-xs text-destructive",
      )}
    >
      <AlertCircle className="size-3.5" />
      {error ?? "Could not save."}
    </p>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  hideLabel,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  hideLabel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "flex items-baseline justify-between gap-2",
          hideLabel && "sr-only",
        )}
      >
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
