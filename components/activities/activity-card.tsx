"use client";

// Renders a single activity: its meta, an optional research summary, and — when
// present — its cached AI score as six ScoreBars, a tier Badge, rationale,
// inflation flags (warning Alerts), follow-up improvement prompts, and the
// generalized credit multiplier with an InfoTooltip.
//
// EXTENSION (§11): a SELECTIVITY PANEL surfaces the scored selectivityBreakdown
// — Axis A (level, each external figure with its value, "(YYYY figures)" tag,
// clickable source, and a confidence Badge, plus the attend-vs-achievement note)
// and Axis B (the student's own attainment). A "Refresh program data" button
// resolves Axis-A enrichment on demand and surfaces when it was last enriched.
// Unknowns render honestly as "no reliable public data found".

import * as React from "react";
import {
  ExternalLink,
  Pencil,
  Trash2,
  Sparkles,
  RefreshCw,
  Download,
} from "lucide-react";

import { enrichActivityProgramAction } from "@/app/actions/enrich";

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
  CONFIDENCE_LABELS,
  ConfidenceSchema,
  SOURCE_QUALITY_LABELS,
  SourceQualitySchema,
  type ActivityCategory,
  type Authorship,
  type ContributionArea,
  type ResearchOutput,
} from "@/lib/enums";
import type { SelectivityBreakdown, ExternalFigure } from "@/lib/types";

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

const NO_DATA = "no reliable public data found";

function tierVariant(tier: number): "default" | "secondary" | "outline" {
  if (tier <= 1) return "default";
  if (tier <= 2) return "secondary";
  return "outline";
}

function categoryLabel(c: string): string {
  return ACTIVITY_CATEGORY_LABELS[c as ActivityCategory] ?? c;
}

/** Map a lowercase confidence to a Badge variant + label. */
function confidenceBadge(
  c: "none" | "low" | "medium" | "high",
): { variant: "outline" | "secondary" | "warning" | "success"; label: string } {
  const upper = ConfidenceSchema.catch("NONE").parse(c.toUpperCase());
  const label = CONFIDENCE_LABELS[upper];
  switch (upper) {
    case "HIGH":
      return { variant: "success", label };
    case "MEDIUM":
      return { variant: "secondary", label };
    case "LOW":
      return { variant: "warning", label };
    default:
      return { variant: "outline", label };
  }
}

/** Pretty-print a lowercase level for display. */
function levelText(level: string): string {
  if (level === "na") return NO_DATA;
  if (level === "unknown") return NO_DATA;
  return level.charAt(0).toUpperCase() + level.slice(1);
}

/** Format an enrichedAt ISO string as a short local date. */
function enrichedAtText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

        <SelectivityPanel
          activityId={activity.id}
          programKey={activity.programKey}
          enrichedAt={activity.enrichedAt}
          breakdown={score?.selectivityBreakdown ?? null}
        />

        {score ? (
          <ScoreBlock score={score} hasCredit={score.creditMultiplier != null} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Not scored yet. Click Score to see how this stacks up.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// §11 Selectivity panel
// ---------------------------------------------------------------------------

function SelectivityPanel({
  activityId,
  programKey,
  enrichedAt,
  breakdown,
}: {
  activityId: string;
  programKey: string | null;
  enrichedAt: string | null;
  breakdown: SelectivityBreakdown | null;
}) {
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function handleRefresh() {
    setError(null);
    setNotice(null);
    setRefreshing(true);
    try {
      const res = await enrichActivityProgramAction(activityId, true);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice("Program data refreshed.");
    } finally {
      setRefreshing(false);
    }
  }

  const figures = breakdown?.externalFigures ?? [];
  const hasBreakdown = breakdown !== null;
  const conf = breakdown ? confidenceBadge(breakdown.confidence) : null;

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">
            Selectivity &amp; prestige
          </span>
          {conf ? (
            <Badge variant={conf.variant}>{conf.label} confidence</Badge>
          ) : null}
        </div>
        {programKey ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <Download className={refreshing ? "animate-spin" : undefined} />
            {refreshing ? "Fetching…" : "Refresh program data"}
          </Button>
        ) : null}
      </div>

      {!hasBreakdown ? (
        <p className="text-muted-foreground">
          {programKey
            ? "Score this activity to see how selective and recognized its program is."
            : "Not linked to a named program — selectivity isn't assessed here."}
        </p>
      ) : (
        <div className="space-y-3">
          {/* Axis A — external selectivity */}
          <div className="space-y-1">
            <div className="font-medium text-foreground">
              How selective / recognized (Axis A)
            </div>
            <div className="text-muted-foreground">
              Level: {levelText(breakdown.level)}
            </div>
            {figures.length > 0 ? (
              <ul className="space-y-1">
                {figures.map((fig, i) => (
                  <FigureRow key={`${fig.label}-${i}`} figure={fig} />
                ))}
              </ul>
            ) : (
              <div className="text-muted-foreground">
                External figures: {NO_DATA}
              </div>
            )}
            <div className="text-muted-foreground">
              {breakdown.attendVsAchievementNote.trim().length > 0
                ? breakdown.attendVsAchievementNote
                : `Attend vs. achieve: ${NO_DATA}`}
            </div>
          </div>

          {/* Axis B — the student's own attainment */}
          <div className="space-y-1">
            <div className="font-medium text-foreground">
              Your attainment (Axis B)
            </div>
            <div className="text-muted-foreground">
              {breakdown.studentAttainment.trim().length > 0
                ? breakdown.studentAttainment
                : NO_DATA}
            </div>
          </div>
        </div>
      )}

      {enrichedAt ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Program data as of {enrichedAtText(enrichedAt)}.
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert variant="success" className="mt-2">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

/** Map a lowercase source quality to a Badge variant. */
function sourceQualityBadge(q: "primary" | "secondary" | "tertiary"): {
  variant: "outline" | "secondary" | "success";
  label: string;
} {
  const upper = SourceQualitySchema.catch("TERTIARY").parse(q.toUpperCase());
  const label = SOURCE_QUALITY_LABELS[upper];
  switch (upper) {
    case "PRIMARY":
      return { variant: "success", label };
    case "SECONDARY":
      return { variant: "secondary", label };
    default:
      return { variant: "outline", label };
  }
}

function FigureRow({ figure }: { figure: ExternalFigure }) {
  const badge = sourceQualityBadge(figure.sourceQuality);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
      <span className="text-foreground">{figure.label}:</span>
      <span>{figure.value}</span>
      <span className="text-[11px]">
        ({figure.asOfYear} figures
        {figure.isFallbackYear ? ", prior cycle" : ""})
      </span>
      {figure.sourceUrl.trim().length > 0 ? (
        <a
          href={figure.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
        >
          source <ExternalLink className="size-3" />
        </a>
      ) : null}
      <Badge variant={badge.variant}>{badge.label}</Badge>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Score display
// ---------------------------------------------------------------------------

function ScoreBlock({
  score,
  hasCredit,
}: {
  score: NonNullable<ActivityView["score"]>;
  hasCredit: boolean;
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
        {hasCredit && score.creditMultiplier != null ? (
          <InfoTooltip label="Discounts credit based on how independently and honestly the work was attributed to you.">
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
