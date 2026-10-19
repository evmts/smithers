/**
 * PACKAGE.ts planning and execution facade.
 *
 * @since 0.1.0
 */
import type * as Executor from "./Executor.ts";
import type { PlanReport, RunOptions } from "./internal/PackageOptions.ts";
export type { CrateRow, ExecuteOptions, LaneData, Mode, PackageNode, PackagePlan, PackageVerb, PlanReport, RunOptions, TargetApprovalRequest, TargetApprovals, TestOperandPlan } from "./internal/PackageOptions.ts";
export { attended, closureResultDigest, graphKeySentinel, keyMaterialWithGraph, PACKAGE_EXECUTION_FORMAT, plan, takesExclusiveTreePermit, wildcardOmits, workspaceRootToken } from "./internal/PackagePlanner.ts";
export { execute } from "./internal/PackageRunner.ts";
/**
 * Plans and, unless `--plan` asked for the inert report, executes one
 * PACKAGE.ts invocation.
 *
 * The result follows the `plan` option: a literal `true` yields the
 * `PlanReport`, an omitted or literal `false` plan yields the executor
 * `Summary`, and only a runtime `boolean` keeps the union, so a caller that
 * already chose reads `Summary.ok` without an assertion.
 *
 * @category execution
 * @since 0.1.0
 */
export declare function run(options: RunOptions & {
    readonly plan: true;
}): Promise<PlanReport>;
export declare function run(options: RunOptions & {
    readonly plan?: false;
}): Promise<Executor.Summary>;
export declare function run(options: RunOptions): Promise<Executor.Summary | PlanReport>;
