import { Otlp } from "@smthrs/observability"
import { Clock, Effect, Layer, Metric } from "effect"
import { FetchHttpClient } from "effect/http"
import { reconnectOnline } from "./features/chat/reconnect"
import { chatShortcuts } from "./features/chat/shortcuts"
import { type Chat, type ChatConfig, ChatStore, chatConfig } from "./features/chat/store"
import * as Collections from "./lib/collections"
import { Boundary } from "./lib/runtime"

/** From the page's start to the conversation's first snapshot (`performance.timeOrigin` to ready). */
export const bootTime = Metric.histogram("smithers_web_boot_ms", {
  description: "Milliseconds from page start to the conversation being ready",
  boundaries: Metric.exponentialBoundaries({ start: 50, factor: 2, count: 10 }),
})

/**
 * The browser's services, built once by main.tsx's runtime: chat's store over ChatApi on `origin`, and telemetry
 * exported over OTLP to ChatApi's relay (`/api/telemetry`), which every Effect log, span and metric goes through.
 * Every request goes through `fetch`, the global one unless a test host supplies its own.
 */
export const appLayer = (options: {
  readonly origin: string
  readonly fetch?: typeof globalThis.fetch
} & Omit<ChatConfig, "shapeUrl" | "questionsUrl" | "fetch">) => {
  const { origin, ...chat } = options
  const app = ChatStore.layer(chatConfig(origin, chat)).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provideMerge(Otlp.layerFetch({ baseUrl: `${origin}/api/telemetry`, serviceName: "smithers-mvp-web" })),
  )
  return options.fetch === undefined ? app : app.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, options.fetch)))
}

/**
 * Logs what nothing caught on `target` (the window): an uncaught error or an unhandled rejection, by its name and,
 * for an error, where it was thrown. Never its message, which can quote what someone wrote.
 */
export const logPageErrors = Effect.fnUntraced(function* (target: EventTarget) {
  const boundary = yield* Boundary
  const onError = (event: Event) => {
    const { error, reason, filename, lineno, colno } = event as Partial<ErrorEvent & PromiseRejectionEvent>
    const thrown: unknown = event.type === "error" ? error : reason
    const name = thrown instanceof Error ? thrown.name : typeof thrown
    boundary.runSync(
      Effect.logError(event.type === "error" ? "page error" : "unhandled rejection").pipe(
        Effect.annotateLogs({ name, ...(filename ? { source: `${filename}:${lineno}:${colno}` } : {}) }),
        Effect.annotateLogs({ feature: "app" }),
      ),
    )
  }
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      target.addEventListener("error", onError)
      target.addEventListener("unhandledrejection", onError)
    }),
    () =>
      Effect.sync(() => {
        target.removeEventListener("error", onError)
        target.removeEventListener("unhandledrejection", onError)
      }),
  )
})

/**
 * The browser program, run once by main.tsx: logs page errors, renders with the store, binds the chat keys, syncs
 * again when the browser comes back online, opens the conversation and records how long that took, then holds
 * everything open until the page closes.
 */
export const boot = (options: {
  readonly target: EventTarget
  /** The page's start, in epoch milliseconds: `performance.timeOrigin`. */
  readonly startedAt: number
  readonly render: (chat: Chat) => void
}) =>
  Effect.gen(function* () {
    yield* logPageErrors(options.target)
    const chat = yield* ChatStore
    yield* Effect.sync(() => options.render(chat))
    yield* chatShortcuts(options.target)
    yield* reconnectOnline(options.target)
    yield* Collections.preload(chat.conversation).pipe(
      Effect.andThen(Clock.currentTimeMillis),
      Effect.flatMap((now) => Metric.update(bootTime, now - options.startedAt)),
      Effect.andThen(Effect.logInfo("chat ready")),
      Effect.catchTag("SyncFailed", (error) =>
        Effect.logError("chat couldn't open").pipe(
          Effect.annotateLogs(error.status === undefined ? {} : { status: error.status }),
        ),
      ),
    )
    return yield* Effect.never
  }).pipe(Effect.scoped, Effect.annotateLogs({ feature: "app" }))
