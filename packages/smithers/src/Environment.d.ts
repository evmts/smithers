/**
 * The environment contract of the `smthrs` command line.
 *
 * Backend and remote control commands share the Smithers login.
 *
 * @since 1.0.0
 */
/**
 * A canonical environment name read by the CLI.
 *
 * @category models
 * @since 1.0.0
 */
export interface Name {
    readonly name: string;
    readonly purpose: string;
}
/**
 * The CLI's public environment settings.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const names: ReadonlyArray<Name>;
/**
 * The environment shape this module reads. `process.env` satisfies it.
 *
 * @category models
 * @since 1.0.0
 */
export type Source = Readonly<Record<string, string | undefined>>;
/**
 * Reads the directory the process was started in by deliberate host choice.
 *
 * Using this gives up the project root resolved for an invocation. It belongs
 * only in explicit process-backed service defaults; project operations take
 * their configured root as an argument.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const ambientWorkingDirectory: () => string;
/**
 * Reads one canonical name.
 *
 * An empty value is treated exactly like an unset one, the convention every
 * credential variable in this CLI already follows: an exported-but-blank
 * variable is how a shell spells "not configured".
 *
 * @category getters
 * @since 1.0.0
 */
export declare const read: (environment: Source, name: string) => string | undefined;
/**
 * Reads one canonical name as a positive integer, ignoring anything else.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const readInteger: (environment: Source, name: string) => number | undefined;
/**
 * Reads one canonical name as a positive millisecond budget for a timer.
 *
 * It accepts what {@link readInteger} accepts and caps the result at
 * 2147483647 ms (about 24.8 days). Node fires a longer timer after 1 ms, so an
 * uncapped "wait a very long time" became an immediate timeout.
 *
 * @param environment - The variables to read, usually `process.env`.
 * @param name - The canonical variable name.
 * @returns The capped budget, or `undefined` when the value is unset, blank,
 * zero, or not all digits.
 * @category getters
 * @since 1.0.0
 */
export declare const readMilliseconds: (environment: Source, name: string) => number | undefined;
/**
 * The database-backend refusal sentence.
 *
 * The contract fixes the whole sentence, so this is a constant rather than a
 * template. An interpolated value cannot be asserted verbatim, and the two
 * clauses an interpolated version drops are the ones an operator needs: which
 * backends are unavailable, and what to do next. Repeating the value they
 * typed is neither.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const unsupportedBackendMessage: string;
/**
 * The database-backend refusal.
 *
 * `sqlite`, `postgres`, and an unset value are supported; every other
 * value names a backend that does not ship, and saying so is the whole
 * contract — a silent fallback to SQLite would run a project's flows against
 * a database it did not ask for.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const unsupportedBackend: (value: string | undefined) => string | undefined;
