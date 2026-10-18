/**
 * Where a `smthrs` invocation decides it is running.
 *
 * Every command that touches durable state resolves the same project root the
 * same way, because 0.x's most reported operational surprise was two commands
 * in one repository disagreeing about which database they meant (`smthrs up`
 * from a subdirectory writing a second store). The rule:
 *
 * 1. an explicit `--root`, resolved against the invocation directory;
 * 2. otherwise the nearest ancestor that anchors a project (see
 *    {@link anchors});
 * 3. otherwise the invocation directory itself.
 *
 * The same module answers the 0.x state question: is there
 * Smithers 0.x state beside this project? rc.0 never loads it, and the
 * detector exists so the CLI can say so once instead of failing obscurely.
 *
 * @since 1.0.0
 */
import { Context, Layer } from "effect";
import * as Environment from "./Environment.ts";
/**
 * Directory and file names that mark a Smithers 0.x project.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const legacyMarkers: ReadonlyArray<string>;
/**
 * Resolves the project root for one invocation.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const root: (explicit: string | undefined, cwd: string, exists?: (path: string) => boolean) => string;
/**
 * Resolves the 0.x project one `smthrs migrate` invocation converts.
 *
 * This is deliberately not {@link root}. That walk anchors on `.flows/`, which
 * only an rc.0 project has, so a 0.x project without a `.git`/`.jj` marker of
 * its own resolved to whatever rc.0 project happened to sit above it and
 * `migrate --apply` rewrote the ancestor's tree. The project being migrated is
 * the one holding 0.x state, so the walk anchors on {@link legacyMarkers} and
 * falls back to the invocation directory. `--root` still wins, and so does the
 * verb's own path argument.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const legacyRoot: (explicit: string | undefined, cwd: string, exists?: (path: string) => boolean) => string;
/**
 * Where this project keeps rc.0 state.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const stateDirectory: (projectRoot: string) => string;
/**
 * Where a detached run writes its log.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const logDirectory: (projectRoot: string) => string;
/**
 * Where a detached run with this id writes its log.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const logFile: (projectRoot: string, runId: string) => string;
/**
 * Where a project's flow sources live: `<root>/.smithers/flows`, from
 * `Descriptor.projectFlowsDirectory`.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const flowsDirectory: (projectRoot: string) => string;
/**
 * Every 0.x run database beside a project, newest ancestor first.
 *
 * Unlike {@link legacyState} this does not stop at a directory that holds
 * `.flows/`. The informational notice is gated only on
 * "no `.flows/` beside it"; the refusal that `smthrs migrate` and the
 * database listing that `smthrs doctor` perform are not gated, and they
 * must not be: the project an operator actually migrates is one that has
 * already run an rc.0 command, so it already has `.flows/`, and gating the
 * refusal there would answer "nothing to finish" for every real migration.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const legacyDatabases: (cwd: string, exists?: (path: string) => boolean) => ReadonlyArray<string>;
/**
 * Smithers 0.x state found beside a project, newest ancestor first.
 *
 * A directory that already holds `.flows/` is an rc.0 project and reports
 * nothing: a repository mid-migration would otherwise print the notice on
 * every command forever.
 *
 * A `.smithers` directory containing only the project's `flows/` and `wiki/`, current
 * build definitions, what a directory-serving host keeps there, or any of them
 * together, is also excluded. Unknown files, other subdirectories and
 * unreadable metadata remain legacy markers.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const legacyState: (cwd: string, exists?: (path: string) => boolean) => ReadonlyArray<string>;
/**
 * The one-line notice written to stderr when 0.x state
 * is found and 1.0 state is not.
 *
 * It names the running version from the package manifest, never a literal a
 * release can leave behind, and the command a project that ran `npx smthrs`
 * has: `smthrs migrate`. `smithers-migrate` is `@smthrs/migrate`'s own bin,
 * which that project's PATH does not hold.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const legacyNotice: (path: string) => string;
/**
 * The project root this invocation resolved, as a service.
 *
 * Commands read it from here rather than calling {@link root} again, so the
 * root a handler acts on is provably the same one the durable layers were
 * built over. `--root` is parsed before the layers are constructed, which is
 * why it cannot simply be a flag every handler reads.
 *
 * @category references
 * @since 1.0.0
 */
export declare const ProjectRoot: Context.Reference<string>;
/**
 * The Smithers 0.x state found beside this project when the invocation
 * started, as a service.
 *
 * @category references
 * @since 1.0.0
 */
export declare const LegacyState: Context.Reference<ReadonlyArray<string>>;
/**
 * The 0.x project `smthrs migrate` converts when no path is given, as a
 * service.
 *
 * Separate from {@link ProjectRoot} because the two answer different
 * questions: the durable layers are built over the rc.0 project, and the
 * migration reads the 0.x project the operator is standing in.
 *
 * @category references
 * @since 1.0.0
 */
export declare const MigrationRoot: Context.Reference<string>;
/**
 * Provides the resolved project root, and the 0.x state found beside it.
 *
 * The 0.x sample is taken here, in an ordinary function call, rather than in
 * the handler that reports it. {@link legacyState} treats a `.flows/`
 * directory as proof the project already moved on, and opening the control
 * database creates `<root>/.flows`. A handler-time sample therefore inspected
 * a directory the same invocation had just written, and the runtime
 * the 0.x-project guard notice printed on no project it was written for. This function
 * runs while the layers are still being described, before any of them is
 * built, so the sample is of the directory as the operator left it.
 *
 * @category layers
 * @since 1.0.0
 */
export declare const layer: (projectRoot: string, migrationRoot: string) => Layer.Layer<never>;
/**
 * Refuses an inaccessible project before a command creates durable state.
 * @category validation
 * @since 1.0.0
 */
export declare const assertRoot: (projectRoot: string) => void;
/**
 * Resolves and validates a local-only invocation using the canonical environment rules.
 * @category constructors
 * @since 1.0.0
 */
export declare const localRoot: (options: {
    readonly root?: string | undefined;
    readonly remote?: string | undefined;
}, environment: Environment.Source) => string;
