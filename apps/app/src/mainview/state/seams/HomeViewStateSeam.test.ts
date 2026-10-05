import { expect, test } from "bun:test"
import { createHomeViewStateSeam, MainViewStateSchema } from "./HomeViewStateSeam"
import { mergedSinceLastLook } from "./HomeFromTodos"
import type { TodoCard } from "@smthrs/rpc/TodoCard"

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const merged = (n: number, seq: number): TodoCard => ({ n, merge_seq: seq, state: "merged" } as TodoCard)

const harness = (lookMs = 30) => {
 let who: string | undefined = "maya", seq = 1, fail = false
 let stored = { last_seen_seq: 0 }
 const calls: RequestInit[] = []
 const listeners = new Set<() => void>()
 const seam = createHomeViewStateSeam({ lookMs, member: () => who,
  todos: { get: () => ({ todos: [merged(1, seq)] }), subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } },
  http: async (_path, init) => { calls.push(init ?? {}); if (fail) throw new Error("offline")
   if (init?.method === "PUT") stored = { ...stored, ...JSON.parse(String(init.body)) }
   return Response.json(stored)
  }
 })
 return { seam, calls, fail: (value: boolean) => { fail = value }, member: (value?: string) => { who = value; seam.reset() },
  merge: (value: number) => { seq = value; for (const listener of listeners) listener() } }
}

test("last look advances only after two seconds on screen, and duplicate visibility does not restart it", async () => {
 const h = harness(2000), stop = h.seam.snapshots.subscribe(() => {})
 try {
  await sleep(10); h.seam.onView({ on_screen: true }); await sleep(1900)
  expect(h.calls.filter(call => call.method === "PUT")).toHaveLength(0)
  h.seam.onView({ on_screen: true }); await sleep(150)
  expect(h.seam.snapshots.get().state?.last_seen_seq).toBe(1)
  expect(h.calls.filter(call => call.method === "PUT")).toHaveLength(1)
  h.merge(2); await sleep(40); expect(h.seam.snapshots.get().state?.last_seen_seq).toBe(1)
  h.seam.onView({ on_screen: false }); await sleep(2050)
  expect(h.seam.snapshots.get().state?.last_seen_seq).toBe(1)
 } finally { stop(); h.seam.dispose() }
})

test("offline writes keep unseen merges; retry advances; cancellation and identity changes cancel the timer", async () => {
 const h = harness(), stop = h.seam.snapshots.subscribe(() => {})
 try {
  await sleep(10); h.fail(true); h.seam.onView({ on_screen: true }); await sleep(45)
  expect(h.seam.snapshots.get().state?.last_seen_seq).toBe(0)
  h.fail(false); await sleep(45); expect(h.seam.snapshots.get().state?.last_seen_seq).toBe(1)
  h.merge(2); h.seam.onView({ on_screen: false }); await sleep(45)
  expect(h.seam.snapshots.get().state?.last_seen_seq).toBe(1)
  h.seam.onView({ on_screen: true }); h.member("alice"); await sleep(45)
  expect(h.seam.snapshots.get().on_screen).toBe(false)
  expect(h.calls.filter(call => call.method === "PUT")).toHaveLength(2)
 } finally { stop(); h.seam.dispose() }
})

test("unsubscribe and dispose cancel a pending look", async () => {
 const h = harness(), stop = h.seam.snapshots.subscribe(() => {})
 await sleep(10); h.seam.onView({ on_screen: true }); stop(); h.seam.dispose(); await sleep(45)
 expect(h.calls.filter(call => call.method === "PUT")).toHaveLength(0)
})

test("filter resets persist through the served member view", async () => {
 const h = harness(), stop = h.seam.snapshots.subscribe(() => {})
 try {
  await sleep(10); h.seam.onView({ filter: "working" }); await sleep(10)
  expect(h.seam.snapshots.get().state?.filter).toBe("working")
  h.seam.onView({ filter: undefined }); await sleep(10)
  expect(h.seam.snapshots.get().state?.filter).toBe("")
 } finally { stop(); h.seam.dispose() }
})

test("merge derivation is ordered, ignores unmerged rows, and survives duplicates (property)", () => {
 for (let cursor = 0; cursor < 20; cursor++) {
  const rows = Array.from({ length: 20 }, (_, i) => merged(i + 1, i + 1))
  const expected = rows.filter(row => row.merge_seq! > cursor).map(row => row.n)
  expect(mergedSinceLastLook([...rows].reverse().concat(rows, [{ ...merged(99, 99), state: "working" }]), cursor)).toEqual(expected)
  expect(mergedSinceLastLook(rows, 20)).toEqual([])
 }
 for (const seq of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) expect(MainViewStateSchema.safeParse({ last_seen_seq: seq }).success).toBe(false)
})
