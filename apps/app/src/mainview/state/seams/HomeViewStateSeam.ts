import { createCollection, localOnlyCollectionOptions } from "@tanstack/db"
import { z } from "zod"
import type { HomeViewProps } from "@smthrs/rpc/HomeCard"
import { TodoStateSchema } from "@smthrs/rpc/CardPrimitives"
import type { TodoListSnapshots } from "./TodoSeam"
import { randomUuid } from "../../runtime/RandomUuid"

export const MainViewStateSchema = z.object({
  last_seen_seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  filter: z.union([TodoStateSchema, z.literal("")]).optional(), maximized: z.boolean().optional()
})
export type MainViewState = z.infer<typeof MainViewStateSchema>
export interface HomeViewSnapshot { readonly state?: MainViewState; readonly on_screen: boolean }
export interface HomeViewStateOptions {
  readonly http?: (path: string, init?: RequestInit) => Promise<Response>
  readonly todos: TodoListSnapshots
  readonly member: () => string | undefined
  readonly lookMs?: number
}

/** Member-private served state. Reuses the Home observer and TODO list rather
 * than a second poller or React lifecycle authority. Only acknowledged PUTs
 * advance last look; disconnect, disposal and identity changes cancel it. */
export const createHomeViewStateSeam = (options: HomeViewStateOptions) => {
  const rows = createCollection(localOnlyCollectionOptions<HomeViewSnapshot & { id: string }, string>({
    id: `home-view-${randomUuid()}`, getKey: row => row.id, initialData: [{ id: "main", on_screen: false }]
  }))
  let snapshot: HomeViewSnapshot = { on_screen: false }
  const listeners = new Set<() => void>()
  let member = options.member()
  let epoch = 0, disposed = false, busy = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopTodos: (() => void) | undefined
  let target = 0
  let pending: Partial<MainViewState> | undefined
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined }
  const publish = (next: HomeViewSnapshot) => {
    snapshot = next
    rows.update("main", row => { row.state = next.state; row.on_screen = next.on_screen })
    for (const listener of listeners) listener()
  }
  const reset = () => {
    ++epoch; cancel(); busy = false; pending = undefined; target = 0
    member = options.member(); publish({ on_screen: false })
    if (listeners.size) void read()
  }
  const current = (version: number, who: string | undefined) => !disposed && version === epoch && who === options.member()
  const schedule = () => {
    if (disposed || !listeners.size || !snapshot.on_screen || !snapshot.state || !options.http) { cancel(); return }
    const seq = Math.max(0, ...(options.todos.get().todos ?? []).map(todo => todo.merge_seq ?? 0))
    if (seq <= snapshot.state.last_seen_seq) { cancel(); target = 0; return }
    if (timer !== undefined && target === seq) return
    cancel(); target = seq
    timer = setTimeout(() => { timer = undefined; void write({ last_seen_seq: seq }) }, options.lookMs ?? 2000)
  }
  const read = async () => {
    if (disposed || !options.http || !member) return
    const version = epoch, who = member
    try {
      const response = await options.http("/api/conversations/main/view-state", { credentials: "same-origin", cache: "no-store" })
      const body: unknown = await response.json()
      if (!current(version, who)) return
      const parsed = MainViewStateSchema.safeParse(body)
      if (response.ok && parsed.success) {
        // A late GET cannot undo an acknowledged PUT.
        publish({ ...snapshot, state: { ...parsed.data, last_seen_seq: Math.max(parsed.data.last_seen_seq, snapshot.state?.last_seen_seq ?? 0) } })
        schedule()
      }
    } catch { /* retain the last acknowledged state; the next mount retries */ }
  }
  const write = async (patch: Partial<MainViewState>) => {
    if (disposed || !options.http || !member) return
    if (busy) { pending = { ...pending, ...patch, last_seen_seq: Math.max(pending?.last_seen_seq ?? 0, patch.last_seen_seq ?? 0) }; return }
    busy = true
    const version = epoch, who = member
    try {
      const response = await options.http("/api/conversations/main/view-state", { method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
      const parsed = MainViewStateSchema.safeParse(await response.json())
      if (current(version, who) && response.ok && parsed.success) publish({ ...snapshot, state: parsed.data })
    } catch { /* a failed write never claims a new last look */ }
    finally {
      if (current(version, who)) {
        busy = false
        const next = pending; pending = undefined
        if (next) void write(next)
        else schedule()
      }
    }
  }
  const onView: HomeViewProps["onView"] = patch => {
    if (options.member() !== member) reset()
    if (patch.on_screen !== undefined) { publish({ ...snapshot, on_screen: patch.on_screen }); schedule() }
    if ("filter" in patch || "maximized" in patch) void write({
      ...("filter" in patch ? { filter: patch.filter ?? "" } : {}),
      ...(patch.maximized === undefined ? {} : { maximized: patch.maximized })
    })
  }
  const snapshots = {
    get: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (listeners.size === 1 && !disposed) {
        if (options.member() !== member) reset()
        else void read()
        stopTodos = options.todos.subscribe(() => { if (options.member() !== member) reset(); else schedule() })
        schedule()
      }
      return () => { listeners.delete(listener); if (!listeners.size) { cancel(); stopTodos?.(); stopTodos = undefined; snapshot = { ...snapshot, on_screen: false } } }
    }
  }
  const dispose = () => { disposed = true; ++epoch; cancel(); stopTodos?.(); listeners.clear() }
  return { snapshots, onView, read, write, reset, dispose }
}
export type HomeViewStateSeam = ReturnType<typeof createHomeViewStateSeam>
