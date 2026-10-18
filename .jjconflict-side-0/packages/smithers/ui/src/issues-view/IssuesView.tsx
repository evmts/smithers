/** @jsxImportSource react */
import type { ComponentProps } from "react";
import { Badge } from "../badge";
import { cn } from "../cn";
import { EmptyState } from "../empty-state";
import { useInjectUiCss } from "../styles";

/** One issue, as the host loaded it. */
export type IssuesViewIssue = {
  readonly number: number;
  readonly title: string;
  readonly state: "open" | "closed";
  readonly labels?: ReadonlyArray<string>;
  readonly author?: string;
  readonly comments?: number;
  /** An ISO 8601 time; the view shows its date. */
  readonly updatedAt?: string;
};

export type IssuesViewProps = Omit<ComponentProps<"section">, "children"> & {
  /** The repository the issues belong to, such as `maya/tinyhttp`. */
  repo: string;
  issues: ReadonlyArray<IssuesViewIssue>;
  /** `inline` scrolls the list inside a bounded height; `full` shows every row. */
  size?: "inline" | "full";
};

/**
 * The `issues` template: a repository's issues as the host passed them, in a
 * GitHub-like list. Each row shows the state, number, title, labels, author,
 * comment count and date. It renders data only: nothing in it navigates.
 */
export function IssuesView({ repo, issues, size = "inline", className, ...props }: IssuesViewProps) {
  useInjectUiCss();
  const open = issues.filter((issue) => issue.state === "open").length;
  return (
    <section
      data-slot="issues-view"
      data-size={size}
      aria-label={`${repo} issues`}
      className={cn("sui-issues-view", className)}
      {...props}
    >
      <header className="sui-issues-header">
        <span className="sui-issues-repo">{repo}</span>
        <span className="sui-issues-counts">
          {open} open · {issues.length - open} closed
        </span>
      </header>
      {issues.length === 0 ? (
        <EmptyState title="No issues" />
      ) : (
        <ul className="sui-issues-list" tabIndex={size === "inline" ? 0 : undefined}>
          {issues.map((issue) => (
            <li key={issue.number} className="sui-issues-row" data-state={issue.state}>
              <Badge variant={issue.state === "open" ? "success" : "muted"} className="sui-issues-state">
                <span aria-hidden className="sui-status-dot" />
                {issue.state === "open" ? "Open" : "Closed"}
              </Badge>
              <div className="sui-issues-main">
                <div className="sui-issues-title-line">
                  <span className="sui-issues-title">{issue.title}</span>
                  {issue.labels?.map((label) => (
                    <Badge key={label} variant="outline" className="sui-issues-label">
                      {label}
                    </Badge>
                  ))}
                </div>
                <div className="sui-issues-meta">
                  <span className="sui-issues-number">#{issue.number}</span>
                  {issue.author === undefined ? null : <span className="sui-issues-author">{issue.author}</span>}
                  {issue.updatedAt === undefined ? null : (
                    <time dateTime={issue.updatedAt}>{issue.updatedAt.slice(0, 10)}</time>
                  )}
                </div>
              </div>
              {issue.comments === undefined || issue.comments === 0 ? null : (
                <span className="sui-issues-comments" aria-label={`${issue.comments} comments`}>
                  {issue.comments}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
