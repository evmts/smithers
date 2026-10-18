/** Private Node host boundary; the command surface lives in NodeControl.
 * @since 1.0.0
 */
import { NodeServices } from "@effect/platform-node";
import type * as Undici from "@effect/platform-node/Undici";
import * as NodeGateway from "@smthrs/gateway/node/NodeGateway";
import * as RequestExecutor from "@smthrs/model/RequestExecutor";
import * as EgressHttpClient from "@smthrs/platform-node/EgressHttpClient";
import { Effect, Layer, type Scope } from "effect";
import * as NativeControl from "./NativeControl.ts";
/**
 * Respect the supplied environment's egress proxy without changing unproxied Node hosts.
 *
 * The one definition lives in `@smthrs/platform-node`, so the dispatcher a
 * transport rebuilds and the client a judge dials through are built by the
 * same code. This name is the CLI's spelling of it.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const environmentDispatcher: typeof EgressHttpClient.dispatcher;
/**
 * The outbound HTTP client this process should use, given the environment it
 * runs in: Undici through the egress proxy the environment names, and the
 * plain Undici pool when it names none.
 *
 * Provide this, never `NodeHttpClient.layerUndici`, under any layer that takes
 * `HttpClient` from context. The bare client ignores `HTTP_PROXY`/`HTTPS_PROXY`
 * and dials every origin directly, which a default-deny sandbox drops.
 *
 * @category layers
 * @since 1.0.0
 */
export declare const layerEgressHttpClient: typeof EgressHttpClient.layer;
/**
 * A replaceable HTTP transport over Undici, given a way to acquire a dispatcher.
 *
 * `RequestExecutor` asks a host for two things: the client to use now, and an
 * effect that builds another. A retry ladder repairs a failure by
 * waiting and a destroyed HTTP/2 session is the failure waiting does not
 * repair. Undici's dispatcher *is* the connection pool, so on Node the
 * replacement is a new one.
 *
 * Each dispatcher is acquired in a scope forked off the caller's, and the
 * previous scope is closed the moment the next dispatcher is in hand, so a run
 * that rebuilds many times still holds exactly one pool and the caller's own
 * teardown closes the last of them. The *first* client is built by this same
 * code rather than taken from `NodeHttpClient.layerUndici`, so the client the
 * executor starts on and the client a rebuild produces are made the same way
 * and owned the same way.
 *
 * `acquire` is a parameter so a test can hand it a scripted dispatcher; the
 * production caller passes `environmentDispatcher(process.env)`.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const rebuildableTransport: typeof EgressHttpClient.rebuildableTransport;
/**
 * The model transport every Node host in this repository runs on: an Undici
 * agent the run may replace.
 *
 * It is one constructor rather than one per host because the repair it carries
 * is not specific to any of them. `smithers run` had it and a second host once
 * did not, and the difference was one line: that host bound
 * `RequestExecutor.layer` over `NodeHttpClient.layerUndici`, whose transport is
 * {@link RequestExecutor.fixed} and whose rebuild hands back the pool that just
 * failed. A server whose provider session the peer destroyed therefore failed
 * every later turn identically until somebody restarted it.
 *
 * `acquire` is the dispatcher the pool is built from, so a caller passes
 * {@link environmentDispatcher} over its own environment record and a test
 * passes a scripted dispatcher.
 *
 * @category layers
 * @since 1.0.0
 */
export declare const layerRebuildableRequestExecutor: (acquire: Effect.Effect<Undici.Dispatcher, never, Scope.Scope>) => Layer.Layer<RequestExecutor.RequestExecutor>;
/** Selects existing Node adapters for the shared native composition.
 * @since 1.0.0
 * @private
 */
export declare const platform: NativeControl.Platform;
/** Default CLI composition; private configured hosts reuse the same adapters.
 * @since 1.0.0
 * @private
 */
export declare const native: {
    evaluatorFor: (environment: Readonly<Record<string, string | undefined>>, supplied?: Layer.Layer<import("@smthrs/model/Evaluator").Evaluator>, startsRuns?: boolean) => Layer.Layer<import("@smthrs/model/Evaluator").Evaluator, never, never>;
    projectSources: (root: string) => ReadonlyArray<import("@smthrs/registry/Descriptor").Source>;
    layerHostPlatform: Layer.Layer<NodeServices.NodeServices, never, never>;
    layerGrantStore: (root: string) => Layer.Layer<import("@smthrs/kernel/GrantStore").GrantStore>;
    layerGuardedPlatform: (root: string, grants?: Layer.Layer<import("@smthrs/kernel/GrantStore").GrantStore>) => Layer.Layer<NodeServices.NodeServices, never, never>;
    layerObserver: (root: string, options?: import("@smthrs/agent/WorkspaceObservation").Options) => Layer.Layer<import("@smthrs/agent/WorkspaceObservation").Observer>;
    layerRegistry: (root: string) => Layer.Layer<import("@smthrs/registry/Registry").Registry>;
    gatewayApprovalAuthority: import("@smthrs/control/ApprovalAuthority").Service;
    databasePath: typeof import("./ControlDatabasePath.ts").databasePath;
    executionDatabasePath: typeof import("./ExecutionDatabasePath.ts").executionDatabasePath;
    materializeEngine: (engine: NativeControl.EngineDurable) => Effect.Effect<NativeControl.EngineDurable, never, Scope.Scope>;
    engineDurable: (root: string, registry?: Layer.Layer<import("@smthrs/registry/Registry").Registry> | undefined, authority?: Pick<import("../Application.ts").Config, "approvalAuthority" | "principal" | "credential" | "stateRoot" | "databases">) => NativeControl.EngineDurable;
    layerExecutor: (registry: Layer.Layer<import("@smthrs/registry/Registry").Registry>, engine: NativeControl.EngineDurable, root: string, options: NativeControl.ExecutorOptions) => ReturnType<(registry: Layer.Layer<import("@smthrs/registry/Registry").Registry>, engine: NativeControl.EngineDurable, root: string, options: NativeControl.ExecutorOptions, evaluator: Layer.Layer<import("@smthrs/model/Evaluator").Evaluator>) => Layer.Layer<import("@smthrs/control/ControlExecutor").ControlExecutor, never, import("@smthrs/control/ControlRuntime").ControlRuntime | import("@smthrs/journal/Journal").Journal | import("@smthrs/notifications/NotificationQueue").NotificationQueue | import("@smthrs/registry/Registry").Registry>>;
    layerControlFromEngine: (config: import("../Application.ts").Config & Pick<NativeControl.ExecutorOptions, "expectedSourceRevision" | "catalogRevision" | "approvalChannel" | "plansFlows">, registry: Layer.Layer<import("@smthrs/registry/Registry").Registry>, engine: NativeControl.EngineDurable, modules?: NativeControl.ModuleRegistration) => Layer.Layer<import("@smthrs/control/Control").Control, never, never>;
    layerControl: (config: import("../Application.ts").Config, suppliedRegistry?: Layer.Layer<import("@smthrs/registry/Registry").Registry>, suppliedEngine?: NativeControl.EngineDurable, modules?: NativeControl.ModuleRegistration) => Layer.Layer<import("@smthrs/control/Control").Control, never, never>;
    layerObserve: (config: import("../Application.ts").Config, registry: Layer.Layer<import("@smthrs/registry/Registry").Registry>) => Layer.Layer<import("@smthrs/control/Control").Control, never, never>;
    layerGateway: (health: import("@smthrs/gateway/GatewayServer").Health, options: NodeGateway.ServerOptions | undefined, root: string, engine?: NativeControl.EngineDurable, journal?: Layer.Layer<import("@smthrs/journal/Journal").Journal>) => Layer.Layer<import("effect/http/HttpServer").HttpServer, import("@smthrs/gateway/GatewayError").GatewayError | import("@smthrs/sync/SyncError").SyncError, import("@smthrs/control/Control").Control>;
    layerGatewayHost: (engine: NativeControl.EngineDurable, control: Layer.Layer<import("@smthrs/control/Control").Control>) => Layer.Layer<import("../Serve.ts").GatewayHost, never, never>;
    layerMemory: (root: string, engine?: NativeControl.EngineDurable) => Layer.Layer<import("@smthrs/memory/MemoryStore").MemoryStore, never, never>;
    layerHost: (config: import("../Application.ts").Config & Pick<NativeControl.ExecutorOptions, "expectedSourceRevision" | "catalogRevision" | "approvalChannel">, modules?: NativeControl.ModuleRegistration, suppliedRegistry?: Layer.Layer<import("@smthrs/registry/Registry").Registry>) => Layer.Layer<import("@smthrs/control/Control").Control | import("../Serve.ts").GatewayHost | import("@smthrs/memory/MemoryStore").MemoryStore | NodeServices.NodeServices, never, never>;
};
