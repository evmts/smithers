import { Logger } from "@smthrs/observability"
import { EdgeCache, type ExecutionObject } from "@smthrs/platform-cloudflare"
import { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import type { Flow } from "@smthrs/flow"
import { Cause, Effect, Layer, Option, Redacted } from "effect"
import { FetchHttpClient } from "effect/http"
import * as Database from "../db/Database.ts"
import * as AlertChannels from "./AlertChannels.ts"
import * as BranchSandboxes from "./BranchSandboxes.ts"
import { codeOf } from "./ErrorCode.ts"
import * as AgentSandbox from "./AgentSandbox.ts"
import * as ExecutionHost from "./ExecutionHost.ts"
import * as Expire from "./flows/Expire.ts"
import * as TodoAgent from "./flows/TodoAgent.ts"
import * as SandboxKeep from "./flows/SandboxKeep.ts"
import { RecheckRole, recheckExecutionId } from "./flows/RecheckRole.ts"
import * as GitHubHost from "./github/Host.ts"
import * as ModelEndpoint from "./ModelEndpoint.ts"
import * as RepoConfig from "./RepoConfig.ts"
import * as SignIn from "./SignIn.ts"
import { keepExecutionId } from "../src/features/sandbox/contract.ts"

// The Durable Object that runs remote flows on Cloudflare (docs/features/remote-flows.md): one object per execution,
// named by its execution id, hosted by ChatApi. Alchemy runs its handlers; they delegate to worker/ExecutionHost.ts,
// which the workerd test drives the same way.

/**
 * What a caller sees: `start` records an intent and wakes the object; `wake` makes its execution due again, for
 * another object whose drive left it due; `alarm` is Cloudflare's wake-up.
 */
export interface FlowExecutionShape {
  readonly start: (
    intent: ExecutionObject.Intent,
  ) => Effect.Effect<void, ExecutionObject.IntentConflict, RuntimeContext>
  readonly wake: () => Effect.Effect<boolean, never, RuntimeContext>
  readonly alarm: () => Effect.Effect<void, never, RuntimeContext>
}

/** The `FlowExecution` Durable Object namespace. A caller reaches one execution with `getByName(executionId)`. */
export class FlowExecution extends Cloudflare.DurableObject<FlowExecution, FlowExecutionShape>()("FlowExecution") {}

/**
 * The object's implementation over `connection`, the Hyperdrive config the engine reaches Postgres through. Its id is
 * the engine's host id, the same for every incarnation of the object, so a new incarnation takes over its run at once.
 * `dev` (`alchemy dev` only) lets an alert provider pointed at a local fake send without its key
 * (worker/AlertChannels.ts `channelsConfig`).
 */
export const live = <E, R>(
  connection: Effect.Effect<Cloudflare.Hyperdrive.Connection, E, R>,
  options: { readonly dev?: boolean } = {},
) =>
  FlowExecution.make(
    Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState
      // This class's own namespace: the router reaches any other execution's object through it.
      const executions = (yield* Cloudflare.DurableObject) as Cloudflare.DurableObject<FlowExecutionShape>
      const hyperdrive = yield* Cloudflare.Hyperdrive.Connect(connection)
      const database = Layer.unwrap(
        Effect.map(
          hyperdrive.connectionString,
          (url) => ExecutionHost.database(Redacted.value(url), ExecutionHost.ENGINE_SCHEMA),
        ),
      )
      // Sign-in's role checks (`auth/RecheckRole`) run here too when sign-in is configured. They write the app's own
      // tables, so they reach Postgres through the app's client, not the engine's schema.
      const signIn = yield* SignIn.configured().pipe(Effect.provide(FetchHttpClient.layer), Effect.orDie)
      const appDatabase = Database.layer(hyperdrive.connectionString)
      // `chat/Expire` settles answers their devices left streaming (docs/features/agent.md#settling).
      const app = { database: appDatabase, expiry: yield* Expire.expiry.pipe(Effect.orDie) }
      // `repo/Clone` runs here when this deployment has a Code Storage organization (docs/features/repo.md#the-clone).
      // Its Index reads the file list into the same immutable cache RepoApi reads from.
      const repoClone = yield* RepoConfig.cloneServices(appDatabase, EdgeCache.layer({ name: "repo" }).pipe(Layer.orDie)).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.orDie,
      )
      // The git loop's flows (`github/Apply`, `github/Reconcile`, `github/Write`, `triage/Run`) run here when the GitHub
      // App is configured (docs/features/issues.md#remote-flows). Triage decides with the `judge` model role, admitted
      // and metered in process as the model endpoint's calls are (docs/features/issues.md#triage).
      const github = yield* GitHubHost.ready(appDatabase).pipe(Effect.provide(FetchHttpClient.layer), Effect.orDie)
      const seats = yield* ModelEndpoint.local(appDatabase).pipe(Effect.orDie)
      const judge = seats("judge")
      // The `todo` run's agent writes with the `agent` role, admitted and metered as the endpoint's calls are.
      const agent = seats("agent")
      // `ops/SpendAlert` sends by email and Telegram through the deployment's providers, from its secrets
      // (docs/features/spend-alerts.md#channels).
      const alertChannels = yield* AlertChannels.channelsConfig(options).pipe(Effect.orDie)
      // `terminal/Open` wakes a branch's machine, its `SandboxObject` (docs/features/branch-workspace.md#opening-a-terminal).
      const sandboxObjects = (yield* BranchSandboxes.SandboxObject) as Cloudflare.DurableObject<
        BranchSandboxes.SandboxObjectShape
      >
      // Workers Logs keeps every JSON line, as it does ChatApi's.
      const logs = Logger.layerStructuredJson()
      // The object's id exists only at runtime: Alchemy evaluates this outer effect at plan time with a stand-in state.
      return Effect.sync(() => {
        const hostFor = <ROut, FE, FR>(flows: ExecutionHost.Flows<ROut, FE, FR>) =>
          ExecutionHost.make(state.storage, {
            hostId: state.id.toString(),
            database,
            flows,
            router: {
              start: (intent) => executions.getByName(intent.executionId).start(intent),
              wake: (executionId) => Effect.asVoid(executions.getByName(executionId).wake()),
            },
          })
        // Each wake of a branch's machine starts that generation's `sandbox/Keep` on its own object, once
        // (docs/features/sandbox-tools.md#sleep-and-wake).
        const keep: BranchSandboxes.Keep = (branchId, generation) => {
          const executionId = keepExecutionId(branchId, generation)
          return ExecutionHost.intent(SandboxKeep.Keep, { executionId, payload: { branchId, generation } }).pipe(
            Effect.flatMap((intent) => executions.getByName(executionId).start(intent)),
            Effect.catchCause((cause) =>
              Effect.logWarning("sandbox.keep.start").pipe(
                Effect.annotateLogs({ branchId, generation, errorCode: codeOf(Cause.squash(cause)) }),
              )
            ),
          )
        }
        // `secret/Put` and `secret/Delete` write an Admin's sealed secrets (docs/features/secrets.md#writing). The
        // sandbox tools run on the branches' machines (docs/features/sandbox-tools.md).
        const base = ExecutionHost.withSecrets(
          ExecutionHost.withSandboxTools(
            ExecutionHost.withTerminals(
              Option.isSome(signIn)
                ? ExecutionHost.remoteWithSignIn(app, signIn.value, alertChannels)
                : ExecutionHost.remote(app, alertChannels),
              appDatabase,
              BranchSandboxes.sandboxesLayer(sandboxObjects, keep),
            ),
            appDatabase,
            BranchSandboxes.machinesLayer(sandboxObjects, keep),
          ),
          appDatabase,
        )
        // A person's write whose GitHub token is about to expire starts the session's `auth/RecheckRole` on its own
        // object, the one redeemer of the refresh token, with the execution's own runtime context.
        const githubServices = <GE, GR>(ready: GitHubHost.Ready<GE, GR>) =>
          Effect.gen(function* () {
            const runtime = yield* RuntimeContext
            return GitHubHost.services(ready, {
              keys: Option.map(signIn, (configured) => configured.keys),
              refresh: (sessionId, generation) => {
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
            }, judge)
          })
        // The coding factory's `todo` run and a head's checks (docs/features/todos.md#the-run) need the App: they make
        // branches, commits and pull requests. They start what they start (the next TODO's run, a head's checks) on
        // their own objects, and the agent writes on the branches' machines.
        const machines = BranchSandboxes.machinesLayer(sandboxObjects, keep)
        const todoServices = <GE, GR>(ready: GitHubHost.Ready<GE, GR>) =>
          Effect.gen(function* () {
            const runtime = yield* RuntimeContext
            const built = yield* githubServices(ready)
            return {
              ...built,
              start: (flow: Flow.Any, options: { readonly executionId: string; readonly payload: unknown }) =>
                ExecutionHost.intent(flow, { executionId: options.executionId, payload: options.payload as never }).pipe(
                  Effect.flatMap((intent) => executions.getByName(options.executionId).start(intent)),
                  Effect.provideService(RuntimeContext, runtime),
                  Effect.catchCause((cause) =>
                    Effect.logWarning("todo.start").pipe(
                      Effect.annotateLogs({ flow: flow._tag, outcome: "not_started", errorCode: codeOf(Cause.squash(cause)) }),
                    )
                  ),
                ),
            }
          })
        const withGitHub = <ROut, FE, FR>(flows: ExecutionHost.Flows<ROut, FE, FR>) =>
          Option.isSome(github)
            ? hostFor(
              ExecutionHost.withTodos(
                ExecutionHost.withGitHub(flows, githubServices(github.value)),
                todoServices(github.value),
                machines,
                TodoAgent.registration(agent, appDatabase, AgentSandbox.layer),
              ),
            )
            : hostFor(flows)
        const host = Option.isSome(repoClone)
          ? withGitHub(ExecutionHost.withRepoClone(base, repoClone.value))
          : withGitHub(base)
        return {
          start: (intent: ExecutionObject.Intent) => host.start(intent).pipe(Effect.provide(logs)),
          wake: () => host.wake().pipe(Effect.provide(logs)),
          alarm: () => host.alarm().pipe(Effect.asVoid, Effect.provide(logs)),
        }
      })
    }),
  )
