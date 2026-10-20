import { Logger } from "@smthrs/observability"
import type { ExecutionObject } from "@smthrs/platform-cloudflare"
import { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { Cause, Effect, Layer, Option, Redacted } from "effect"
import { FetchHttpClient } from "effect/http"
import * as Database from "../db/Database.ts"
import * as BranchSandboxes from "./BranchSandboxes.ts"
import { codeOf } from "./ErrorCode.ts"
import * as ExecutionHost from "./ExecutionHost.ts"
import * as Expire from "./flows/Expire.ts"
import { RecheckRole, recheckExecutionId } from "./flows/RecheckRole.ts"
import * as GitHubHost from "./github/Host.ts"
import * as RepoConfig from "./RepoConfig.ts"
import * as SignIn from "./SignIn.ts"

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
 */
export const live = <E, R>(connection: Effect.Effect<Cloudflare.Hyperdrive.Connection, E, R>) =>
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
      const repoClone = yield* RepoConfig.cloneServices(appDatabase).pipe(Effect.provide(FetchHttpClient.layer), Effect.orDie)
      // The git loop's flows (`github/Apply`, `github/Reconcile`, `github/Write`) run here when the GitHub App is
      // configured (docs/features/issues.md#remote-flows).
      const github = yield* GitHubHost.ready(appDatabase).pipe(Effect.provide(FetchHttpClient.layer), Effect.orDie)
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
        const base = ExecutionHost.withTerminals(
          Option.isSome(signIn) ? ExecutionHost.remoteWithSignIn(app, signIn.value) : ExecutionHost.remote(app),
          appDatabase,
          BranchSandboxes.sandboxesLayer(sandboxObjects),
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
            })
          })
        const withGitHub = <ROut, FE, FR>(flows: ExecutionHost.Flows<ROut, FE, FR>) =>
          Option.isSome(github)
            ? hostFor(ExecutionHost.withGitHub(flows, githubServices(github.value)))
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
