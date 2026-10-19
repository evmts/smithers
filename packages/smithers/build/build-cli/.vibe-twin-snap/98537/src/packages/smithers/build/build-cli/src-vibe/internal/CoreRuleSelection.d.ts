/**
 * Adapts the core rules still planned in PackageExec to the rule contract.
 * Native lane rules must be selected where their payload is constructed.
 *
 * @since 1.0.0
 */
import type * as Rule from "./RuleContract.js";
/** Narrows an already resolved command at the planner boundary.
 * @category planning
 * @since 1.0.0
 */
export declare const argvOf: (argv: ReadonlyArray<string> | undefined) => Rule.Argv | undefined;
/** Selects only the core rules whose payload remains in shared node fields.
 * A missing executable leaves a refusal for the centralized planner to report.
 * Unknown declaration names use the explicit body boundary; native names cannot.
 * @category planning
 * @since 1.0.0
 */
export declare const select: (rule: string, command: ReadonlyArray<string> | undefined) => Rule.Selection | undefined;
