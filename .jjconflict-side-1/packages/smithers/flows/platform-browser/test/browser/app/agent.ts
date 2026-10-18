/**
 * The tab the agent suite drives: `BrowserEngine.layer` over its own engine
 * worker, `/agent-worker.js`, exposed to Playwright as `window.harness`.
 */
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { BrowserEngine } from "../../../src/index.ts"
import { Ask } from "./agent-flow.ts"

const log: Array<{ readonly label: string; readonly worker: string }> = []
new BroadcastChannel("browser-test-log").onmessage = (event) => {
  log.push(event.data)
}

/**
 * A worker that dies while it loads never leads, so a request to the engine
 * would wait on it forever. Every harness call races its error instead, and
 * fails naming the cause.
 */
let workerFailed: (message: string) => void = () => {}
const failure = new Promise<never>((_, reject) => {
  workerFailed = (message) => reject(new Error(`the engine worker did not load: ${message}`))
})
failure.catch(() => {})

const runtime = ManagedRuntime.make(BrowserEngine.layer({
  name: "browser-test-agent",
  worker: () => {
    const worker = new Worker(`/agent-worker.js${location.search}`, { type: "module" })
    worker.addEventListener("error", (event) => workerFailed(event.message))
    return worker
  }
}))

// Build the layer now: it starts this tab's engine worker, which wakes an
// unfinished run as soon as it leads.
await runtime.runPromise(BrowserEngine.BrowserEngine)

const engine = <A, E>(f: (engine: BrowserEngine.Service) => Effect.Effect<A, E>) =>
  Promise.race([runtime.runPromise(Effect.flatMap(BrowserEngine.BrowserEngine, f)), failure])

Object.assign(globalThis, {
  harness: {
    log,
    start: (executionId: string, question: string) =>
      engine((e) => e.start(Ask, { executionId, payload: { question } })),
    result: (executionId: string) =>
      engine((e) => e.result(Ask, executionId)).then((exit) =>
        Exit.isSuccess(exit) ? { ok: true, value: exit.value } : { ok: false, cause: String(exit.cause) }
      )
  }
})
