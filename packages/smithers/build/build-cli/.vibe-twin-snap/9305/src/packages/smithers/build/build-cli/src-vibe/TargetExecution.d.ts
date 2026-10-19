/**
 * The shared runtime for executing a target declaration's own Effect body.
 *
 * Specialized rules may use native implementations, while every other target
 * settles through this exact stack.
 *
 * @since 0.1.0
 */
import type * as ExecSandbox from "@smthrs/targets/ExecSandbox";
import * as Target from "@smthrs/targets/Target";
import * as Effect from "effect/Effect";
import type * as OutputStream from "./OutputStream.js";
import type * as Planner from "./Planner.js";
/**
 * Executes one target body in a fresh in-memory Flow runtime.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const runTarget: (workspaceRoot: string, cacheDirectory: string, target: Target.AnyTarget, attrs: unknown, executionId: string, sensitiveEnv: ReadonlyArray<string>, packageName?: string | undefined, nixEnvironment?: Planner.PlannedEnvironment | undefined, sandbox?: ExecSandbox.Request | undefined, output?: OutputStream.Observer | undefined) => Effect.Effect<unknown, unknown, never>;
