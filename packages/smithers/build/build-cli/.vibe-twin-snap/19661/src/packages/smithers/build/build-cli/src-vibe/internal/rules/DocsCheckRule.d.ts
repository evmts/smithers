/**
 * A documentation stamp's paired planner and executor.
 *
 * @since 1.0.0
 */
import * as DocsCheck from "@smthrs/targets/DocsCheck";
import * as Input from "@smthrs/targets/Input";
import type * as Rule from "../RuleContract.js";
type Selection = Extract<Rule.Selection, {
    readonly rule: "Docs.Check";
}> & {
    readonly writeSet: ReadonlyArray<string>;
};
interface Request {
    readonly attrs: unknown;
    readonly packagePath: string;
    readonly docsFiles: (attrs: DocsCheck.Attrs) => ReadonlyArray<Input.FileDigest> | string;
}
/** Plans only the input closure and writes or judges its stamp.
 * @category execution
 * @since 1.0.0
 */
export declare const contract: Rule.Contract<Selection, Request, {
    readonly output?: unknown;
    readonly note?: string;
}>;
/** Narrows the scheduler's node at this rule's dispatch boundary.
 * @category guards
 * @since 1.0.0
 */
export declare const accepts: (node: Rule.PlannedRule) => node is Rule.Planned<Selection>;
export {};
