import { Logger } from "@smthrs/observability"
import type { ExecutionObject } from "@smthrs/platform-cloudflare"
import type { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { Effect, Layer, Option, Redacted } from "effect"
import { FetchHttpClient } from "effect/http"
import * as Database from "../db/Database.ts"
import * as ExecutionHost from "./ExecutionHost.ts"
import * as Expire from "./flows/Expire.ts"
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
        const base = Option.isSome(signIn)
          ? ExecutionHost.remoteWithSignIn(app, signIn.value)
          : ExecutionHost.remote(app)
        const host = Option.isSome(repoClone)
          ? hostFor(ExecutionHost.withRepoClone(base, repoClone.value))
          : hostFor(base)
        return {
          start: (intent: ExecutionObject.Intent) => host.start(intent).pipe(Effect.provide(logs)),
          wake: () => host.wake().pipe(Effect.provide(logs)),
          alarm: () => host.alarm().pipe(Effect.asVoid, Effect.provide(logs)),
        }
      })
    }),
  )
