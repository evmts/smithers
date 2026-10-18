import { createCollection, localOnlyCollectionOptions } from "@tanstack/db"
import { useSyncExternalStore } from "react"
import { listRepositoryCommits } from "../runtime/RepositoryReadsClient"
import type { ApplicationClient } from "../runtime/ApplicationClient"

type Row = { id: string; state: "loading" | "ready" | "error"; value?: unknown; error?: string }
/** Server snapshots belong to a collection scoped to the selected transport, never to component state. */
export function createHistoryReads(request: ApplicationClient["request"]) {
  const rows = createCollection(localOnlyCollectionOptions<Row, string>({ getKey: row => row.id }))
  const pending = new Set<string>()
  const tasks = new Map<string, () => Promise<unknown>>()
  const load = (id: string) => {
    if (pending.has(id)) return
    pending.add(id)
    const put = (row: Row) => {
      if (rows.has(id)) rows.update(id, draft => { Object.assign(draft, row) })
      else rows.insert(row)
    }
    put({ id, state: "loading", error: undefined })
    void tasks.get(id)!().then(value => put({ id, state: "ready", value, error: undefined }), error =>
      put({ id, state: "error", error: error instanceof Error ? error.message : "Unavailable" })
    ).finally(() => pending.delete(id))
  }
  return {
    request,
    resource<T>(id: string, task: () => Promise<T>) {
      tasks.set(id, task)
      return {
        subscribe: (listener: () => void) => {
          const subscription = rows.subscribeChanges(listener)
          if (!rows.has(id)) queueMicrotask(() => { if (!rows.has(id)) load(id) })
          return () => subscription.unsubscribe()
        },
        snapshot: () => rows.get(id),
        retry: () => load(id)
      }
    },
    commits(repo: string, ref?: string, path?: string, cursor?: string) {
      const [owner, name] = repo.split("/")
      return listRepositoryCommits({ request } as ApplicationClient, owner!, name!, { ref, path, cursor })
    }
  }
}
export type HistoryReads = ReturnType<typeof createHistoryReads>
export function useHistoryRead<T>(reads: HistoryReads, key: string, task: () => Promise<T>) {
  const resource = reads.resource(key, task)
  const row = useSyncExternalStore(resource.subscribe, resource.snapshot, () => undefined)
  return { state: row?.state ?? "loading", value: row?.value as T | undefined, error: row?.error, retry: resource.retry }
}
