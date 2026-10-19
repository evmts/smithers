/**
 * Paired native rules selected once for both planning and execution.
 *
 * @since 1.0.0
 */
import type * as DocsCheck from "@smthrs/targets/DocsCheck";
import type * as Input from "@smthrs/targets/Input";
import type * as Target from "@smthrs/targets/Target";
import type * as Rule from "../RuleContract.ts";
interface Request {
    readonly rule: string;
    readonly target: Target.AnyTarget;
    readonly attrs: unknown;
    readonly packagePath: string;
    readonly labelFor: (target: Target.AnyTarget) => string;
    readonly docsFiles: (attrs: DocsCheck.Attrs) => ReadonlyArray<Input.FileDigest> | string;
}
interface Context extends Rule.ExecutionContext {
    readonly nodes: ReadonlyMap<string, Rule.PlannedRule>;
}
interface Result {
    readonly output?: unknown;
    readonly note?: string;
}
interface Entry {
    readonly plan: (request: Request) => Rule.PlanResult<Rule.Selection & Partial<Rule.SharedFields>>;
    readonly cache: "artifacts" | "result";
    readonly prepare: (node: Rule.PlannedRule, context: Context) => (signal?: AbortSignal) => Promise<Result>;
}
/** Resolves a paired rule. The coordinator owns cache replay and publication.
 * @category execution
 * @since 1.0.0
 */
export declare const get: (rule: string) => Entry | undefined;
export {};
