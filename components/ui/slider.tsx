"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface RangeSliderProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type"
  > {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

const RangeSlider = React.forwardRef<HTMLInputElement, RangeSliderProps>(
  (
    { className, value, onValueChange, min = 0, max = 10, step = 1, ...props },
    ref,
  ) => {
    return (
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onValueChange(Number(e.target.value))}
        className={cn(
          "h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
RangeSlider.displayName = "RangeSlider";

export { RangeSlider };
