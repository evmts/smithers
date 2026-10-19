/**
 * Planning helpers for Foundry targets and mise-pinned tool references.
 *
 * forge shares a name with unrelated binaries, so resolution probes every
 * PATH candidate and keeps the one whose version output is Foundry's; the
 * declared foundry.toml and the workspace's mise pins enter the key as
 * digested authority, and an absent or wrong forge is a typed refusal.
 * `S.Mise.bin` resolution lives here too: the pinned version is read from
 * the declared mise config and execution refuses when mise itself is not
 * on the host.
 *
 * @since 0.1.0
 */
import type * as Foundry from "@smthrs/targets/Foundry";
import type * as WorkspaceDeclaration from "@smthrs/targets/WorkspaceDeclaration";
import * as HostProbes from "./internal/HostProbes.ts";
/**
 * One resolved executable and the complete identity entering target keys.
 *
 * @category models
 * @since 0.1.0
 */
export type ResolvedTool = {
    readonly ok: true;
    readonly path: string;
    readonly identity: unknown;
} | {
    readonly ok: false;
    readonly refusal: string;
    readonly identity: unknown;
};
/**
 * Resolves `S.Mise.bin`, keying the declared config and pinned tool entry.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const resolveMiseBin: (root: string, workspace: WorkspaceDeclaration.WorkspaceDeclaration, name: string, environment: Readonly<Record<string, string | undefined>>, probes?: HostProbes.HostProbes) => Promise<ResolvedTool>;
/**
 * The reduced plan fields a Foundry target contributes to PackageExec.
 *
 * @category models
 * @since 0.1.0
 */
export interface Plan {
    readonly argv?: ReadonlyArray<string> | undefined;
    readonly cwd: string;
    readonly env: Readonly<Record<string, string>>;
    readonly outDirs: ReadonlyArray<string>;
    /**
     * Workspace-relative directories forge writes on its own account: the
     * compiler cache (`cache_path`, when caching is on) and the artifact
     * directory (`out`). Neither is a declared output of the rule (`Foundry.Test`
     * declares none, and a `Foundry.Build` may name a different `outDirs`), so
     * the confinement learns them here, from `forge config` itself, which is
     * what resolves the profile, the environment, and the config file the same
     * way the build will.
     */
    readonly writeSet: ReadonlyArray<string>;
    readonly toolchain: unknown;
    readonly refusal?: string | undefined;
}
/**
 * Plans one Foundry rule from validated attrs.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const plan: (options: {
    readonly root: string;
    readonly packagePath: string;
    readonly workspace: WorkspaceDeclaration.WorkspaceDeclaration;
    readonly rule: "Foundry.Build" | "Foundry.Test" | "Foundry.Fmt";
    readonly mode: "execute" | "check" | "write";
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
    /** The invocation's host-probe cache; a fresh one when planning a single target directly. */
    readonly probes?: HostProbes.HostProbes | undefined;
    readonly attrs: (typeof Foundry.BuildAttrs)["Type"] | (typeof Foundry.TestAttrs)["Type"] | (typeof Foundry.FmtAttrs)["Type"];
}) => Promise<Plan>;
