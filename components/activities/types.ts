// Plain, serializable view models passed from the server page into the client
// island. Prisma Date columns are pre-formatted to strings and JSON columns are
// pre-parsed on the server so the client never imports server-only code.

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
  research: ResearchView | null;
  score: ScoreView | null;
}
