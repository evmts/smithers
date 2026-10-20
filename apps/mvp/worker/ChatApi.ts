import { HostModel } from "@smthrs/model-host"
import { Logger } from "@smthrs/observability"
import { EdgeCache } from "@smthrs/platform-cloudflare"
import { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { Cause, Effect, Layer, Predicate } from "effect"
import { FetchHttpClient, HttpServerRequest } from "effect/http"
import * as Database from "../db/Database.ts"
import * as Electric from "../infra/Electric.ts"
import * as SignInSecret from "../infra/SignIn.ts"
import { AUTH_ROUTE } from "../src/features/auth/contract.ts"
import { REPOS_ROUTE, REPOSITORIES_SHAPE_ROUTE } from "../src/features/repo/contract.ts"
import * as Chat from "./Chat.ts"
import { codeOf } from "./ErrorCode.ts"
import * as ExecutionHost from "./ExecutionHost.ts"
import * as Executions from "./Executions.ts"
import * as Flows from "./Flows.ts"
import { RecheckRole } from "./flows/RecheckRole.ts"
import { RevokeGitHubToken } from "./flows/RevokeGitHubToken.ts"
import * as RepoApi from "./RepoApi.ts"
import * as RepoConfig from "./RepoConfig.ts"
import * as SignIn from "./SignIn.ts"

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
const ChatDatabase = Effect.gen(function* () {
  const { origin, sslmode } = Database.hyperdrive(yield* Database.url)
  return yield* Cloudflare.Hyperdrive.Connection("ChatDatabase", {
    origin,
    caching: { disabled: true },
    dev: { ...origin, sslmode },
  })
})

/** ChatApi's Worker settings; `worker/DevChatApi.ts` uses them with its own `main`. */
export const props = {
  main: "worker/ChatApi.ts",
  // @effect/sql-pg opens its sockets with node:net, which workerd provides under nodejs_compat.
  compatibility: { date: "2026-10-01", flags: ["nodejs_compat", "enable_request_signal"] },
  // Workers Logs keeps every JSON log line; Cloudflare.Telemetry() below turns on Workers Traces.
  observability: { enabled: true, logs: { enabled: true, invocationLogs: true, persist: true } },
  // Browsers reach it only through the site, so locally it takes any free port and the site keeps 1337.
  dev: { port: 0 },
}

/**
 * ChatApi's program. Who is asking comes from sign-in (`worker/SignIn.ts`); `fallback` is who is signed in while the
 * GitHub App isn't configured: nobody in production (below), a local developer under `alchemy dev`
 * (`worker/DevChatApi.ts`). The model endpoint refuses a call with no actor.
 */
export const program = (options: { readonly fallback?: SignIn.Signed } = {}) =>
  Effect.gen(function* () {
    yield* Electric.bind
    yield* SignInSecret.bind
    const hyperdrive = yield* Cloudflare.Hyperdrive.Connect(ChatDatabase)
    const database = Database.layer(hyperdrive.connectionString)
    const chat = yield* Chat.make(database)
    const signIn = yield* SignIn.make(database, options).pipe(Effect.provide(FetchHttpClient.layer))
    // Repositories (docs/features/repo.md): cloning into Code Storage, the `repositories` shape, and reads at a commit,
    // cached in this Worker's Cache API.
    const codeStorage = yield* RepoConfig.codeStorage.pipe(Effect.provide(FetchHttpClient.layer))
    const repos = yield* RepoApi.make(database, { codeStorage })
    const repoCache = EdgeCache.layer({ name: "repo" }).pipe(Layer.orDie)
    const logs = Logger.layerStructuredJson()
    // ChatApi hosts the remote flow executions' Durable Object (worker/Executions.ts, docs/features/remote-flows.md).
    const executions = yield* Executions.FlowExecution

    /**
     * Starts `auth/RecheckRole` on its own Durable Object, one execution per session and the check it replaces, so one
     * check of a session runs at a time; it never waits.
     */
    const roleChecks = Effect.gen(function* () {
      const runtime = yield* RuntimeContext
      return SignIn.RoleChecks.of({
        start: (sessionId, generation) => {
          const executionId = `auth-recheck-${sessionId}-${generation}`
          return ExecutionHost.intent(RecheckRole, { executionId, payload: { sessionId } }).pipe(
            Effect.flatMap((intent) => executions.getByName(executionId).start(intent)),
            Effect.provideService(RuntimeContext, runtime),
            Effect.catchCause((cause) =>
              Effect.logWarning("auth.role_check").pipe(
                Effect.annotateLogs({ sessionId, outcome: "not_started", errorCode: codeOf(Cause.squash(cause)) }),
              )
            ),
          )
        },
      })
    })

    /**
     * Starts `auth/RevokeGitHubToken` for a session that ended at sign-out on its own Durable Object, one execution per
     * session (`auth-revoke-<sessionId>`); it never waits for the flow.
     */
    const tokenRevocations = Effect.gen(function* () {
      const runtime = yield* RuntimeContext
      return SignIn.TokenRevocations.of({
        start: (sessionId) => {
          const executionId = `auth-revoke-${sessionId}`
          return ExecutionHost.intent(RevokeGitHubToken, { executionId, payload: { sessionId } }).pipe(
            Effect.flatMap((intent) => executions.getByName(executionId).start(intent)),
            Effect.provideService(RuntimeContext, runtime),
            Effect.catchCause((cause) =>
              Effect.logWarning("auth.revoke_token").pipe(
                Effect.annotateLogs({ sessionId, outcome: "not_started", errorCode: codeOf(Cause.squash(cause)) }),
              )
            ),
          )
        },
      })
    })

    /**
     * Where the remote door (worker/Flows.ts) starts a flow: its own Durable Object, named by the execution id. The
     * same intent again is a no-op; another payload under the id is `StartConflict`; any other failure, the payload's
     * encoding or the object's RPC, is `StartUnavailable` with its code.
     */
    const flowStarter = Effect.gen(function* () {
      const runtime = yield* RuntimeContext
      return Flows.FlowStarter.of({
        // The door decoded `payload` with this flow's own schema; `Flow.Any` can't say so in its type.
        start: (flow, { executionId, payload }) =>
          ExecutionHost.intent(flow, { executionId, payload: payload as never }).pipe(
            Effect.flatMap((intent) => executions.getByName(executionId).start(intent)),
            Effect.provideService(RuntimeContext, runtime),
            Effect.catchCause((cause) => {
              const error = Cause.squash(cause)
              return Effect.fail(
                Predicate.isTagged(error, "@smthrs/platform-cloudflare/IntentConflict")
                  ? new Flows.StartConflict()
                  : new Flows.StartUnavailable({ errorCode: codeOf(error) }),
              )
            }),
          ),
      })
    })

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const checks = Layer.succeed(SignIn.RoleChecks, yield* roleChecks)
        const signedIn = Layer.merge(checks, signIn.sessions.pipe(Layer.provide(checks)))
        if (request.url.startsWith(`${AUTH_ROUTE}/`)) {
          const revocations = Layer.succeed(SignIn.TokenRevocations, yield* tokenRevocations)
          return yield* Effect.provide(signIn.fetch, Layer.merge(signedIn, revocations))
        }
        const starter = yield* flowStarter
        const path = request.url.split("?")[0]!
        if (path === REPOS_ROUTE || path.startsWith(`${REPOS_ROUTE}/`) || path === REPOSITORIES_SHAPE_ROUTE) {
          return yield* repos.fetch.pipe(
            Effect.provideService(Flows.FlowStarter, starter),
            Effect.provide(signedIn),
            Effect.provide(repoCache),
          )
        }
        return yield* chat.fetch.pipe(Effect.provideService(Flows.FlowStarter, starter), Effect.provide(signedIn))
      }).pipe(Effect.provide(logs)),
    }
  }).pipe(
    Effect.provide(Executions.live(ChatDatabase)),
    Effect.provide(
      Layer.mergeAll(
        HostModel.layerConfig("CHAT_MODEL", DEFAULT_CHAT_MODEL),
        Cloudflare.Hyperdrive.ConnectBinding,
        Cloudflare.Telemetry({ persist: true }),
      ),
    ),
  )

// ChatApi answers /api/* for the site Worker (worker/index.ts): questions, the Electric shape proxy, the model
// endpoint, the answer routes, the remote flow door, sign-in, repositories and the browser's telemetry
// (docs/features/chat.md, docs/features/model-endpoint.md, docs/features/agent.md, docs/features/flows.md,
// docs/features/sign-in.md, docs/features/repo.md).
// Alchemy runs its handlers; nothing here runs an Effect itself. Until the GitHub App is configured, nobody is signed
// in, so asking, the model endpoint, the answer routes and the door refuse every call.
export default class ChatApi extends Cloudflare.Worker<ChatApi>()("ChatApi", props, program()) {}
