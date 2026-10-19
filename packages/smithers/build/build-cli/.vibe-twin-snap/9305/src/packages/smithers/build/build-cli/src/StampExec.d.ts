/**
 * Late stamp resolution. Values are deliberately read only immediately before spawn.
 *
 * @since 0.1.0
 */
import * as Stamp from "@smthrs/targets/Stamp";
/**
 * The `{smthrs:stamp:<payload>}` token spelling a planned argv carries, shared
 * with the declaration side that produced it.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const token: typeof Stamp.token;
/**
 * Substitutes every stamp token in a planned argv immediately before spawn.
 *
 * Resolution is late on purpose: `version`, `commit`, and `commitDate` read
 * the repository as it stands when the target runs, not as it stood when the
 * plan was built. An unrecognized stamp name and a corrupt token both fail the
 * target rather than resolving to empty text, because a binary stamped with
 * nothing is indistinguishable from one stamped correctly. The substitution
 * uses the function form of `String.prototype.replace`, so a `$&` or `$1` in a
 * git tag is inserted literally rather than expanded.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const resolveArgv: (root: string, argv: ReadonlyArray<string>) => Promise<Array<string>>;
/**
 * Every distinct stamp token in `texts`, in first-seen order.
 *
 * @category planning
 * @since 1.0.0
 */
export declare const tokensIn: (texts: ReadonlyArray<string>) => Array<string>;
/**
 * The public stamp name a token carries, or `undefined` for a literal or a
 * corrupt token.
 *
 * @category planning
 * @since 1.0.0
 */
export declare const nameOf: (token: string) => string | undefined;
/**
 * Resolves each token now and returns token to value. Pinning a stamp this
 * way (for an approved revision) replaces the late resolution at spawn.
 *
 * @category planning
 * @since 1.0.0
 */
export declare const resolveTokens: (root: string, tokens: ReadonlyArray<string>) => Promise<ReadonlyMap<string, string>>;
/**
 * Substitutes resolved token values into `text`; unknown tokens stay.
 *
 * @category planning
 * @since 1.0.0
 */
export declare const substitute: (text: string, values: ReadonlyMap<string, string>) => string;
