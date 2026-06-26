"use client";

// Spike Panel (§7, §11). Renders the student's Spike Index as a prominent
// dial/large number with its tier Badge, ALWAYS accompanied by the full
// decomposition (peak / concentration / trajectory / originality) — never a
// bare number. Highlights the peak activities, surfaces the nearest anonymized
// admit archetype (rarityAnchor) when present, and shows a concrete,
// time-aware gap-to-next-tier note. A compute/recompute Button drives
// computeSpikeAction with pending + error states. Includes an empty state for
// when no SpikeAssessment exists yet.
//
// This is a client island (it owns the compute interaction). The server-only
// computeSpikeAction is imported as a Server Action — safe to call from here.

import * as React from "react";
import { Sparkles, RefreshCw, Target } from "lucide-react";

import { computeSpikeAction } from "@/app/actions/spike";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreBar } from "@/components/ui/score-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SPIKE_TIER_LABELS, type SpikeTier } from "@/lib/enums";
import type { SpikeAssessmentData } from "@/lib/types";

interface SpikePanelProps {
  /** The parsed assessment, or null when none has been computed yet. */
  spike: SpikeAssessmentData | null;
  /** Titles of the peak activities, in the same order as spike.peakActivityIds. */
  peakTitles: string[];
}

/** Map a spike tier to a Badge variant. Higher tiers read as stronger/positive. */
function tierBadge(tier: SpikeTier): {
  variant: "default" | "secondary" | "outline" | "destructive" | "warning" | "success";
  label: string;
} {
  const label = SPIKE_TIER_LABELS[tier];
  switch (tier) {
    case "EXCEPTIONAL":
    case "NATIONAL":
      return { variant: "success", label };
    case "STRONG":
      return { variant: "default", label };
    case "SOLID":
      return { variant: "secondary", label };
    case "EMERGING":
    default:
      return { variant: "outline", label };
  }
}

/** Small client island: triggers a (re)compute with pending state. */
function ComputeSpikeButton({
  hasSpike,
  pending,
  onClick,
}: {
  hasSpike: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  const label = hasSpike ? "Recompute spike" : "Compute spike";
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
      {hasSpike ? <RefreshCw /> : <Sparkles />}
      {pending ? "Computing…" : label}
    </Button>
  );
}

export function SpikePanel({ spike, peakTitles }: SpikePanelProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const handleCompute = React.useCallback(
    (force: boolean) => {
      setError(null);
      startTransition(async () => {
        const res = await computeSpikeAction(force);
        if (!res.ok) {
          setError(res.error);
        }
        // On success, revalidatePath("/") re-renders the server page and feeds
        // fresh props back into this island.
      });
    },
    [],
  );

  // --- Empty state: no assessment yet ---
  if (spike === null) {
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Your Spike Index</CardTitle>
          </div>
          <CardDescription>
            A 0–100 measure of how sharp, concentrated, and original your strongest
            theme is — decomposed into peak, concentration, trajectory, and originality.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Couldn&apos;t compute your spike</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <EmptyState
            icon={<Sparkles />}
            title="No spike computed yet"
            description="Compute your Spike Index to see your strongest theme, how concentrated it is, and the concrete next step to the tier above."
            action={
              <ComputeSpikeButton
                hasSpike={false}
                pending={pending}
                onClick={() => handleCompute(false)}
              />
            }
          />
        </CardContent>
      </Card>
    );
  }

  const tb = tierBadge(spike.tier);
  const { peak, concentration, trajectory, originality } = spike.components;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Your Spike Index</CardTitle>
          <ComputeSpikeButton
            hasSpike
            pending={pending}
            onClick={() => handleCompute(true)}
          />
        </div>
        <CardDescription>
          How sharp, concentrated, and original your strongest theme is.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t recompute your spike</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {/* --- Index + tier + dominant theme --- */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <SpikeDial value={spike.spikeIndex} />
          <div className="space-y-2">
            <Badge variant={tb.variant} className="text-sm">
              {tb.label} spike
            </Badge>
            <p className="text-sm text-muted-foreground">
              Dominant theme:{" "}
              <span className="font-medium text-foreground">
                {spike.dominantTheme || "Undefined"}
              </span>
            </p>
          </div>
        </div>

        {/* --- Decomposition — ALWAYS shown, never a bare number --- */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">How it breaks down</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <ScoreBar label="Peak" value={round1(peak)} />
            <ScoreBar label="Concentration" value={round1(concentration)} />
            <ScoreBar label="Trajectory" value={round1(trajectory)} />
            <ScoreBar label="Originality" value={round1(originality)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Peak weighs most (40%); concentration, trajectory, and originality each
            contribute 20%.
          </p>
        </div>

        {/* --- Peak activities --- */}
        {peakTitles.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">
              {peakTitles.length === 1 ? "Peak activity" : "Peak activities"}
            </h4>
            <ul className="flex flex-wrap gap-2">
              {peakTitles.map((title, i) => (
                <li key={`peak-${i}`}>
                  <Badge variant="secondary">{title}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* --- Nearest archetype (rarityAnchor) --- */}
        {spike.rarityAnchor ? (
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-foreground">Closest admit pattern</h4>
            <p className="text-sm text-muted-foreground">{spike.rarityAnchor}</p>
            <p className="text-xs text-muted-foreground">
              An anonymized pattern, not a guarantee — outcomes reflect survivorship.
            </p>
          </div>
        ) : null}

        {/* --- Gap to next tier — concrete + time-aware --- */}
        {spike.gapToNextTier ? (
          <div className="flex gap-2 rounded-md border border-border bg-muted/40 p-3">
            <Target className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Your next step up</p>
              <p className="text-sm text-muted-foreground">{spike.gapToNextTier}</p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Large numeric dial for the 0–100 index, with a thin progress arc backdrop. */
function SpikeDial({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="relative flex size-24 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(hsl(var(--primary)) ${clamped * 3.6}deg, hsl(var(--secondary)) 0deg)`,
      }}
      role="img"
      aria-label={`Spike Index ${clamped} out of 100`}
    >
      <div className="flex size-[78%] flex-col items-center justify-center rounded-full bg-card">
        <span className="text-2xl font-semibold tabular-nums leading-none text-foreground">
          {clamped}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
