import { LANE_STATES, SETTLED_STATES, type TodoState } from "./contract"

// The stack's rules (decision 0016 §1), as a pure function: what one change does to one repository's stack. The writer
// (worker/stack/Stack.ts) loads the stack inside its transaction, applies a change here, and writes back what changed,
// so these rules have one home, and the property tests (stack.test.ts) prove them over random sequences of changes.
//
// - A TODO's number counts per repository from 1 and is never reused.
// - The stack is the open TODOs (neither merged nor dropped) in `position` order; positions are always 1 to n.
// - A settled TODO has no position.
// - Dropping a dropped TODO changes nothing; a merged one can't be dropped.
// - At most `lanes` TODOs hold a lane (started, and neither settled nor failed). When one frees, the first Queued TODO
//   in order starts. A host that runs no TODOs passes `lanes: 0`, and nothing starts.

/** A TODO as the rules see it. */
export interface Row {
  readonly id: string
  readonly number: number
  readonly state: TodoState
  readonly position: number | null
  /** How many attempts it has had: its next one's ordinal is one more. */
  readonly attempt: number
  /** Its prompt's latest revision, which an attempt works on. */
  readonly revision: number
}

/** One repository's stack, as its writer loaded it under the lock. */
export interface Stack {
  /** The number its next TODO takes. */
  readonly nextNumber: number
  /** How many TODOs may work at once; 0 when this host runs no TODOs. */
  readonly lanes: number
  /** How many TODOs may be open at once. */
  readonly maxOpen: number
  /** Every open TODO, and any settled one a change names. */
  readonly todos: ReadonlyArray<Row>
}

/**
 * A change: append TODO `id`, drop TODO `number`, or finish TODO `id`'s attempt `ordinal` as its run ended it (merged,
 * closed on GitHub as dropped, or failed).
 */
export type Op =
  | { readonly kind: "commit"; readonly id: string }
  | { readonly kind: "drop"; readonly number: number }
  | { readonly kind: "finish"; readonly id: string; readonly ordinal: number; readonly state: FinishedState }

/** How a run ends its TODO. */
export type FinishedState = "merged" | "dropped" | "failed"

/** A TODO that starts an attempt: its run's key is the attempt the writer records for it. */
export interface Start {
  readonly todoId: string
  readonly number: number
  /** The attempt's ordinal: 1 for a TODO's first. */
  readonly ordinal: number
  readonly revision: number
}

/** What a change did, or why the stack refused it. */
export type Result =
  | {
    readonly kind: "committed"
    readonly number: number
    readonly position: number
    readonly starts: ReadonlyArray<Start>
  }
  | {
    readonly kind: "dropped"
    readonly number: number
    /** False when it was dropped already: the change changed nothing. */
    readonly changed: boolean
    /** The TODO's attempt, when it held a lane: its run must stop. */
    readonly stopped: { readonly todoId: string; readonly ordinal: number } | undefined
    readonly starts: ReadonlyArray<Start>
  }
  | {
    readonly kind: "finished"
    readonly number: number
    readonly state: FinishedState
    readonly starts: ReadonlyArray<Start>
  }
  | { readonly kind: "refused"; readonly code: "stack_full" | "merged" | "not_found" | "stale" }

const settled = (state: TodoState): boolean => (SETTLED_STATES as ReadonlyArray<TodoState>).includes(state)
const inLane = (state: TodoState): boolean => (LANE_STATES as ReadonlyArray<TodoState>).includes(state)

/** The open TODOs, in stack order. */
export const openOf = (stack: Stack): ReadonlyArray<Row> => byPosition(stack.todos)

/** `todos`' placed ones, by position. */
const byPosition = (todos: ReadonlyArray<Row>): ReadonlyArray<Row> =>
  todos.filter((todo) => todo.position !== null).sort((a, b) => a.position! - b.position!)

/** Starts the first Queued TODOs in order while a lane is free. */
const fill = (todos: ReadonlyArray<Row>, lanes: number): { todos: ReadonlyArray<Row>; starts: ReadonlyArray<Start> } => {
  const free = lanes - todos.filter((todo) => inLane(todo.state)).length
  const queued = byPosition(todos).filter((todo) => todo.state === "queued")
  const starting = new Set(queued.slice(0, Math.max(0, free)).map((todo) => todo.id))
  const starts: Array<Start> = []
  const next = todos.map((todo) => {
    if (!starting.has(todo.id)) return todo
    const ordinal = todo.attempt + 1
    starts.push({ todoId: todo.id, number: todo.number, ordinal, revision: todo.revision })
    return { ...todo, state: "working" as const, attempt: ordinal }
  })
  return { todos: next, starts }
}

/** Applies `op` to `stack`: the stack after it, and what it did. A refused change leaves the stack as it was. */
export const apply = (stack: Stack, op: Op): { readonly stack: Stack; readonly result: Result } => {
  const open = openOf(stack)
  if (op.kind === "commit") {
    if (open.length >= stack.maxOpen) return { stack, result: { kind: "refused", code: "stack_full" } }
    const todo: Row = {
      id: op.id,
      number: stack.nextNumber,
      state: "queued",
      position: open.length + 1,
      attempt: 0,
      revision: 1,
    }
    const filled = fill([...stack.todos, todo], stack.lanes)
    return {
      stack: { ...stack, nextNumber: stack.nextNumber + 1, todos: filled.todos },
      result: { kind: "committed", number: todo.number, position: todo.position!, starts: filled.starts },
    }
  }
  if (op.kind === "finish") return finish(stack, op)
  const target = stack.todos.find((todo) => todo.number === op.number)
  if (target === undefined) return { stack, result: { kind: "refused", code: "not_found" } }
  if (target.state === "merged") return { stack, result: { kind: "refused", code: "merged" } }
  if (target.state === "dropped") {
    return { stack, result: { kind: "dropped", number: op.number, changed: false, stopped: undefined, starts: [] } }
  }
  const from = target.position!
  const shifted = stack.todos.map((todo): Row =>
    todo.id === target.id
      ? { ...todo, state: "dropped", position: null }
      : todo.position !== null && todo.position > from
      ? { ...todo, position: todo.position - 1 }
      : todo
  )
  const filled = fill(shifted, stack.lanes)
  return {
    stack: { ...stack, todos: filled.todos },
    result: {
      kind: "dropped",
      number: op.number,
      changed: true,
      stopped: inLane(target.state) ? { todoId: target.id, ordinal: target.attempt } : undefined,
      starts: filled.starts,
    },
  }
}

/**
 * A run ends TODO `op.id`'s attempt: only while that attempt holds a lane (a dropped TODO's run, or an earlier attempt's,
 * is `stale`). Merged and dropped leave the stack and close the gap; failed keeps its place. The lane frees either way.
 */
const finish = (stack: Stack, op: Extract<Op, { readonly kind: "finish" }>): { readonly stack: Stack; readonly result: Result } => {
  const target = stack.todos.find((todo) => todo.id === op.id)
  if (target === undefined || !inLane(target.state) || target.attempt !== op.ordinal) {
    return { stack, result: { kind: "refused", code: "stale" } }
  }
  const from = target.position!
  const leaves = op.state !== "failed"
  const changed = stack.todos.map((todo): Row =>
    todo.id === target.id
      ? { ...todo, state: op.state, position: leaves ? null : todo.position }
      : leaves && todo.position !== null && todo.position > from
      ? { ...todo, position: todo.position - 1 }
      : todo
  )
  const filled = fill(changed, stack.lanes)
  return {
    stack: { ...stack, todos: filled.todos },
    result: { kind: "finished", number: target.number, state: op.state, starts: filled.starts },
  }
}

/**
 * What a stack's rules forbid, as one line each; none for a stack that keeps them: unique numbers below `nextNumber`,
 * open positions exactly 1 to n, settled TODOs unplaced and open ones placed, and no more lanes held than allowed.
 */
export const violations = (stack: Stack): ReadonlyArray<string> => {
  const found: Array<string> = []
  const numbers = stack.todos.map((todo) => todo.number)
  if (new Set(numbers).size !== numbers.length) found.push("a number is taken twice")
  if (numbers.some((number) => number < 1 || number >= stack.nextNumber)) found.push("a number outside 1 to next")
  const positions = openOf(stack).map((todo) => todo.position!)
  if (positions.some((position, index) => position !== index + 1)) found.push("open positions aren't 1 to n")
  if (stack.todos.some((todo) => settled(todo.state) !== (todo.position === null))) {
    found.push("a settled TODO is placed, or an open one isn't")
  }
  if (positions.length > stack.maxOpen) found.push("more TODOs open than allowed")
  if (stack.todos.filter((todo) => inLane(todo.state)).length > Math.max(stack.lanes, 0)) {
    found.push("more lanes held than allowed")
  }
  return found
}
