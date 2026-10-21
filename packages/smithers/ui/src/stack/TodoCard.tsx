/** @jsxImportSource react */
import { type ComponentProps, useId, useRef, useState } from "react";
import { cn } from "../cn";
import { Markdown } from "../primitives/markdown";
import { useInjectUiCss } from "../styles";
import { isDroppable, type TodoPending, type TodoState, todoNumberText } from "./todo";
import { AcceptanceList, DropControl, TodoPendingChip, TodoStateBadge } from "./TodoParts";

export type TodoCardProps = Omit<ComponentProps<"article">, "children" | "title" | "onDrop"> & {
  /** `null` until the stack numbers it: the header shows `T–`. */
  number: number | null;
  title: string;
  state: TodoState;
  /** The person's prompt, Markdown, rendered as untrusted text: no HTML tag becomes an element. */
  prompt: string;
  /** Acceptance criteria, if any: a short list under the prompt. */
  acceptance?: ReadonlyArray<string>;
  /** This device's commit or drop still on its way, or refused: a `Requested` or `Not sent` chip. */
  pending?: TodoPending;
  /** Shows Drop (confirmed inline) unless the TODO is unnumbered, merged or dropped, or a pending chip shows. */
  onDrop?: () => void;
};

/**
 * One TODO at full size: an `article` named by its title heading, with the
 * number, the state chip and a pending chip; the prompt as Markdown; the
 * acceptance criteria; and Drop, which confirms inline once with `Drop T4`
 * and `Cancel`.
 */
export function TodoCard({
  number,
  title,
  state,
  prompt,
  acceptance,
  pending,
  onDrop,
  className,
  ...props
}: TodoCardProps) {
  useInjectUiCss();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [confirming, setConfirming] = useState(false);
  const label = todoNumberText(number);
  return (
    <article
      data-slot="todo-card"
      data-state={state}
      data-pending={pending}
      aria-labelledby={headingId}
      className={cn("sui-todo-card", className)}
      {...props}
    >
      <header className="sui-todo-card-header">
        <span className="sui-todo-number">{label}</span>
        <h2 id={headingId} ref={heading} tabIndex={-1} className="sui-todo-card-title">
          {title}
        </h2>
        <TodoStateBadge state={state} />
        {pending === undefined ? null : <TodoPendingChip pending={pending} />}
      </header>
      <Markdown content={prompt} variant="document" className="sui-todo-card-prompt" />
      {acceptance === undefined || acceptance.length === 0 ? null : <AcceptanceList items={acceptance} />}
      {onDrop === undefined || !isDroppable({ number, state, pending }) ? null : (
        <footer className="sui-todo-card-footer">
          <DropControl
            label={label}
            confirming={confirming}
            onStart={() => setConfirming(true)}
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false);
              heading.current?.focus();
              onDrop();
            }}
          />
        </footer>
      )}
    </article>
  );
}
