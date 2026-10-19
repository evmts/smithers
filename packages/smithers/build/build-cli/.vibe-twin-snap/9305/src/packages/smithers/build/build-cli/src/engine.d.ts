/**
 * Runtime adapter between the CLI and the install package.
 *
 * Every assumption about the install package's exports stays in this file, so
 * a surface change there reconciles in one place. The executor composes the
 * layers exported here beside each target's own interpreter registration.
 *
 * @since 0.1.0
 */
import { Install, PackageManager, Runtime } from "@smthrs/build";
import { Action } from "@smthrs/flow";
import * as TargetPackageManager from "@smthrs/targets/PackageManager";
import * as TargetRuntime from "@smthrs/targets/Runtime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
/**
 * Node host services needed by non-interactive smithers-build execution.
 *
 * `NodeServices.layer` also acquires `NodeTerminal`, which attaches listeners
 * to process stdin. The executor gives every target an isolated flow runtime;
 * acquiring the aggregate layer in sixteen concurrent runtimes therefore
 * attached sixteen terminal listeners even though no target reads a terminal,
 * producing leak warnings during ordinary CI. Keeping the host layer to the
 * services the CLI actually uses avoids shared-terminal state and preserves
 * per-target flow isolation.
 *
 * @category layers
 * @since 0.1.0
 * @slop
 */
export declare const layerNonInteractiveNodeServices: Layer.Layer<ChildProcessSpawner | import("effect/Crypto").Crypto | import("effect/FileSystem").FileSystem | import("effect/Path").Path | import("effect/Stdio").Stdio, never, never>;
/**
 * Structured result returned by the install command.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface InstallResult {
    readonly workspace: string;
    readonly manager: PackageManager.Name;
    readonly plan: ReadonlyArray<{
        readonly id: string;
        readonly kind: string;
        readonly dependencies: ReadonlyArray<string>;
    }>;
    readonly result: Install.LinkManifest;
}
/**
 * Copies the host environment without remote-cache credentials.
 *
 * The package-manager implementation selects only its own bootstrap and
 * project-declared variables from this copy. Removing cache credentials here
 * also covers a custom token name that a project `.npmrc` happens to mention.
 *
 * @category security
 * @since 0.1.0
 * @slop
 */
export declare const packageManagerEnvironment: (source: Readonly<Record<string, string | undefined>>, sensitiveEnvironment?: ReadonlyArray<string>, windows?: boolean) => Readonly<Record<string, string | undefined>>;
/**
 * The toolchain one target declared.
 *
 * A target's attrs carry the manager and runtime declarations.
 * This is the shape the CLI needs out of them to build the two layers.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface Toolchain {
    readonly manager: PackageManager.Name;
    readonly managerVersion: string;
    readonly managerExecutable: string | undefined;
    readonly runtime: Runtime.Name;
    readonly runtimeVersion: string;
    readonly runtimeExecutable: string | undefined;
}
/**
 * The toolchain used when a target declares none.
 *
 * Both requirements accept any version. A target that does not run a tool has
 * no business failing because of the interpreter on the host, and inventing a
 * requirement the author never wrote would do exactly that.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export declare const defaultToolchain: Toolchain;
/**
 * The declared tools an action-backed target actually uses.
 *
 * The two file generators carry package-manager data to render configuration,
 * not to execute a manager. Vitest's explicit Bun runtime selects Bun itself
 * as the manager, exactly as its target implementation does.
 *
 * @category models
 * @since 1.0.0
 */
export interface TargetToolchain {
    readonly runtime: TargetRuntime.Runtime | undefined;
    readonly packageManager: TargetPackageManager.PackageManager | undefined;
}
/**
 * Selects tools from already validated target attrs without executing a probe.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const targetToolchain: (target: string, attrs: unknown) => TargetToolchain;
/**
 * Verifies declarations before the target can execute a tool.
 *
 * The existing runtime and package-manager services own version parsing,
 * deadlines and typed refusals. No install or fetch operation is performed.
 * Bun's package-manager install service is deliberately unsupported; its tool
 * runner is the Bun executable itself, so its version is verified through the
 * real Bun runtime service instead.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const verifyTargetToolchain: (toolchain: TargetToolchain, cwd: string, environment: Readonly<Record<string, string | undefined>>, sensitiveEnvironment?: ReadonlyArray<string>) => Effect.Effect<void, PackageManager.PackageManagerError | Runtime.RuntimeError, ChildProcessSpawner | import("effect/FileSystem").FileSystem>;
/**
 * Extracts the toolchain a target declared, falling back to
 * {@link defaultToolchain}.
 *
 * A declaration is a trust boundary, so every field is read as an own data property
 * and validated. A malformed declaration yields the default rather than a
 * crash: the target's own attrs schema already rejected anything malformed, and
 * this reader runs on the far side of that check.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const declaredToolchain: (attrs: unknown) => Toolchain;
/**
 * The runtime layer for this host.
 *
 * The platform and a sanitized host-environment snapshot are read here, at
 * the composition root, and passed in. The runtime selects only executable
 * lookup names from that snapshot, so a workspace-declared `--version` probe
 * cannot inherit CI credentials.
 *
 * @category layers
 * @since 0.1.0
 * @slop
 */
export declare const layerRuntime: (toolchain: Toolchain, environment?: Readonly<Record<string, string | undefined>>) => Layer.Layer<Runtime.Runtime, never, ChildProcessSpawner>;
/**
 * The operator variable naming the registry hosts a project `.npmrc` may bind
 * a host credential to, as a comma-separated list of `host` or `host:port`.
 *
 * It is read from the host environment, never from the checkout, because the
 * checkout is what the list constrains. Unset, only `registry.npmjs.org` may
 * receive one.
 *
 * @category security
 * @since 0.1.0
 * @slop
 */
export declare const credentialHostsVariable = "SMITHERS_NPM_CREDENTIAL_HOSTS";
/**
 * Reads {@link credentialHostsVariable} from the host environment.
 *
 * @category security
 * @since 0.1.0
 * @slop
 */
export declare const credentialHostsOf: (source: Readonly<Record<string, string | undefined>>) => ReadonlyArray<string> | undefined;
/**
 * The package-manager layer for this host, over the runtime it declared.
 *
 * @category layers
 * @since 0.1.0
 * @slop
 */
export declare const layerPackageManager: (projectRoot: string, toolchain?: Toolchain, sensitiveEnvironment?: ReadonlyArray<string>, 
/**
 * The host environment executables are looked up in. A workspace with a
 * declared Nix environment passes a copy whose `PATH` is the closure's, so
 * the manager and the runtime come from the closure and never from the host.
 */
source?: Readonly<Record<string, string | undefined>> | undefined) => Layer.Layer<PackageManager.PackageManager | Runtime.Runtime, never, ChildProcessSpawner | import("effect/FileSystem").FileSystem>;
/**
 * The install action implementations plus the registered install flow.
 *
 * The flow no longer trampolines, so registration is no longer what resolves a
 * round-two handoff. It stays because the executor merges this beside a
 * target's own interpreter registration, which is what lets an install target
 * reached from any dependency graph execute.
 *
 * @category layers
 * @since 0.1.0
 * @slop
 */
export declare const layerInstall: Layer.Layer<Action.Requirement<"smithers-build/install/fetch/pnpm"> | Action.Requirement<"smithers-build/install/link"> | Action.Requirement<"smithers-build/install/measure">, never, import("effect/Crypto").Crypto | import("effect/FileSystem").FileSystem | import("@smthrs/flow/FlowRuntime").FlowRuntime | Action.Implementations | PackageManager.PackageManager | Runtime.Runtime>;
/**
 * Plans and executes the install package's Install Flow under the declared
 * toolchain, or under {@link defaultToolchain} when the caller passes none.
 *
 * The package-manager service carries the absolute workspace root, so this
 * operation never mutates the process-wide current directory and independent
 * callers can safely run against different workspaces at the same time.
 *
 * Only pnpm installs. A Bun toolchain is refused with a `PackageManagerError`
 * whose code is `unsupported` before the workspace is read.
 *
 * @category execution
 * @since 0.1.0
 * @slop
 */
export declare const runInstall: (workspaceRoot: string, options?: {
    readonly cacheDirectory?: string | undefined;
    readonly sensitiveEnvironment?: ReadonlyArray<string> | undefined;
    readonly signal?: AbortSignal | undefined;
    /**
     * The toolchain the workspace declared. The `install` verb runs one target
     * that the workspace may not have declared at all, so the caller passes what it
     * read; omitting it accepts whatever the host has.
     */
    readonly toolchain?: Toolchain | undefined;
}) => Promise<InstallResult>;
