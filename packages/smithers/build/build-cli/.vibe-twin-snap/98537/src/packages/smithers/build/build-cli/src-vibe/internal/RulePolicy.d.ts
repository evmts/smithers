/**
 * Package rule policy shared by planning, scheduling, and execution.
 *
 * @since 1.0.0
 */
import type { Mode, PlannedRule } from "./RuleContract.js";
interface Policy {
    readonly overlay?: boolean;
    readonly check?: boolean;
    readonly outward?: boolean;
    readonly attended?: boolean;
    readonly keyOnly?: boolean;
    readonly service?: boolean;
    readonly exclusive?: boolean;
    readonly writes?: boolean;
    readonly cache?: "always" | "read" | "execute" | "check" | "clean-repository";
}
/** Looks up a rule's intrinsic policy; unknown target bodies keep their declaration policy.
 * @category policies
 * @since 1.0.0
 */
export declare const of: (rule: string) => Policy;
/** Whether a native rule adds cacheability beyond its declaration.
 * Cargo builds keep their incremental tree; only checks replay a verdict.
 * @category policies
 * @since 1.0.0
 */
export declare const cacheable: (rule: string, mode: Mode, repositoryDirty: boolean | undefined) => boolean;
/** Capabilities implied by the rule, invocation mode, and sandbox.
 * @category policies
 * @since 1.0.0
 */
export declare const capabilities: (rule: string, mode: Mode, sandbox: PlannedRule["sandbox"]) => ReadonlyArray<string>;
export {};
