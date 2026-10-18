/**
 * Cell validation at the boundary.
 *
 * A cell used to be parsed for the first time inside the realm that runs it, so
 * "this does not compile" arrived as a settled frame: one whole model turn
 * bought, spent, and answered with a syntax error. The r90 wave paid for nine
 * of them — `sympy__sympy-20154` emitted a 53 KB program that never ran and
 * then had it replayed back to it verbatim as input, `django__django-15987`
 * spent 59 % of the instance's whole bill on one dead cell, and
 * `sympy__sympy-18763` emitted the *same* syntax error twice in a row because
 * the first failure was invisible to it.
 *
 * Parsing is cheap and the controller can do it before it commits anything, so
 * it does: this module is the parse, and `CellTurn` answers what it finds
 * inside the same frame, at cached-prefix price, instead of ending the frame on
 * it.
 *
 * The same parse does one more thing: it normalizes the top-level statement
 * list so the persistent realm behaves like a notebook rather than like a script
 * that may only be run once. See {@link normalize}.
 *
 * Nothing here executes anything, and nothing here is a gate. The only outcome
 * it can produce is a rejection the model is asked to fix in this frame.
 *
 * @since 0.1.0
 */
import * as Cell from "./Cell.ts";
/**
 * What the boundary learned by parsing one cell.
 *
 * Exactly one of `rejected` and `compiled` is present: a cell either has a
 * program to run or a reason it does not.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type Validation = {
    readonly rejected: Cell.Rejected;
    readonly compiled: undefined;
} | {
    readonly rejected: undefined;
    readonly compiled: string;
};
/**
 * Rewrites a cell's top-level declarations so a persistent realm can re-run it.
 *
 * Raw persistence is not enough. Consecutive global evals in one QuickJS context
 * do share top-level `const`/`let` — they live in the realm's global lexical
 * scope, exactly like consecutive `<script>` tags — but that leaves a REPL three
 * measured edges: a later cell that reuses a name dies on
 * `SyntaxError: redeclaration of 'x'` with nothing run at all, a cell that
 * throws leaves every name below the throw permanently in TDZ — unreadable and
 * un-redeclarable for the rest of the run — and lexical names are invisible to
 * reflection, so no panel can enumerate them.
 *
 * All three are closed by one mechanical rewrite of the top-level statement list
 * only:
 *
 * - a top-level `const`/`let` variable statement becomes the same statement
 *   with the keyword `var`; destructuring patterns, initializers and multiple
 *   declarators are untouched, because only the keyword token moves;
 * - `let x;` with no initializer becomes `var x = undefined;`, so re-declaring
 *   a name really does clear it;
 * - a top-level `class K { … }` becomes `var K = class K { … };`;
 * - a top-level `function f() {}` is untouched, being already a redeclarable
 *   global;
 * - everything nested — function bodies, blocks, loop heads, class bodies — is
 *   untouched, so an inner `const` is still an inner `const` and a
 *   `for (const x of …)` head still scopes to its loop.
 *
 * The price is stated plainly: a top-level `const` is no longer read-only. That
 * is the same price every notebook pays. What it buys is that rebinding a name
 * is ordinary, a throw leaves no poison, and every live name is an own property
 * of `globalThis` — which is what makes the variables panel reflective instead
 * of parsed.
 *
 * @category conversions
 * @since 0.1.0
 */
export declare const normalize: (compiled: string) => string;
/**
 * Parses one cell and reports everything the parse can decide.
 *
 * It refuses a `return` the realm cannot compile, refuses a top-level
 * declaration of a name the realm owns, and normalizes the top-level
 * declarations the realm has to be able to re-run.
 *
 * @category conversions
 * @since 0.1.0
 * @slop
 */
export declare const validate: (cell: Cell.Source) => Validation;
