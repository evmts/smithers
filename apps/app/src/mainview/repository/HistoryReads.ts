import { createCollection, localOnlyCollectionOptions } from "@tanstack/db"
import { useMemo, useSyncExternalStore } from "react"
import { ApplicationClientError } from "../runtime/ApplicationClient"
import { getRepositoryCommit, listRepositoryCommits } from "../runtime/RepositoryReadsClient"
import type { ApplicationClient } from "../runtime/ApplicationClient"

type Row = { id: string; state: "loading" | "ready" | "error"; value?: unknown; error?: string; status?: number | null }
/** Server snapshots live in a collection scoped to the selected transport. */
export function createHistoryReads(request: (path: string, init?: RequestInit) => Promise<unknown>) {
  const rows = createCollection(localOnlyCollectionOptions<Row, string>({ getKey: row => row.id }))
  const pending = new Map<string, AbortController>()
  const readers = new Map<string, number>()
  const tasks = new Map<string, (signal: AbortSignal) => Promise<unknown>>()
  const load = (id: string) => {
    if (pending.has(id)) return
    const controller = new AbortController()
    pending.set(id, controller)
    const put = (row: Row) => {
      if (pending.get(id) !== controller) return
      if (rows.has(id)) rows.update(id, draft => { Object.assign(draft, row) })
      else rows.insert(row)
    }
    put({ id, state: "loading", error: undefined, status: undefined })
    void tasks.get(id)!(controller.signal).then(value =>
      put({ id, state: "ready", value, error: undefined, status: undefined }), error =>
      put({ id, state: "error", error: error instanceof Error ? error.message : "Unavailable",
        status: error instanceof ApplicationClientError ? error.status : undefined })
    ).finally(() => { if (pending.get(id) === controller) pending.delete(id) })
  }
  return {
    resource<T>(id: string, task: (signal: AbortSignal) => Promise<T>) {
      tasks.set(id, task)
      return {
        subscribe: (listener: () => void) => {
          readers.set(id, (readers.get(id) ?? 0) + 1)
          const subscription = rows.subscribeChanges(listener)
          if (!rows.has(id)) queueMicrotask(() => { if (!rows.has(id) && readers.get(id)) load(id) })
          return () => {
            subscription.unsubscribe()
            const remaining = (readers.get(id) ?? 1) - 1
            readers.set(id, remaining)
            if (remaining === 0 && pending.has(id)) {
              pending.get(id)!.abort()
              pending.delete(id)
              if (rows.get(id)?.state === "loading") rows.delete(id)
            }
          }
        },
        snapshot: () => rows.get(id),
        retry: () => load(id)
      }
    },
    commit(repo: string, sha: string, signal?: AbortSignal) {
      const [owner, name] = repo.split("/")
      return getRepositoryCommit({ request } as ApplicationClient, owner!, name!, sha, signal)
    },
    commits(repo: string, ref?: string, path?: string, cursor?: string, signal?: AbortSignal) {
      const [owner, name] = repo.split("/")
      return listRepositoryCommits({ request } as ApplicationClient, owner!, name!, { ref, path, cursor, signal })
    }
  }
}
export type HistoryReads = ReturnType<typeof createHistoryReads>
export function useHistoryRead<T>(reads: HistoryReads, key: string, task: (signal: AbortSignal) => Promise<T>) {
  const resource = useMemo(() => reads.resource(key, task), [reads, key])
  const row = useSyncExternalStore(resource.subscribe, resource.snapshot, () => undefined)
  return { state: row?.state ?? "loading", value: row?.value as T | undefined, error: row?.error, status: row?.status, retry: resource.retry }
}
