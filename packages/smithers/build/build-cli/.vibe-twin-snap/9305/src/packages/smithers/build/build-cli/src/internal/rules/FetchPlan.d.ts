/**
 * Reduces a validated Fetch declaration to its complete execution contract.
 * @since 1.0.0
 */
import * as FetchTarget from "@smthrs/targets/Fetch";
import * as Target from "@smthrs/targets/Target";
import type * as Rule from "../RuleContract.ts";
/** The intrinsic network policy of the existing Fetch backend.
 * @category policies
 * @since 1.0.0
 */
export declare const sandbox: {
    readonly network: true;
};
/** Reduces schema-validated attrs without reading remote bytes or the filesystem.
 * Output validation is repeated at the actual package boundary.
 * @category planning
 * @since 1.0.0
 */
export declare const planAttrs: (options: {
    readonly packagePath: string;
    readonly attrs: FetchTarget.FetchAttrs;
}) => Rule.PlanResult<Rule.Fetch>;
/** Plans the schema-backed declaration at the package lowering boundary.
 * @category planning
 * @since 1.0.0
 */
export declare const plan: (options: {
    readonly packagePath: string;
    readonly target: Target.AnyTarget;
}) => Rule.PlanResult<Rule.Fetch>;
