/**
 * Planning and execution of a single copied or literal file.
 *
 * @since 1.0.0
 */
import * as Target from "@smthrs/targets/Target";
import type * as Rule from "../RuleContract.ts";
type Selection = Extract<Rule.Selection, {
    readonly rule: "Copy" | "Literal";
}> & {
    readonly outFiles: readonly [string];
};
interface Request {
    readonly rule: "Copy" | "Literal";
    readonly attrs: unknown;
    readonly packagePath: string;
    readonly labelFor: (target: Target.AnyTarget) => string;
}
interface Context extends Rule.ExecutionContext {
    readonly nodes: ReadonlyMap<string, Rule.PlannedRule>;
}
/** The native file contract; artifact caching is owned by the coordinator.
 * @category execution
 * @since 1.0.0
 */
export declare const contract: Rule.Contract<Selection, Request, void, Context>;
/** Narrows the scheduler's node at this rule's dispatch boundary.
 * @category guards
 * @since 1.0.0
 */
export declare const accepts: (node: Rule.PlannedRule) => node is Rule.Planned<Selection>;
export {};
