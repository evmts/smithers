/** @jsxImportSource react */
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { Badge } from "../badge";
import { cn } from "../cn";
import { EmptyState } from "../empty-state";
import { isPlainNavigationClick } from "../internal/navigationClick";
import { safeHref } from "../internal/safeHref";
import { Skeleton } from "../skeleton";
import { Spinner } from "../spinner";
import { useInjectUiCss } from "../styles";

/** A write this device made that hasn't reached GitHub: on its way (`requested`) or refused (`not_sent`). */
export type IssuesViewPending = "requested" | "not_sent";

/** The chip each pending state shows. */
export const PENDING_WORDS: Readonly<Record<IssuesViewPending, string>> = { requested: "Requested", not_sent: "Not sent" };

/** One issue, as the host loaded it. */
export type IssuesViewIssue = {
  /** Stable row key; defaults to the number. Pending rows have no number yet. */
  readonly id?: string;
  /** `null` while GitHub hasn't numbered the issue; the row shows `#–`. */
  readonly number: number | null;
  readonly title: string;
  readonly state: "open" | "closed";
  readonly labels?: ReadonlyArray<string>;
  readonly author?: string;
  readonly comments?: number;
  /** An ISO 8601 time; the view shows its date. */
  readonly updatedAt?: string;
  /** This device's write still on its way ("requested") or refused ("not_sent"); shown as a small status chip. */
  readonly pending?: IssuesViewPending;
};

export type IssuesViewProps = Omit<ComponentProps<"section">, "children"> & {
  /** The repository the issues belong to, such as `maya/tinyhttp`. */
  repo: string;
  issues: ReadonlyArray<IssuesViewIssue>;
  /** `inline` scrolls the list inside a bounded height; `full` shows every row. */
  size?: "inline" | "full";
  /** The row's link; when set the title is an `<a href>`. */
  href?: (issue: IssuesViewIssue) => string | undefined;
  /**
   * Called on a plain left click of a row's link (no modifier keys), after
   * `preventDefault`, so a host router navigates; modified clicks keep the
   * browser's behavior.
   */
  onNavigate?: (issue: IssuesViewIssue, href: string) => void;
  /** Rows aren't known yet (first sync not complete): a loading state, never "No issues". */
  loading?: boolean;
  /** Header actions, such as a "New issue" button. */
  actions?: ReactNode;
};

/** `#12`, or `#–` for an issue GitHub hasn't numbered yet. */
export const issueNumberText = (number: number | null): string => (number === null ? "#–" : `#${number}`);

/**
 * The `issues` template and a repository's issue list: the issues as the host
 * passed them, in a GitHub-like list. Each row shows the state, number (`#–`
 * before GitHub numbers it), title, labels, a `Requested` or `Not sent` chip
 * for this device's pending write, author, comment count and date.
 *
 * Without `href` it renders data only. With `href` each title is a link, and
 * `onNavigate` turns a plain click into in-app navigation. While `loading`,
 * the list shows placeholders and a status, never "No issues".
 */
export function IssuesView({
  repo,
  issues,
  size = "inline",
  href,
  onNavigate,
  loading = false,
  actions,
  className,
  ...props
}: IssuesViewProps) {
  useInjectUiCss();
  const open = issues.filter((issue) => issue.state === "open").length;
  const follow = (issue: IssuesViewIssue, link: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate === undefined || !isPlainNavigationClick(event)) return;
    event.preventDefault();
    onNavigate(issue, link);
  };
  return (
    <section
      data-slot="issues-view"
      data-size={size}
      aria-label={`${repo} issues`}
      aria-busy={loading || undefined}
      className={cn("sui-issues-view", className)}
      {...props}
    >
      <header className="sui-issues-header">
        <span className="sui-issues-repo">{repo}</span>
        {loading ? (
          <Spinner size="sm" aria-label="Loading issues" className="sui-issues-loading-status" />
        ) : (
          <span className="sui-issues-counts">
            {open} open · {issues.length - open} closed
          </span>
        )}
        {actions === undefined || actions === null ? null : <div className="sui-issues-actions">{actions}</div>}
      </header>
      {issues.length === 0 ? (
        loading ? (
          <div className="sui-issues-loading" aria-hidden>
            <Skeleton className="sui-issues-skeleton" />
            <Skeleton className="sui-issues-skeleton" />
            <Skeleton className="sui-issues-skeleton" />
          </div>
        ) : (
          <EmptyState title="No issues" />
        )
      ) : (
        <ul className="sui-issues-list" tabIndex={size === "inline" ? 0 : undefined}>
          {issues.map((issue, index) => {
            const raw = href?.(issue);
            const link = raw === undefined ? undefined : safeHref(raw);
            return (
              <li
                key={issue.id ?? (issue.number === null ? `pending:${index}` : String(issue.number))}
                className="sui-issues-row"
                data-state={issue.state}
                data-pending={issue.pending}
              >
                <Badge variant={issue.state === "open" ? "success" : "muted"} className="sui-issues-state">
                  <span aria-hidden className="sui-status-dot" />
                  {issue.state === "open" ? "Open" : "Closed"}
                </Badge>
                <div className="sui-issues-main">
                  <div className="sui-issues-title-line">
                    {link === undefined ? (
                      <span className="sui-issues-title">{issue.title}</span>
                    ) : (
                      <a className="sui-issues-title sui-issues-link" href={link} onClick={follow(issue, link)}>
                        {issue.title}
                      </a>
                    )}
                    {issue.labels?.map((label) => (
                      <Badge key={label} variant="outline" className="sui-issues-label">
                        {label}
                      </Badge>
                    ))}
                  </div>
                  <div className="sui-issues-meta">
                    <span className="sui-issues-number">{issueNumberText(issue.number)}</span>
                    {issue.pending === undefined ? null : (
                      <Badge
                        variant={issue.pending === "not_sent" ? "destructive" : "muted"}
                        className="sui-issues-pending"
                      >
                        {PENDING_WORDS[issue.pending]}
                      </Badge>
                    )}
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
            );
          })}
        </ul>
      )}
    </section>
  );
}
