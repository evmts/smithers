/**
 * The durable flow engine in a dedicated Web Worker.
 *
 * - {@link layer} composes `@smthrs/flows`' `Runtime.layer` over an injected
 *   `SqlClient` and the browser engine host.
 * - {@link layerHost} opens that `SqlClient` on SQLite in OPFS, with the
 *   app's shared database (`SharedSqlite`) beside it.
 * - {@link serve} elects one leader per origin with a Web Lock, wakes the
 *   runs that are due, answers the tabs' requests over a `BroadcastChannel`,
 *   and runs the tabs' statements on the shared database.
 * - {@link run} is the worker entry: {@link serve} over {@link layerHost}.
 *
 * This module loads the engine itself only when one of these runs: each
 * imports the engine's modules lazily. A tab that imports the package's root
 * for `BrowserEngine` or `SharedSqlite` loads none of them, and an app's
 * production build of its tab bundle carries no engine and no wasm.
 *
 * @since 1.0.0
 */

import type { Flow, FlowRuntime } from "@smthrs/flow"
import * as Effect from "effect/Effect"
import type * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import type * as BrowserSqlite from "./BrowserSqlite.ts"
import type * as Engine from "./internal/Engine.ts"
import type * as Leader from "./internal/Leader.ts"
import * as Metrics from "./internal/Metrics.ts"
import * as TabChannel from "./TabChannel.ts"
import * as WebLock from "./WebLock.ts"

/** The engine's composition, imported when a worker first builds an engine. */
const engine = Effect.promise(() => import("./internal/Engine.ts"))

/**
 * What names one engine.
 *
 * @category models
 * @since 1.0.0
 */
export interface Options {
  /**
   * The engine's name, such as `"smithers"`: its host id in the store, the
   * Web Lock its leader holds and the channels its tabs use. Every tab of
   * one app passes the same name.
   */
  readonly name: string
}

/**
 * What {@link layerHost} adds: the SQLite build the stores open.
 *
 * @category models
 * @since 1.0.0
 */
export interface HostOptions extends Options {
  /**
   * The synchronous wa-sqlite build, as lazy imports: loaded only once this
   * worker leads. See `BrowserSqlite.Build`.
   */
  readonly sqlite: BrowserSqlite.Build
}

/**
 * The services the engine host gives every registered flow: WebCrypto,
 * the owner identity, POSIX paths, the fetch client, and a `Jj` that
 * refuses, because a worker holds no repository.
 *
 * @category models
 * @since 1.0.0
 */
export type Host = Engine.Host

/**
 * Provides the durable engine, with `registerFlows` registered, and the run
 * catalog over the `SqlClient` the caller provides. The engine sweeps its own
 * store while it lives, so due timers fire and stalled runs are reclaimed.
 *
 * Only the worker that holds the engine's Web Lock builds an engine, so the
 * liveness check is `Ownership.singleIncarnationLiveness`: an owner recorded
 * under the same name by another incarnation ran in a worker that lost the
 * lock, and the engine takes its runs at once instead of waiting out the lease.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer = <Registered, RegistrationError, RegistrationRequirements>(
  options: Options,
  registerFlows: Layer.Layer<Registered, RegistrationError, RegistrationRequirements>
): ReturnType<typeof Engine.layer<Registered, RegistrationError, RegistrationRequirements>> =>
  Layer.unwrap(Effect.map(engine, (module) => module.layer(options, registerFlows)))

/**
 * Provides {@link layer} over SQLite in OPFS: the database `engine.db` on
 * `BrowserSqlite.layerSqlite`'s pool in the directory `smithers/<name>`, and
 * the app's shared database, `SharedSqlite.filename`, on a connection of its
 * own in the same pool. Build it in a dedicated worker. An app that opens one
 * VFS for every store in the worker provides {@link layer} with
 * `BrowserSqlite.layer({ filename })` over its own `BrowserSqlite.Sqlite`
 * instead.
 *
 * @category layers
 * @since 1.0.0
 */
export const layerHost = <Registered, RegistrationError, RegistrationRequirements>(
  options: HostOptions,
  registerFlows: Layer.Layer<Registered, RegistrationError, RegistrationRequirements>
): ReturnType<typeof Engine.layerHost<Registered, RegistrationError, RegistrationRequirements>> =>
  Layer.unwrap(Effect.map(engine, (module) => module.layerHost(options, registerFlows)))

/**
 * The services the leader reads from the engine it builds.
 *
 * @category models
 * @since 1.0.0
 */
export type Services = Leader.Services

/**
 * What {@link serve} runs.
 *
 * @category models
 * @since 1.0.0
 */
export type ServeOptions = Leader.Options

/**
 * Runs the leader over `engine`: waits for the engine's Web Lock, builds the
 * engine, drives every unfinished run, announces itself on the engine's
 * channel, and answers followers until the worker ends. When `engine` also
 * provides the app's shared database, as {@link layerHost} does, it runs the
 * tabs' statements on it; otherwise it refuses them. A lock another context
 * steals ends the leadership, and the worker waits for the lock again.
 * Requires the {@link WebLock} and {@link TabChannel} services, so a test
 * provides faulty ones.
 *
 * @category running
 * @since 1.0.0
 */
export const serve = <E, R>(
  options: ServeOptions,
  engine: Layer.Layer<Services, E, R>
): Effect.Effect<never, E, R | WebLock.WebLock | TabChannel.TabChannel> =>
  Effect.flatMap(Effect.promise(() => import("./internal/Leader.ts")), (leader) => leader.serve(options, engine))

/**
 * Times a worker became leader.
 *
 * @category metrics
 * @since 1.0.0
 */
export const leaderships = Metrics.leaderships

/**
 * Unfinished runs a new leader drove, by `outcome`.
 *
 * @category metrics
 * @since 1.0.0
 */
export const wakes = Metrics.wakes

/**
 * Follower requests the leader handled, by `request` and `outcome`.
 *
 * @category metrics
 * @since 1.0.0
 */
export const requests = Metrics.requests

/**
 * Statements the leader ran on the app's shared database, by `outcome`
 * (`executed`, `failed`, `lost`), and tabs' transactions it rolled back when
 * the tab ended (`abandoned`).
 *
 * @category metrics
 * @since 1.0.0
 */
export const statements = Metrics.statements

/**
 * What a worker's engine runs: the engine's name, the SQLite build, every
 * flow followers may start, the layer that registers their implementations,
 * and optionally where the worker's logs, spans and metrics go.
 *
 * @category models
 * @since 1.0.0
 */
export interface RunOptions<Registered, RegistrationError, RegistrationRequirements> extends HostOptions {
  readonly flows: ReadonlyArray<Flow.Any>
  readonly registerFlows: Layer.Layer<Registered, RegistrationError, RegistrationRequirements>
  /**
   * Where the worker's own records go, such as `Otlp.layerFetch` from
   * `@smthrs/observability`: provided to the whole program, so the leader's,
   * the engine's and every flow's logs, spans and metrics reach it. Omitted,
   * they stay in the worker. A layer that fails to build ends the worker, as
   * an engine that cannot be built does.
   */
  readonly telemetry?: Layer.Layer<never, unknown> | undefined
}

/**
 * The worker entry: call it once at the top of the module a tab starts as
 * its engine worker. It runs {@link serve} over {@link layerHost} with the
 * browser's own Web Locks and `BroadcastChannel`, until the worker ends, with
 * `telemetry`, when given, as where its records go.
 *
 * ```ts
 * import wasmUrl from "@journeyapps/wa-sqlite/dist/wa-sqlite.wasm?url"
 *
 * BrowserRuntime.run({
 *   name: "smithers",
 *   sqlite: {
 *     module: () => import("@journeyapps/wa-sqlite/dist/wa-sqlite.mjs"),
 *     wasm: () => fetch(wasmUrl).then((response) => response.arrayBuffer())
 *   },
 *   flows,
 *   registerFlows,
 *   telemetry: Otlp.layerFetch({ baseUrl: `${self.location.origin}/api/telemetry`, serviceName: "engine" })
 * })
 * ```
 *
 * @category running
 * @since 1.0.0
 */
export const run = <Registered, RegistrationError, RegistrationRequirements extends FlowRuntime.FlowRuntime | Host>(
  options: RunOptions<Registered, RegistrationError, RegistrationRequirements>
): Fiber.Fiber<never, unknown> =>
  Effect.runFork(
    Effect.flatMap(engine, (module) => module.program(options)).pipe(
      Effect.provide(Layer.mergeAll(WebLock.layer, TabChannel.layer, options.telemetry ?? Layer.empty))
    )
  )
