import * as React from "react";
import { cn } from "@/lib/utils";

export interface ScoreBarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: number;
  max?: number;
}

const ScoreBar = React.forwardRef<HTMLDivElement, ScoreBarProps>(
  ({ className, label, value, max = 10, ...props }, ref) => {
    const safeMax = max > 0 ? max : 1;
    const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
    return (
      <div ref={ref} className={cn("space-y-1", className)} {...props}>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">{label}</span>
          <span className="tabular-nums text-muted-foreground">
            {value}/{max}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  },
);
ScoreBar.displayName = "ScoreBar";

export { ScoreBar };
