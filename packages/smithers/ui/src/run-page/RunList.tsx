/** @jsxImportSource react */
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";
import { EmptyState } from "../empty-state";
import { safeHref } from "../internal/safeHref";
import { useInjectUiCss } from "../styles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../table";
import { formatRelativeTime } from "../time/formatRelativeTime";
import { clockDuration, type RunState } from "./runPage";
import { RunStatusPill } from "./RunStatusPill";

/** One run in a list. */
export interface RunRow {
  readonly id: string;
  /** The flow's name: the row's link text. */
  readonly flow: string;
  readonly state: RunState;
  readonly cancelRequested?: boolean;
  readonly startedAtMs: number;
  readonly finishedAtMs: number | null;
  /** The run page. */
  readonly href: string;
}

export type RunListProps = Omit<ComponentProps<"div">, "children"> & {
  runs: ReadonlyArray<RunRow>;
  now: number;
  /** Renders the flow's link, such as the router's `Link`; a plain `<a>` otherwise. */
  renderLink?: (href: string, children: ReactNode) => ReactNode;
  /** Shown when there are no runs. Default: `EmptyState` titled `No runs`. */
  empty?: ReactNode;
};

/** Runs as a table: the flow (a link to its run page), its state, when it started and how long it ran. */
export function RunList({ runs, now, renderLink, empty, className, ...props }: RunListProps) {
  useInjectUiCss();
  if (runs.length === 0) {
    return (
      <div data-slot="run-list" data-empty="true" className={cn("sui-run-list", className)} {...props}>
        {empty ?? <EmptyState title="No runs" />}
      </div>
    );
  }
  // The plain link takes only a navigable href; one that isn't shows the flow's name alone.
  const link = renderLink ?? ((href: string, children: ReactNode) => {
    const safe = safeHref(href);
    return safe === undefined ? children : <a href={safe}>{children}</a>;
  });
  return (
    <div data-slot="run-list" className={cn("sui-run-list", className)} {...props}>
      <Table aria-label="Runs">
        <TableHeader>
          <TableRow>
            <TableHead>Flow</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id} data-run={run.id}>
              <TableCell className="sui-run-list-flow">{link(run.href, run.flow)}</TableCell>
              <TableCell>
                <RunStatusPill state={run.state} cancelRequested={run.cancelRequested ?? false} />
              </TableCell>
              <TableCell className="sui-run-list-time">{formatRelativeTime(run.startedAtMs, now)}</TableCell>
              <TableCell className="sui-run-list-time">{clockDuration((run.finishedAtMs ?? now) - run.startedAtMs)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
