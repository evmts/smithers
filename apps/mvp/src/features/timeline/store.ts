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
/** Collection projection of completed durable runs. Streaming chunks never launch model calls. */
export const followSummaries = (messages: Collection.Collection<Message>, summaries: Collection.Collection<Summary, string>, dispatch: FlowDispatch["Service"]) => Effect.gen(function* () {
  yield* summaries.restored.pipe(Effect.ignore)
  yield* messages.changes({ initial: true }).pipe(
    Stream.flattenIterable,
    Stream.filter(change => change.type !== "delete" && change.value.status === "done" && change.value.text.trim() !== ""),
    Stream.runForEach(change => Effect.gen(function* () {
      const row = change.value
      const revision = revisionOf(row)
      const cached = yield* summaries.get(row.id)
      if (cached._tag === "Some" && cached.value.revision === revision) return
      const result = yield* dispatch.dispatch("timeline/summarize", { id: row.id, revision, role: row.role, text: row.text.slice(0, 8000) }, { door: "sync", executionId: `timeline-${revision}` })
      if (result._tag !== "Done") return
      const current = yield* messages.get(row.id)
      if (current._tag === "None" || revisionOf(current.value) !== revision) return
      const value = { id: row.id, revision, summary: result.value.summary }
      if ((yield* summaries.get(row.id))._tag === "None") yield* summaries.insert(value)
      else yield* summaries.update(row.id, draft => { Object.assign(draft, value) })
    }).pipe(Effect.catch(() => Effect.logWarning("timeline.summary.unavailable")))),
  )
})
