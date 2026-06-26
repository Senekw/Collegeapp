import * as React from "react";
import { cn } from "@/lib/utils";

export interface InfoTooltipProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  label: React.ReactNode;
  children: React.ReactNode;
}

/** CSS-hover tooltip — no JS state, no Radix. */
const InfoTooltip = React.forwardRef<HTMLSpanElement, InfoTooltipProps>(
  ({ className, label, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn("group relative inline-flex", className)}
        {...props}
      >
        {children}
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block group-focus-within:block"
        >
          {label}
        </span>
      </span>
    );
  },
);
InfoTooltip.displayName = "InfoTooltip";

export { InfoTooltip };
