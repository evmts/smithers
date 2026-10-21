import { revisionOf } from "./identity"
import { Collection, LiveQuery } from "@smthrs/effect-tanstack-db"
import { Effect, Schema, Stream } from "effect"
import type { FlowDispatch } from "../../flows/dispatch"
import type { Message } from "../chat/schema"

export { revisionOf } from "./identity"

export const Summary = Schema.Struct({ id: Schema.String, revision: Schema.String, summary: Schema.String })
export type Summary = typeof Summary.Type
export const summaryQuery = (rows: Collection.Collection<Summary, string>) => LiveQuery.make(q => q.from({ summary: rows.tanstack }))
export const makeSummaries = Effect.gen(function* () {
  return yield* Collection.persisted({ id: "timeline-summaries", schema: Summary, getKey: row => row.id, schemaVersion: 1 })
})

/** A row of the conversation's window, as far as a summary reads it: chat's `latest` query gives these. */
export interface Shown {
  readonly id: string
  readonly role: string
  readonly status: string
  readonly text: string
}

/** The conversation's window: the messages the rail shows, as they enter, change and leave it. */
export interface Window {
  readonly changes: (options?: { readonly initial?: boolean }) => Stream.Stream<ReadonlyArray<Collection.Change<Shown>>>
}

/**
 * Summarizes each settled, nonempty ask and answer while the rail shows it: the rows of the conversation's `window`
 * (chat's `latest` query, which Load earlier widens), never every message the device holds. Opening a long
 * conversation starts at most a window's worth of `timeline/summarize` runs, not one per message ever written, which
 * kept a new device's engine and store busy for minutes (docs/features/timeline.md). Streaming chunks never launch
 * model calls. A result is kept only while `messages` still holds that entry unchanged. Once the summary role answers
 * that it has no model (`unconfigured`), no entry can have a summary, so this stops until the app opens again.
 */
export const followSummaries = (
  window: Window,
  messages: Collection.Collection<Message>,
  summaries: Collection.Collection<Summary, string>,
  dispatch: FlowDispatch["Service"],
) => Effect.gen(function* () {
  yield* summaries.restored.pipe(Effect.ignore)
  yield* window.changes({ initial: true }).pipe(
    Stream.flattenIterable,
    Stream.filter(change => change.type !== "delete" && (change.value.role === "user" || change.value.role === "assistant") && change.value.status === "done" && change.value.text.trim() !== ""),
    // Each entry answers whether to go on: not once the summary role says it has no model.
    Stream.runForEachWhile(change => Effect.gen(function* () {
      const row = change.value
      const revision = revisionOf(row)
      const cached = yield* summaries.get(row.id)
      if (cached._tag === "Some" && cached.value.revision === revision) return true
      const role = row.role as "user" | "assistant"
      const result = yield* dispatch.dispatch("timeline/summarize", { id: row.id, revision, role, text: row.text.slice(0, 8000) }, { door: "sync", executionId: `timeline-${revision}` })
      if (result._tag !== "Done") {
        if (result.error.code !== "unconfigured") return true
        yield* Effect.logWarning("timeline.summary.unconfigured")
        return false
      }
      const current = yield* messages.get(row.id)
      if (current._tag === "None" || revisionOf(current.value) !== revision) return true
      const value = { id: row.id, revision, summary: result.value.summary }
      if ((yield* summaries.get(row.id))._tag === "None") yield* summaries.insert(value)
      else yield* summaries.update(row.id, draft => { Object.assign(draft, value) })
      return true
    }).pipe(Effect.catch(() => Effect.as(Effect.logWarning("timeline.summary.unavailable"), true)))),
  )
})
