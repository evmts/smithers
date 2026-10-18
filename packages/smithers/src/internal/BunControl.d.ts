/** Private Bun boundary for the shared native control host; no Node sidecar.
 * @since 1.0.0
 */
import { Layer } from "effect";
import * as NativeControl from "./NativeControl.ts";
/** Select existing Bun adapters for the single native control composition.
 * @since 1.0.0
 * @private
 */
export declare const platform: NativeControl.Platform;
/** Default Bun composition; private configured hosts reuse the same adapters.
 * @since 1.0.0
 * @private
 */
export declare const native: {
    evaluatorFor: (environment: Readonly<Record<string, string | undefined>>, supplied?: Layer.Layer<import("@smthrs/model/Evaluator").Evaluator>, startsRuns?: boolean) => Layer.Layer<import("@smthrs/model/Evaluator").Evaluator, never, never>;
    projectSources: (root: string) => ReadonlyArray<import("@smthrs/registry/Descriptor").Source>;
    layerHostPlatform: Layer.Layer<import("@effect/platform-node/NodeServices").NodeServices, never, never>;
    layerGrantStore: (root: string) => Layer.Layer<import("@smthrs/kernel/GrantStore").GrantStore>;
    layerGuardedPlatform: (root: string, grants?: Layer.Layer<import("@smthrs/kernel/GrantStore").GrantStore>) => Layer.Layer<import("@effect/platform-node/NodeServices").NodeServices, never, never>;
    layerObserver: (root: string, options?: import("@smthrs/agent/WorkspaceObservation").Options) => Layer.Layer<import("@smthrs/agent/WorkspaceObservation").Observer>;
    layerRegistry: (root: string) => Layer.Layer<import("@smthrs/registry/Registry").Registry>;
    gatewayApprovalAuthority: import("@smthrs/control/ApprovalAuthority").Service;
    databasePath: typeof import("./ControlDatabasePath.ts").databasePath;
    executionDatabasePath: typeof import("./ExecutionDatabasePath.ts").executionDatabasePath;
    materializeEngine: (engine: NativeControl.EngineDurable) => import("effect/Effect").Effect<NativeControl.EngineDurable, never, import("effect/Scope").Scope>;
    engineDurable: (root: string, registry?: Layer.Layer<import("@smthrs/registry/Registry").Registry> | undefined, authority?: Pick<import("../Application.ts").Config, "approvalAuthority" | "principal" | "credential" | "stateRoot" | "databases">) => NativeControl.EngineDurable;
    layerExecutor: (registry: Layer.Layer<import("@smthrs/registry/Registry").Registry>, engine: NativeControl.EngineDurable, root: string, options: NativeControl.ExecutorOptions) => ReturnType<(registry: Layer.Layer<import("@smthrs/registry/Registry").Registry>, engine: NativeControl.EngineDurable, root: string, options: NativeControl.ExecutorOptions, evaluator: Layer.Layer<import("@smthrs/model/Evaluator").Evaluator>) => Layer.Layer<import("@smthrs/control/ControlExecutor").ControlExecutor, never, import("@smthrs/control/ControlRuntime").ControlRuntime | import("@smthrs/journal/Journal").Journal | import("@smthrs/notifications/NotificationQueue").NotificationQueue | import("@smthrs/registry/Registry").Registry>>;
    layerControlFromEngine: (config: import("../Application.ts").Config & Pick<NativeControl.ExecutorOptions, "expectedSourceRevision" | "catalogRevision" | "approvalChannel" | "plansFlows">, registry: Layer.Layer<import("@smthrs/registry/Registry").Registry>, engine: NativeControl.EngineDurable, modules?: NativeControl.ModuleRegistration) => Layer.Layer<import("@smthrs/control/Control").Control, never, never>;
    layerControl: (config: import("../Application.ts").Config, suppliedRegistry?: Layer.Layer<import("@smthrs/registry/Registry").Registry>, suppliedEngine?: NativeControl.EngineDurable, modules?: NativeControl.ModuleRegistration) => Layer.Layer<import("@smthrs/control/Control").Control, never, never>;
    layerObserve: (config: import("../Application.ts").Config, registry: Layer.Layer<import("@smthrs/registry/Registry").Registry>) => Layer.Layer<import("@smthrs/control/Control").Control, never, never>;
    layerGateway: (health: import("@smthrs/gateway/GatewayServer").Health, options: import("@smthrs/gateway/node/NodeGateway").ServerOptions | undefined, root: string, engine?: NativeControl.EngineDurable, journal?: Layer.Layer<import("@smthrs/journal/Journal").Journal>) => Layer.Layer<import("effect/http/HttpServer").HttpServer, import("@smthrs/gateway/GatewayError").GatewayError | import("@smthrs/sync/SyncError").SyncError, import("@smthrs/control/Control").Control>;
    layerGatewayHost: (engine: NativeControl.EngineDurable, control: Layer.Layer<import("@smthrs/control/Control").Control>) => Layer.Layer<import("../Serve.ts").GatewayHost, never, never>;
    layerMemory: (root: string, engine?: NativeControl.EngineDurable) => Layer.Layer<import("@smthrs/memory/MemoryStore").MemoryStore, never, never>;
    layerHost: (config: import("../Application.ts").Config & Pick<NativeControl.ExecutorOptions, "expectedSourceRevision" | "catalogRevision" | "approvalChannel">, modules?: NativeControl.ModuleRegistration, suppliedRegistry?: Layer.Layer<import("@smthrs/registry/Registry").Registry>) => Layer.Layer<import("@smthrs/control/Control").Control | import("../Serve.ts").GatewayHost | import("@smthrs/memory/MemoryStore").MemoryStore | import("@effect/platform-node/NodeServices").NodeServices, never, never>;
};
