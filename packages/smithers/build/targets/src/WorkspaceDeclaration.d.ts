/**
 * The WORKSPACE.ts declaration surface: `S.Workspace(name, options)` and the
 * typed service declarations it composes — `S.Cache`, `S.Host`, `S.Flags`,
 * `S.Npm.NodeModules`, `S.Nix.Environment`, `S.Sandboxes`, and `S.Sandbox.*`.
 *
 * Every constructor is inert: it validates and freezes data, performs no
 * I/O, and constructs no target. The build CLI's workspace loader validates
 * exactly one `Workspace` export and the package index resolves agent and
 * flag references against these declarations.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import { type AgentsDeclaration } from "./AgentTarget.ts";
import * as DependencyDocs from "./DependencyDocs.ts";
import * as Input from "./Input.ts";
import * as LocalRepository from "./LocalRepository.ts";
import { type SmithersCloudDeclaration } from "./MemoryTarget.ts";
import * as Nix from "./Nix.ts";
import * as Owners from "./Owners.ts";
import * as PackageManager from "./PackageManager.ts";
import * as Reference from "./Reference.ts";
import * as RemoteCache from "./RemoteCache.ts";
import * as Runtime from "./Runtime.ts";
import * as RustToolchain from "./RustToolchain.ts";
import * as Target from "./Target.ts";
import type * as Toolchain from "./Toolchain.ts";
/**
 * Schema for the workspace cache declaration.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const CacheDeclaration: Schema.TaggedStruct<"Cache", {
    readonly directory: Schema.NonEmptyString;
    readonly hostDirectories: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    readonly remote: Schema.optional<Schema.declare<RemoteCache.RemoteCache, RemoteCache.RemoteCache>>;
}>;
/**
 * The workspace cache declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type CacheDeclaration = typeof CacheDeclaration.Type;
/**
 * Checks whether a value is the workspace cache declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isCacheDeclaration: (value: unknown) => value is CacheDeclaration;
/**
 * Declares the workspace cache directory and, optionally, the remote cache
 * (`S.RemoteCache.make(...)`) it replicates to. The remote declaration is
 * inert data here; the CLI reads it when it opens the workspace cache.
 * `hostDirectories` explicitly owns regenerable tool caches as host state:
 * ignored contents are excluded from write-set snapshots and rollback.
 * Tracked files remain guarded. Paths must be canonical and workspace-relative.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Cache: (options: {
    readonly directory: string;
    readonly hostDirectories?: ReadonlyArray<string> | undefined;
    readonly remote?: RemoteCache.RemoteCache | undefined;
}) => CacheDeclaration;
/**
 * Schema for the workspace host-binary declaration.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const HostDeclaration: Schema.TaggedStruct<"Host", {
    readonly bins: Schema.$Array<Schema.NonEmptyString>;
}>;
/**
 * The workspace host-binary declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type HostDeclaration = typeof HostDeclaration.Type;
/**
 * Checks whether a value is the workspace host declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isHostDeclaration: (value: unknown) => value is HostDeclaration;
declare const makeHost: (options: {
    readonly bins: ReadonlyArray<string>;
}) => HostDeclaration;
/**
 * The `S.Host` surface: callable as the workspace declaration constructor
 * (`S.Host({ bins })`) and the reference surface for one declared binary
 * (`S.Host.bin(name)`).
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Host: typeof makeHost & {
    readonly bin: typeof Reference.hostBin;
};
/**
 * Runtime marker for the workspace flags declaration.
 *
 * @category type ids
 * @since 0.1.0
 */
export declare const FlagsTypeId: unique symbol;
/**
 * The workspace flags declaration: a validated name-to-argv-text record.
 *
 * @category models
 * @since 0.1.0
 */
export interface FlagsDeclaration {
    readonly [FlagsTypeId]: typeof FlagsTypeId;
    readonly flags: Readonly<Record<string, string>>;
}
/**
 * Checks whether a value is the workspace flags declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isFlagsDeclaration: (value: unknown) => value is FlagsDeclaration;
declare const makeFlags: (flags: Readonly<Record<string, string>>) => FlagsDeclaration;
/**
 * The `S.Flags` surface: callable as the workspace declaration constructor
 * (`S.Flags({ production: "--production" })`) and a property-access
 * reference surface (`S.Flags.production` in a PACKAGE.ts argv).
 *
 * Property access mints a fresh inert {@link Reference.FlagRef}; the name is
 * validated against the workspace declaration at index time. This is the
 * same single sanctioned Proxy pattern `S.Agents` uses, and for the same
 * reason: the names are workspace-defined and cannot be precomputed.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Flags: typeof makeFlags & Record<string, Reference.FlagRef>;
/**
 * Schema for the installed-modules declaration, `S.Npm.NodeModules`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const NodeModulesDeclaration: Schema.TaggedStruct<"NpmNodeModules", {
    readonly packageJson: Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>;
    readonly workspaces: Schema.optional<Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>>;
}>;
/**
 * The installed-modules declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type NodeModulesDeclaration = typeof NodeModulesDeclaration.Type;
/**
 * Checks whether a value is the installed-modules declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isNodeModulesDeclaration: (value: unknown) => value is NodeModulesDeclaration;
/**
 * Declares the installed node_modules tree derived from a manifest.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const NodeModules: (options: {
    readonly packageJson: Input.File;
    readonly workspaces?: Input.File | undefined;
}) => NodeModulesDeclaration;
/**
 * Schema for one sandbox implementation declaration.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const SandboxDeclaration: Schema.Union<readonly [Schema.TaggedStruct<"SandboxBubblewrap", {}>, Schema.TaggedStruct<"SandboxDocker", {
    readonly image: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"SandboxMicrosandbox", {
    readonly image: Schema.optional<Schema.NonEmptyString>;
    readonly environment: Schema.optional<Schema.TaggedStruct<"NixEnvironment", {
        readonly flake: Schema.optional<Schema.TaggedStruct<"File", {
            readonly path: Schema.NonEmptyString;
        }>>;
        readonly lock: Schema.optional<Schema.TaggedStruct<"File", {
            readonly path: Schema.NonEmptyString;
        }>>;
        readonly file: Schema.optional<Schema.TaggedStruct<"File", {
            readonly path: Schema.NonEmptyString;
        }>>;
        readonly attr: Schema.optional<Schema.NonEmptyString>;
    }>>;
}>, Schema.TaggedStruct<"SandboxNone", {}>]>;
/**
 * Options accepted by `S.Sandbox.Microsandbox`.
 *
 * @category models
 * @since 0.1.0
 */
export interface MicrosandboxOptions {
    /**
     * The OCI image the microVM boots. With an `environment` the image must
     * carry `nix`; `@smthrs/sandbox` defaults it to `nixos/nix` then.
     */
    readonly image?: string | undefined;
    /**
     * The Nix environment every command in the microVM runs under. The
     * provider plants the flake and its lock in the guest and wraps each
     * command in `nix develop` of them, so the sandbox holds the workspace's
     * declared toolchain rather than whatever the image shipped.
     */
    readonly environment?: Nix.Environment | undefined;
}
/**
 * One sandbox implementation declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type SandboxDeclaration = typeof SandboxDeclaration.Type;
/**
 * Checks whether a value is a sandbox implementation declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isSandboxDeclaration: (value: unknown) => value is SandboxDeclaration;
/**
 * The sandbox implementation constructors, `S.Sandbox`.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Sandbox: Readonly<{
    /** Bubblewrap on Linux; refused elsewhere. The selection with no declaration on Linux. */
    Bubblewrap: () => SandboxDeclaration;
    /** `docker run` with the named image supplying the toolchain; the only mechanism on Windows. */
    Docker: (options: {
        readonly image: string;
    }) => SandboxDeclaration;
    /**
     * A Microsandbox microVM holding the workspace's Nix environment: the
     * runtime sandbox `@smthrs/sandbox`'s `MicrosandboxSandbox` provider boots
     * for agent and flow sessions. Build-target confinement does not run under
     * it; `ExecSandbox` refuses the mechanism and names Bubblewrap or Docker.
     */
    Microsandbox: (options?: MicrosandboxOptions) => SandboxDeclaration;
    /**
     * No confinement at all. The explicit opt-out: every target runs
     * unconfined and no result of such a run enters the shared cache.
     */
    None: () => SandboxDeclaration;
}>;
/**
 * Runtime marker for the workspace sandboxes declaration.
 *
 * @category type ids
 * @since 0.1.0
 */
export declare const SandboxesTypeId: unique symbol;
/**
 * The workspace sandboxes declaration: a validated name-to-sandbox record.
 *
 * @category models
 * @since 0.1.0
 */
export interface SandboxesDeclaration {
    readonly [SandboxesTypeId]: typeof SandboxesTypeId;
    readonly sandboxes: Readonly<Record<string, SandboxDeclaration>>;
}
/**
 * Checks whether a value is the workspace sandboxes declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isSandboxesDeclaration: (value: unknown) => value is SandboxesDeclaration;
/**
 * Declares the workspace sandbox implementations by name.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Sandboxes: (sandboxes: Readonly<Record<string, SandboxDeclaration>>) => SandboxesDeclaration;
/**
 * The git hook events a workspace may bind targets to.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const gitHookNames: readonly ["preCommit", "postCommit", "prePush", "postMerge"];
/**
 * One git-hook binding table: hook event to gate-capable target.
 *
 * @category models
 * @since 0.1.0
 */
export type GitHooks = Readonly<Partial<Record<(typeof gitHookNames)[number], Target.AnyTarget>>>;
/**
 * Runtime marker for the workspace declaration.
 *
 * @category type ids
 * @since 0.1.0
 */
export declare const WorkspaceTypeId: unique symbol;
/**
 * The validated `S.Workspace(name, options)` declaration.
 *
 * @category models
 * @since 0.1.0
 */
export interface WorkspaceDeclaration {
    readonly [WorkspaceTypeId]: typeof WorkspaceTypeId;
    readonly name: string;
    readonly repository: string;
    readonly cache: CacheDeclaration;
    readonly runtime: Runtime.Runtime | Runtime.NodeDeclaration | Runtime.BunDeclaration | undefined;
    readonly packageManager: PackageManager.PackageManager | PackageManager.YarnDeclaration | PackageManager.PnpmDeclaration | undefined;
    readonly nodeModules: NodeModulesDeclaration | undefined;
    /** The Nix closure every tool-running target resolves executables from. */
    readonly environment: Nix.Environment | undefined;
    readonly toolchains: ReadonlyArray<Toolchain.Declaration | {
        readonly _tag: string;
    }>;
    readonly flags: FlagsDeclaration | undefined;
    readonly host: HostDeclaration | undefined;
    readonly memory: SmithersCloudDeclaration | undefined;
    readonly sandboxes: SandboxesDeclaration | undefined;
    readonly agents: AgentsDeclaration | undefined;
    readonly gitHooks: GitHooks | undefined;
    readonly repos: Readonly<Record<string, LocalRepository.Declaration>> | undefined;
    /** Bounds on the package walk; see {@link DiscoveryDeclaration}. */
    readonly discovery: DiscoveryDeclaration | undefined;
    /** Workspace-wide default owners: what a package with no owning ancestor resolves to. */
    readonly owners: Owners.Declaration | undefined;
    /** The team roster `team:<name>` references resolve against. */
    readonly teams: Owners.TeamsDeclaration | undefined;
    /** Dependency documentation a wiki refresh imports for agent memory; see `S.Docs`. */
    readonly docs: Readonly<Record<string, DependencyDocs.Declaration>> | undefined;
}
/**
 * Checks whether a value is the workspace declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isWorkspaceDeclaration: (value: unknown) => value is WorkspaceDeclaration;
/**
 * Bounds on the package walk.
 *
 * `prune` names workspace-relative directories the walk never enters, for
 * trees no declaration lives in and nothing else can recognise: a toolchain
 * cache without a `CACHEDIR.TAG`, a package store, run evidence. The walk is
 * ignore-blind, so a gitignored tree costs its full size on every command
 * until it is named here.
 *
 * @category models
 * @since 1.0.0
 */
export interface DiscoveryDeclaration {
    readonly prune: ReadonlyArray<string>;
}
/**
 * Options accepted by {@link Workspace}.
 *
 * @category models
 * @since 0.1.0
 */
export interface WorkspaceOptions {
    readonly repository: string;
    readonly cache: CacheDeclaration;
    readonly runtime?: Runtime.Runtime | Runtime.NodeDeclaration | Runtime.BunDeclaration | undefined;
    readonly packageManager?: PackageManager.PackageManager | PackageManager.YarnDeclaration | PackageManager.PnpmDeclaration | undefined;
    readonly nodeModules?: NodeModulesDeclaration | undefined;
    readonly environment?: Nix.Environment | undefined;
    readonly toolchains?: ReadonlyArray<Toolchain.Declaration | {
        readonly _tag: string;
    }> | undefined;
    readonly flags?: FlagsDeclaration | undefined;
    readonly host?: HostDeclaration | undefined;
    readonly memory?: SmithersCloudDeclaration | undefined;
    readonly sandboxes?: SandboxesDeclaration | undefined;
    readonly agents?: AgentsDeclaration | undefined;
    readonly gitHooks?: GitHooks | undefined;
    readonly repos?: Readonly<Record<string, LocalRepository.Declaration>> | undefined;
    readonly discovery?: {
        readonly prune?: ReadonlyArray<string> | undefined;
    } | undefined;
    readonly owners?: Owners.Options | Owners.Declaration | undefined;
    readonly teams?: Owners.TeamsDeclaration | Readonly<Record<string, ReadonlyArray<string>>> | undefined;
    readonly docs?: Readonly<Record<string, DependencyDocs.Declaration>> | undefined;
}
/**
 * Declares the workspace: its name plus the typed host and toolchain
 * services every target resolves against.
 *
 * @example
 * ```ts
 * import { Smithers as S } from "@smthrs/targets"
 *
 * export const Workspace = S.Workspace("force", {
 *   repository: "git+https://github.com/artsy/force.git",
 *   cache: S.Cache({ directory: ".flows" }),
 *   runtime: S.Runtime.Node({ manifest: S.file("//package.json") }),
 *   packageManager: S.PackageManager.Yarn({
 *     manifest: S.file("//package.json"),
 *     lockfile: S.file("//yarn.lock")
 *   }),
 *   nodeModules: S.Npm.NodeModules({ packageJson: S.file("//package.json") }),
 *   environment: S.Nix.Environment({ flake: S.file("//flake.nix") })
 * })
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Workspace: (name: string, options: WorkspaceOptions) => WorkspaceDeclaration;
/**
 * The agent names a workspace declares, for index-time reference
 * validation.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const agentNames: (workspace: WorkspaceDeclaration) => ReadonlySet<string>;
/**
 * The flag names a workspace declares, for index-time reference validation.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const flagNames: (workspace: WorkspaceDeclaration) => ReadonlySet<string>;
/**
 * The team names a workspace declares, for index-time owner reference
 * validation.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const teamNames: (workspace: WorkspaceDeclaration) => ReadonlySet<string>;
/**
 * The first declared Rust toolchain layer, or undefined for a workspace that
 * declares none.
 *
 * Every `S.Cargo.*` target resolves cargo through this layer, so a workspace
 * without one refuses those targets by name rather than falling back to
 * whatever `cargo` happens to be on PATH.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const rustToolchain: (workspace: WorkspaceDeclaration) => RustToolchain.ToolchainDeclaration | undefined;
/**
 * The Nix environment a workspace's tools resolve from, or undefined for a
 * workspace that declares none.
 *
 * The `environment` option wins; a `toolchains` entry declared with
 * `S.Nix.Environment` is the same thing in list form. An `S.Nix.DevShell`
 * entry is deliberately not one: it pins the tools `S.Nix.bin` references
 * name and nothing else, so a Go workspace that lists a dev shell beside its
 * Go toolchain keeps resolving `go` the way it declared.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const nixEnvironment: (workspace: WorkspaceDeclaration) => Nix.Environment | undefined;
export {};
