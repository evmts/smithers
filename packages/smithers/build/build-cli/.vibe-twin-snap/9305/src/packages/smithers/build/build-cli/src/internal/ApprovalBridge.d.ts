/**
 * Hands a parent's approval store to the build CLIs it launches.
 *
 * `smthrs watch` runs every cycle in a fresh standalone build CLI, and a
 * `Repo.Target` runs its child repository's target the same way. Those
 * processes have no approval store of their own, so an approved
 * `approval: "required"` target refused there. The parent serves its store on
 * a private local socket and names it, with a per-process token, in the child
 * environment; the child's store asks the parent and fails closed when the
 * answer is missing or malformed.
 *
 * @since 1.0.0
 */
import type { TargetApprovals } from "./PackageOptions.ts";
/**
 * The child environment variable naming the parent's store: `<token>@<socket>`.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const environmentName = "SMTHRS_APPROVALS_BRIDGE";
declare const ApprovalBridgeError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/ApprovalBridgeError";
} & Readonly<A>;
/**
 * The approval bridge could not carry a question or its answer; a child
 * treats it as an unreadable store and refuses.
 *
 * @category errors
 * @since 1.0.0
 */
export declare class ApprovalBridgeError extends ApprovalBridgeError_base<{
    readonly message: string;
}> {
}
/**
 * One served store: the environment a child needs to reach it.
 *
 * @category models
 * @since 1.0.0
 */
export interface Bridge {
    readonly environment: Readonly<Record<string, string>>;
    readonly close: () => Promise<void>;
}
/**
 * Serves `store` to child processes. Without a store the environment is empty,
 * so children keep refusing approval-required targets.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const serve: (store: TargetApprovals | undefined) => Promise<Bridge>;
/**
 * Serves `store` for the duration of `run`, which receives the child environment.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const withBridge: <A>(store: TargetApprovals | undefined, run: (environment: Readonly<Record<string, string>>) => Promise<A>) => Promise<A>;
/**
 * The store a child reaches through its parent, from the value of
 * {@link environmentName}; `undefined` when the parent served none.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const client: (value: string | undefined) => TargetApprovals | undefined;
export {};
