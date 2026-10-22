/**
 * What one run costs the leader's engine, from admission to settlement, over
 * the leader's store in OPFS (`test/fixtures/MemoryOpfs.ts`, wa-sqlite's
 * access-handle pool over in-memory files).
 *
 * The run is the fixture `Steps`: three steps that return at once, so the
 * time is the engine's alone: its SQL and its own work. The cases:
 *
 * - one run at a time: what a resumed run costs before it frees the
 *   connection for the next;
 * - ten runs at once: the same cost shared, as when a leader resumes runs
 *   together.
 *
 * Measured on nyc-01 (2026-10-22): one run settles in about 110 ms, of which
 * about 50 ms is SQL over 338 statements in 30 transactions (prepare about
 * 20 ms, step about 30 ms; 29 of the transactions each append one journal
 * event), and the rest the engine's own work. Real OPFS adds a flush to every
 * commit, so a browser pays more per transaction than this.
 *
 * Run: `pnpm bench` in this package.
 */
import { FlowRuntime } from "@smthrs/flow"
import * as Effect from "effect/Effect"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { afterAll, beforeAll, describe, test } from "vitest"
import { BrowserRuntime } from "../src/index.ts"
import { registration, Steps } from "./fixtures/Flows.ts"
import * as MemoryOpfs from "./fixtures/MemoryOpfs.ts"
import * as MemorySqlite from "./fixtures/MemorySqlite.ts"

let remove: () => void = () => undefined
let runtime: ManagedRuntime.ManagedRuntime<FlowRuntime.FlowRuntime, unknown>
let next = 0

beforeAll(async () => {
  remove = MemoryOpfs.install()
  runtime = ManagedRuntime.make(
    BrowserRuntime.layerHost({ name: "settle-bench", sqlite: MemorySqlite.build }, registration(Effect.succeed))
  )
  await runtime.runPromise(settle(1))
})

afterAll(async () => {
  await runtime.dispose()
  remove()
})

/** Admits `count` runs at once and waits for every one to settle. */
const settle = (count: number) =>
  Effect.flatMap(FlowRuntime.FlowRuntime, (flows) =>
    Effect.forEach(
      Array.from({ length: count }, () => `run-${next++}`),
      (executionId) => flows.execute(Steps, { executionId, payload: { prefix: executionId } }),
      { concurrency: "unbounded", discard: true }
    ))

/** Settles `count` runs at once, `rounds` times over, and prints the mean cost of one run. */
const measure = async (label: string, count: number, rounds: number) => {
  const started = performance.now()
  for (let round = 0; round < rounds; round++) await runtime.runPromise(settle(count))
  console.log(`${label}: ${((performance.now() - started) / (count * rounds)).toFixed(1)} ms per run`)
}

describe("a run from admission to settlement", () => {
  test("one run at a time", () => measure("one run at a time", 1, 30))
  test("ten runs at once", () => measure("ten runs at once", 10, 5))
})
