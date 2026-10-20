import { Otlp } from "@smthrs/observability"
import { Persistence } from "@smthrs/effect-tanstack-db"
import type { BrowserEngine, StoragePersistence } from "@smthrs/platform-browser"
import type { BrowserWASQLiteDatabase } from "@tanstack/browser-db-sqlite-persistence"
import { Clock, type Duration, Effect, Fiber, Layer, ManagedRuntime, Metric } from "effect"
import { FetchHttpClient, type HttpClient } from "effect/http"
import { AuthClient } from "./features/auth/api"
import { Auth, type AuthView } from "./features/auth/auth"
import { DeviceWipe } from "./features/auth/device"
import { AuthStore } from "./features/auth/store"
import { ChatClient } from "./features/chat/api"
import { Chat, type ChatView } from "./features/chat/chat"
import { bindConnectivity } from "./features/chat/connectivity"
import { QUESTIONS_ROUTE, TELEMETRY_ROUTE } from "./features/chat/contract"
import { storagePersisted } from "./features/chat/metrics"
import { chatShortcuts } from "./features/chat/shortcuts"
import { type ChatConfig, type ChatHost, ChatStore, chatConfig } from "./features/chat/store"
import { RepoClient, REQUEST_WITHIN } from "./features/repo/api"
import { Clipboard } from "./features/repo/clipboard"
import { Repo, type RepoView } from "./features/repo/repo"
import { RepoStore } from "./features/repo/store"
import { type ThemeHost, ThemeStore } from "./features/theme/store"
import { Theme, type ThemeView } from "./features/theme/theme"
import { FlowDispatch, RemoteFlows } from "./flows/dispatch"
import { failFastOnEngine, tabAnswers, tabEngine } from "./flows/engine"
import type { Endpoint } from "./flows/tabPort"
import { Page } from "./page"
import { EXPORTED_SPANS, WEB_SERVICE } from "./telemetry"

/** From the page's start to the conversation shown from the device (`performance.timeOrigin` to restored). */
export const bootTime = Metric.histogram("smithers_web_boot_ms", {
  description: "Milliseconds from page start to the conversation restored from the device",
  boundaries: Metric.exponentialBoundaries({ start: 50, factor: 2, count: 10 }),
})

/**
 * What the device keeps and how it sends: the device store (`Persistence.layer`'s options: the database, the
 * persistence over it and the coordinator between tabs), chat's host (the outbox's entry point, storage, network
 * detector and lock service, and whether the browser is online), the request for persistent storage, the page the
 * theme paints, the clipboard, and this tab's engine worker. main.tsx gives the browser's; a test gives Node's.
 */
export interface Host extends ChatHost {
  readonly persistence: Persistence.Options<BrowserWASQLiteDatabase>
  /** Asks the browser to keep this site's storage: `@smthrs/platform-browser`'s `StoragePersistence`. */
  readonly storage: StoragePersistence.Service
  /** Where the theme paints, mirrors and reads the system's mode (src/features/theme/store.ts). */
  readonly theme: ThemeHost
  /** Writes `text` to the system clipboard: Copy permalink (src/features/repo/clipboard.ts). */
  readonly clipboard: (text: string) => Promise<void>
  /** Starts this tab's engine worker (src/flows/engine.worker.ts), which runs every client flow once it leads. */
  readonly engineWorker: () => BrowserEngine.WorkerLike & Endpoint
  /** The engine's name: its Web Lock, channel and store. `ENGINE_NAME` unless set, so tests can keep engines apart. */
  readonly engineName?: string
  /**
   * Wipes what this device holds of a session that ended: its synced database, the engine's store and the outbox
   * (decision 0008 §4.6). Sign-out calls it once ChatApi has ended the session (src/features/auth/device.ts).
   */
  readonly wipe: () => Promise<void>
}

/**
 * What the browser's services are built from: ChatApi's `origin`, the page's `fetch` and `reload`, the host, how long
 * ChatApi gets to answer a question (default 15 s), and chat's settings.
 */
export interface AppOptions extends Omit<ChatConfig, "shapeUrl"> {
  readonly origin: string
  readonly fetch: typeof globalThis.fetch
  readonly reload: () => void
  readonly host: Host
  readonly answerWithin?: Duration.Input
}

/**
 * The real services the browser reaches ChatApi through: chat's client and sign-in's, each with `answerWithin`
 * (default 15 s) for a whole request. Electric's shape source needs no layer.
 */
export const realServices = (options: Pick<AppOptions, "origin" | "answerWithin">) => {
  const within = options.answerWithin ?? "15 seconds"
  return Layer.merge(
    ChatClient.layer({ url: `${options.origin}${QUESTIONS_ROUTE}`, within }),
    AuthClient.layer({ origin: options.origin, within }),
  )
}

/**
 * The browser's services: the chat, sign-in, theme and repository layers; chat's store over the device store, which
 * dispatches each question it sends to this device's agent; the repository store, which reads who is signed in from
 * sign-in's store; dispatch over this tab's engine (its worker, `host.engineWorker`, started before the device store
 * opens) and the server's door; the tab's answers to its worker; the theme's store; RepoApi's client (`REQUEST_WITHIN`
 * for a whole request) and the host's clipboard; the page; and telemetry exported over OTLP to ChatApi's relay
 * (`/api/telemetry`), which every Effect log, span and metric goes through. Every request goes through `fetch`.
 * `services` is how the browser reaches ChatApi and Electric: `realServices`, or, for a test of an unhappy path or the
 * end-to-end entry (`/app?faults`, src/test/e2e.ts), faulty ones (src/test/faults.ts).
 */
export const appLayer = <S = never>(
  options: AppOptions,
  services: Layer.Layer<ChatClient | AuthClient | S, never, HttpClient.HttpClient>,
) => {
  const { origin, reload, host, fetch: _fetch, answerWithin: _answerWithin, ...chat } = options
  const auth = Auth.layer.pipe(Layer.provide(DeviceWipe.layer(host.wipe)))
  return Layer.mergeAll(Chat.layer, auth, Theme.layer, Repo.layer).pipe(
    Layer.provideMerge(ChatStore.layer(chatConfig(origin, chat), host)),
    Layer.provideMerge(RepoStore.layer({ origin })),
    // Below the repository store, which shows the sign-in link in Clone's place from sign-in's row.
    Layer.provideMerge(AuthStore.layer),
    Layer.provideMerge(FlowDispatch.layer),
    Layer.provideMerge(RemoteFlows.layerHttp(origin)),
    Layer.provideMerge(tabAnswers),
    Layer.provideMerge(ThemeStore.layer(host.theme)),
    Layer.provideMerge(services),
    Layer.provideMerge(RepoClient.layer({ origin, within: REQUEST_WITHIN })),
    Layer.provideMerge(Clipboard.layer(host.clipboard)),
    // The device store opens through the leading tab's engine worker; if this tab's worker fails, it opens in memory
    // at once instead of waiting for a leader that will never answer.
    Layer.provideMerge(Layer.unwrap(Effect.map(failFastOnEngine(host.persistence), Persistence.layer))),
    // Built before the device store: the leading tab's engine worker serves the store's SQLite, so this tab starts
    // its worker first.
    Layer.provideMerge(tabEngine(host.engineWorker, host.engineName)),
    Layer.provideMerge(Page.layer(reload)),
    Layer.provide(FetchHttpClient.layer),
    // Only the spans the relay keeps: a tab's engine requests, hundreds per answer, stay in the tab.
    Layer.provideMerge(
      Otlp.layerFetch({ baseUrl: `${origin}${TELEMETRY_ROUTE}`, serviceName: WEB_SERVICE, spans: EXPORTED_SPANS }),
    ),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, options.fetch)),
  )
}

/**
 * Logs what nothing caught on `target` (the window): an uncaught error or an unhandled rejection, by its name and,
 * for an error, where it was thrown. Never its message, which can quote what someone wrote. The listener runs its log
 * with the services it was bound with.
 */
export const logPageErrors = Effect.fnUntraced(function* (target: EventTarget) {
  const run = Effect.runSyncWith(yield* Effect.context<never>())
  const onError = (event: Event) => {
    const { error, reason, filename, lineno, colno } = event as Partial<ErrorEvent & PromiseRejectionEvent>
    const thrown: unknown = event.type === "error" ? error : reason
    const name = thrown instanceof Error ? thrown.name : typeof thrown
    run(
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

/** Asks the browser to keep this site's storage, so it isn't cleared after days unused, and counts its answer. */
export const requestPersistentStorage = (storage: StoragePersistence.Service) =>
  storage.persist.pipe(
    Effect.map(String),
    Effect.flatMap((granted) =>
      Effect.andThen(
        Metric.update(Metric.withAttributes(storagePersisted, { granted }), 1),
        Effect.logInfo("persistent storage requested").pipe(Effect.annotateLogs({ granted, feature: "app" })),
      ),
    ),
  )

/**
 * Where the boot program renders and listens: the window, the page's start, and a renderer for the chat, sign-in,
 * theme and repository layers.
 */
export interface BootOptions {
  readonly target: EventTarget
  /** The page's start, in epoch milliseconds: `performance.timeOrigin`. */
  readonly startedAt: number
  readonly render: (chat: ChatView, auth: AuthView, theme: ThemeView, repo: RepoView) => void
}

/**
 * The browser program: logs page errors, renders with the chat, sign-in, theme and repository layers, binds the chat
 * keys and the browser's connectivity, asks to keep the device's storage, records how long the conversation took to
 * show from the device, then holds everything open until it is stopped.
 */
export const boot = (options: BootOptions & { readonly storage: StoragePersistence.Service }) =>
  Effect.gen(function* () {
    yield* logPageErrors(options.target)
    const chat = yield* Chat
    const auth = yield* Auth
    const theme = yield* Theme
    const repo = yield* Repo
    const store = yield* ChatStore
    yield* Effect.sync(() => options.render(chat, auth, theme, repo))
    yield* chatShortcuts(options.target)
    yield* bindConnectivity(options.target)
    yield* requestPersistentStorage(options.storage).pipe(Effect.forkScoped)
    yield* store.messages.restored.pipe(
      Effect.andThen(Clock.currentTimeMillis),
      Effect.flatMap((now) => Metric.update(bootTime, now - options.startedAt)),
      Effect.andThen(Effect.logInfo("chat ready")),
      Effect.catchTag("LoadFailed", () => Effect.logError("chat couldn't restore")),
    )
    return yield* Effect.never
  }).pipe(Effect.scoped, Effect.annotateLogs({ feature: "app" }))

/**
 * The program's boundary, called once by main.tsx: builds the app's one runtime from `appLayer` and runs `boot` on it.
 * Every Effect in the app runs on this runtime, or with services taken from it. `services` is `realServices`, or
 * faulty ones, as in `appLayer`. Returns `stop`, which ends the program and closes the runtime, flushing telemetry, and `runtime`.
 */
export const start = <S = never>(
  options: AppOptions & BootOptions,
  services: Layer.Layer<ChatClient | AuthClient | S, never, HttpClient.HttpClient>,
) => {
  const { target, startedAt, render, ...app } = options
  const runtime = ManagedRuntime.make(appLayer(app, services))
  const program = runtime.runFork(boot({ target, startedAt, render, storage: app.host.storage }))
  return { runtime, stop: () => runtime.runPromise(Fiber.interrupt(program)).then(() => runtime.dispose()) }
}
