/**
 * What a failure that carries no sentence still owes an operator.
 *
 * Every `@smthrs/control` failure is a `Schema.TaggedError` whose data lives in
 * named fields. Some override `message` with a sentence — `NoMatchingWait`
 * does, and says why: "every other renderer in the tree prints `message`, so a
 * refusal with none is a refusal with no reason". The rest have none, and the
 * executable's reporter printed the class name and a bare colon for them:
 * `smthrs resume` against a run another process owns answered the whole line
 * `ClaimLost: `, which names neither the run nor the stable `code` a script
 * must be able to grep for.
 *
 * It lives here rather than in `cli/LegacyBin.ts` because importing that module runs the
 * command line: the reporter itself can only be exercised through a real
 * process, and this is the part of it that has an answer to check.
 *
 * @since 1.0.0
 */
/**
 * One line of untrusted text made inert for a terminal: ANSI escape sequences
 * are removed, and every remaining control or format code point becomes a
 * space, so journaled model or cell text cannot move the cursor, clear the
 * screen, or set the window title.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const terminalSafe: (text: string) => string;
/**
 * Multi-line untrusted text made inert for a terminal: like `terminalSafe`,
 * but line feeds and tabs survive and a CRLF becomes a line feed.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const terminalSafeLines: (text: string) => string;
/**
 * Escape terminal controls JSON permits literally, preserving decoded data
 * and structural whitespace in JSON and JSONL documents.
 * @category formatting
 * @since 1.0.0
 */
export declare const terminalSafeJson: (text: string) => string;
/**
 * A structured value with every string made inert as `terminalSafeLines`
 * makes it, for formats that print strings as they are (toon, yaml, md).
 *
 * @category getters
 * @since 1.0.0
 */
export declare const terminalSafeValue: (value: unknown) => unknown;
/**
 * The most specific recorded cause, including older nested Error stacks.
 * @category getters
 * @since 1.0.0
 */
export declare const causeLine: (cause: string) => string;
/**
 * How much of one field a refusal line may spend, before the rest is cut.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const fieldValueLimit = 256;
/**
 * The refusal detail a failure's own fields state.
 *
 * The constant contract code leads, then every scalar field by name, each
 * bounded so one large field — an `InvalidInput` issue, say — cannot flood a
 * terminal. Structured fields are left out: a plan envelope is not a refusal
 * reason, and it is in the run's journal either way. An error carrying neither
 * a code nor a scalar field answers the empty string, which is what the
 * reporter printed for it before.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const fields: (error: Error) => string;
/**
 * The sentence an operator reads for one failure: its own, or its fields.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const sentence: (error: Error) => string;
/**
 * The sentence an operator reads for a failure nobody designed a sentence
 * for. It is `UNKNOWN_FAILURE.sentence` from `@smthrs/rpc/UserFailure`, which
 * this published package cannot depend on; `test/Failure.test.ts` keeps the
 * two equal.
 *
 * @category constants
 * @since 1.0.0-rc.1
 */
export declare const unknownSentence = "Something went wrong on our side. Not your fault.";
/**
 * Whether a thrown value is a tagged error: an `Error` with a string `_tag`,
 * which every `Schema.TaggedError` and `Data.TaggedError` is.
 *
 * @category refinements
 * @since 1.0.0-rc.1
 */
export declare const isTagged: (error: unknown) => error is Error & {
    readonly _tag: string;
};
/**
 * A usable own data tag, without invoking accessors on a thrown value.
 * @category getters
 * @since 1.0.0
 */
export declare const tagOf: (error: unknown) => string | undefined;
/**
 * Whether a thrown value carries a sentence someone wrote for an operator: a
 * tagged failure, or a plain `Error` this CLI threw on purpose. A runtime bug
 * (`TypeError` and friends), a Node system error, and a non-Error value do
 * not. The plain-`Error` allowance is transitional: those throws are being
 * converted to tagged refusals (#2813).
 *
 * @category refinements
 * @since 1.0.0-rc.1
 */
export declare const isDesigned: (error: unknown) => error is Error;
/**
 * The one sentence an operator reads for any thrown value: a designed
 * failure's own sentence, and `unknownSentence` for everything else. A raw
 * runtime message, a stack, or `String(error)` is never the sentence; it is
 * detail, printed only for `--verbose` through `operatorDetail`.
 *
 * @category getters
 * @since 1.0.0-rc.1
 */
export declare const operatorSentence: (error: unknown) => string;
/**
 * The name an operator reads for a failure: the last segment of a tagged
 * failure's `_tag` (`NoMatchingWait`, not `/control/NoMatchingWait`), or the
 * error's `name`.
 *
 * @category getters
 * @since 1.0.0-rc.1
 */
export declare const displayName: (error: Error) => string;
/**
 * The stderr line for a failure the CLI reports itself: `Name: sentence` for a
 * designed failure, `unknownSentence` otherwise, and the raw detail on the
 * following lines when `verbose` is set.
 *
 * @category getters
 * @since 1.0.0-rc.1
 */
export declare const operatorLine: (error: unknown, verbose: boolean) => string;
/**
 * The stderr text for a failure that ends the process: its operator sentence,
 * and for an undesigned failure under `verbose`, the redacted raw detail.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const operatorReport: (error: unknown, verbose: boolean) => string;
/**
 * The raw text behind a failure, for `--verbose` only: its stack and cause
 * chain, redacted and made inert for a terminal. Never throws.
 *
 * @category getters
 * @since 1.0.0-rc.1
 */
export declare const operatorDetail: (error: unknown) => string;
