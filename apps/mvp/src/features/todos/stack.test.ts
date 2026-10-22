// The stack's rules (src/features/todos/stack.ts, decision 0016 §1 and §7): property tests over random sequences of
// commits, drops, runs publishing their pull requests and runs failing, on stacks of random size limits and lanes,
// against a model that is only a list of ids in order; and the rules one case at a time.
import { Arbitrary, Effect, Schema } from "effect"
import { describe, expect, test } from "vitest"
import { apply, openOf, type Op, type Row, type Stack, violations } from "./stack"

/**
 * One step of a random history: a person's commit or drop, or a run publishing or failing its started TODO (Track B's
 * writer ops).
 */
const Step = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("commit") }),
  Schema.Struct({ kind: Schema.Literal("publish"), pick: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 24 })) }),
  Schema.Struct({ kind: Schema.Literal("drop"), pick: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 24 })) }),
  Schema.Struct({ kind: Schema.Literal("again"), pick: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 24 })) }),
  Schema.Struct({ kind: Schema.Literal("fail"), pick: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 24 })) }),
])
type Step = typeof Step.Type

const History = Arbitrary.all({
  lanes: Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }))),
  maxOpen: Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 6 }))),
  steps: Arbitrary.array(Arbitrary.schema(Step), { maxLength: 80 }),
})

const empty = (lanes: number, maxOpen: number): Stack => ({ nextNumber: 1, lanes, maxOpen, todos: [] })

/** Runs a property over `runs` random histories; fails the test with the shrunk history when it doesn't hold. */
const check = async <A>(arbitrary: Arbitrary.Arbitrary<A>, property: (value: A) => boolean, runs = 400) => {
  // `size` lets histories grow to their full length: checking starts small and grows toward it.
  const result = await Effect.runPromise(Arbitrary.checkEffect(arbitrary, property, { runs, size: 100, seed: 20261020 }))
  expect(Arbitrary.formatCheckFailure(result)).toBeUndefined()
}


/**
 * Plays `steps` from an empty stack, with the model alongside: the ids of the open TODOs in order. Calls `each` after
 * every step with the stacks before and after, what the step did, and the model; answers whether every call held.
 */
const play = (
  history: { readonly lanes: number; readonly maxOpen: number; readonly steps: ReadonlyArray<Step> },
  each: (step: {
    readonly before: Stack
    readonly after: Stack
    readonly op: Op | undefined
    readonly result: ReturnType<typeof apply>["result"] | undefined
    readonly model: ReadonlyArray<string>
  }) => boolean,
) => {
  let stack = empty(history.lanes, history.maxOpen)
  let model: Array<string> = []
  let ids = 0
  for (const step of history.steps) {
    const before = stack
    // Picks among every TODO ever made, settled ones included, so drops of dropped TODOs come up.
    const picked = before.todos[step.kind === "commit" ? 0 : step.pick % Math.max(before.todos.length, 1)]
    if (step.kind === "fail") {
      if (picked === undefined || !["working", "in_review"].includes(picked.state)) continue
      stack = apply(before, { kind: "finish", id: picked.id, ordinal: picked.attempt, state: "failed" }).stack
      if (!each({ before, after: stack, op: undefined, result: undefined, model })) return false
      continue
    }
    if (step.kind === "publish") {
      if (picked === undefined || picked.state !== "working") continue
      const op: Op = { kind: "publish", id: picked.id, ordinal: picked.attempt }
      const published = apply(before, op)
      stack = published.stack
      if (!each({ before, after: stack, op, result: published.result, model })) return false
      continue
    }
    const op: Op = step.kind === "commit"
      ? { kind: "commit", id: `todo-${++ids}` }
      : { kind: "drop", number: picked === undefined ? step.pick + 1 : picked.number }
    const applied = apply(before, op)
    stack = applied.stack
    if (applied.result.kind === "committed" && op.kind === "commit") model = [...model, op.id]
    if (applied.result.kind === "dropped" && op.kind === "drop") {
      model = model.filter((id) => before.todos.find((todo) => todo.number === op.number)?.id !== id)
    }
    if (!each({ before, after: stack, op, result: applied.result, model })) return false
    // `again`: the same drop once more answers dropped and changes nothing.
    if (step.kind === "again" && op.kind === "drop" && applied.result.kind === "dropped") {
      const repeated = apply(stack, op)
      if (repeated.result.kind !== "dropped" || repeated.result.changed || repeated.stack !== stack) return false
    }
  }
  return true
}

const openIds = (stack: Stack) => openOf(stack).map((todo) => todo.id)

describe("the stack's invariants, over random histories", () => {
  test("every stack keeps the rules: unique numbers, positions 1 to n, settled unplaced, limits held", () =>
    check(History, (history) => play(history, ({ after }) => violations(after).length === 0)))

  test("order is the model's: commits append, drops take out, nothing else moves", () =>
    check(History, (history) => play(history, ({ after, model }) => JSON.stringify(openIds(after)) === JSON.stringify(model))))

  test("numbers count up from 1 and are never reused", () =>
    check(History, (history) => {
      const seen = new Set<number>()
      return play(history, ({ before, result }) => {
        if (result?.kind !== "committed") return true
        if (seen.has(result.number) || result.number !== before.nextNumber) return false
        seen.add(result.number)
        return true
      })
    }))

  test("Drop is idempotent: the same drop again answers dropped and changes nothing", () =>
    check(
      Arbitrary.map(History, (history) => ({
        ...history,
        steps: history.steps.map((step): Step => (step.kind === "drop" ? { kind: "again", pick: step.pick } : step)),
      })),
      (history) => play(history, () => true),
    ))

  test("a refused change leaves the stack exactly as it was", () =>
    check(History, (history) => play(history, ({ before, after, result }) => result?.kind !== "refused" || before === after)))

  // A no-op drop leaves the stack exactly as it was, even when a failure the run reported left a lane free; the next
  // change that changes the stack fills it.
  test("no lane is idle while a TODO waits: after a change, a free lane means nothing is Queued", () =>
    check(History, (history) =>
      play(history, ({ after, op, result }) => {
        if (op === undefined || result?.kind === "refused" || (result?.kind === "dropped" && !result.changed)) return true
        const held = after.todos.filter((todo) => todo.state === "working")
        return held.length >= after.lanes || openOf(after).every((todo) => todo.state !== "queued")
      })))

  test("each start is the first Queued TODO, on its next attempt", () =>
    check(History, (history) =>
      play(history, ({ before, after, result }) => {
        if (result === undefined || result.kind === "refused") return true
        return result.starts.every((start) => {
          const was = before.todos.find((todo) => todo.id === start.todoId)
          const now = after.todos.find((todo) => todo.id === start.todoId)!
          return now.state === "working" && now.attempt === start.ordinal && start.ordinal === (was?.attempt ?? 0) + 1
        })
      })))
})

describe("apply, case by case", () => {
  const queued = (id: string, number: number, position: number): Row => ({
    id,
    number,
    state: "queued",
    position,
    attempt: 0,
    revision: 1,
  })

  test("a commit takes the next number and the last position, Queued, revision 1", () => {
    const { stack, result } = apply({ nextNumber: 7, lanes: 0, maxOpen: 5, todos: [queued("a", 6, 1)] }, {
      kind: "commit",
      id: "b",
    })
    expect(result).toEqual({ kind: "committed", number: 7, position: 2, starts: [] })
    expect(stack.nextNumber).toBe(8)
    expect(stack.todos.find((todo) => todo.id === "b")).toEqual({
      id: "b",
      number: 7,
      state: "queued",
      position: 2,
      attempt: 0,
      revision: 1,
    })
  })

  test("a full stack refuses a commit and keeps its next number", () => {
    const full: Stack = { nextNumber: 3, lanes: 0, maxOpen: 2, todos: [queued("a", 1, 1), queued("b", 2, 2)] }
    expect(apply(full, { kind: "commit", id: "c" })).toEqual({
      stack: full,
      result: { kind: "refused", code: "stack_full" },
    })
  })

  test("with a free lane, a commit starts the first Queued TODO on its first attempt", () => {
    const { stack, result } = apply({ nextNumber: 1, lanes: 1, maxOpen: 5, todos: [] }, { kind: "commit", id: "a" })
    expect(result).toEqual({
      kind: "committed",
      number: 1,
      position: 1,
      starts: [{ todoId: "a", number: 1, ordinal: 1, revision: 1 }],
    })
    expect(stack.todos[0]).toMatchObject({ state: "working", attempt: 1 })
  })

  test("dropping a working TODO stops its attempt, closes the gap and starts the next", () => {
    const working: Row = { id: "a", number: 1, state: "working", position: 1, attempt: 2, revision: 1 }
    const { stack, result } = apply(
      { nextNumber: 3, lanes: 1, maxOpen: 5, todos: [working, queued("b", 2, 2)] },
      { kind: "drop", number: 1 },
    )
    expect(result).toEqual({
      kind: "dropped",
      number: 1,
      changed: true,
      stopped: { todoId: "a", ordinal: 2 },
      starts: [{ todoId: "b", number: 2, ordinal: 1, revision: 1 }],
    })
    expect(stack.todos).toEqual([
      { ...working, state: "dropped", position: null },
      { id: "b", number: 2, state: "working", position: 1, attempt: 1, revision: 1 },
    ])
  })

  test("dropping a Queued TODO stops nothing", () => {
    const { result } = apply({ nextNumber: 2, lanes: 0, maxOpen: 5, todos: [queued("a", 1, 1)] }, {
      kind: "drop",
      number: 1,
    })
    expect(result).toMatchObject({ kind: "dropped", changed: true, stopped: undefined, starts: [] })
  })

  test("a merged TODO can't be dropped, and an unknown number isn't found", () => {
    const merged: Row = { id: "a", number: 1, state: "merged", position: null, attempt: 1, revision: 1 }
    const stack: Stack = { nextNumber: 2, lanes: 1, maxOpen: 5, todos: [merged] }
    expect(apply(stack, { kind: "drop", number: 1 }).result).toEqual({ kind: "refused", code: "merged" })
    expect(apply(stack, { kind: "drop", number: 9 }).result).toEqual({ kind: "refused", code: "not_found" })
  })

  test("publishing frees the lane: the TODO goes In review and the next Queued one starts, to stack on it", () => {
    const working: Row = { id: "a", number: 1, state: "working", position: 1, attempt: 1, revision: 1 }
    const { stack, result } = apply(
      { nextNumber: 4, lanes: 1, maxOpen: 5, todos: [working, queued("b", 2, 2), queued("c", 3, 3)] },
      { kind: "publish", id: "a", ordinal: 1 },
    )
    expect(result).toEqual({ kind: "published", number: 1, starts: [{ todoId: "b", number: 2, ordinal: 1, revision: 1 }] })
    expect(stack.todos.map((todo) => [todo.id, todo.state, todo.position])).toEqual([
      ["a", "in_review", 1],
      ["b", "working", 2],
      ["c", "queued", 3],
    ])
    // Published again with a new head, nothing changes; the next lane frees when b publishes.
    expect(apply(stack, { kind: "publish", id: "a", ordinal: 1 }).result).toEqual({ kind: "published", number: 1, starts: [] })
    const next = apply(stack, { kind: "publish", id: "b", ordinal: 1 })
    expect(next.result).toMatchObject({ kind: "published", number: 2, starts: [{ todoId: "c" }] })
    expect(violations(next.stack)).toEqual([])
  })

  test("a stale publish changes nothing: another attempt, a dropped TODO, a Queued one, an unknown one", () => {
    const working: Row = { id: "a", number: 1, state: "working", position: 1, attempt: 2, revision: 1 }
    const dropped: Row = { id: "b", number: 2, state: "dropped", position: null, attempt: 1, revision: 1 }
    const stack: Stack = { nextNumber: 4, lanes: 1, maxOpen: 5, todos: [working, dropped, queued("c", 3, 2)] }
    for (const op of [
      { kind: "publish", id: "a", ordinal: 1 },
      { kind: "publish", id: "b", ordinal: 1 },
      { kind: "publish", id: "c", ordinal: 0 },
      { kind: "publish", id: "z", ordinal: 1 },
    ] as const) {
      expect(apply(stack, op)).toEqual({ stack, result: { kind: "refused", code: "stale" } })
    }
  })

  test("dropping a TODO in review stops its attempt, whose run closes its pull request", () => {
    const review: Row = { id: "a", number: 1, state: "in_review", position: 1, attempt: 1, revision: 1 }
    const { result } = apply({ nextNumber: 2, lanes: 1, maxOpen: 5, todos: [review] }, { kind: "drop", number: 1 })
    expect(result).toMatchObject({ kind: "dropped", stopped: { todoId: "a", ordinal: 1 }, starts: [] })
  })

  test("a failed TODO holds its place but not a lane", () => {
    const fail: Row = { id: "a", number: 1, state: "failed", position: 1, attempt: 1, revision: 1 }
    const { stack, result } = apply({ nextNumber: 2, lanes: 1, maxOpen: 5, todos: [fail] }, { kind: "commit", id: "b" })
    expect(result).toMatchObject({ kind: "committed", position: 2, starts: [{ todoId: "b" }] })
    expect(openOf(stack).map((todo) => [todo.id, todo.state])).toEqual([["a", "failed"], ["b", "working"]])
  })
})

describe("violations", () => {
  const row = (fields: Partial<Row> & Pick<Row, "id" | "number">): Row => ({
    state: "queued",
    position: 1,
    attempt: 0,
    revision: 1,
    ...fields,
  })

  test("names each broken rule", () => {
    expect(violations({ nextNumber: 2, lanes: 1, maxOpen: 5, todos: [row({ id: "a", number: 1 })] })).toEqual([])
    expect(violations({ nextNumber: 3, lanes: 1, maxOpen: 5, todos: [row({ id: "a", number: 1 }), row({ id: "b", number: 1, position: 2 })] }))
      .toEqual(["a number is taken twice"])
    expect(violations({ nextNumber: 1, lanes: 1, maxOpen: 5, todos: [row({ id: "a", number: 1 })] }))
      .toEqual(["a number outside 1 to next"])
    expect(violations({ nextNumber: 3, lanes: 1, maxOpen: 5, todos: [row({ id: "a", number: 1 }), row({ id: "b", number: 2, position: 3 })] }))
      .toEqual(["open positions aren't 1 to n"])
    expect(violations({ nextNumber: 2, lanes: 1, maxOpen: 5, todos: [row({ id: "a", number: 1, state: "dropped" })] }))
      .toEqual(["a settled TODO is placed, or an open one isn't"])
    expect(violations({ nextNumber: 3, lanes: 1, maxOpen: 1, todos: [row({ id: "a", number: 1 }), row({ id: "b", number: 2, position: 2 })] }))
      .toEqual(["more TODOs open than allowed"])
    expect(violations({ nextNumber: 2, lanes: 0, maxOpen: 5, todos: [row({ id: "a", number: 1, state: "working" })] }))
      .toEqual(["more lanes held than allowed"])
  })

  test("a run that merges its TODO leaves the stack, closes the gap and starts the next", () => {
    const working: Row = { id: "a", number: 1, state: "in_review", position: 1, attempt: 1, revision: 1 }
    const queued = (id: string, number: number, position: number): Row => ({
      id,
      number,
      state: "queued",
      position,
      attempt: 0,
      revision: 1,
    })
    const { stack, result } = apply(
      { nextNumber: 3, lanes: 1, maxOpen: 5, todos: [working, queued("b", 2, 2)] },
      { kind: "finish", id: "a", ordinal: 1, state: "merged" },
    )
    expect(result).toEqual({
      kind: "finished",
      number: 1,
      state: "merged",
      starts: [{ todoId: "b", number: 2, ordinal: 1, revision: 1 }],
    })
    expect(stack.todos.map((todo) => [todo.id, todo.state, todo.position])).toEqual([["a", "merged", null], [
      "b",
      "working",
      1,
    ]])
    expect(violations(stack)).toEqual([])
  })

  test("a PR closed on GitHub drops its TODO; a failed run keeps its place", () => {
    const working: Row = { id: "a", number: 1, state: "working", position: 1, attempt: 2, revision: 1 }
    const closed = apply({ nextNumber: 2, lanes: 1, maxOpen: 5, todos: [working] }, {
      kind: "finish",
      id: "a",
      ordinal: 2,
      state: "dropped",
    })
    expect(closed.stack.todos[0]).toMatchObject({ state: "dropped", position: null })
    const failedRun = apply({ nextNumber: 2, lanes: 1, maxOpen: 5, todos: [working] }, {
      kind: "finish",
      id: "a",
      ordinal: 2,
      state: "failed",
    })
    expect(failedRun.stack.todos[0]).toMatchObject({ state: "failed", position: 1 })
    expect(failedRun.result).toEqual({ kind: "finished", number: 1, state: "failed", starts: [] })
  })

  test("a stale run's finish changes nothing: another attempt, a dropped TODO, an unknown one", () => {
    const working: Row = { id: "a", number: 1, state: "working", position: 1, attempt: 2, revision: 1 }
    const dropped: Row = { id: "b", number: 2, state: "dropped", position: null, attempt: 1, revision: 1 }
    const stack: Stack = { nextNumber: 3, lanes: 1, maxOpen: 5, todos: [working, dropped] }
    for (const op of [
      { kind: "finish", id: "a", ordinal: 1, state: "merged" },
      { kind: "finish", id: "b", ordinal: 1, state: "failed" },
      { kind: "finish", id: "z", ordinal: 1, state: "dropped" },
    ] as const) {
      expect(apply(stack, op)).toEqual({ stack, result: { kind: "refused", code: "stale" } })
    }
  })
})

test("retry keeps the failed TODO in place and starts attempt two; working refuses", () => {
  const failed = { nextNumber: 2, lanes: 1, maxOpen: 50, todos: [
    { id: "one", number: 1, state: "failed" as const, position: 1, attempt: 1, revision: 1 },
  ] }
  const retried = apply(failed, { kind: "retry", number: 1 })
  expect(retried.result).toMatchObject({ kind: "retried", starts: [{ todoId: "one", ordinal: 2 }] })
  expect(retried.stack.todos[0]).toMatchObject({ id: "one", position: 1, state: "working", attempt: 2 })
  expect(apply(retried.stack, { kind: "retry", number: 1 }).result).toEqual({ kind: "refused", code: "not_retryable" })
})
