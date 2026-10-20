import { Collection, Outbox } from "@smthrs/effect-tanstack-db"
import { Clock, Context, Effect, Layer, Metric, Option } from "effect"
import { OutboxWrites } from "../../outbox"
import { IssuesClient, type WriteRequest } from "./api"
import { type NotSentReason, refusalOf } from "./contract"
import { sends } from "./metrics"
import { Requested, Sending } from "./schema"

// Issue writes in the device's one outbox (decision 0012 §4, decision 0002 §3). A write step's tab puts the write in
// the outbox (store.ts `queue`); the outbox stores it, then sends it through the `issue-write` mutation here, to
// ChatApi's writes route, with the library's backoff, across reloads, from whichever tab leads. Once the route takes
// it, the write is Requested on this device (`issue-requested`) until GitHub's row arrives; nothing waits for that, so
// the outbox never holds chat's questions behind a write. A refusal keeps it Not sent, with why.

/** The outbox's names for issue writes: the collection of their optimistic rows, and the mutation that sends them. */
export const SENDING = "issue-sending"
export const ISSUE_WRITE = "issue-write"

/**
 * Issue writes on this device:
 * - `sending`: writes the outbox holds, as the optimistic rows of their outbox writes; in memory, restored by the outbox;
 * - `requested`: writes the route took (`requested`) or refused (`not_sent`), kept on the device.
 */
export class IssueWrites extends Context.Service<
  IssueWrites,
  {
    readonly sending: Collection.Collection<Sending, string>
    readonly requested: Collection.Collection<Requested, string>
  }
>()("@smthrs/mvp/issues/IssueWrites") {
  /**
   * The collections, and the outbox's `issue-write` mutation, sending through `IssuesClient` with the services this
   * layer was built with (`OutboxWrites`). Built below chat's store, which builds the outbox.
   */
  static readonly layer = Layer.effectContext(
    Effect.gen(function* () {
      const sending = yield* Collection.local<Sending, string>({ id: SENDING, schema: Sending, getKey: (row) => row.id })
      const requested = yield* Collection.persisted<Requested, string>({
        id: "issue-requested",
        schema: Requested,
        getKey: (row) => row.id,
        schemaVersion: 1,
      })
      const context = yield* Effect.context<IssuesClient>()
      const mutation: Outbox.Mutation<never> = (params) => send(requested, params).pipe(Effect.provideContext(context))
      return Context.make(IssueWrites, IssueWrites.of({ sending, requested })).pipe(
        Context.add(
          OutboxWrites,
          OutboxWrites.of({ collections: { [SENDING]: sending }, mutations: { [ISSUE_WRITE]: mutation } }),
        ),
      )
    }),
  )
}

/**
 * Keeps `row` on the device as `status`, with `reason` when Not sent: inserted, or, when a send replayed after a crash
 * finds it there, its status replaced. Waits until the device stored it; a store that fails leaves it in memory, and
 * the send still settles.
 */
export const keep = (
  requested: Collection.Collection<Requested, string>,
  row: Sending,
  status: Requested["status"],
  reason: NotSentReason | null,
) =>
  Effect.gen(function* () {
    const kept = Option.isNone(yield* requested.get(row.id))
      ? yield* requested.insert({
        id: row.id,
        repo: row.repo,
        repoId: row.repoId,
        op: row.op,
        via: row.via,
        title: row.title,
        number: row.number,
        body: row.body,
        queuedAt: row.queuedAt,
        status,
        reason,
      })
      : yield* requested.update(row.id, (draft) => {
        draft.status = status
        draft.reason = reason
      })
    yield* Effect.ignore(kept.persisted)
  }).pipe(Effect.orDie)

/** The route's body for `row`. */
const requestOf = (row: Sending): WriteRequest =>
  row.op === "issue/create"
    ? { writeId: row.id, via: row.via, op: row.op, title: row.title, body: row.body }
    : { writeId: row.id, via: row.via, op: row.op, number: row.number, body: row.body }

/**
 * Sends one queued write. ChatApi took it (202, or 200 for one it had): Requested, and done. A refusal (400, 401, 403,
 * 404, 409, 413): Not sent with why, and never sent again. Anything else (no answer, a deadline, 429, 5xx) is sent
 * again. Records the send as a span `issues.write.send`, a log line and a count of `sends` by operation and outcome,
 * never the text.
 */
const send = (requested: Collection.Collection<Requested, string>, { rows }: { readonly rows: ReadonlyArray<unknown> }) => {
  const row = rows[0] as Sending
  return Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis
    const [owner, name] = row.repo.split("/") as [string, string]
    const answer = yield* Effect.result((yield* IssuesClient).write(owner, name, requestOf(row)))
    const status = answer._tag === "Success" ? undefined : answer.failure.status
    const reason = answer._tag === "Success" ? undefined : refusalOf(status)
    const outcome = answer._tag === "Success"
      ? answer.success.txid === null ? "existing" : "started"
      : reason === undefined
      ? "retry"
      : "refused"
    yield* Metric.update(Metric.withAttributes(sends, { op: row.op, outcome }), 1)
    yield* Effect.annotateCurrentSpan({ outcome })
    yield* Effect.logWithLevel(answer._tag === "Success" ? "Info" : "Warn")("issues.write.send").pipe(
      Effect.annotateLogs({
        outcome,
        ...(status === undefined ? {} : { status }),
        durationMs: (yield* Clock.currentTimeMillis) - startedAt,
      }),
    )
    if (answer._tag === "Success") return yield* keep(requested, row, "requested", null)
    if (reason === undefined) return yield* new Outbox.Retry(status === undefined ? {} : { status })
    yield* keep(requested, row, "not_sent", reason)
    return yield* new Outbox.Refused({ status: status! })
  }).pipe(
    Effect.annotateLogs({ feature: "issues", writeId: row.id, op: row.op, via: row.via }),
    Effect.withSpan("issues.write.send", { attributes: { writeId: row.id, op: row.op, via: row.via } }),
  )
}
