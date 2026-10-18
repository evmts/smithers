/** One private control/executor composition over existing native platform adapters.
 * @since 1.0.0
 */
import type * as NodeServices from "@effect/platform-node/NodeServices";
import * as Agent from "@smthrs/agent/Agent";
import * as AgentAction from "@smthrs/agent/AgentAction";
import * as AgentSession from "@smthrs/agent/AgentSession";
import * as Budget from "@smthrs/agent/Budget";
import * as QuotaPolicy from "@smthrs/agent/QuotaPolicy";
import type * as SeatResolver from "@smthrs/agent/SeatResolver";
import * as StandardFlows from "@smthrs/agent/StandardFlows";
import * as WorkspaceObservation from "@smthrs/agent/WorkspaceObservation";
import { ApprovalAuthority, Control, ControlExecutor, ControlRuntime } from "@smthrs/control";
import * as DurableWriter from "@smthrs/database/DurableWriter";
import type * as ReplayOnly from "@smthrs/engine-store/ReplayOnly";
import type * as NodeFlowsRuntime from "@smthrs/flows/NodeRuntime";
import type * as GatewayServer from "@smthrs/gateway/GatewayServer";
import type * as NodeGateway from "@smthrs/gateway/node/NodeGateway";
import type { HarnessError } from "@smthrs/harness/HarnessError";
import type * as Sandbox from "@smthrs/harness/Sandbox";
import * as Steering from "@smthrs/harness/Steering";
import type { JjError } from "@smthrs/jj";
import * as Journal from "@smthrs/journal/Journal";
import * as KernelChildProcessSpawner from "@smthrs/kernel/ChildProcessSpawner";
import * as GrantStore from "@smthrs/kernel/GrantStore";
import * as KernelHttpClient from "@smthrs/kernel/HttpClient";
import * as KernelJj from "@smthrs/kernel/Jj";
import type * as McpClient from "@smthrs/mcp/McpClient";
import * as MemoryStore from "@smthrs/memory/MemoryStore";
import * as Evaluator from "@smthrs/model/Evaluator";
import type * as RequestExecutor from "@smthrs/model/RequestExecutor";
import type { NotificationQueue } from "@smthrs/notifications";
import * as Descriptor from "@smthrs/registry/Descriptor";
import * as Executable from "@smthrs/registry/Executable";
import * as Registry from "@smthrs/registry/Registry";
import { type AttemptStore, RunStore } from "@smthrs/run-store";
import { Effect, FileSystem, Layer, Scope } from "effect";
import type { Crypto, Path } from "effect";
import { SqlClient } from "effect/sql/SqlClient";
import type * as Application from "../Application.ts";
import * as Serve from "../Serve.ts";
import * as ControlDatabasePath from "./ControlDatabasePath.ts";
import * as ExecutionDatabasePath from "./ExecutionDatabasePath.ts";
import * as LocalControl from "./LocalControl.ts";
/** Captured durable control services shared by native consumers.
 * @since 1.0.0
 * @private
 */
export interface EngineDurable extends Application.Engine {
    readonly stores: Layer.Layer<DurableWriter.DurableWriter | SqlClient | RunStore.RunStore>;
    /**
     * What this composition's executor registered, read by the control runtime,
     * engine journal and gateway built over the same engine. Every engine owns
     * its own: two roots open in one process never plan from each other's
     * catalog or report each other's revision (#2746).
     */
    readonly host: HostState;
}
/** The catalog, revision and executor one composition registered.
 * @since 1.0.0
 * @private
 */
export interface HostState {
    /**
     * The executable catalog this host's executor built, or `undefined` when it
     * has not built one.
     *
     * Planning a discovered flow needs the Executable behind its descriptor,
     * and the catalog is constructed by the executor layer, after the control
     * runtime it must answer. A plain reference rather than an awaited
     * `Deferred` is deliberate: a composition that only observes persisted runs (or a bare
     * `engineDurable`) never builds a catalog at all, and a plan that
     * awaited one would hang the command instead of answering it.
     */
    catalog: Executable.Catalog | undefined;
    /** Approved historical modules available for replay, never for new admission. */
    replayDescriptors?: ReadonlySet<Descriptor.FlowDescriptor>;
    /**
     * The workspace revision the catalog above was read out of, or `undefined`
     * when this host cannot name one.
     *
     * It is set with `catalog` and for the same reason: a declaration site
     * is a path and a line, and the plans this host builds are built from the
     * modules that catalog holds, which were read off one tree at startup. A
     * reader that has this can ask for the file AT that revision rather than
     * for whatever is on disk when they open the tab, and a host that cannot
     * name one reports nothing rather than binding code to a moving tree
     * (D-068).
     *
     * It holds a revision only when a reading taken before the catalog was read
     * and a reading taken after it agree. A host is not alone on its tree, and
     * a write landing while the catalog is loading would otherwise be recorded
     * as a revision that does not describe the bytes the catalog holds.
     *
     * The engine reads it too, through the function its store is given: this
     * field is filled during registration, which runs after the engine layer
     * is composed, so the engine asks for the answer instead of being handed
     * one that did not exist yet.
     */
    revision: string | undefined;
    /**
     * The registry and catalog rebuild this host's executor checks runs
     * against, or `undefined` when it has no executor. Set with `catalog`.
     *
     * Both are snapshots the control plane's own discovery does not refresh, so
     * an allowed drift that recorded the digest on disk handed the executor an
     * identity it did not hold: the resume was accepted and the run then failed
     * `LaunchFailed` (#2740). Adopting loads the new code through these first.
     */
    executor: {
        readonly registry: Registry.Registry;
        readonly refresh: Executable.Refresh | undefined;
        /**
         * Joins this run's local module handlers before replacing its source.
         * The caller supplies its identity without reopening its control transaction.
         */
        readonly prepareAdoption?: ((flowId: string, runId: string, executionDigest: string | undefined) => Effect.Effect<void>) | undefined;
        /**
         * Runs `effect` in the host's transaction-free context. A resume
         * adopts inside the control mutation's SQL transaction, and a body
         * registered from there inherits it: every later run of that body
         * then failed "cannot start a transaction within a transaction".
         */
        readonly onHost: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E>;
    } | undefined;
}
/** Existing executable registration input to the native runtime final phase.
 * @since 1.0.0
 * @private
 */
export type ModuleRegistration = Layer.Layer<Executable.Catalog, never, Executable.Registration | AgentAction.Host | Sandbox.Sandbox | Steering.Source | Exclude<Effect.Services<ReturnType<typeof AgentSession.make>>, Scope.Scope> | FileSystem.FileSystem | Path.Path | KernelJj.Jj | SqlClient | AttemptStore.AttemptStore | KernelChildProcessSpawner.ChildProcessSpawner | Budget.Budget | QuotaPolicy.QuotaClassifier | NotificationQueue.NotificationQueue | Evaluator.Evaluator | MemoryStore.MemoryStore>;
/** Everything the production executor is configured with beyond its stores.
 * @since 1.0.0
 * @private
 */
export interface ExecutorOptions {
    /** Product-host binding: require this exact catalog snapshot before admission. */
    readonly expectedSourceRevision?: string | undefined;
    /** Trusted source materialization receipt reader; independent of the editable execution root. */
    readonly catalogRevision?: (() => Effect.Effect<string | undefined>) | undefined;
    /** An explicit host judge, including an evidence-based offline script. */
    readonly evaluator?: Layer.Layer<Evaluator.Evaluator> | undefined;
    /** Where seat credentials and the host's test declaration are read from. */
    readonly environment: Readonly<Record<string, string | undefined>>;
    /**
     * MCP servers to connect at startup, each projected into the run's flow
     * catalog by `@smthrs/mcp/McpFlows`, one more source alongside filesystem,
     * shell, and memory. A stdio server spawns through the guarded spawner; a
     * Streamable HTTP server is reached through the guarded egress `HttpClient`.
     * Empty by default: a host that names none behaves exactly as it always has.
     */
    readonly mcpServers?: ReadonlyArray<McpClient.ConnectOptions> | undefined;
    /** The store the guarded filesystem and the spawner must both ask. */
    readonly grants?: Layer.Layer<GrantStore.GrantStore> | undefined;
    readonly requestExecutor?: Layer.Layer<RequestExecutor.RequestExecutor> | undefined;
    readonly quotaPolicy?: Layer.Layer<QuotaPolicy.QuotaClassifier> | undefined;
    /** Seat-capacity parking policy forwarded to every agent run. */
    readonly capacity?: Agent.Options["capacity"];
    /** The checkout runs execute in, when it is not the project root. */
    readonly executionRoot?: string | undefined;
    /** Where `engine.db` lives, when that is not the project root. */
    readonly stateRoot?: string | undefined;
    /** The database files, when they are not under `stateRoot`; see `Application.Config.databases`. */
    readonly databases?: Application.Databases | undefined;
    /** Replays recorded steps and executes none; see `Application.Config.replayOnly`. */
    readonly replayOnly?: Layer.Layer<ReplayOnly.ReplayOnly> | undefined;
    /**
     * Whether this executor may drive a run. `false` builds the observing
     * executor described on `Application.Config.startsRuns`: no judge is
     * required and `launch` and `resumeRun` are unreachable.
     */
    readonly startsRuns?: boolean | undefined;
    /** Planning imports authored modules without enabling launches or resumes. */
    readonly plansFlows?: boolean | undefined;
    /** A human can answer this executor's in-run waits. */
    readonly approvalChannel?: boolean | undefined;
    /**
     * Trusted native registrations using the existing executable catalog.
     * Built in the engine's registration phase with the guarded host platform;
     * every registered handler restores its owning approved control envelope.
     */
    readonly modules?: ModuleRegistration | undefined;
    /**
     * Whether this executor imports a flow file its own runs write, while it
     * serves. Off by default; `Application.Config.rebuildAuthoredFlows` states
     * what turning it on means.
     */
    readonly rebuildAuthoredFlows?: boolean | undefined;
    /** The machines a flow's `sandbox:` may select; see `Application.Config.sandboxProviders`. */
    readonly sandboxProviders?: Application.SandboxProviders | undefined;
}
/** Existing service implementations selected by the executable boundary.
 * @since 1.0.0
 * @private
 */
export interface Platform {
    /** Modules whose settled launches retain their run for subsequent input. */
    readonly reenterModules?: ReadonlyArray<string> | undefined;
    readonly reentryCheckpoint?: AgentSession.Options["reentryCheckpoint"];
    /** Wait for committed external inputs before the owning notification drain. */
    readonly beforeSteeringDrain?: ((runId: string, flowId: string) => Effect.Effect<void, HarnessError>) | undefined;
    /** Coding hosts require the registered daemon terminal; never use the native spawn binding. */
    readonly shellTerminal?: "agent" | undefined;
    /**
     * The machine's agent terminal for `shellTerminal: "agent"` (T-TRM-05).
     * Undefined where the host has none: `bash` then refuses, typed.
     */
    readonly agentTerminal?: (spawner: KernelChildProcessSpawner.ChildProcessSpawner["Service"]) => StandardFlows.TerminalPort | undefined;
    readonly agentLimits?: {
        readonly modelCallMs: number;
        readonly toolMs: number;
        readonly taskMs: number;
        readonly weights?: Budget.Weights | undefined;
    } | undefined;
    readonly host: Layer.Layer<NodeServices.NodeServices>;
    readonly crypto: Layer.Layer<Crypto.Crypto>;
    readonly database: (filename: string) => Layer.Layer<DurableWriter.DurableWriter | SqlClient>;
    /** Opens an existing store read-only: no directory, migration, schema object or write lock. */
    readonly observe: (filename: string) => Layer.Layer<DurableWriter.DurableWriter | SqlClient>;
    readonly runtime: typeof NodeFlowsRuntime.layer;
    readonly jj: (root: string) => Layer.Layer<KernelJj.Jj, JjError, KernelChildProcessSpawner.ChildProcessSpawner>;
    /** Private deployment policy around the already guarded standard file tools. */
    readonly filesystem?: (root: string, filesystem: FileSystem.FileSystem, spawner: KernelChildProcessSpawner.ChildProcessSpawner["Service"]) => Effect.Effect<FileSystem.FileSystem>;
    readonly httpClient: (environment: Readonly<Record<string, string | undefined>>) => Layer.Layer<KernelHttpClient.HttpClient>;
    readonly requestExecutor: Layer.Layer<RequestExecutor.RequestExecutor>;
    /**
     * The judge this platform binds, when it is not the one its environment
     * names.
     *
     * A deployed host uses the existing subscription seat resolver. An offline
     * composition supplies an evidence-based scripted judge explicitly.
     */
    readonly evaluator?: Layer.Layer<Evaluator.Evaluator> | undefined;
    readonly gateway: typeof NodeGateway.layer;
    readonly bearerPrincipal: typeof NodeGateway.bearerPrincipal;
}
/** Binds one control composition to the already-existing Node or Bun services.
 *
 * `seats` provides the `SeatResolver`, and a `SeatRouter.Catalog` beside it
 * when the host routes undeclared and `auto` seats.
 * @since 1.0.0
 * @private
 */
export declare const make: (native: Platform, seats?: (environment: Readonly<Record<string, string | undefined>>) => Layer.Layer<SeatResolver.SeatResolver, never, RequestExecutor.RequestExecutor>, decorateNotifications?: LocalControl.NotificationDecorator) => {
    evaluatorFor: (environment: Readonly<Record<string, string | undefined>>, supplied?: Layer.Layer<Evaluator.Evaluator>, startsRuns?: boolean) => Layer.Layer<Evaluator.Evaluator, never, never>;
    projectSources: (root: string) => ReadonlyArray<Descriptor.Source>;
    layerHostPlatform: Layer.Layer<NodeServices.NodeServices, never, never>;
    layerGrantStore: (root: string) => Layer.Layer<GrantStore.GrantStore>;
    layerGuardedPlatform: (root: string, grants?: Layer.Layer<GrantStore.GrantStore>) => Layer.Layer<NodeServices.NodeServices, never, never>;
    layerObserver: (root: string, options?: WorkspaceObservation.Options) => Layer.Layer<WorkspaceObservation.Observer>;
    layerRegistry: (root: string) => Layer.Layer<Registry.Registry>;
    gatewayApprovalAuthority: ApprovalAuthority.Service;
    databasePath: typeof ControlDatabasePath.databasePath;
    executionDatabasePath: typeof ExecutionDatabasePath.executionDatabasePath;
    materializeEngine: (engine: EngineDurable) => Effect.Effect<EngineDurable, never, Scope.Scope>;
    engineDurable: (root: string, registry?: Layer.Layer<Registry.Registry> | undefined, authority?: Pick<Application.Config, "approvalAuthority" | "principal" | "credential" | "stateRoot" | "databases">) => EngineDurable;
    layerExecutor: (registry: Layer.Layer<Registry.Registry>, engine: EngineDurable, root: string, options: ExecutorOptions) => ReturnType<(registry: Layer.Layer<Registry.Registry>, engine: EngineDurable, root: string, options: ExecutorOptions, evaluator: Layer.Layer<Evaluator.Evaluator>) => Layer.Layer<ControlExecutor.ControlExecutor, never, ControlRuntime.ControlRuntime | Journal.Journal | NotificationQueue.NotificationQueue | Registry.Registry>>;
    layerControlFromEngine: (config: Application.Config & Pick<ExecutorOptions, "expectedSourceRevision" | "catalogRevision" | "approvalChannel" | "plansFlows">, registry: Layer.Layer<Registry.Registry>, engine: EngineDurable, modules?: ModuleRegistration) => Layer.Layer<Control.Control, never, never>;
    layerControl: (config: Application.Config, suppliedRegistry?: Layer.Layer<Registry.Registry>, suppliedEngine?: EngineDurable, modules?: ModuleRegistration) => Layer.Layer<Control.Control, never, never>;
    layerObserve: (config: Application.Config, registry: Layer.Layer<Registry.Registry>) => Layer.Layer<Control.Control, never, never>;
    layerGateway: (health: GatewayServer.Health, options: NodeGateway.ServerOptions | undefined, root: string, engine?: EngineDurable, journal?: Layer.Layer<Journal.Journal>) => Layer.Layer<import("effect/http/HttpServer").HttpServer, import("@smthrs/gateway/GatewayError").GatewayError | import("@smthrs/sync/SyncError").SyncError, Control.Control>;
    layerGatewayHost: (engine: EngineDurable, control: Layer.Layer<Control.Control>) => Layer.Layer<Serve.GatewayHost, never, never>;
    layerMemory: (root: string, engine?: EngineDurable) => Layer.Layer<MemoryStore.MemoryStore, never, never>;
    layerHost: (config: Application.Config & Pick<ExecutorOptions, "expectedSourceRevision" | "catalogRevision" | "approvalChannel">, modules?: ModuleRegistration, suppliedRegistry?: Layer.Layer<Registry.Registry>) => Layer.Layer<Control.Control | Serve.GatewayHost | MemoryStore.MemoryStore | NodeServices.NodeServices, never, never>;
};
