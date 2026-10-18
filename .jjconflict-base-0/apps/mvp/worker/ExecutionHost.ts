import * as Pg from "@effect/sql-pg"
import { PostgresDatabase } from "@smthrs/database"
import type { Flow, FlowRuntime } from "@smthrs/flow"
import { CloudflareRuntime, ExecutionObject } from "@smthrs/platform-cloudflare"
import { Effect, Layer } from "effect"
import type { SqlClient } from "effect/sql"
import * as Expire from "./flows/Expire.ts"
import * as Pause from "./flows/Pause.ts"
import * as RecheckRole from "./flows/RecheckRole.ts"
import * as RepoClone from "./flows/RepoClone.ts"
import * as RevokeGitHubToken from "./flows/RevokeGitHubToken.ts"

// What a remote flow execution runs on Cloudflare (docs/features/remote-flows.md): `@smthrs/platform-cloudflare`'s
// per-execution Durable Object functions over the engine's Postgres schema. worker/Executions.ts hands it the Durable
// Object's storage and id under Alchemy; the workerd test hands it a plain Durable Object's. The flows themselves
// (worker/flows/) never see Cloudflare.

/** The Postgres schema the flow engine keeps its journal, runs and timers in, beside the app's tables. */
export const ENGINE_SCHEMA = "smithers_flows"

/**
 * The flows a remote execution may run, and the registration that implements their steps. The registration may need
 * the engine's `FlowRuntime`, which the runtime provides.
 */
export interface Flows<ROut, E, R> {
  readonly flows: ReadonlyArray<Flow.Any>
  readonly registration: Layer.Layer<ROut, E, R | FlowRuntime.FlowRuntime>
}

/**
 * The deployed remote flows: `probe/Pause`, whose steps log, and `chat/Expire` over `app`: the app's own tables (not
 * the engine's schema) and how old a streaming answer gets before it settles (docs/features/agent.md#settling).
 */
export const remote = <E, R>(app: Expire.Services<E, R>) => ({
  flows: [Pause.Pause, Expire.Expire],
  registration: Layer.merge(Pause.registration(Pause.logged), Expire.registration(app)),
})

/**
 * The deployed remote flows when sign-in is configured: `remote`, plus `auth/RecheckRole` and
 * `auth/RevokeGitHubToken` over the app's tables and sign-in's services (docs/features/sign-in.md#role-checks,
 * #signing-out).
 */
export const remoteWithSignIn = <E, R>(app: Expire.Services<E, R>, services: RecheckRole.Services) => {
  const base = remote(app)
  return {
    flows: [...base.flows, RecheckRole.RecheckRole, RevokeGitHubToken.RevokeGitHubToken],
    registration: Layer.mergeAll(
      base.registration,
      RecheckRole.registration(app.database, services),
      RevokeGitHubToken.registration(app.database, services),
    ),
  }
}

/**
 * `flows`, plus `repo/Clone` over `services` (the app's tables, Code Storage and GitHub) when this deployment has a
 * Code Storage organization (docs/features/repo.md#the-clone).
 */
export const withRepoClone = <ROut, E, R, CE, CR>(flows: Flows<ROut, E, R>, services: RepoClone.Services<CE, CR>) => ({
  flows: [...flows.flows, RepoClone.Clone],
  registration: Layer.merge(flows.registration, RepoClone.registration(services)),
})

/**
 * The slice of a Durable Object's storage the handlers use; `R` is what its methods require (Alchemy's
 * `RuntimeContext`, or nothing for a plain object's).
 */
export type Storage<R = never> = ExecutionObject.Storage<R>

/**
 * What a caller hands `start`: the flow by tag, the execution id (which also names the Durable Object) and the
 * payload, encoded with the flow's own codec (`ExecutionObject.intent`).
 */
export const intent = ExecutionObject.intent

/**
 * Records `intent` on one execution's Durable Object `storage` and wakes it at once (`ExecutionObject.start`): the
 * same intent again changes nothing, and another under the same execution id fails with `IntentConflict`.
 */
export const recordStart = <RS>(storage: ExecutionObject.Storage<RS>, intent: ExecutionObject.Intent) =>
  ExecutionObject.start(storage, intent, Effect.void)

/**
 * The engine's `SqlClient` on the Postgres at `url`, in `schema` (`ENGINE_SCHEMA` when deployed). Every statement
 * sets the schema inside its own transaction, so it holds behind Hyperdrive's transaction pooling.
 */
export const database = (url: string, schema: string): Layer.Layer<SqlClient.SqlClient> =>
  PostgresDatabase.layer({ url, driver: Pg, schema })

/**
 * The handlers of one execution's Durable Object over its `storage`:
 * - `start` records the intent and wakes the object at once (`ExecutionObject.start`); the same intent again is a
 *   no-op, and a different one fails with `IntentConflict`.
 * - `wake` moves the alarm to now when the object holds an intent (`ExecutionObject.wake`); another object's alarm
 *   calls it through its router when this execution became due.
 * - `alarm` builds the engine for that one execution, as `hostId`, over `database`, drives it until it settles or
 *   parks, hands the executions it left for other objects to `router`, then arms the next wake
 *   (`ExecutionObject.alarm`). It never fails: a failure re-arms the alarm with backoff.
 *
 * `database` is a layer, so each alarm opens its own connection and closes it when the alarm ends. `router` reaches
 * other objects of the same class by execution id.
 */
export const make = <RS, RD, ROut, E, R, RE, RR>(
  storage: ExecutionObject.Storage<RS>,
  options: {
    readonly hostId: string
    readonly database: Layer.Layer<SqlClient.SqlClient, never, RD>
    readonly flows: Flows<ROut, E, R>
    readonly router: ExecutionObject.Router<RE, RR>
  },
) => {
  const { flows, registration } = options.flows
  return {
    start: (intent: ExecutionObject.Intent) => recordStart(storage, intent),
    wake: () => ExecutionObject.wake(storage),
    alarm: () =>
      ExecutionObject.alarm(storage, {
        flows,
        runtime: (intent) =>
          CloudflareRuntime.layer({ hostId: options.hostId, executionId: intent.executionId }, registration).pipe(
            Layer.provide(options.database),
          ),
        router: options.router,
      }),
  }
}
