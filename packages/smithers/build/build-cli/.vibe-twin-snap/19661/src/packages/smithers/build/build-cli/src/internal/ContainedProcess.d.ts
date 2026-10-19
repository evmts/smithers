/** Scoped process execution for build-cli discovery and watch cycles.
 * @since 1.0.0-rc.0
 */
import { Cause, Effect } from "effect";
declare const ProcessError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => Cause.YieldableError & {
    readonly _tag: "smithers-build/ProcessError";
} & Readonly<A>;
/** A bounded process operation failed, with its original cause retained.
 * @category errors
 * @since 1.0.0-rc.0
 */
export declare class ProcessError extends ProcessError_base<{
    readonly code: "timed_out" | "cancelled" | "process_failed" | "output_limit" | "cleanup_failed";
    readonly message: string;
    readonly cause?: unknown;
}> {
    constructor(code: ProcessError["code"], message: string, cause?: unknown);
}
/** One bounded process invocation.
 * @category models
 * @since 1.0.0-rc.0
 */
export interface Options {
    readonly command: string;
    readonly args: ReadonlyArray<string>;
    readonly cwd: string;
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly timeoutMs?: number | undefined;
    readonly maxOutputBytes?: number | undefined;
    readonly fatalUtf8?: boolean | undefined;
    /** Written to the command's stdin, which is then closed; without it stdin is ignored. */
    readonly stdin?: string | undefined;
    readonly stdout: (text: string) => void;
    readonly stderr: (text: string) => void;
}
/** Executes a command and joins its owned process tree before releasing its scope.
 * @category execution
 * @since 1.0.0-rc.0
 */
export declare const runEffect: (options: Omit<Options, "signal">) => Effect.Effect<number, ProcessError>;
/** Promise boundary for command APIs that accept an AbortSignal.
 * @category execution
 * @since 1.0.0-rc.0
 */
export declare const run: (options: Options) => Promise<number>;
export {};
