// Plain, serializable view models passed from the server page into the client
// island. Prisma Date columns are pre-formatted to strings and JSON columns are
// pre-parsed on the server so the client never imports server-only code.

import type { DeepDive } from "@/lib/gemini/schemas";
import type { SelectivityBreakdown } from "@/lib/types";

export interface ResearchView {
  outputType: string;
  authorship: string;
  contribution: string[];
  venue: string | null;
  independence: number | null;
  narrative: string | null;
}

export interface ScoreView {
  tier: number;
  impact: number;
  originality: number;
  initiative: number;
  depth: number;
  selectivity: number;
  spikeAlignment: number;
  substantiated: boolean;
  inflationFlags: string[];
  creditMultiplier: number | null;
  rationale: string;
  followUpQuestions: string[];
  /** Parsed Axis-A selectivity breakdown (§6/§11). Empty when not yet scored. */
  selectivityBreakdown: SelectivityBreakdown;
}

export interface ActivityView {
  id: string;
  title: string;
  category: string;
  role: string | null;
  description: string;
  /** ISO yyyy-mm-dd or null, suitable for a date input. */
  startDate: string | null;
  endDate: string | null;
  hoursPerWeek: number | null;
  weeksPerYear: number | null;
  evidenceUrl: string | null;
  spikeTheme: string | null;
  /** Normalized Axis-A program key, when this activity names a program. */
  programKey: string | null;
  research: ResearchView | null;
  /** Parsed Axis-B per-category deep dive (null for research / none yet). */
  deepDive: DeepDive | null;
  score: ScoreView | null;
  /** When Axis-A program enrichment was last resolved (ISO string), or null. */
  enrichedAt: string | null;
}
