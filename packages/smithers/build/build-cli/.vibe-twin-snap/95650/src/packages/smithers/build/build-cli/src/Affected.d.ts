/** Conservative changed-file selection, including reverse target dependencies.
 * @since 0.1.0
 */
import * as Input from "@smthrs/targets/Input";
import * as ContainedProcess from "./internal/ContainedProcess.ts";
import type { PackageIndex } from "./PackageIndex.ts";
declare const AffectedGitError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/AffectedGitError";
} & Readonly<A>;
/** Affected discovery refused a git result or could not finish within its bound.
 * @category errors
 * @since 1.0.0-rc.0
 */
export declare class AffectedGitError extends AffectedGitError_base<{
    readonly code: ContainedProcess.ProcessError["code"] | "nonzero_exit" | "invalid_timeout";
    readonly args: ReadonlyArray<string>;
    readonly message: string;
    readonly cause?: unknown;
}> {
    constructor(code: AffectedGitError["code"], args: ReadonlyArray<string>, message: string, cause?: unknown);
}
/** Collects changed paths from explicit inputs or a verified Git comparison.
 * @category querying
 * @since 0.1.0
 */
export declare const changedPaths: (root: string, options: {
    readonly base: string;
    readonly head?: string | undefined;
    readonly files?: ReadonlyArray<string> | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly timeoutMs?: number | undefined;
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
}) => Promise<ReadonlyArray<string>>;
interface ReasonDetail {
    readonly file: string;
    readonly kind: "global-input" | "unknown-input" | "ambient-input" | "uncacheable" | "package" | "declared-input" | "empty";
    readonly label?: string;
    readonly rule?: string;
    readonly input?: Input.Declared;
    readonly dependencyPath?: ReadonlyArray<string>;
}
/** Selects roots, among the union of the patterns, whose declarations, package inputs or dependencies may have changed.
 * Every uncacheable target, and each target depending on one, is selected by any change.
 * @category querying
 * @since 0.1.0
 */
export declare const select: (index: PackageIndex, patterns: ReadonlyArray<string>, paths: ReadonlyArray<string>, options?: {
    readonly explain?: boolean;
}) => {
    pattern: string;
    files: string[];
    conservative: boolean;
    globalInputs: string[];
    targets: {
        label: string;
        reasons: string[];
        reasonDetails?: ReasonDetail[];
    }[];
};
/**
 * Whether changed files meet a pattern that names no target: an empty graph
 * or a renamed package, which would otherwise gate a real diff with nothing
 * and pass green. Pass the number of targets each pattern resolves to. A
 * pattern that resolves but whose targets the diff does not reach, or that
 * have no rule of the verb's kind, is a legitimate green.
 *
 * @category selection
 * @since 1.0.0
 */
export declare const silent: (files: ReadonlyArray<string>, resolved: ReadonlyArray<number>) => boolean;
/**
 * The labels an execution summary holds no record of: a planned target the
 * executor never recorded never ran, and that is red.
 *
 * @category selection
 * @since 1.0.0
 */
export declare const unrecorded: (labels: ReadonlyArray<string>, summary: {
    readonly results: ReadonlyArray<{
        readonly label: string;
    }>;
}) => ReadonlyArray<string>;
/**
 * A summary in which a selected gate was skipped without a failure behind it,
 * turned red. A skip is a failure's shadow only when its `blockedBy` chain ends
 * at a failed row; one that ends anywhere else never ran for a reason of its
 * own (a review whose engine is not installed here), whatever else failed. The
 * skipped rows become failed rows that keep their reason, so the results
 * survive and the known-red list can still excuse one by label and failure.
 *
 * @category selection
 * @since 1.0.0
 */
export declare const unskipped: <S extends {
    readonly ok: boolean;
    readonly counts: {
        readonly failed: number;
        readonly skipped: number;
    };
    readonly results: ReadonlyArray<{
        readonly label: string;
        readonly status: string;
        readonly error?: string | undefined;
        readonly blockedBy?: string | undefined;
    }>;
}>(labels: ReadonlyArray<string>, summary: S) => S;
export {};
