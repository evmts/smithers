/**
 * The attr-walking helper `PackageIndex` and `PackageExec` had copy-defined.
 *
 * Both modules read the same declaration objects and both must reach the same
 * answer: the index computes a target's declared edges from it, the executor
 * computes the same target's plan from it. Two copies drifting apart would let
 * the graph a run schedules disagree with the graph the index reports.
 *
 * @since 0.1.0
 */
import * as Target from "@smthrs/targets/Target";
/**
 * Every target reachable inside one attr value, in encounter order.
 *
 * The walk reads own data descriptors only and refuses a class instance, so a
 * declaration cannot run user code by being inspected. A cycle is bounded by
 * the visited set. A target reached twice through two paths appears twice;
 * callers that want each target once collect into a `Set`.
 *
 * @category attrs
 * @since 0.1.0
 */
export declare const collectTargets: (value: unknown) => ReadonlyArray<Target.AnyTarget>;
