/** @jsxImportSource react */
import { type ComponentProps, type KeyboardEvent, type MouseEvent, type ReactNode, useId, useState } from "react";
import { cn } from "../cn";
import { EmptyState } from "../empty-state";
import { isPlainNavigationClick } from "../internal/navigationClick";
import { safeHref } from "../internal/safeHref";
import { Skeleton } from "../skeleton";
import { Spinner } from "../spinner";
import { useInjectUiCss } from "../styles";
import { isDroppable, type TodoPending, type TodoState, todoNumberText } from "./todo";
import { DropControl, TodoPendingChip, TodoStateBadge } from "./TodoParts";

/** One TODO on the stack, as the host loaded it. */
export type StackListTodo = {
  readonly id: string;
  /** `null` until the stack numbers it: the row shows `T–`. */
  readonly number: number | null;
  readonly title: string;
  readonly state: TodoState;
  /** This device's commit or drop still on its way, or refused: a `Requested` or `Not sent` chip. */
  readonly pending?: TodoPending;
};

export type StackListProps = Omit<ComponentProps<"section">, "children" | "onDrop"> & {
  /** `owner/name`: names the section `<repo> stack`. */
  repo: string;
  /** In the host's order: the stack's open items first, in merge order, then settled ones. */
  todos: ReadonlyArray<StackListTodo>;
  /** A row's link; when set, the title is an `<a href>` (through `safeHref`). */
  href?: (todo: StackListTodo) => string | undefined;
  /**
   * Called on a plain left click of a row's link (no modifier keys), after
   * `preventDefault`, so a host router navigates; modified clicks keep the
   * browser's behavior.
   */
  onNavigate?: (todo: StackListTodo, href: string) => void;
  /** Shows Drop on each row that is numbered, not merged or dropped, and has no pending chip. Absent: no Drop. */
  onDrop?: (todo: StackListTodo) => void;
  /** Rows aren't known yet: placeholders and a status, never the empty state. */
  loading?: boolean;
  /** Header actions, such as a `New TODO` button. */
  actions?: ReactNode;
  /** The id of the TODO the page shows: its row gets `aria-current="true"`. */
  selected?: string;
};

/** Keys that move focus between rows, unmodified. */
const ROW_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

/** Marks the element a row's keyboard focus lands on: its title link, else the row. */
const TARGET_ATTR = "data-stack-target";

/** The focus target of the row holding `element`, if any. */
const rowTarget = (element: Element): HTMLElement | null => {
  const row = element.closest<HTMLElement>("[data-todo]");
  if (row === null) return null;
  return row.hasAttribute(TARGET_ATTR) ? row : row.querySelector<HTMLElement>(`[${TARGET_ATTR}]`);
};

/**
 * A repository's stack: its TODOs in the order the host passes, as an ordered
 * list named `Stack`. Each row shows the number (`T4`, or `T–` before the
 * stack numbers it), the title, the state chip, a `Requested` or `Not sent`
 * chip for this device's pending write, and Drop when `onDrop` is set and the
 * TODO may be dropped. Drop confirms inline once: `Drop T4` and `Cancel`.
 *
 * ArrowDown and ArrowUp move focus between rows (their title links, or the
 * rows themselves when a row has no link), Home and End to the first and last.
 * While `loading`, the list shows placeholders and a status, never `No TODOs`.
 */
export function StackList({
  repo,
  todos,
  href,
  onNavigate,
  onDrop,
  loading = false,
  actions,
  selected,
  className,
  ...props
}: StackListProps) {
  useInjectUiCss();
  const headingId = useId();
  const [confirming, setConfirming] = useState<string | null>(null);
  const follow = (todo: StackListTodo, link: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate === undefined || !isPlainNavigationClick(event)) return;
    event.preventDefault();
    onNavigate(todo, link);
  };
  const moveFocus = (event: KeyboardEvent<HTMLOListElement>) => {
    if (!ROW_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const targets = [...event.currentTarget.querySelectorAll<HTMLElement>(`[${TARGET_ATTR}]`)];
    if (targets.length === 0) return;
    const current = rowTarget(event.target as Element);
    const at = current === null ? -1 : targets.indexOf(current);
    const last = targets.length - 1;
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? last : event.key === "ArrowDown" ? Math.min(at + 1, last) : Math.max(at - 1, 0);
    event.preventDefault();
    targets[next]!.focus();
  };
  return (
    <section
      data-slot="stack-list"
      aria-label={`${repo} stack`}
      aria-busy={loading || undefined}
      className={cn("sui-stack-list", className)}
      {...props}
    >
      <header className="sui-stack-header">
        <h2 id={headingId} className="sui-stack-heading">
          Stack
        </h2>
        {loading ? <Spinner size="sm" aria-label="Loading stack" className="sui-stack-loading-status" /> : null}
        {actions === undefined || actions === null ? null : <div className="sui-stack-actions">{actions}</div>}
      </header>
      {todos.length === 0 ? (
        loading ? (
          <div className="sui-stack-loading" aria-hidden>
            <Skeleton className="sui-stack-skeleton" />
            <Skeleton className="sui-stack-skeleton" />
            <Skeleton className="sui-stack-skeleton" />
          </div>
        ) : (
          <EmptyState title="No TODOs" />
        )
      ) : (
        <ol aria-labelledby={headingId} className="sui-stack-rows" onKeyDown={moveFocus}>
          {todos.map((todo) => {
            const raw = href?.(todo);
            const link = raw === undefined ? undefined : safeHref(raw);
            const label = todoNumberText(todo.number);
            return (
              <li
                key={todo.id}
                data-slot="stack-row"
                data-todo={todo.id}
                data-state={todo.state}
                data-pending={todo.pending}
                aria-current={selected === todo.id ? "true" : undefined}
                className="sui-stack-row"
                tabIndex={link === undefined ? 0 : undefined}
                data-stack-target={link === undefined ? "" : undefined}
              >
                <span className="sui-todo-number">{label}</span>
                <span className="sui-stack-main">
                  {link === undefined ? (
                    <span className="sui-stack-title">{todo.title}</span>
                  ) : (
                    <a className="sui-stack-title sui-stack-link" href={link} onClick={follow(todo, link)} data-stack-target="">
                      {todo.title}
                    </a>
                  )}
                </span>
                <TodoStateBadge state={todo.state} />
                {todo.pending === undefined ? null : <TodoPendingChip pending={todo.pending} />}
                {onDrop === undefined || !isDroppable(todo) ? null : (
                  <DropControl
                    label={label}
                    confirming={confirming === todo.id}
                    onStart={() => setConfirming(todo.id)}
                    onCancel={() => setConfirming(null)}
                    onConfirm={(event) => {
                      setConfirming(null);
                      rowTarget(event.currentTarget)?.focus();
                      onDrop(todo);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
