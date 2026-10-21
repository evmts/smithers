/** @jsxImportSource react */
import { type ComponentProps, type KeyboardEvent, type ReactNode, useId } from "react";
import { Badge } from "../badge";
import { Button } from "../button";
import { cn } from "../cn";
import { Textarea } from "../input";
import { issueNumberText, PENDING_WORDS, type IssuesViewPending } from "../issues-view/IssuesView";
import { safeHref } from "../internal/safeHref";
import { Markdown } from "../primitives/markdown";
import { Skeleton } from "../skeleton";
import { Spinner } from "../spinner";
import { useInjectUiCss } from "../styles";
import { RelativeTime } from "../time/RelativeTime";

/** One comment on an issue, in the order the host passes them. */
export type ItemConversationComment = {
  readonly id: string;
  readonly author?: string;
  /** ISO 8601. */
  readonly createdAt?: string;
  /** Markdown. */
  readonly body: string;
  readonly pending?: IssuesViewPending;
  /** Shown for a not_sent comment: a short closed reason such as "Not allowed" (the host decides the words). */
  readonly reason?: string;
  /** Buttons for this comment, such as Edit and Discard for a not-sent one. */
  readonly actions?: ReactNode;
};

/** The comment composer. Controlled: the host owns the draft. */
export type ItemConversationComposer = {
  readonly draft: string;
  readonly onDraft: (text: string) => void;
  readonly onSubmit: () => void;
  readonly disabled?: boolean;
  /** Accessible label of the textarea; default "Comment". */
  readonly label?: string;
};

export type ItemConversationProps = Omit<ComponentProps<"article">, "children" | "title"> & {
  title: string;
  number: number | null;
  state: "open" | "closed";
  author?: string;
  /** ISO 8601. */
  createdAt?: string;
  /** Markdown. */
  body: string;
  pending?: IssuesViewPending;
  comments: ReadonlyArray<ItemConversationComment>;
  /** "Open on GitHub ↗" link target, when known. */
  externalHref?: string;
  /** Rows aren't known yet: a loading state. */
  loading?: boolean;
  /** The composer; absent when this person can't comment (hidden, not disabled). Controlled. */
  composer?: ItemConversationComposer;
  /** The title's heading level. Default `h1`. */
  headingLevel?: 1 | 2 | 3;
  /** Controls at the end of the header's meta row, such as `TriageControl`. Not rendered while `loading`. */
  headerActions?: ReactNode;
};

/** ⌘Enter on macOS, Ctrl+Enter elsewhere; never while an IME composes. */
export const isSubmitChord = (event: KeyboardEvent<HTMLElement>): boolean =>
  event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing;

/** A timestamp as a ticking relative time, or nothing when it isn't a date. */
function When({ iso }: { readonly iso: string | undefined }) {
  if (iso === undefined) return null;
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? null : <RelativeTime ts={ts} />;
}

function PendingChip({ pending }: { readonly pending: IssuesViewPending | undefined }) {
  if (pending === undefined) return null;
  return (
    <Badge variant={pending === "not_sent" ? "destructive" : "muted"} className="sui-item-conv-pending">
      {PENDING_WORDS[pending]}
    </Badge>
  );
}

/**
 * One issue's page: the title with `#number` (`#–` before GitHub numbers it),
 * an Open or Closed badge, the author, an optional "Open on GitHub ↗" link
 * and the host's `headerActions`; the body; the comments in order as an `<ol>`; and the composer when the
 * person may comment.
 *
 * Bodies and comments render through the light `Markdown` in its `document`
 * variant, as GitHub renders them: HTML comments (issue templates) are dropped
 * and no tag the text names, a `<script>` included, ever becomes an element.
 *
 * A pending item or comment carries a `Requested` or `Not sent` chip and
 * `data-pending`; a not-sent comment shows its `reason` and `actions`. The
 * composer submits on its button, ⌘Enter or Ctrl+Enter, and only while the
 * trimmed draft is non-empty and it isn't `disabled`. While `loading` the page
 * shows placeholders and a status, and no composer or header actions.
 */
export function ItemConversation({
  title,
  number,
  state,
  author,
  createdAt,
  body,
  pending,
  comments,
  externalHref,
  loading = false,
  composer,
  headingLevel = 1,
  headerActions,
  className,
  ...props
}: ItemConversationProps) {
  useInjectUiCss();
  const titleId = useId();
  const draftId = useId();
  const Heading = `h${headingLevel}` as const;

  if (loading) {
    return (
      <article
        data-slot="item-conversation"
        aria-busy="true"
        aria-label="Loading"
        className={cn("sui-item-conv", className)}
        {...props}
      >
        <Spinner aria-label="Loading" className="sui-item-conv-loading-status" />
        <div className="sui-item-conv-loading" aria-hidden>
          <Skeleton className="sui-item-conv-skeleton-title" />
          <Skeleton className="sui-item-conv-skeleton-body" />
          <Skeleton className="sui-item-conv-skeleton-body" />
        </div>
      </article>
    );
  }

  const external = externalHref === undefined ? undefined : safeHref(externalHref);
  const canSubmit = composer !== undefined && composer.disabled !== true && composer.draft.trim() !== "";
  const submit = () => {
    if (canSubmit) composer?.onSubmit();
  };

  return (
    <article
      data-slot="item-conversation"
      data-state={state}
      data-pending={pending}
      aria-labelledby={titleId}
      className={cn("sui-item-conv", className)}
      {...props}
    >
      <header className="sui-item-conv-header">
        <Heading id={titleId} className="sui-item-conv-title">
          {title} <span className="sui-item-conv-number">{issueNumberText(number)}</span>
        </Heading>
        <div className="sui-item-conv-meta">
          <Badge variant={state === "open" ? "success" : "muted"} className="sui-item-conv-state">
            <span aria-hidden className="sui-status-dot" />
            {state === "open" ? "Open" : "Closed"}
          </Badge>
          <PendingChip pending={pending} />
          {author === undefined ? null : <span className="sui-item-conv-author">{author}</span>}
          <When iso={createdAt} />
          {external === undefined ? null : (
            <a className="sui-item-conv-external" href={external} target="_blank" rel="noopener noreferrer">
              Open on GitHub ↗
            </a>
          )}
          {headerActions === undefined || headerActions === null ? null : (
            <div className="sui-item-conv-header-actions">{headerActions}</div>
          )}
        </div>
      </header>
      {body.trim() === "" ? null : (
        <div className="sui-item-conv-post">
          <Markdown content={body} variant="document" />
        </div>
      )}
      {comments.length === 0 ? null : (
        <ol className="sui-item-conv-comments" aria-label="Comments">
          {comments.map((comment) => (
            <li key={comment.id} className="sui-item-conv-comment" data-pending={comment.pending}>
              <div className="sui-item-conv-comment-meta">
                {comment.author === undefined ? null : <span className="sui-item-conv-author">{comment.author}</span>}
                <When iso={comment.createdAt} />
                <PendingChip pending={comment.pending} />
                {comment.pending === "not_sent" && comment.reason !== undefined ? (
                  <span className="sui-item-conv-reason">{comment.reason}</span>
                ) : null}
              </div>
              <Markdown content={comment.body} variant="document" />
              {comment.actions === undefined || comment.actions === null ? null : (
                <div className="sui-item-conv-comment-actions">{comment.actions}</div>
              )}
            </li>
          ))}
        </ol>
      )}
      {composer === undefined ? null : (
        <form
          className="sui-item-conv-composer"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label htmlFor={draftId} className="sui-sr-only">
            {composer.label ?? "Comment"}
          </label>
          <Textarea
            id={draftId}
            value={composer.draft}
            onChange={(event) => composer.onDraft(event.target.value)}
            onKeyDown={(event) => {
              if (!isSubmitChord(event)) return;
              event.preventDefault();
              submit();
            }}
          />
          <div className="sui-item-conv-composer-actions">
            <Button type="submit" disabled={!canSubmit}>
              Comment
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}
