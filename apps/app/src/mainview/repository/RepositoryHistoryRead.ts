/** Route-scoped history requests; React projects the collection and never owns read state. */
import { createCollection, localOnlyCollectionOptions } from "@tanstack/db"
import { ApplicationClientError } from "../runtime/ApplicationClient"
import { clientRefusal } from "@smthrs/rpc/Refusal"
import { refusalLine } from "@smthrs/rpc/RefusalCopy"

export function createHistoryRead<T>(load: (signal: AbortSignal) => Promise<{ value: T; cursor?: string }>, fallback: string) {
 type Row = { id: string; phase: "loading" | "ready" | "failed"; value?: T; cursor?: string; error?: string; status?: number | null }
 const rows = createCollection(localOnlyCollectionOptions<Row, string>({ getKey: row => row.id }))
 let snapshot: Row = { id: "read", phase: "loading" }
 rows.insert(snapshot)
 const listeners = new Set<() => void>()
 let abort: AbortController | undefined
 let started = false
 const publish = (row: Row) => { rows.update("read", draft => Object.assign(draft, { value: undefined, cursor: undefined, error: undefined, status: undefined }, row)); snapshot = row; for (const listener of listeners) listener() }
 const read = () => {
  abort?.abort(); const request = new AbortController(); abort = request
  publish({ id: "read", phase: "loading" })
  void load(request.signal).then(result => {
   if (!request.signal.aborted) publish({ id: "read", phase: "ready", ...result })
  }, error => {
   if (!request.signal.aborted) publish({ id: "read", phase: "failed", status: error instanceof ApplicationClientError ? error.status : null, error: refusalLine(error instanceof ApplicationClientError ? error.refusal : clientRefusal(error, fallback), fallback) })
  })
 }
 return {
  getSnapshot: () => snapshot,
  subscribe: (listener: () => void) => {
   listeners.add(listener)
   if (!started) { started = true; read() }
   return () => { listeners.delete(listener); if (!listeners.size) { abort?.abort(); started = false } }
  },
  retry: read
 }
}
