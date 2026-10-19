import * as Nix from "@smthrs/targets/Nix";
import { type ResolvedEnvironment } from "./NixExec.vibe";
/** `process.platform`, the default of NixExec.vibe's `hostSystem`. */
export declare const platform: () => string;
/** `process.arch`, the default of NixExec.vibe's `hostSystem`. */
export declare const arch: () => string;
/**
 * Resolves one declared environment on this host.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const resolveEnvironment: (options: {
    readonly root: string;
    readonly declaration: Nix.Environment;
    /** The workspace-relative cache directory the memo lives under; omit to skip the memo. */
    readonly cacheDirectory?: string | undefined;
    /** The host environment `nix` is looked up in and spawned with. */
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly log?: ((line: string) => void) | undefined;
}) => Promise<ResolvedEnvironment>;
/**
 * Asserts that one tool the closure supplies satisfies the version the
 * workspace declared for it.
 *
 * The tool is looked up on the closure's `PATH` alone. An absent tool and a
 * version outside the requirement are both {@link NixEnvironmentError}s that
 * name the declaration and what the closure provides.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const assertToolVersion: (resolved: ResolvedEnvironment, tool: {
    readonly name: string;
    readonly executable?: string | undefined;
    readonly requirement: string;
}, options: {
    readonly root: string;
    readonly signal?: AbortSignal | undefined;
}) => Promise<string>;
