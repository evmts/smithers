/**
 * The durable engine's composition in a dedicated Web Worker: everything
 * `BrowserRuntime` loads only when a worker builds an engine, so a tab that
 * imports this package from its root never loads the engine.
 *
 * @since 1.0.0
 */

import { WebCrypto } from "@smthrs/crypto"
import { OwnerIdentity, RunCatalogRead, StepBoundary, WorkspaceSandbox } from "@smthrs/engine-store"
import { type Flow, type FlowRuntime, RetryPolicy } from "@smthrs/flow"
import { Runtime } from "@smthrs/flows"
import * as Jj from "@smthrs/jj"
import { Ownership } from "@smthrs/run-store"
import type * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import type { HttpClient } from "effect/http/HttpClient"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import * as BrowserSqlite from "../BrowserSqlite.ts"
import { filename } from "../SharedSqlite.ts"
import type * as TabChannel from "../TabChannel.ts"
import type * as WebLock from "../WebLock.ts"
import * as HttpClientLayer from "./HttpClient.ts"
import * as Leader from "./Leader.ts"
import * as Protocol from "./Protocol.ts"
import * as SqlConnection from "./SqlConnection.ts"

/**
 * What names one engine.
 *
 * @category models
 * @since 1.0.0
 */
export interface Options {
  readonly name: string
}

/**
 * What {@link layerHost} adds: the SQLite build the stores open.
 *
 * @category models
 * @since 1.0.0
 */
export interface HostOptions extends Options {
  readonly sqlite: BrowserSqlite.Build
}

/**
 * The services the engine host gives every registered flow.
 *
 * @category models
 * @since 1.0.0
 */
export type Host = Crypto.Crypto | OwnerIdentity.OwnerIdentity | Path.Path | HttpClient | Jj.Jj

/** The browser engine host. */
const engineHost: Layer.Layer<Host> = Layer.mergeAll(
  OwnerIdentity.layerWithoutPid,
  Path.layer,
  HttpClientLayer.layer,
  Jj.layerNoop({})
).pipe(Layer.provideMerge(WebCrypto.layer))

/**
 * The durable engine and the run catalog over the `SqlClient` the caller
 * provides; see `BrowserRuntime.layer`.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer = <Registered, RegistrationError, RegistrationRequirements>(
  options: Options,
  registerFlows: Layer.Layer<Registered, RegistrationError, RegistrationRequirements>
) =>
  Runtime.layer(
    { owner: { hostId: options.name }, isAlive: Ownership.singleIncarnationLiveness },
    StepBoundary.layerUnsupported,
    WorkspaceSandbox.layerUnsupported,
    registerFlows
  ).pipe(Layer.provideMerge(RunCatalogRead.layer), Layer.provideMerge(engineHost))

/**
 * {@link layer} over SQLite in OPFS, with the app's shared database beside
 * it; see `BrowserRuntime.layerHost`.
 *
 * @category layers
 * @since 1.0.0
 */
export const layerHost = <Registered, RegistrationError, RegistrationRequirements>(
  options: HostOptions,
  registerFlows: Layer.Layer<Registered, RegistrationError, RegistrationRequirements>
) =>
  Layer.merge(
    layer(options, registerFlows).pipe(Layer.provide(BrowserSqlite.layer({ filename: "engine.db" }))),
    SqlConnection.layer({ filename })
  ).pipe(
    Layer.provide(BrowserSqlite.layerSqlite({ build: options.sqlite, directory: `smithers/${options.name}` }))
  )

/**
 * What a worker's engine runs; see `BrowserRuntime.run`.
 *
 * @category models
 * @since 1.0.0
 */
export interface RunOptions<Registered, RegistrationError, RegistrationRequirements> extends HostOptions {
  readonly flows: ReadonlyArray<Flow.Any>
  readonly registerFlows: Layer.Layer<Registered, RegistrationError, RegistrationRequirements>
}

/**
 * The worker's program: `Leader.serve` over {@link layerHost}, logging how it
 * stopped by the failure's tag.
 *
 * @category running
 * @since 1.0.0
 */
export const program = <Registered, RegistrationError, RegistrationRequirements extends FlowRuntime.FlowRuntime | Host>(
  options: RunOptions<Registered, RegistrationError, RegistrationRequirements>
): Effect.Effect<never, unknown, WebLock.WebLock | TabChannel.TabChannel> =>
  // Every service `RegistrationRequirements` may name is one the engine host
  // provides, which the generic `Exclude` chain cannot show.
  (Leader.serve(options, layerHost(options, options.registerFlows)) as Effect.Effect<
    never,
    unknown,
    WebLock.WebLock | TabChannel.TabChannel
  >).pipe(
    Effect.tapCause((cause) =>
      Effect.logError("browser.runtime.stopped").pipe(
        Effect.annotateLogs({ "error.type": RetryPolicy.failureType(cause) }),
        // A failure only: interrupting the worker's fiber, as its tab closing
        // does, never reaches here.
        Effect.andThen(tellTab(RetryPolicy.failureType(cause)))
      )
    )
  )

/**
 * Tells the tab that started this dedicated worker that its engine stopped,
 * so the tab fails its requests instead of waiting for a leader. Outside a
 * worker, as in a test that runs the entry on the main thread, there is no
 * such tab.
 */
const tellTab = (error: string) =>
  Effect.sync(() => {
    if (typeof (globalThis as { readonly WorkerGlobalScope?: unknown }).WorkerGlobalScope !== "function") return
    ;(globalThis as unknown as { postMessage(message: unknown): void }).postMessage(
      Schema.encodeSync(Protocol.Stopped)({ _tag: "@smthrs/platform-browser/EngineStopped", error })
    )
  })
