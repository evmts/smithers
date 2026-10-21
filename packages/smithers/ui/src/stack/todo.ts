/** A TODO's state (mvp.md §4.1). */
export type TodoState = "queued" | "starting" | "working" | "needs_you" | "in_review" | "merged" | "dropped" | "failed";

/** This device's commit or drop of a TODO that the stack hasn't shown yet: on its way, or refused. */
export type TodoPending = "requested" | "not_sent";

/** The chip each TODO state shows. */
export const TODO_STATE_WORDS: Readonly<Record<TodoState, string>> = {
  queued: "Queued",
  starting: "Starting",
  working: "Working",
  needs_you: "Needs you",
  in_review: "In review",
  merged: "Merged",
  dropped: "Dropped",
  failed: "Failed",
};

/** The chip each pending state shows. */
export const TODO_PENDING_WORDS: Readonly<Record<TodoPending, string>> = { requested: "Requested", not_sent: "Not sent" };

/** The Badge variant each state's chip takes. */
export const TODO_STATE_VARIANTS: Readonly<
  Record<TodoState, "outline" | "default" | "warning" | "success" | "muted" | "destructive">
> = {
  queued: "outline",
  starting: "outline",
  working: "default",
  needs_you: "warning",
  in_review: "default",
  merged: "success",
  dropped: "muted",
  failed: "destructive",
};

/** `T4`, or `T–` for a TODO the stack hasn't numbered yet. */
export const todoNumberText = (number: number | null): string => (number === null ? "T–" : `T${number}`);

/** Merged and dropped TODOs have left the stack. */
export const isSettledTodo = (state: TodoState): boolean => state === "merged" || state === "dropped";

/**
 * Whether a person may drop this TODO: the stack numbered it, it hasn't left
 * the stack, and no commit or drop of it is pending on this device.
 */
export const isDroppable = (todo: {
  readonly number: number | null;
  readonly state: TodoState;
  readonly pending?: TodoPending | undefined;
}): boolean => todo.number !== null && !isSettledTodo(todo.state) && todo.pending === undefined;
