/** @jsxImportSource react */
import type { ComponentProps } from "react";
import { cn } from "../cn";
import { useInjectUiCss } from "../styles";
import { STEP_WORDS, stepDuration, stepElapsed, type StepRow, waterfallBars } from "./runPage";

export type RunWaterfallProps = Omit<ComponentProps<"div">, "children" | "onSelect"> & {
  steps: ReadonlyArray<StepRow>;
  now: number;
  selected?: string | null;
  /** With it, each bar is a button that selects its step. */
  onSelect?: (id: string) => void;
};

/**
 * The run's timeline: one bar per step on a shared axis from the earliest
 * start to the latest end. An open step runs to `now`; a step that ended where
 * it began is a marker.
 */
export function RunWaterfall({ steps, now, selected = null, onSelect, className, ...props }: RunWaterfallProps) {
  useInjectUiCss();
  const bars = waterfallBars(steps, now);
  return (
    <div role="list" aria-label="Timeline" data-slot="run-waterfall" className={cn("sui-waterfall", className)} {...props}>
      {steps.map((step, index) => {
        const bar = bars[index]!;
        const name = `${step.label}, ${STEP_WORDS[step.state]}, ${stepDuration(stepElapsed(step, now))}`;
        const shape = (
          <span
            className="sui-waterfall-bar"
            data-instant={bar.instant ? "true" : undefined}
            data-open={bar.open ? "true" : undefined}
            style={{ left: `${bar.left}%`, width: bar.instant ? undefined : `${bar.width}%` }}
          />
        );
        return (
          <div
            key={step.id}
            role="listitem"
            data-step={step.id}
            data-state={step.state}
            data-selected={step.id === selected ? "true" : undefined}
            className="sui-waterfall-row"
          >
            <span className="sui-waterfall-label" aria-hidden>
              {step.label}
            </span>
            {onSelect === undefined ? (
              <span className="sui-waterfall-track" role="img" aria-label={name}>
                {shape}
              </span>
            ) : (
              <button
                type="button"
                className="sui-waterfall-track"
                aria-label={name}
                aria-pressed={step.id === selected}
                onClick={() => onSelect(step.id)}
              >
                {shape}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
