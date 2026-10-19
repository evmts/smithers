/**
 * The known-red list: targets already failing on the trunk, named with an
 * owner and an expiry, so an execution fails only on a target that turned red
 * since, including a different failure of the same target.
 *
 * A trunk that has been red for weeks gives no signal: every run fails, so a
 * new regression looks exactly like the old ones. Requiring the whole graph
 * green before anything can land stalls every change behind the slowest fix.
 * The list is the middle: a failure it names is still executed and still
 * reported, but it does not fail the command; any other failure does. An entry
 * past its expiry names nothing, so the list cannot become a permanent mute.
 *
 * The file is JSON:
 *
 * ```json
 * {
 *   "entries": [
 *     {
 *       "label": "//packages/example:test",
 *       "platforms": ["win32"],
 *       "owner": "will",
 *       "reason": "path separators in snapshot names",
 *       "issue": "https://github.com/smithersai/smithers/issues/1",
 *       "expires": "2026-10-09",
 *       "failureDigest": "sha256:253379cf8835d1a7559d89ddee8faa65e06dd0aa69c08f640385716e3cbd9ffd"
 *     }
 *   ]
 * }
 * ```
 *
 * `platforms` is optional and matches `process.platform`; omitted, the entry
 * applies on every platform. `issue` is required: a muted failure is tracked
 * work, so every entry names the issue that will clear it. `expires` is the
 * last day, in UTC, the entry holds. `failureDigest` binds the entry to the
 * complete reviewed diagnostic, normalized by {@link fingerprint}.
 *
 * @since 1.0.0
 */
import type * as Executor from "./Executor.js";
/**
 * One known-red target.
 *
 * @category models
 * @since 1.0.0
 */
export interface Entry {
    readonly label: string;
    readonly platforms?: ReadonlyArray<string> | undefined;
    readonly owner: string;
    readonly reason: string;
    readonly issue: string;
    readonly expires: string;
    readonly failureDigest: string;
}
/**
 * What applying the list to one execution found.
 *
 * `known` failed and is named by a live entry; `newlyRed` failed and is not;
 * `expired` names entries on this platform whose expiry has passed; `recovered`
 * names live entries whose target executed green, so the entry can go.
 * `unrun` names unlisted targets skipped because a dependency was red: an
 * entry excuses its own failure, never the consumers it kept from running.
 *
 * @category models
 * @since 1.0.0
 */
export interface Verdict {
    readonly source: string;
    readonly known: ReadonlyArray<string>;
    readonly newlyRed: ReadonlyArray<string>;
    readonly observed: ReadonlyArray<{
        readonly label: string;
        readonly failureDigest: string;
    }>;
    readonly unrun: ReadonlyArray<string>;
    readonly expired: ReadonlyArray<string>;
    readonly recovered: ReadonlyArray<string>;
    readonly advisory?: ReadonlyArray<string>;
}
/**
 * An execution summary judged against the list.
 *
 * @category models
 * @since 1.0.0
 */
export interface JudgedSummary extends Executor.Summary {
    readonly knownRed: Verdict;
}
declare const KnownRedError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/KnownRedError";
} & Readonly<A>;
/**
 * The file is missing, is not JSON, or an entry is malformed.
 *
 * @category errors
 * @since 1.0.0
 */
export declare class KnownRedError extends KnownRedError_base<{
    /** `unreadable` when the file could not be read, `invalid` when it is not a valid list. */
    readonly reason: "unreadable" | "invalid";
    readonly message: string;
}> {
    constructor(reason: "unreadable" | "invalid", message: string);
}
/**
 * SHA-256 of the complete reviewed failure diagnostic (normalization v1).
 *
 * Normalizes CRLF, ANSI controls, leading UTC ISO log timestamps, and
 * Smithers mkdtemp roots. JSON string values are normalized independently;
 * keys, array order, exit codes, filenames and other numbers remain intact.
 * Failed rows never match by substring, regular-expression or target alone.
 * Listed skipped dependents retain label-based excusal; they have no diagnostic.
 *
 * @category judging
 * @since 1.0.0
 */
export declare const fingerprint: (error: string) => string;
/**
 * Parses and validates the list's JSON text.
 *
 * @category parsing
 * @since 1.0.0
 */
export declare const parse: (source: string, content: string) => ReadonlyArray<Entry>;
/**
 * Reads and parses the list at `path`, resolved against `directory`.
 *
 * @category parsing
 * @since 1.0.0
 */
export declare const read: (directory: string, path: string) => Promise<{
    readonly source: string;
    readonly entries: ReadonlyArray<Entry>;
}>;
/**
 * Judges one execution against the list.
 *
 * `today` is a `YYYY-MM-DD` UTC date. The summary's `ok` is true when every
 * failure is named by a live entry for `platform` and no unlisted target was
 * skipped for a red dependency.
 *
 * @category judging
 * @since 1.0.0
 */
export declare const judge: (summary: Executor.Summary, list: {
    readonly source: string;
    readonly entries: ReadonlyArray<Entry>;
}, context: {
    readonly platform: string;
    readonly today: string;
    readonly advisory?: ReadonlySet<string>;
}) => JudgedSummary;
/**
 * The lines a person reads about the verdict, one per finding.
 *
 * @category rendering
 * @since 1.0.0
 */
export declare const describe: (verdict: Verdict) => ReadonlyArray<string>;
/**
 * Today's `YYYY-MM-DD` date in UTC.
 *
 * @category judging
 * @since 1.0.0
 */
export declare const today: (now?: Date) => string;
export {};
