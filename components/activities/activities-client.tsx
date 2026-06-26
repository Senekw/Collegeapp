"use client";

// Client island that owns all activity interactions: add, edit, delete, score a
// single activity, and score all. It calls the server actions directly and
// relies on their revalidatePath("/activities") to refresh the server-rendered
// list, while using a transition to keep the UI responsive. Friendly error
// alerts (e.g. missing Gemini key) surface at the top of the list.

import * as React from "react";
import { Plus, ClipboardList } from "lucide-react";

import {
  createActivity,
  updateActivity,
  deleteActivity,
  type ActivityInput,
} from "@/app/actions/activity";
import { scoreActivityAction, scoreAllAction } from "@/app/actions/scoring";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

import { ActivityForm, type ActivityFormValues } from "./activity-form";
import { ActivityCard } from "./activity-card";
import type { ActivityView } from "./types";

interface ActivitiesClientProps {
  activities: ActivityView[];
}

type FormState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; activity: ActivityView };

/** Map the form's values into the ActivityInput the server action expects. */
function toInput(values: ActivityFormValues): ActivityInput {
  return {
    title: values.title,
    category: values.category,
    role: values.role,
    description: values.description,
    startDate: values.startDate,
    endDate: values.endDate,
    hoursPerWeek: values.hoursPerWeek,
    weeksPerYear: values.weeksPerYear,
    evidenceUrl: values.evidenceUrl,
    spikeTheme: values.spikeTheme,
    research: values.research,
    deepDive: values.deepDive,
  };
}

export function ActivitiesClient({ activities }: ActivitiesClientProps) {
  const [form, setForm] = React.useState<FormState>({ mode: "closed" });
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [scoringId, setScoringId] = React.useState<string | null>(null);
  const [scoringAll, setScoringAll] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const refresh = React.useCallback(() => {
    // Server Action revalidation re-renders this island with fresh props; the
    // transition keeps interactions from blocking while React reconciles.
    startTransition(() => {});
  }, []);

  async function handleSubmit(values: ActivityFormValues) {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const input = toInput(values);
      const res =
        form.mode === "edit"
          ? await updateActivity(form.activity.id, input)
          : await createActivity(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setForm({ mode: "closed" });
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(activity: ActivityView) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${activity.title}"? This can't be undone.`)
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    const res = await deleteActivity(activity.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (form.mode === "edit" && form.activity.id === activity.id) {
      setForm({ mode: "closed" });
    }
    refresh();
  }

  async function handleScore(activity: ActivityView) {
    setError(null);
    setNotice(null);
    setScoringId(activity.id);
    try {
      // No force: the service keys its cache on the activity's content hash, so
      // re-scoring an UNCHANGED activity returns the identical cached result with
      // zero Gemini calls, while edited activities recompute automatically (§5.3).
      const res = await scoreActivityAction(activity.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      refresh();
    } finally {
      setScoringId(null);
    }
  }

  async function handleScoreAll() {
    setError(null);
    setNotice(null);
    setScoringAll(true);
    try {
      const res = await scoreAllAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const { scored, failed } = res.data;
      setNotice(
        failed > 0
          ? `Scored ${scored} ${scored === 1 ? "activity" : "activities"}, ${failed} failed.`
          : `Scored ${scored} ${scored === 1 ? "activity" : "activities"}.`,
      );
      refresh();
    } finally {
      setScoringAll(false);
    }
  }

  const formOpen = form.mode !== "closed";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {activities.length}{" "}
          {activities.length === 1 ? "activity" : "activities"}
        </div>
        <div className="flex items-center gap-2">
          {activities.length > 0 ? (
            <Button
              variant="outline"
              onClick={handleScoreAll}
              disabled={scoringAll || scoringId !== null}
            >
              {scoringAll ? "Scoring all…" : "Score all"}
            </Button>
          ) : null}
          {!formOpen ? (
            <Button onClick={() => setForm({ mode: "create" })}>
              <Plus /> Add activity
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {notice ? (
        <Alert variant="success">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {formOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {form.mode === "edit" ? "Edit activity" : "Add activity"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityForm
              initial={form.mode === "edit" ? form.activity : null}
              submitting={saving}
              onSubmit={handleSubmit}
              onCancel={() => {
                setError(null);
                setForm({ mode: "closed" });
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {activities.length === 0 && !formOpen ? (
        <EmptyState
          icon={<ClipboardList />}
          title="No activities yet"
          description="Add what you've done — clubs, research, competitions, work, projects. Then score each to see how it stacks up and where to push next."
          action={
            <Button onClick={() => setForm({ mode: "create" })}>
              <Plus /> Add your first activity
            </Button>
          }
        />
      ) : (
        <div className="space-y-4" aria-busy={isPending}>
          {activities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              scoring={scoringId === activity.id || scoringAll}
              onEdit={() => {
                setError(null);
                setForm({ mode: "edit", activity });
              }}
              onDelete={() => handleDelete(activity)}
              onScore={() => handleScore(activity)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
