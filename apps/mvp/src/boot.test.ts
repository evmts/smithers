import { Effect, Fiber, Layer, Logger, Metric, References } from "effect"
import { afterEach, expect, test, vi } from "vitest"
import { appLayer, boot, bootTime, logPageErrors } from "./boot"
import type { Chat } from "./features/chat/store"
import { ChatStore } from "./features/chat/store"
import * as Collections from "./lib/collections"
import { makeRuntime } from "./lib/runtime"
import { openTestApp } from "./test/chatApi"

// The browser program, on the app's own layer, as main.tsx runs it.

const runtimes: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
})

const cmdK = () => Object.assign(new Event("keydown", { cancelable: true }), { key: "k", metaKey: true })

test("renders with the store, binds the keys, records boot time once the conversation is ready, and unbinds when stopped", async () => {
  const runtime = openTestApp()
  runtimes.push(runtime)
  const target = new EventTarget()
  const rendered: Array<Chat> = []
  const fiber = runtime.runFork(boot({ target, startedAt: Date.now() - 1_000, render: (chat) => rendered.push(chat) }))
  await vi.waitFor(() => expect(runtime.runSync(Metric.value(bootTime)).count).toBe(1), { timeout: 10_000 })
  const chat = await runtime.runPromise(Effect.service(ChatStore))
  expect(rendered).toEqual([chat])
  expect(runtime.runSync(Metric.value(bootTime)).sum).toBeGreaterThanOrEqual(1_000)
  expect(chat.conversation.status).toBe("ready")

  target.dispatchEvent(cmdK())
  expect(chat.composer.get("composer")?.open).toBe(true)
  await runtime.runPromise(Fiber.interrupt(fiber))
  target.dispatchEvent(cmdK())
  expect(chat.composer.get("composer")?.open).toBe(true)
})

test("keeps running, with no boot time, when the conversation can't open, and sync says why", async () => {
  const refuse: typeof globalThis.fetch = async () => Response.json({ message: "Invalid request" }, { status: 400 })
  const runtime = makeRuntime(
    appLayer({ origin: "http://chatapi.test", fetch: refuse }).pipe(
      Layer.provideMerge(Layer.succeed(Metric.MetricRegistry, new Map())),
    ),
  )
  runtimes.push(runtime)
  const fiber = runtime.runFork(boot({ target: new EventTarget(), startedAt: Date.now(), render: () => {} }))
  const chat = await runtime.runPromise(Effect.service(ChatStore))
  await vi.waitFor(() => expect(chat.conversation.status).toBe("error"), { timeout: 10_000 })
  await runtime.runPromise(Collections.preload(chat.syncState))
  expect(chat.syncState.toArray[0]).toEqual(
    expect.objectContaining({ status: "failed", reason: "refused", httpStatus: 400 }),
  )
  expect(runtime.runSync(Metric.value(bootTime)).count).toBe(0)
  expect(fiber.pollUnsafe()).toBeUndefined()
})

test("logs an uncaught error by name and place, and an unhandled rejection by name, never their messages", async () => {
  const logs: Array<{ message: unknown; annotations: Record<string, unknown> }> = []
  const recorder = Logger.make(({ message, fiber }) => {
    logs.push({ message, annotations: { ...fiber.getRef(References.CurrentLogAnnotations) } })
  })
  const runtime = makeRuntime(Logger.layer([recorder]))
  runtimes.push(runtime)
  const target = new EventTarget()
  await runtime.runPromise(Effect.scoped(Effect.gen(function* () {
    yield* logPageErrors(target)
    const secret = "what someone wrote"
    target.dispatchEvent(
      Object.assign(new Event("error"), { error: new TypeError(secret), filename: "app.js", lineno: 3, colno: 7 }),
    )
    target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new RangeError(secret) }))
    target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: secret }))
  })))
  target.dispatchEvent(Object.assign(new Event("error"), { error: new Error("after the scope") }))
  expect(logs).toEqual([
    { message: ["page error"], annotations: { feature: "app", name: "TypeError", source: "app.js:3:7" } },
    { message: ["unhandled rejection"], annotations: { feature: "app", name: "RangeError" } },
    { message: ["unhandled rejection"], annotations: { feature: "app", name: "string" } },
  ])
})
