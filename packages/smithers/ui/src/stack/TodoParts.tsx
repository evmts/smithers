/** @jsxImportSource react */
import { type KeyboardEvent, type MouseEvent, useCallback, useId, useRef } from "react";
import { Badge } from "../badge";
import { Button } from "../button";
import { TODO_PENDING_WORDS, TODO_STATE_VARIANTS, TODO_STATE_WORDS, type TodoPending, type TodoState } from "./todo";

/** A TODO's state chip. Working carries the status dot. */
export function TodoStateBadge({ state }: { readonly state: TodoState }) {
  return (
    <Badge variant={TODO_STATE_VARIANTS[state]} className="sui-todo-state" data-state={state}>
      {state === "working" ? <span aria-hidden className="sui-status-dot" /> : null}
      {TODO_STATE_WORDS[state]}
    </Badge>
  );
}

/** This device's pending commit or drop: `Requested` muted, `Not sent` destructive. */
export function TodoPendingChip({ pending }: { readonly pending: TodoPending }) {
  return (
    <Badge
      variant={pending === "not_sent" ? "destructive" : "muted"}
      className="sui-todo-pending"
      data-pending={pending}
    >
      {TODO_PENDING_WORDS[pending]}
    </Badge>
  );
}

/** A TODO's acceptance criteria as a short list named `Acceptance criteria`. */
export function AcceptanceList({ items }: { readonly items: ReadonlyArray<string> }) {
  const labelId = useId();
  return (
    <div data-slot="todo-acceptance" className="sui-todo-acceptance">
      <span id={labelId} className="sui-todo-acceptance-label">
        Acceptance criteria
      </span>
      <ul aria-labelledby={labelId} className="sui-todo-acceptance-list">
        {items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    </div>
  );
}

export type DropControlProps = {
  /** The TODO's number text, such as `T4`: the confirm button reads `Drop T4`. */
  readonly label: string;
  /** Whether the confirm buttons show instead of Drop. */
  readonly confirming: boolean;
  /** Drop was pressed. */
  readonly onStart: () => void;
  /** Cancel or Escape was pressed. */
  readonly onCancel: () => void;
  /** `Drop T4` was pressed. The host moves focus, since Drop may not come back. */
  readonly onConfirm: (event: MouseEvent<HTMLButtonElement>) => void;
};

/**
 * Drop, confirmed inline once: Drop becomes `Drop T4` and `Cancel`, and focus
 * moves to Cancel. Cancel or Escape puts Drop back and focuses it. Cancel sits
 * where Drop was, so a double click cancels rather than drops.
 */
export function DropControl({ label, confirming, onStart, onCancel, onConfirm }: DropControlProps) {
  const returning = useRef(false);
  const focusDrop = useCallback((button: HTMLButtonElement | null) => {
    if (button === null || !returning.current) return;
    returning.current = false;
    button.focus();
  }, []);
  const focusCancel = useCallback((button: HTMLButtonElement | null) => {
    button?.focus();
  }, []);
  const cancel = () => {
    returning.current = true;
    onCancel();
  };
  if (!confirming) {
    return (
      <Button ref={focusDrop} variant="ghost" size="sm" data-slot="todo-drop" className="sui-todo-drop" onClick={() => onStart()}>
        Drop
      </Button>
    );
  }
  return (
    <div
      role="group"
      data-slot="todo-drop-confirm"
      className="sui-todo-drop-confirm"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }}
    >
      <Button variant="destructive" size="sm" onClick={(event) => onConfirm(event)}>
        {`Drop ${label}`}
      </Button>
      <Button ref={focusCancel} variant="ghost" size="sm" onClick={() => cancel()}>
        Cancel
      </Button>
    </div>
  );
}
