import { Logger } from "@smthrs/observability"
import { EdgeCache, type ExecutionObject } from "@smthrs/platform-cloudflare"
import { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { Cause, Effect, Layer, Option, Predicate, Redacted } from "effect"
import { FetchHttpClient } from "effect/http"
import * as Database from "../db/Database.ts"
import * as AlertChannels from "./AlertChannels.ts"
import * as BranchSandboxes from "./BranchSandboxes.ts"
import { codeOf } from "./ErrorCode.ts"
import * as AgentSandbox from "./AgentSandbox.ts"
import * as ExecutionHost from "./ExecutionHost.ts"
import * as Flows from "./Flows.ts"
import * as Expire from "./flows/Expire.ts"
import * as TodoAgent from "./flows/TodoAgent.ts"
import * as Todo from "./flows/Todo.ts"
import * as SandboxKeep from "./flows/SandboxKeep.ts"
import { RecheckRole, recheckExecutionId } from "./flows/RecheckRole.ts"
import * as GitHubHost from "./github/Host.ts"
import * as ModelEndpoint from "./ModelEndpoint.ts"
import * as Placement from "./Placement.ts"
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

/** What `starter` reaches an execution's object through: the namespace, from ChatApi or from another execution. */
export interface Objects {
  readonly getByName: (executionId: string) => {
    readonly start: FlowExecutionShape["start"]
  }
}

/**
 * Where a request's or an alarm's code starts a remote flow (worker/Flows.ts): its own Durable Object, named by the
 * execution id, with the runtime of the request or alarm that builds it. The same intent again is a no-op; another
 * payload under the id is `StartConflict`; any other failure, the payload's encoding or the object's RPC, is
 * `StartUnavailable` with its code.
 */
export const starter = (objects: Objects) =>
  Effect.gen(function* () {
    const runtime = yield* RuntimeContext
    return Flows.FlowStarter.of({
      // The caller built `payload` as this flow's own schema types it; `Flow.Any` can't say so in its type.
      start: (flow, { executionId, payload }) =>
        ExecutionHost.intent(flow, { executionId, payload: payload as never }).pipe(
          Effect.flatMap((intent) => objects.getByName(executionId).start(intent)),
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

/**
 * The object's implementation over `connection`, the Hyperdrive config the engine reaches Postgres through. Its id is
 * the engine's host id, the same for every incarnation of the object, so a new incarnation takes over its run at once.
 * `dev` (`alchemy dev` only) lets an alert provider pointed at a local fake send without its key
 * (worker/AlertChannels.ts `channelsConfig`).
 */
export const live = <E, R>(
  connection: Effect.Effect<Cloudflare.Hyperdrive.Connection, E, R>,
  options: { readonly dev?: boolean; readonly spendAlerts?: boolean } = {},
) =>
  FlowExecution.make(
    Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState
      // This class's own namespace: the router reaches any other execution's object through it, creating each one where
      // the deployment places them (`FLOW_EXECUTION_LOCATION`, worker/Placement.ts).
      const executions = Placement.placed(
        (yield* Cloudflare.DurableObject) as Cloudflare.DurableObject<FlowExecutionShape>,
        yield* Placement.location.pipe(Effect.orDie),
      )
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
      // Each admitted call of a server seat starts its window's spend alert, as the endpoint's calls do: `spendAlerts`,
      // which only `alchemy dev` sets, to `false`, is `MODEL_SPEND_ALERTS`' default (docs/features/spend-alerts.md).
      const seats = yield* ModelEndpoint.local(
        appDatabase,
        options.spendAlerts === undefined ? {} : { alerts: options.spendAlerts },
      ).pipe(Effect.orDie)
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
        // Where a server seat's call starts its window's spend alert: this alarm's own runtime, on the alert's object.
        const flowStarter = starter(executions)
        // A person's write whose GitHub token is about to expire starts the session's `auth/RecheckRole` on its own
        // object, the one redeemer of the refresh token, with the execution's own runtime context. Triage and a head's
        // review judge with the `judge` role, admitted and metered as the endpoint's calls are.
        const githubServices = <GE, GR>(ready: GitHubHost.Ready<GE, GR>) =>
          Effect.gen(function* () {
            const runtime = yield* RuntimeContext
            const judge = seats("judge", yield* flowStarter)
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
              start: Todo.admission((flow, options) =>
                ExecutionHost.intent(flow, { executionId: options.executionId, payload: options.payload as never }).pipe(
                  Effect.flatMap((intent) => executions.getByName(options.executionId).start(intent)),
                  Effect.provideService(RuntimeContext, runtime),
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
                // The `todo` run's agent writes with the `coding` role, admitted and metered as the endpoint's calls are.
                Layer.unwrap(Effect.map(flowStarter, (started) =>
                  TodoAgent.registration(seats("coding", started), appDatabase, AgentSandbox.layer))),
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
