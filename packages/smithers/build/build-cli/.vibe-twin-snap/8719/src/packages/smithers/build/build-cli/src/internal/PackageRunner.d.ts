/**
 * Executes a planned graph: cache lifecycle, services, write ownership, and scheduling.
 *
 * @since 1.0.0
 */
import * as ExecSandbox from "@smthrs/targets/ExecSandbox";
import * as WorkspaceDeclaration from "@smthrs/targets/WorkspaceDeclaration";
import * as Effect from "effect/Effect";
import * as Executor from "../Executor.ts";
import type { ExecuteOptions, PackageNode, PackagePlan } from "./PackageOptions.ts";
/**
 * The confinement one package node runs under.
 *
 * The read set is what the content key covers: the node's expanded declared
 * inputs, the closure a rule planned for itself (`Go.*` names its work with
 * import patterns, so `go.mod` and the compiler inputs arrive that way), the
 * declared outputs of every transitive dependency, the `node_modules` trees
 * above the working directory, and the cache
 * directory's scratch and fetch store. The write set is the node's declared
 * outputs, its declared `changes`, its clean targets, a cargo crate's
 * `target` directory, and the cache directory with the result cache itself
 * re-closed. The policy is the node's own `sandbox` attr, the mechanism the
 * workspace's `Sandboxes({ default })` declaration or the platform's own.
 *
 * @category internal
 * @since 1.0.0
 */
export declare const sandboxRequest: (node: PackageNode, nodes: ReadonlyMap<string, PackageNode>, workspace: WorkspaceDeclaration.WorkspaceDeclaration, cacheDirectory: string, candidateReads?: ReadonlyArray<string>) => ExecSandbox.Request;
/**
 * The finding fields a review status line renders.
 * @category rendering
 * @since 1.0.0
 */
export interface ReviewFinding {
    readonly file: string;
    readonly line: number;
    readonly severity: string;
    readonly message: string;
    readonly security?: {
        readonly checkId: string;
        readonly impact: string;
    };
}
/**
 * A model review's findings with their stored fingerprints, as its report or FindingsError carries them.
 * @category rendering
 * @since 1.0.0
 */
export interface ReviewResult {
    readonly findings: ReadonlyArray<ReviewFinding>;
    readonly fingerprints?: ReadonlyArray<string>;
}
/**
 * Renders model-review findings one per line. A review's findings are its
 * whole result, so a status line that dropped them would report a failed
 * review with no reason and a passing one with its warnings hidden. A security
 * finding names only its severity, check, impact and stored fingerprint: its
 * description stays in the private finding store, out of the log.
 * @category rendering
 * @since 1.0.0
 */
export declare const renderReviewFindings: ({ findings, fingerprints }: ReviewResult) => string;
/**
 * The status text of a failed model review, or undefined for any other failure.
 * Findings render as {@link renderReviewFindings} does; a review error renders
 * only its {@link LlmLint.publicError} message, never quoted model output or an
 * unmasked credential.
 * @category rendering
 * @since 1.0.0
 */
export declare const reviewFailureText: (value: unknown) => string | undefined;
/**
 * Executes one planned PACKAGE.ts work list with keep-going scheduling.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const executeEffect: (planned: PackagePlan, options: ExecuteOptions) => Effect.Effect<Executor.Summary, unknown>;
/**
 * Promise boundary for the CLI host. The Effect owns all invocation resources.
 * @category execution
 * @since 1.0.0
 */
export declare const execute: (planned: PackagePlan, options: ExecuteOptions) => Promise<Executor.Summary>;
