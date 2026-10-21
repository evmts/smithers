// The stack's writer (worker/stack/Stack.ts, decision 0016 §1 and §7) on this file's schema of the compose Postgres
// (`pnpm db:up`): what each change writes, its receipt under the op id, the stack's refusals, the attempts it records
// when the host runs TODOs, and, with writers racing on connections of their own, that no change is lost and the
// stack's rules hold after every race.
import { Arbitrary, Effect, Logger, Metric, Schema, Tracer } from "effect"
import { SqlClient } from "effect/sql"
import { beforeEach, describe, expect, test } from "vitest"
import * as TestDatabase from "../../db/TestDatabase.ts"
import { openOf, type Row, violations } from "../../src/features/todos/stack.ts"
import { testFile, uuid } from "../test/harness.ts"
import * as Stack from "./Stack.ts"

const runtime = testFile("stack_writer")
beforeEach(() =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql`TRUNCATE stack_ops, todo_attempts, todo_requests, todos, stacks`))
)

const REPO = "github/octo/hello"
const maya = { id: "person-maya", login: "maya" }

const commit = (fields: Partial<Stack.Change> & { readonly title?: string; readonly prompt?: string } = {}): Stack.Change => ({
  opId: fields.opId ?? uuid(),
  repoId: fields.repoId ?? REPO,
  actor: fields.actor ?? maya,
  via: fields.via ?? "person",
  op: fields.op ?? {
    kind: "commit",
    title: fields.title ?? "Retry webhook delivery",
    prompt: fields.prompt ?? "Retry a failed delivery **three** times.",
    acceptance: [],
  },
})
const drop = (number: number, opId = uuid()): Stack.Change => ({
  opId,
  repoId: REPO,
  actor: maya,
  via: "person",
  op: { kind: "drop", number },
})

/** Every log line, span and metric a writer records, kept for the test. */
const observe = () => {
  const lines: Array<{ readonly message: unknown; readonly annotations: Readonly<Record<string, unknown>> }> = []
  const spans: Array<Tracer.NativeSpan> = []
  const registry: Metric.MetricRegistry = new Map()
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  const logger = Logger.make((options) => {
    const { message, annotations } = Logger.formatStructured.log(options)
    lines.push({ message, annotations })
  })
  return {
    lines,
    spans,
    count: (metric: Metric.Metric<number, Metric.CounterState<number>>, attributes: Record<string, string>) =>
      runtime.runSync(
        Metric.value(Metric.withAttributes(metric, attributes)).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
      ).count,
    recorded: () => JSON.stringify({ lines, spans: spans.map((span) => [...span.attributes]) }),
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provideService(Tracer.Tracer, tracer),
        Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
        Effect.provideService(Metric.MetricRegistry, registry),
      ),
  }
}

/** Applies `change` on a connection of its own, as one request of ChatApi does. */
const applyOn = (change: Stack.Change, runs = false, observed = observe()) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const { database } = yield* TestDatabase.Scratch
      return yield* observed.provide(Stack.apply(change, { runs })).pipe(Effect.provide(database))
    }),
  )

const sql = <A extends object>(statement: string) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (client) => client.unsafe<A>(statement)))

const todos = () =>
  sql<{ id: string; number: number; title: string; state: string; position: number | null; attempt: number; revision: number; settledBy: string | null; settled: boolean }>(`
    SELECT id, number, title, state, position, attempt, revision, settled_by AS "settledBy",
      settled_at IS NOT NULL AS settled
    FROM todos WHERE repo_id = '${REPO}' ORDER BY number`)
const stack = async () =>
  (await sql<{ nextNumber: number; version: number }>(
    `SELECT next_number AS "nextNumber", version::int AS version FROM stacks WHERE repo_id = '${REPO}'`,
  ))[0]

describe("a commit", () => {
  test("numbers the TODO, places it last, Queued, keeps its prompt as revision 1, and keeps a receipt", async () => {
    const first = commit()
    const applied = await applyOn(first)
    expect(applied).toMatchObject({ kind: "applied", version: 1, receipt: { outcome: "committed", number: 1, starts: [] } })
    expect(applied.kind === "applied" && applied.txid).toBeGreaterThan(0)
    await applyOn(commit({
      title: "Add rate limit headers",
      op: { kind: "commit", title: "Add rate limit headers", prompt: "Add them.", acceptance: ["429 has Retry-After", "docs"] },
    }))

    expect(await todos()).toEqual([
      expect.objectContaining({ id: first.opId, number: 1, title: "Retry webhook delivery", state: "queued", position: 1, attempt: 0, revision: 1 }),
      expect.objectContaining({ number: 2, title: "Add rate limit headers", state: "queued", position: 2 }),
    ])
    expect(await sql(`SELECT todo_id AS "todoId", revision, prompt, acceptance, by_login AS "byLogin" FROM todo_requests ORDER BY prompt DESC`))
      .toEqual([
        { todoId: first.opId, revision: 1, prompt: "Retry a failed delivery **three** times.", acceptance: [], byLogin: "maya" },
        { todoId: expect.any(String), revision: 1, prompt: "Add them.", acceptance: ["429 has Retry-After", "docs"], byLogin: "maya" },
      ])
    expect(await stack()).toEqual({ nextNumber: 3, version: 2 })
    expect(await sql(`SELECT op, via, outcome, result, actor_id AS "actorId" FROM stack_ops WHERE id = '${first.opId}'`)).toEqual([
      { op: "commit", via: "person", outcome: "committed", result: { outcome: "committed", number: 1, starts: [] }, actorId: "person-maya" },
    ])
  })

  test("a repeated op answers its receipt and changes nothing; another payload under its id is a conflict", async () => {
    const first = commit()
    await applyOn(first)

    expect(await applyOn(first)).toEqual({ kind: "repeated", receipt: { outcome: "committed", number: 1, starts: [] } })
    expect(await applyOn({ ...first, op: { kind: "commit", title: "Something else", prompt: "x", acceptance: [] } }))
      .toEqual({ kind: "conflict" })
    expect(await applyOn({ ...first, via: "agent" })).toEqual({ kind: "conflict" })
    expect(await stack()).toEqual({ nextNumber: 2, version: 1 })
    expect(await todos()).toHaveLength(1)
  })

  test("a full stack refuses it, keeps the refusal as the receipt and spends no number", async () => {
    await applyOn(commit())
    await sql(`UPDATE stacks SET max_open = 1 WHERE repo_id = '${REPO}'`)
    const refused = commit()

    expect(await applyOn(refused)).toMatchObject({ kind: "applied", receipt: { outcome: "stack_full", starts: [] } })
    expect(await applyOn(refused)).toEqual({ kind: "repeated", receipt: { outcome: "stack_full", starts: [] } })
    expect(await stack()).toEqual({ nextNumber: 2, version: 2 })
    expect(await todos()).toHaveLength(1)
  })

  test("stacks are per repository: each counts its own numbers", async () => {
    await applyOn(commit())
    await applyOn(commit({ repoId: "github/octo/other" }))
    expect(await sql(`SELECT repo_id AS "repoId", number, position FROM todos ORDER BY repo_id`)).toEqual([
      { repoId: "github/octo/hello", number: 1, position: 1 },
      { repoId: "github/octo/other", number: 1, position: 1 },
    ])
  })
})

describe("a drop", () => {
  test("drops the TODO, closes the gap in one statement and records who dropped it", async () => {
    for (let index = 0; index < 4; index++) await applyOn(commit())

    expect(await applyOn(drop(2))).toMatchObject({ kind: "applied", receipt: { outcome: "dropped", number: 2, starts: [] } })
    expect((await todos()).map(({ number, state, position, settledBy, settled }) => [number, state, position, settledBy, settled]))
      .toEqual([
        [1, "queued", 1, null, false],
        [2, "dropped", null, "person-maya", true],
        [3, "queued", 2, null, false],
        [4, "queued", 3, null, false],
      ])
  })

  test("is idempotent: dropping a dropped TODO answers dropped and moves nothing", async () => {
    await applyOn(commit())
    await applyOn(commit())
    await applyOn(drop(1))
    const before = await todos()

    expect(await applyOn(drop(1))).toMatchObject({ kind: "applied", receipt: { outcome: "dropped", number: 1 } })
    expect(await todos()).toEqual(before)
  })

  test("refuses a merged TODO and a number the stack never had", async () => {
    await applyOn(commit())
    // What Track B's Settle will write: merged, out of the stack.
    await sql(`UPDATE todos SET state = 'merged', position = NULL, settled_at = now() WHERE number = 1`)

    expect(await applyOn(drop(1))).toMatchObject({ kind: "applied", receipt: { outcome: "merged" } })
    expect(await applyOn(drop(7))).toMatchObject({ kind: "applied", receipt: { outcome: "not_found" } })
    expect((await todos())[0]).toMatchObject({ state: "merged" })
  })
})

describe("on a host that runs TODOs", () => {
  test("a commit with a free lane starts its first attempt; a drop stops it and starts the next", async () => {
    const first = await applyOn(commit(), true)
    const started = first.kind === "applied" ? first.receipt.starts : []
    expect(started).toEqual([
      { attemptId: expect.any(String), todoId: expect.any(String), repoId: REPO, number: 1, ordinal: 1, revision: 1 },
    ])
    await applyOn(commit(), true)
    expect((await todos()).map(({ state, attempt }) => [state, attempt])).toEqual([["working", 1], ["queued", 0]])
    expect(await sql(`SELECT id, ordinal, status FROM todo_attempts`)).toEqual([
      { id: started[0]!.attemptId, ordinal: 1, status: "running" },
    ])

    const dropped = await applyOn(drop(1), true)
    expect(dropped).toMatchObject({
      kind: "applied",
      receipt: {
        outcome: "dropped",
        stopped: { attemptId: started[0]!.attemptId, todoId: started[0]!.todoId },
        starts: [{ number: 2, ordinal: 1 }],
      },
    })
    expect((await todos()).map(({ state, position }) => [state, position])).toEqual([["dropped", null], ["working", 1]])
  })

  test("without runs, nothing starts: every TODO stays Queued", async () => {
    await applyOn(commit(), false)
    expect((await todos())[0]).toMatchObject({ state: "queued", attempt: 0 })
    expect(await sql(`SELECT id FROM todo_attempts`)).toEqual([])
  })
})

describe("a run's reports", () => {
  /** Commits TODOs on a host that runs them, and answers the first one's attempt. */
  const started = async (count = 1) => {
    const receipts = []
    for (let index = 0; index < count; index++) receipts.push(await applyOn(commit(), true))
    const first = receipts[0]!
    if (first.kind !== "applied") throw new Error("not applied")
    const start = first.receipt.starts[0]!
    return { attemptId: start.attemptId, todoId: start.todoId, repoId: REPO, ordinal: start.ordinal }
  }
  const reportOn = (attempt: Stack.RunAttempt, event: Stack.RunEvent, runs = true, observed = observe()) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const { database } = yield* TestDatabase.Scratch
        return yield* observed.provide(Stack.report(attempt, event, { runs })).pipe(Effect.provide(database))
      }),
    )
  const row = async () =>
    (await sql<{
      state: string
      step: string | null
      branch: string | null
      baseSha: string | null
      headSha: string | null
      prNumber: number | null
      failure: string | null
      note: string | null
      mergeSha: string | null
      position: number | null
      settled: boolean
    }>(`
      SELECT state, step, branch, base_sha AS "baseSha", head_sha AS "headSha", pr_number AS "prNumber", failure, note,
        merge_sha AS "mergeSha", position, settled_at IS NOT NULL AS settled
      FROM todos WHERE repo_id = '${REPO}' ORDER BY number LIMIT 1`))[0]!
  const BASE = "a".repeat(40)
  const HEAD = "b".repeat(40)
  const MERGE = "c".repeat(40)

  test("step, branch and published change the row; merged settles it, frees the lane and starts the next", async () => {
    const attempt = await started(2)
    expect(await reportOn(attempt, { kind: "step", step: "implement" })).toEqual({ outcome: "applied", starts: [] })
    expect(await reportOn(attempt, { kind: "branch", branch: "smithers/t1-retry", baseSha: BASE }))
      .toEqual({ outcome: "applied", starts: [] })
    expect(await row()).toMatchObject({ state: "working", step: "implement", branch: "smithers/t1-retry", baseSha: BASE })
    const observed = observe()
    await reportOn(attempt, { kind: "published", headSha: HEAD, prNumber: 7 }, true, observed)
    expect(await row()).toMatchObject({ state: "in_review", step: "await", headSha: HEAD, prNumber: 7 })
    expect(observed.count(Stack.transitions, { from: "working", to: "in_review" })).toBe(1)
    // Published again, as a retried step does: the row stands, and nothing counts twice.
    const again = observe()
    await reportOn(attempt, { kind: "published", headSha: HEAD, prNumber: 7 }, true, again)
    expect(again.count(Stack.transitions, { from: "working", to: "in_review" })).toBe(0)
    const merged = await reportOn(attempt, { kind: "finished", state: "merged", note: "merged_on_github", mergeSha: MERGE })
    expect(merged).toMatchObject({ outcome: "applied", starts: [{ number: 2, ordinal: 1, repoId: REPO }] })
    expect(await row()).toMatchObject({
      state: "merged",
      step: null,
      position: null,
      settled: true,
      note: "merged_on_github",
      mergeSha: MERGE,
    })
    expect((await todos()).map(({ state, position }) => [state, position])).toEqual([["merged", null], ["working", 1]])
    expect(await sql(`SELECT status, settled_at IS NOT NULL AS settled FROM todo_attempts ORDER BY created_at`))
      .toEqual([{ status: "settled", settled: true }, { status: "running", settled: false }])
  })

  test("failed keeps the TODO's place with its code; a stale report changes nothing and is logged", async () => {
    const attempt = await started()
    await reportOn(attempt, { kind: "finished", state: "failed", failure: "implement" })
    expect(await row()).toMatchObject({ state: "failed", failure: "implement", position: 1, settled: false })
    expect(await sql(`SELECT status FROM todo_attempts`)).toEqual([{ status: "failed" }])
    const observed = observe()
    expect(await reportOn(attempt, { kind: "step", step: "publish" }, true, observed)).toEqual({
      outcome: "stale",
      starts: [],
    })
    expect(observed.count(Stack.reports, { kind: "step", outcome: "stale" })).toBe(1)
    expect(observed.lines.at(-1)).toMatchObject({ message: "stack.report", annotations: { outcome: "stale" } })
    expect(await reportOn({ ...attempt, ordinal: 9 }, { kind: "step", step: "publish" })).toMatchObject({ outcome: "stale" })
    expect(await reportOn({ ...attempt, repoId: "github/no/where" }, { kind: "step", step: "publish" }))
      .toMatchObject({ outcome: "stale" })
  })

  test("an ending moves only what it must: failed leaves the rest in place, merged closes the gap behind it", async () => {
    const attempt = await started(4)
    const failed = await reportOn(attempt, { kind: "finished", state: "failed", failure: "implement" })
    const places = async () => (await todos()).map(({ state, position }) => [state, position])
    expect(await places()).toEqual([["failed", 1], ["working", 2], ["queued", 3], ["queued", 4]])
    const next = failed.starts[0]!
    await reportOn({ attemptId: next.attemptId, todoId: next.todoId, repoId: REPO, ordinal: next.ordinal }, {
      kind: "finished",
      state: "merged",
    })
    expect(await places()).toEqual([["failed", 1], ["merged", null], ["working", 2], ["queued", 3]])
  })

  test("a PR closed on GitHub drops the TODO; a dropped TODO's run is stale; with no runs nothing starts", async () => {
    const attempt = await started(2)
    await applyOn(drop(1), true)
    expect(await reportOn(attempt, { kind: "finished", state: "merged" })).toMatchObject({ outcome: "stale" })
    const second = (await sql<{ id: string; todoId: string }>(
      `SELECT id, todo_id AS "todoId" FROM todo_attempts WHERE id <> '${attempt.attemptId}'`,
    ))[0]!
    const next = { attemptId: second.id, todoId: second.todoId, repoId: REPO, ordinal: 1 }
    expect(await reportOn(next, { kind: "finished", state: "dropped", note: "closed_on_github" }, false)).toEqual({
      outcome: "applied",
      starts: [],
    })
    expect((await todos()).map(({ state }) => state)).toEqual(["dropped", "dropped"])
  })

  test("attemptTodo reads the attempt's TODO and the prompt revision it works on", async () => {
    const attempt = await started()
    const read = await runtime.runPromise(
      Effect.gen(function* () {
        const { database } = yield* TestDatabase.Scratch
        return yield* Stack.attemptTodo(attempt).pipe(Effect.provide(database))
      }),
    )
    expect(read._tag === "Some" && read.value).toMatchObject({
      number: 1,
      title: "Retry webhook delivery",
      prompt: "Retry a failed delivery **three** times.",
      acceptance: [],
      issueNumber: null,
      createdBy: "person-maya",
      createdLogin: "maya",
      state: "working",
      attempt: 1,
    })
    const none = await runtime.runPromise(
      Effect.gen(function* () {
        const { database } = yield* TestDatabase.Scratch
        return yield* Stack.attemptTodo({ ...attempt, attemptId: uuid() }).pipe(Effect.provide(database))
      }),
    )
    expect(none._tag).toBe("None")
  })
})

describe("observability", () => {
  test("each change is a span, a log line and a count, with ids and numbers only: never a title or a prompt", async () => {
    const observed = observe()
    const title = `title-${uuid()}`
    const prompt = `prompt-${uuid()}`
    const change = commit({ title, prompt })
    await applyOn(change, false, observed)
    await applyOn(change, false, observed)
    await applyOn({ ...change, op: { kind: "drop", number: 1 } }, false, observed)

    expect(observed.lines.map((line) => [line.message, line.annotations.outcome, line.annotations.op])).toEqual([
      ["stack.apply", "committed", "commit"],
      ["stack.apply", "repeated", "commit"],
      ["stack.apply", "conflict", "drop"],
    ])
    expect(observed.lines[0]!.annotations).toMatchObject({ repoId: REPO, opId: change.opId, number: 1, version: 1, via: "person" })
    // Each holds its transaction's spans; the SQL client's spans carry no parameter, so no title or prompt.
    expect(observed.spans.filter((span) => span.name === "stack.apply")).toHaveLength(3)
    expect(observed.count(Stack.changes, { op: "commit", outcome: "committed" })).toBe(1)
    expect(observed.count(Stack.changes, { op: "commit", outcome: "repeated" })).toBe(1)
    expect(observed.count(Stack.transitions, { from: "new", to: "queued" })).toBe(1)
    expect(observed.recorded()).not.toContain(title)
    expect(observed.recorded()).not.toContain(prompt)
  })

  test("a drop counts its transition", async () => {
    const observed = observe()
    await applyOn(commit(), false, observed)
    await applyOn(drop(1), false, observed)
    expect(observed.count(Stack.transitions, { from: "queued", to: "dropped" })).toBe(1)
  })
})

describe("concurrent writers", () => {
  /** The stack as Postgres holds it, in the rules' terms. */
  const loaded = async () => {
    const rows = await todos()
    const { nextNumber } = (await stack()) ?? { nextNumber: 1 }
    return {
      nextNumber,
      lanes: 1,
      maxOpen: 50,
      todos: rows.map((row): Row => ({
        id: row.id,
        number: row.number,
        state: row.state as Row["state"],
        position: row.position,
        attempt: row.attempt,
        revision: row.revision,
      })),
    }
  }

  test("twelve writers commit at once: twelve numbers, positions 1 to 12, no change lost", async () => {
    const changes = Array.from({ length: 12 }, () => commit())
    const applied = await Promise.all(changes.map((change) => applyOn(change, true)))

    const numbers = applied.map((result) => (result.kind === "applied" ? result.receipt.number : 0))
    expect([...numbers].sort((a, b) => a! - b!)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1))
    const after = await loaded()
    expect(violations(after)).toEqual([])
    expect(openOf(after).map((todo) => todo.id).sort()).toEqual(changes.map((change) => change.opId).sort())
    expect(after.todos.filter((todo) => todo.state === "working")).toHaveLength(1)
    expect(await stack()).toEqual({ nextNumber: 13, version: 12 })
  })

  test("random races of commits and drops: every committed TODO is there, every drop held, and the rules hold", async () => {
    const Round = Schema.Array(
      Schema.Union([
        Schema.Struct({ kind: Schema.Literal("commit") }),
        Schema.Struct({ kind: Schema.Literal("drop"), number: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 })) }),
      ]),
    ).check(Schema.isMinLength(1), Schema.isMaxLength(6))
    const rounds = Arbitrary.array(Arbitrary.schema(Round), { minLength: 1, maxLength: 4 })
    const result = await Effect.runPromise(
      Arbitrary.checkEffect(
        rounds,
        (history) =>
          Effect.promise(async () => {
            await sql(`TRUNCATE stack_ops, todo_attempts, todo_requests, todos, stacks`)
            const committed = new Set<string>()
            const dropped = new Set<number>()
            for (const round of history) {
              const changes = round.map((step) => (step.kind === "commit" ? commit() : drop(step.number)))
              const applied = await Promise.all(changes.map((change) => applyOn(change, true)))
              applied.forEach((result, index) => {
                if (result.kind !== "applied") return
                const change = changes[index]!
                if (result.receipt.outcome === "committed") committed.add(change.opId)
                if (result.receipt.outcome === "dropped" && change.op.kind === "drop") dropped.add(change.op.number)
              })
            }
            const after = await loaded()
            const byNumber = new Map(after.todos.map((todo) => [todo.number, todo]))
            return violations(after).length === 0 &&
              after.todos.length === committed.size &&
              after.todos.every((todo) => committed.has(todo.id)) &&
              [...dropped].every((number) => byNumber.get(number)?.state === "dropped") &&
              after.nextNumber === committed.size + 1
          }),
        { runs: 12, size: 30, seed: 20261020 },
      ),
    )
    expect(Arbitrary.formatCheckFailure(result)).toBeUndefined()
  }, 120_000)
})

describe("the seam's errors", () => {
  test("RunsUnavailable carries the host's code", () => {
    expect(new Stack.RunsUnavailable({ errorCode: "no_host" })).toMatchObject({ _tag: "@smthrs/mvp/stack/RunsUnavailable", errorCode: "no_host" })
  })

  test("isRefusal names the outcomes the route refuses", () => {
    expect(["committed", "dropped", "stack_full", "merged", "not_found"].map((outcome) => Stack.isRefusal(outcome as never)))
      .toEqual([false, false, true, true, true])
  })
})
