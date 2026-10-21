import { HostModel } from "@smthrs/model-host"
import { Logger } from "@smthrs/observability"
import { EdgeCache } from "@smthrs/platform-cloudflare"
import { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { Cause, Effect, Layer, Option, Predicate } from "effect"
import { FetchHttpClient, HttpServerRequest } from "effect/http"
import * as Database from "../db/Database.ts"
import * as Electric from "../infra/Electric.ts"
import * as SecretsInfra from "../infra/Secrets.ts"
import * as SignInSecret from "../infra/SignIn.ts"
import { AUTH_ROUTE } from "../src/features/auth/contract.ts"
import { todoExecutionId } from "../src/features/pulls/contract.ts"
import { REPOS_ROUTE, REPOSITORIES_SHAPE_ROUTE } from "../src/features/repo/contract.ts"
import * as BranchApi from "./branch/BranchApi.ts"
import { Forge } from "./branch/Forge.ts"
import { Directory } from "./branch/People.ts"
import { TerminalSockets } from "./branch/Sandboxes.ts"
import * as BranchRooms from "./BranchRooms.ts"
import * as BranchSandboxes from "./BranchSandboxes.ts"
import * as Chat from "./Chat.ts"
import { codeOf } from "./ErrorCode.ts"
import * as ExecutionHost from "./ExecutionHost.ts"
import * as Executions from "./Executions.ts"
import * as Flows from "./Flows.ts"
import { RecheckRole, recheckExecutionId } from "./flows/RecheckRole.ts"
import * as GitHubApi from "./github/Api.ts"
import * as HomeApi from "./home/Api.ts"
import * as GitHubConfig from "./github/Config.ts"
import { DEFAULT_CHAT_MODEL } from "./ModelRoles.ts"
import * as RepoApi from "./RepoApi.ts"
import * as RepoConfig from "./RepoConfig.ts"
import * as SecretsApi from "./secrets/Api.ts"
import { SecretKeys } from "./secrets/Keys.ts"
import * as SignIn from "./SignIn.ts"
import * as StackApi from "./stack/Api.ts"
import * as Stack from "./stack/Stack.ts"
import * as Todo from "./flows/Todo.ts"
import * as Throttle from "./Throttle.ts"

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
  // global_fetch_strictly_public: ChatApi fetches Electric's gateway at its workers.dev URL, and Cloudflare refuses a
  // Worker's fetch to another Worker of the same account there (404, error code 1042) unless fetch goes out publicly.
  compatibility: {
    date: "2026-10-01",
    flags: ["nodejs_compat", "enable_request_signal", "global_fetch_strictly_public"],
  },
  // Workers Logs keeps every JSON log line; Cloudflare.Telemetry() below turns on Workers Traces.
  observability: { enabled: true, logs: { enabled: true, invocationLogs: true, persist: true } },
  // Browsers reach it only through the site, so locally it takes any free port and the site keeps 1337.
  dev: { port: 0 },
}

/**
 * ChatApi's program. Who is asking comes from sign-in (`worker/SignIn.ts`); `fallback` is who is signed in while the
 * GitHub App isn't configured: nobody in production (below), a local developer under `alchemy dev`
 * (`worker/DevChatApi.ts`). The model endpoint refuses a call with no actor. `localHttp`, which only `alchemy dev` sets,
 * keeps links to `http:` pages on `localhost` (`WEB_PAGES_LOCAL_HTTP`'s default, worker/Views.ts). `spendAlerts`,
 * which only `alchemy dev` sets, to `false`, is `MODEL_SPEND_ALERTS`' default: a deploy alerts on any model spend
 * unless its environment says otherwise (docs/features/spend-alerts.md). `dev`, which only `alchemy dev` sets, lets an
 * alert provider pointed at a local fake send without its key (docs/features/spend-alerts.md#channels).
 */
export const program = (
  options: {
    readonly fallback?: SignIn.Signed
    readonly teammates?: Readonly<Record<string, SignIn.Signed>>
    readonly localHttp?: boolean
    readonly spendAlerts?: boolean
    readonly dev?: boolean
  } = {},
) =>
  Effect.gen(function* () {
    yield* Electric.bind
    yield* SignInSecret.bind
    yield* SecretsInfra.bind
    const hyperdrive = yield* Cloudflare.Hyperdrive.Connect(ChatDatabase)
    const database = Database.layer(hyperdrive.connectionString)
    const chat = yield* Chat.make(database, {
      ...(options.localHttp === undefined ? {} : { localHttp: options.localHttp }),
      ...(options.spendAlerts === undefined ? {} : { spendAlerts: options.spendAlerts }),
    })
    const signIn = yield* SignIn.make(database, options).pipe(Effect.provide(FetchHttpClient.layer))
    // Repositories (docs/features/repo.md): cloning into Code Storage, the `repositories` shape, and reads at a commit,
    // cached in this Worker's Cache API.
    const codeStorage = yield* RepoConfig.codeStorage.pipe(Effect.provide(FetchHttpClient.layer))
    const repos = yield* RepoApi.make(database, { codeStorage })
    // The branch workspace (docs/features/branch-workspace.md): tracking a branch, its terminals, and the branches'
    // machines, `SandboxObject`s ChatApi hosts (worker/BranchSandboxes.ts).
    const branchApi = yield* BranchApi.make(database)
    // Repository secrets (docs/features/secrets.md): write-only values sealed under SECRETS_KEY, off without it.
    const secretKeys = yield* Effect.service(SecretKeys).pipe(Effect.provide(SecretKeys.layerConfig), Effect.orDie)
    const secretsApi = yield* SecretsApi.make(yield* GitHubConfig.repository)
    const sandboxObjects = (yield* BranchSandboxes.SandboxObject) as Cloudflare.DurableObject<
      BranchSandboxes.SandboxObjectShape
    >
    // Each branch's room, `RoomObject`s ChatApi hosts (worker/BranchRooms.ts), and the people a branch can be shared
    // with: everyone who signed in, and local development's own people (docs/features/branch-workspace.md#sharing).
    const roomObjects = (yield* BranchRooms.RoomObject) as Cloudflare.DurableObject<BranchRooms.RoomObjectShape>
    const directory = Directory.layer(
      database,
      [options.fallback, ...Object.values(options.teammates ?? {})].flatMap((person) =>
        person === undefined ? [] : [{ id: person.actor.subject.id, login: person.login }]
      ),
    )
    const forge = Forge.layerConfig.pipe(Layer.provide(FetchHttpClient.layer))
    // The git loop (docs/features/issues.md): GitHub's webhook, the writes route and the issues' shapes, for the one
    // repository sign-in reads roles on.
    const github = yield* GitHubApi.make(database, {
      repository: yield* GitHubConfig.repository,
      app: yield* GitHubConfig.configured,
    })
    // TODOs and the stack (docs/features/todos.md): the one route that changes a stack, through its one writer, and the
    // TODOs' shapes.
    const stack = yield* StackApi.make(database)
    const githubApp = yield* GitHubConfig.configured
    const runTodos = yield* Todo.enabled
    /**
     * The `todo` runs the stack's writer starts (decision 0016 Track B): each attempt's run on its own Durable Object,
     * `todo:<attempt id>`, the same start again a no-op. Stop has nothing to send: a dropped TODO's run finds it at its
     * next report to the writer, or at its next read of its pull request, and closes what it opened.
     */
    const todoRuns = (starter: Flows.FlowStarter["Service"]) =>
      Stack.TodoRuns.of({
        start: (attempt) =>
          starter.start(Todo.Todo, { executionId: todoExecutionId(attempt.attemptId), payload: attempt }).pipe(
            Effect.catch((error) =>
              error._tag === "@smthrs/mvp/flows/StartConflict"
                ? Effect.void
                : Effect.fail(new Stack.RunsUnavailable({ errorCode: error.errorCode }))
            ),
          ),
        stop: () => Effect.void,
      })
    // A repository's home (docs/features/home.md): who the asker is on it, and Smithers' curated home for it.
    const home = HomeApi.make()
    const repoCache = EdgeCache.layer({ name: "repo" }).pipe(Layer.orDie)
    const webCache = EdgeCache.layer({ name: "web" }).pipe(Layer.orDie)
    const logs = Logger.layerStructuredJson()
    // ChatApi hosts the remote flow executions' Durable Object (worker/Executions.ts, docs/features/remote-flows.md).
    const executions = yield* Executions.FlowExecution
    // The edge throttle on the open routes (worker/Throttle.ts): requests per network per minute, counted per Cloudflare
    // location. Neither number comes from a load test: a busy tab sends about 70 shape requests and 150 telemetry
    // exports a minute, so each lets about 20 busy tabs share a network (docs/features/chat.md#throttling).
    const shapeLimit = yield* Cloudflare.RateLimit("SHAPE_LIMIT", {
      namespaceId: 71001,
      simple: { limit: 3000, period: 60 },
    })
    const telemetryLimit = yield* Cloudflare.RateLimit("TELEMETRY_LIMIT", {
      namespaceId: 71002,
      simple: { limit: 3000, period: 60 },
    })

    /**
     * Starts `auth/RecheckRole` on its own Durable Object, one execution per session and the check it replaces, so one
     * check of a session runs at a time; it never waits.
     */
    const roleChecks = Effect.gen(function* () {
      const runtime = yield* RuntimeContext
      return SignIn.RoleChecks.of({
        start: (sessionId, generation) => {
          const executionId = recheckExecutionId(sessionId, generation)
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
     * Where ChatApi's routes start a remote flow (worker/Flows.ts): its own Durable Object, named by the execution id.
     * The same intent again is a no-op; another payload under the id is `StartConflict`; any other failure, the
     * payload's encoding or the object's RPC, is `StartUnavailable` with its code.
     */
    const flowStarter = Effect.gen(function* () {
      const runtime = yield* RuntimeContext
      return Flows.FlowStarter.of({
        // The route built `payload` as this flow's own schema types it; `Flow.Any` can't say so in its type.
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
        const runtime = yield* RuntimeContext
        const limited = yield* Throttle.make({
          shape: { limit: (key) => shapeLimit.limit(key).pipe(Effect.provideService(RuntimeContext, runtime)) },
          telemetry: { limit: (key) => telemetryLimit.limit(key).pipe(Effect.provideService(RuntimeContext, runtime)) },
        })(request)
        if (Option.isSome(limited)) return limited.value
        const checks = Layer.succeed(SignIn.RoleChecks, yield* roleChecks)
        const signedIn = Layer.merge(checks, signIn.sessions.pipe(Layer.provide(checks)))
        const starter = yield* flowStarter
        if (request.url.startsWith(`${AUTH_ROUTE}/`)) {
          // Signing out starts `auth/RevokeGitHubToken` through `starter` and answers once the start is recorded.
          return yield* signIn.fetch.pipe(Effect.provideService(Flows.FlowStarter, starter), Effect.provide(signedIn))
        }
        const path = request.url.split("?")[0]!
        if (BranchApi.handles(path)) {
          const sockets = Layer.effect(TerminalSockets, BranchSandboxes.terminalSocketsOver(sandboxObjects))
          const rooms = BranchRooms.roomsLayer(roomObjects)
          return yield* branchApi.fetch.pipe(
            Effect.provideService(Flows.FlowStarter, starter),
            Effect.provide(signedIn),
            Effect.provide(Layer.mergeAll(forge, sockets, rooms, directory, FetchHttpClient.layer)),
          )
        }
        // Before the repository routes: a write is `/api/repos/<owner>/<name>/writes`.
        if (SecretsApi.handles(path)) {
          return yield* secretsApi.fetch.pipe(
            Effect.provideService(Flows.FlowStarter, starter),
            Effect.provideService(SecretKeys, secretKeys),
            Effect.provide(signedIn),
          )
        }
        if (GitHubApi.handles(path)) {
          return yield* github.fetch.pipe(Effect.provideService(Flows.FlowStarter, starter), Effect.provide(signedIn))
        }
        // Before the repository routes too: a change is `/api/repos/<owner>/<name>/stack`. With the GitHub App and
        // `TODO_RUNS` on, this host runs TODOs: each attempt the writer starts runs `todo` on its own Durable Object
        // (decision 0016).
        if (StackApi.handles(path)) {
          return yield* (Option.isSome(githubApp) && runTodos
            ? stack.fetch.pipe(Effect.provideService(Stack.TodoRuns, todoRuns(starter)))
            : stack.fetch).pipe(Effect.provide(signedIn))
        }
        // And a home, `/api/repos/<owner>/<name>/home` (docs/features/home.md): who the asker is and the curated home.
        if (HomeApi.handles(path)) return yield* home.fetch.pipe(Effect.provide(signedIn))
        if (path === REPOS_ROUTE || path.startsWith(`${REPOS_ROUTE}/`) || path === REPOSITORIES_SHAPE_ROUTE) {
          return yield* repos.fetch.pipe(
            Effect.provideService(Flows.FlowStarter, starter),
            Effect.provide(signedIn),
            Effect.provide(repoCache),
          )
        }
        // Pages checked before they are framed are requested through the Worker's fetch, which reaches public addresses
        // only, and their answers kept in this Worker's Cache API (worker/WebPreview.ts).
        return yield* chat.fetch.pipe(
          Effect.provideService(Flows.FlowStarter, starter),
          Effect.provide(signedIn),
          Effect.provide(Layer.merge(FetchHttpClient.layer, webCache)),
        )
      }).pipe(Effect.provide(logs)),
    }
  }).pipe(
    Effect.provide(Executions.live(ChatDatabase, options.dev === true ? { dev: true } : {})),
    Effect.provide(BranchSandboxes.live(ChatDatabase)),
    Effect.provide(BranchRooms.live),
    Effect.provide(
      Layer.mergeAll(
        HostModel.layerConfig("CHAT_MODEL", DEFAULT_CHAT_MODEL),
        Cloudflare.Hyperdrive.ConnectBinding,
        Cloudflare.RateLimitBinding,
        Cloudflare.Telemetry({ persist: true }),
      ),
    ),
  )

// ChatApi answers /api/* for the site Worker (worker/index.ts): questions, the Electric shape proxy, the model
// endpoint, the answer routes, sign-in, repositories, the git loop and the browser's telemetry
// (docs/features/chat.md, docs/features/model-endpoint.md, docs/features/agent.md, docs/features/sign-in.md,
// docs/features/repo.md, docs/features/issues.md), and hosts the remote flows' Durable Object
// (docs/features/remote-flows.md).
// Alchemy runs its handlers; nothing here runs an Effect itself. Until the GitHub App is configured, nobody is signed
// in, so asking, the model endpoint and the answer routes refuse every call.
export default class ChatApi extends Cloudflare.Worker<ChatApi>()("ChatApi", props, program()) {}
