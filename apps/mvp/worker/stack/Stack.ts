import { digestSync } from "@smthrs/crypto"
import { Clock, Context, Effect, Metric, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { STACK_OUTCOMES, type StackOutcome, type StackVia, type TodoState } from "../../src/features/todos/contract.ts"
import { apply as applyRules, type Row, type Stack } from "../../src/features/todos/stack.ts"

// The one writer of a repository's stack (decision 0016 §1): the only code that writes `stacks`, `todos`,
// `todo_requests`, `todo_attempts` and `stack_ops`. Each change is one short transaction that locks the repository's
// `stacks` row first and makes no network or model call: it loads the open TODOs, applies the stack's rules
// (src/features/todos/stack.ts), writes back what changed, and keeps a receipt under the change's op id, so a repeated
// op answers the same and another payload under the same id is refused. Concurrent writers queue on the row lock, so
// none loses another's change. Buttons, slash commands, the agent and the API reach it only through the stack route
// (worker/stack/Api.ts); the `todo` run (decision 0016 Track B) calls it in process.

/** A change to a stack, as the route admitted it. A commit's op id is its TODO's id. */
export interface Change {
  readonly opId: string
  readonly repoId: string
  readonly actor: { readonly id: string; readonly login: string }
  readonly via: StackVia
  readonly op:
    | {
      readonly kind: "commit"
      readonly title: string
      readonly prompt: string
      readonly acceptance: ReadonlyArray<string>
    }
    | { readonly kind: "drop"; readonly number: number }
}

/** An attempt the writer recorded: Track B's `todo` run starts under its id, once per attempt. */
export const AttemptStart = Schema.Struct({
  attemptId: Schema.String,
  todoId: Schema.String,
  repoId: Schema.String,
  number: Schema.Number,
  ordinal: Schema.Number,
  revision: Schema.Number,
})
export type AttemptStart = typeof AttemptStart.Type

/** A dropped TODO's attempt that held a lane: its run must stop. */
export const AttemptStop = Schema.Struct({ attemptId: Schema.String, todoId: Schema.String })
export type AttemptStop = typeof AttemptStop.Type

/**
 * What a change did, kept as its receipt (`stack_ops.result`): its outcome, the TODO's number (absent when the stack
 * refused it for being full), the attempts it started, and the attempt it stopped.
 */
export const Receipt = Schema.Struct({
  outcome: Schema.Literals(STACK_OUTCOMES),
  number: Schema.optional(Schema.Number),
  starts: Schema.Array(AttemptStart),
  stopped: Schema.optional(AttemptStop),
})
export type Receipt = typeof Receipt.Type
const decodeReceipt = Schema.decodeUnknownSync(Receipt)

/**
 * How a change went: `applied` in transaction `txid` (Electric's `awaitTxId`), `repeated` (its op id already answered
 * this payload, with its receipt), or `conflict` (its op id answered another payload).
 */
export type Applied =
  | { readonly kind: "applied"; readonly txid: number; readonly version: number; readonly receipt: Receipt }
  | { readonly kind: "repeated"; readonly receipt: Receipt }
  | { readonly kind: "conflict" }

/**
 * Starts and stops the `todo` runs of the attempts the writer records (decision 0016 §1, "Starting runs"): Track B's
 * seam. Both are idempotent by attempt id: a repeated op starts the same run again, which changes nothing. Until a host
 * provides it, nothing runs a TODO, so the writer starts none and every TODO stays Queued.
 */
export class TodoRuns extends Context.Service<
  TodoRuns,
  {
    readonly start: (attempt: AttemptStart) => Effect.Effect<void, RunsUnavailable>
    readonly stop: (attempt: AttemptStop) => Effect.Effect<void, RunsUnavailable>
  }
>()("@smthrs/mvp/stack/TodoRuns") {}

/** The run host couldn't take a start or stop: the route answers 503, and the outbox sends the op again. */
export class RunsUnavailable extends Schema.TaggedError<RunsUnavailable>()("@smthrs/mvp/stack/RunsUnavailable", {
  errorCode: Schema.String,
}) {}

/** Changes the writer made, by `op` and `outcome`. */
export const changes = Metric.counter("smithers_stack_ops", {
  description: "Changes to a stack the writer made or refused, by op and outcome",
  incremental: true,
})

/** TODO state changes, by `from` and `to` (`new` for a commit). */
export const transitions = Metric.counter("smithers_todo_transitions", {
  description: "TODO state changes the stack's writer made, by from and to",
  incremental: true,
})

/** A change's payload hash: the repository, who it acts for and the change, never its op id. */
export const payloadHash = (change: Change): string =>
  digestSync(JSON.stringify({ repoId: change.repoId, via: change.via, ...change.op }))

/** One loaded TODO row. */
interface Loaded extends Row {
  readonly attemptId: string | null
}

/**
 * Applies `change` to its repository's stack in one transaction; `runs` says whether this host runs TODOs (a
 * `TodoRuns` is provided), and without it no TODO starts. Records a span `stack.apply`, a log line and a count of
 * `changes` by op and outcome, with the repository, op id, number and version: never a title or a prompt.
 */
export const apply = (change: Change, options: { readonly runs: boolean }) =>
  Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis
    const sql = yield* SqlClient.SqlClient
    const hash = payloadHash(change)
    const applied = yield* sql.withTransaction(Effect.gen(function* () {
      yield* sql`INSERT INTO stacks (repo_id) VALUES (${change.repoId}) ON CONFLICT (repo_id) DO NOTHING`
      const [locked] = yield* sql<{ readonly nextNumber: number; readonly lanes: number; readonly maxOpen: number }>`
        SELECT next_number AS "nextNumber", lanes, max_open AS "maxOpen" FROM stacks
        WHERE repo_id = ${change.repoId} FOR UPDATE`
      const [prior] = yield* sql<{ readonly payloadHash: string; readonly result: unknown }>`
        SELECT payload_hash AS "payloadHash", result FROM stack_ops WHERE id = ${change.opId}::uuid`
      if (prior !== undefined) {
        return prior.payloadHash === hash
          ? ({ kind: "repeated", receipt: decodeReceipt(prior.result) } satisfies Applied)
          : ({ kind: "conflict" } satisfies Applied)
      }
      const named = change.op.kind === "drop" ? change.op.number : 0
      const rows = yield* sql<Loaded>`
        SELECT t.id, t.number, t.state, t.position, t.attempt, t.revision, a.id AS "attemptId"
        FROM todos t LEFT JOIN todo_attempts a ON a.todo_id = t.id AND a.ordinal = t.attempt
        WHERE t.repo_id = ${change.repoId} AND (t.position IS NOT NULL OR t.number = ${named})`
      const before: Stack = {
        nextNumber: locked!.nextNumber,
        lanes: options.runs ? locked!.lanes : 0,
        maxOpen: locked!.maxOpen,
        todos: rows.map(({ attemptId: _, ...row }) => row),
      }
      const { stack: after, result } = applyRules(
        before,
        change.op.kind === "commit" ? { kind: "commit", id: change.opId } : change.op,
      )
      const starts = result.kind === "refused" ? [] : result.starts.map((start): AttemptStart => ({
        attemptId: crypto.randomUUID(),
        todoId: start.todoId,
        repoId: change.repoId,
        number: start.number,
        ordinal: start.ordinal,
        revision: start.revision,
      }))
      // A TODO in a lane always has its attempt's row: this writer records both in one transaction.
      const stop = result.kind === "dropped" ? result.stopped : undefined
      const stopped = stop === undefined
        ? undefined
        : { attemptId: rows.find((row) => row.id === stop.todoId)!.attemptId!, todoId: stop.todoId }
      const receipt: Receipt = {
        outcome: result.kind === "refused" ? result.code : result.kind,
        ...(result.kind === "refused" ? {} : { number: result.number }),
        starts,
        ...(stopped === undefined ? {} : { stopped }),
      }
      if (change.op.kind === "commit" && result.kind === "committed") {
        const created = after.todos.find((todo) => todo.id === change.opId)!
        yield* sql`
          INSERT INTO todos (id, repo_id, number, title, state, position, revision, attempt, created_by, created_login)
          VALUES (${change.opId}::uuid, ${change.repoId}, ${created.number}, ${change.op.title}, ${created.state},
            ${created.position}, ${created.revision}, ${created.attempt}, ${change.actor.id}, ${change.actor.login})`
        yield* sql`
          INSERT INTO todo_requests (todo_id, revision, repo_id, prompt, acceptance, by_login)
          VALUES (${change.opId}::uuid, 1, ${change.repoId}, ${change.op.prompt},
            ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(change.op.acceptance)}::jsonb)),
            ${change.actor.login})`
      }
      // Every TODO the change moved, settled or started, in one statement: positions are unique per repository at the
      // statement's end, so closing a gap needs no order.
      const changed = after.todos.filter((todo) => {
        const was = before.todos.find((row) => row.id === todo.id)
        return was !== undefined &&
          (was.state !== todo.state || was.position !== todo.position || was.attempt !== todo.attempt)
      })
      if (changed.length > 0) {
        const values = JSON.stringify(changed.map(({ id, state, position, attempt }) => ({ id, state, position, attempt })))
        yield* sql`
          UPDATE todos AS t
          SET state = v.state, position = v.position, attempt = v.attempt, updated_at = now(),
            settled_at = CASE WHEN v.state IN ('merged', 'dropped') THEN coalesce(t.settled_at, now()) ELSE NULL END,
            settled_by = CASE WHEN v.state = 'dropped' THEN ${change.actor.id} ELSE t.settled_by END
          FROM jsonb_to_recordset(${values}::jsonb) AS v(id uuid, state text, position integer, attempt integer)
          WHERE t.id = v.id`
      }
      for (const start of starts) {
        yield* sql`
          INSERT INTO todo_attempts (id, todo_id, repo_id, ordinal, revision, status)
          VALUES (${start.attemptId}::uuid, ${start.todoId}::uuid, ${change.repoId}, ${start.ordinal},
            ${start.revision}, 'running')`
      }
      const [stack] = yield* sql<{ readonly version: string; readonly txid: string }>`
        UPDATE stacks SET next_number = ${after.nextNumber}, version = version + 1, updated_at = now()
        WHERE repo_id = ${change.repoId}
        RETURNING version::text AS version, pg_current_xact_id()::xid::text AS txid`
      yield* sql`
        INSERT INTO stack_ops (id, repo_id, actor_id, via, op, payload_hash, outcome, result)
        VALUES (${change.opId}::uuid, ${change.repoId}, ${change.actor.id}, ${change.via}, ${change.op.kind}, ${hash},
          ${receipt.outcome}, ${JSON.stringify(receipt)}::jsonb)`
      const moved = [
        ...(result.kind === "committed" ? [{ from: "new", to: after.todos.find((todo) => todo.id === change.opId)!.state }] : []),
        ...changed.map((todo) => ({ from: before.todos.find((row) => row.id === todo.id)!.state as string, to: todo.state })),
      ].filter(({ from, to }) => from !== to)
      return {
        kind: "applied",
        txid: Number(stack!.txid),
        version: Number(stack!.version),
        receipt,
        moved,
      } as const
    }))
    const outcome = applied.kind === "applied" ? applied.receipt.outcome : applied.kind === "repeated" ? "repeated" : "conflict"
    const fields: Record<string, string | number> = {
      repoId: change.repoId,
      opId: change.opId,
      op: change.op.kind,
      via: change.via,
      outcome,
      durationMs: (yield* Clock.currentTimeMillis) - startedAt,
    }
    if (applied.kind !== "conflict" && applied.receipt.number !== undefined) fields.number = applied.receipt.number
    if (applied.kind === "applied") {
      fields.version = applied.version
      for (const { from, to } of applied.moved) {
        yield* Metric.update(Metric.withAttributes(transitions, { from, to: to as TodoState }), 1)
      }
    }
    yield* Metric.update(Metric.withAttributes(changes, { op: change.op.kind, outcome }), 1)
    yield* Effect.annotateCurrentSpan(fields)
    yield* Effect.logWithLevel(applied.kind === "conflict" ? "Warn" : "Info")("stack.apply").pipe(
      Effect.annotateLogs(fields),
    )
    if (applied.kind === "applied") {
      const { moved: _, ...rest } = applied
      return rest satisfies Applied
    }
    return applied satisfies Applied
  }).pipe(Effect.withSpan("stack.apply"))

/** The outcomes a stack refuses a change with: what the route answers instead of the change. */
export const isRefusal = (outcome: StackOutcome): outcome is "stack_full" | "merged" | "not_found" =>
  outcome === "stack_full" || outcome === "merged" || outcome === "not_found"
