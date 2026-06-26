"use client";

// Renders a single activity: its meta, an optional research summary, and — when
// present — its cached AI score as six ScoreBars, a tier Badge, rationale,
// inflation flags (warning Alerts), follow-up improvement prompts, and the
// research credit multiplier with an InfoTooltip. Edit / Delete / Score actions
// are surfaced via the parent's callbacks.

import * as React from "react";
import { ExternalLink, Pencil, Trash2, Sparkles, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBar } from "@/components/ui/score-bar";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { InfoTooltip } from "@/components/ui/tooltip";
import {
  ACTIVITY_CATEGORY_LABELS,
  AUTHORSHIP_LABELS,
  CONTRIBUTION_AREA_LABELS,
  RESEARCH_OUTPUT_LABELS,
  type ActivityCategory,
  type Authorship,
  type ContributionArea,
  type ResearchOutput,
} from "@/lib/enums";

import type { ActivityView } from "./types";

interface ActivityCardProps {
  activity: ActivityView;
  scoring: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onScore: () => void;
}

const TIER_LABELS: Record<number, string> = {
  1: "Tier 1 · Exceptional",
  2: "Tier 2 · Strong",
  3: "Tier 3 · Solid",
  4: "Tier 4 · Foundational",
};

function tierVariant(tier: number): "default" | "secondary" | "outline" {
  if (tier <= 1) return "default";
  if (tier <= 2) return "secondary";
  return "outline";
}

function categoryLabel(c: string): string {
  return ACTIVITY_CATEGORY_LABELS[c as ActivityCategory] ?? c;
}

export function ActivityCard({
  activity,
  scoring,
  onEdit,
  onDelete,
  onScore,
}: ActivityCardProps) {
  const { score, research } = activity;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{activity.title}</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">
                {categoryLabel(activity.category)}
              </Badge>
              {activity.role ? <span>{activity.role}</span> : null}
              {activity.spikeTheme ? (
                <span>· {activity.spikeTheme}</span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant={score ? "outline" : "default"}
              size="sm"
              onClick={onScore}
              disabled={scoring}
            >
              {score ? (
                <RefreshCw className={scoring ? "animate-spin" : undefined} />
              ) : (
                <Sparkles />
              )}
              {scoring ? "Scoring…" : score ? "Re-score" : "Score"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label="Edit activity"
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              aria-label="Delete activity"
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="whitespace-pre-line text-sm text-foreground">
          {activity.description}
        </p>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {activity.hoursPerWeek != null ? (
            <span>{activity.hoursPerWeek} hrs/week</span>
          ) : null}
          {activity.weeksPerYear != null ? (
            <span>{activity.weeksPerYear} weeks/year</span>
          ) : null}
          {activity.evidenceUrl ? (
            <a
              href={activity.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              Evidence <ExternalLink className="size-3" />
            </a>
          ) : (
            <span className="text-amber-600">
              No evidence link — add one to substantiate this.
            </span>
          )}
        </div>

        {research ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div className="mb-1 font-semibold text-foreground">
              Research detail
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              <span>
                Output:{" "}
                {RESEARCH_OUTPUT_LABELS[
                  research.outputType as ResearchOutput
                ] ?? research.outputType}
              </span>
              <span>
                Authorship:{" "}
                {AUTHORSHIP_LABELS[research.authorship as Authorship] ??
                  research.authorship}
              </span>
              {research.independence != null ? (
                <span>Independence: {research.independence}/10</span>
              ) : null}
              {research.venue ? <span>Venue: {research.venue}</span> : null}
            </div>
            {research.contribution.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {research.contribution.map((area) => (
                  <Badge key={area} variant="outline">
                    {CONTRIBUTION_AREA_LABELS[area as ContributionArea] ?? area}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {score ? (
          <ScoreBlock score={score} hasResearch={research !== null} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Not scored yet. Click Score to see how this stacks up.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreBlock({
  score,
  hasResearch,
}: {
  score: NonNullable<ActivityView["score"]>;
  hasResearch: boolean;
}) {
  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={tierVariant(score.tier)}>
          {TIER_LABELS[score.tier] ?? `Tier ${score.tier}`}
        </Badge>
        {score.substantiated ? (
          <Badge variant="success">Substantiated</Badge>
        ) : (
          <Badge variant="warning">Unsubstantiated</Badge>
        )}
        {hasResearch && score.creditMultiplier != null ? (
          <InfoTooltip
            label="Discounts research credit based on authorship and how independently you drove the work."
          >
            <Badge variant="outline" className="cursor-help">
              Credit ×{score.creditMultiplier.toFixed(2)}
            </Badge>
          </InfoTooltip>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ScoreBar label="Impact" value={score.impact} />
        <ScoreBar label="Originality" value={score.originality} />
        <ScoreBar label="Initiative" value={score.initiative} />
        <ScoreBar label="Depth" value={score.depth} />
        <ScoreBar label="Selectivity" value={score.selectivity} />
        <ScoreBar label="Spike alignment" value={score.spikeAlignment} />
      </div>

      {score.rationale ? (
        <div>
          <div className="mb-1 text-xs font-semibold text-foreground">
            Why this score
          </div>
          <p className="text-sm text-muted-foreground">{score.rationale}</p>
        </div>
      ) : null}

      {score.inflationFlags.length > 0 ? (
        <Alert variant="warning">
          <AlertTitle>Possible inflation</AlertTitle>
          <AlertDescription>
            <ul className="ml-4 list-disc space-y-1">
              {score.inflationFlags.map((flag, i) => (
                <li key={i}>{flag}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {score.followUpQuestions.length > 0 ? (
        <div>
          <div className="mb-1 text-xs font-semibold text-foreground">
            To strengthen this
          </div>
          <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
            {score.followUpQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
