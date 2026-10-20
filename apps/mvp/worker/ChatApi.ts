import { HostModel } from "@smthrs/model-host"
import { Logger } from "@smthrs/observability"
import { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { Effect, Layer, Redacted } from "effect"
import * as Database from "../db/Database.ts"
import * as Chat from "./Chat.ts"

// The model when CHAT_MODEL is unset: a Smithers configured-model record (@smthrs/rpc ConfiguredModel).
const DEFAULT_CHAT_MODEL = {
  protocol: "openai-chat",
  baseUrl: "https://api.cerebras.ai",
  modelId: "qwen-3.8-27b",
  credential: "CEREBRAS_API_KEY",
}

/**
 * Postgres, through Hyperdrive. Its origin is `DATABASE_URL`; under `alchemy dev` the binding passes straight
 * through to the same database (the compose Postgres by default). Hyperdrive's query cache is off: an answer's
 * history must see the latest writes.
 */
export const ChatDatabase = Effect.gen(function* () {
  const url = new URL(Redacted.value(yield* Database.url))
  const origin = {
    scheme: "postgres" as const,
    host: url.hostname,
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: Redacted.make(decodeURIComponent(url.password)),
  }
  const sslmode = url.searchParams.get("sslmode") === "require" ? "require" : "disable"
  return yield* Cloudflare.Hyperdrive.Connection("ChatDatabase", {
    origin,
    caching: { disabled: true },
    dev: { ...origin, sslmode },
  })
})

// ChatApi answers /api/* for the site Worker (worker/index.ts): questions, the Electric shape proxy and the browser's
// telemetry (docs/features/chat.md). Alchemy runs its handlers; nothing here runs an Effect itself.
export default class ChatApi extends Cloudflare.Worker<ChatApi>()(
  "ChatApi",
  {
    main: "worker/ChatApi.ts",
    // @effect/sql-pg opens its sockets with node:net, which workerd provides under nodejs_compat.
    compatibility: { date: "2026-10-01", flags: ["nodejs_compat", "enable_request_signal"] },
    // Workers Logs keeps every JSON log line; Cloudflare.Telemetry() below turns on Workers Traces.
    observability: { enabled: true, logs: { enabled: true, invocationLogs: true, persist: true } },
    // Browsers reach it only through the site, so locally it takes any free port and the site keeps 1337.
    dev: { port: 0 },
  },
  Effect.gen(function* () {
    const hyperdrive = yield* Cloudflare.Hyperdrive.Connect(ChatDatabase)
    const chat = yield* Chat.make(Database.layer(hyperdrive.connectionString))
    const execution = yield* Cloudflare.WorkerExecutionContext
    const logs = Logger.layerStructuredJson()

    /** Answers run after the response, within the invocation's `waitUntil`, with its services. */
    const background = Effect.gen(function* () {
      const runtime = yield* RuntimeContext
      return Chat.Background.of({
        run: (effect) => execution.waitUntil(effect).pipe(Effect.provideService(RuntimeContext, runtime)),
      })
    })

    // Stuck answers are dispatched again, or settled as abandoned, within a minute even when nobody asks.
    yield* Cloudflare.Workers.cron("* * * * *", () =>
      Effect.flatMap(background, (bg) => chat.sweep.pipe(Effect.provideService(Chat.Background, bg))).pipe(
        Effect.provide(logs),
      ))

    return {
      fetch: Effect.flatMap(background, (bg) => chat.fetch.pipe(Effect.provideService(Chat.Background, bg))).pipe(
        Effect.provide(logs),
      ),
    }
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        HostModel.layerConfig("CHAT_MODEL", DEFAULT_CHAT_MODEL),
        Cloudflare.Hyperdrive.ConnectBinding,
        Cloudflare.Workers.CronEventSourceLive,
        Cloudflare.Telemetry({ persist: true }),
      ),
    ),
  ),
) {}
