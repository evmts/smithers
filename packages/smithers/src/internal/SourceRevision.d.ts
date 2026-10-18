/**
 * The revision a host's sources were read from.
 *
 * A plan card and a run's journal both carry where each node was declared —
 * a path and a line inside the workspace — and a reader opens that file to
 * see the code the node runs. The path alone does not say WHICH bytes: the
 * working tree moves under the host, and a file read after an edit or a
 * branch switch is a different file at the same address. This module answers
 * the missing half: an immutable name for the tree the host read its flows
 * out of, which a content route can be asked to serve by.
 *
 * Two version-control systems can answer it, and they are not equally able:
 *
 *   - `jj` commits the working copy on every command, so `@`'s commit id
 *     names the tree INCLUDING uncommitted work, and the id stays readable
 *     after the working copy has moved on. That is the whole answer.
 *   - `git` names only what was committed. A tree with any change — staged,
 *     unstaged or untracked, and a new flow file is untracked — is not
 *     described by `HEAD`, so a dirty git checkout answers NOTHING rather
 *     than a commit that does not hold the bytes that were loaded.
 *
 * Nothing here invents a revision. A host with neither tool, a tool that
 * fails, or a git tree that has moved answers `undefined`, which the readers
 * downstream state as an absent Code tab rather than a file they cannot
 * bind.
 *
 * @since 1.0.0
 */
import { Effect } from "effect";
/**
 * Runs one read-only command in `cwd` and answers its stdout, or nothing.
 *
 * Injected so the decision below is tested without a repository: every
 * branch of {@link read} is a different set of answers from this.
 *
 * @since 1.0.0
 * @category models
 */
export type Reader = (file: string, args: ReadonlyArray<string>, cwd: string) => Effect.Effect<string | undefined>;
/**
 * The object id in an answer, or nothing.
 *
 * Both tools print a 40-character hexadecimal id and nothing else under the
 * templates below. Anything else — a hint, an error the tool printed on
 * stdout, an empty answer — is refused rather than passed on as a ref that
 * would 404 at the far end with no explanation.
 *
 * @since 1.0.0
 * @category accessors
 */
export declare const objectId: (answer: string | undefined) => string | undefined;
/**
 * The default reader: the command's stdout on success, nothing on any
 * failure.
 *
 * `stderr` is drained without retaining it: `jj` prints hints and bookmark
 * warnings there on a healthy repository, and a missing binary, a directory
 * that is not a repository and a non-zero exit all refuse, which is the one
 * answer this module has for all of them.
 *
 * @since 1.0.0
 * @category constructors
 */
export declare const spawnReader: Reader;
/**
 * The revision the tree at `root` is at, or nothing.
 *
 * @since 1.0.0
 * @category accessors
 */
export declare const read: (root: string, reader?: Reader) => Effect.Effect<string | undefined>;
