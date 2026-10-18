/**
 * The language servers a native agent host binds, so `edit`, `write` and
 * `apply_patch` return the errors they leave and `bash` keeps the files a
 * server holds open current.
 *
 * Only host copies are bound: a server whose program, or the TypeScript it
 * would run, resolves inside the workspace is left out, because files an
 * agent wrote would then choose what the host executes. Each server starts on
 * the first file it serves, so a run that never touches one never spawns it.
 *
 * @since 1.0.0
 * @private
 */
import type * as ChildProcessSpawner from "@smthrs/kernel/ChildProcessSpawner";
import * as LanguageServer from "@smthrs/std/LanguageServer";
import * as NodeLanguageServer from "@smthrs/std/NodeLanguageServer";
import { Context, Effect, type Scope } from "effect";
/**
 * The files typescript-language-server answers for.
 *
 * @since 1.0.0
 * @private
 */
export declare const TYPESCRIPT_EXTENSIONS: ReadonlyArray<string>;
/**
 * How long an edit waits for typescript-language-server to publish. Measured
 * for #2884 with `@smthrs/std`'s `scripts/lsp-settle-bench.ts`: a change
 * was published after 360 to 520 ms in probes on a small project, and after
 * up to 2.35 s on this repository at load average 40 and above. A change that
 * leaves a file with no problems, which the server never publishes for, costs
 * this long.
 *
 * @since 1.0.0
 * @private
 */
export declare const TYPESCRIPT_SETTLE_MS = 3000;
/**
 * How long an edit waits after a publish for a later one. The server
 * publishes syntax errors before semantic ones on a file's first open, 110 to
 * 180 ms apart in the probes; under heavy load the gap passed this (up to
 * 1.4 s), and the answer is then the syntax errors alone.
 *
 * @since 1.0.0
 * @private
 */
export declare const TYPESCRIPT_QUIET_MS = 500;
/**
 * typescript-language-server from the host's `PATH`, pinned to the TypeScript
 * installed beside it, or `undefined` when either is missing or lies in the
 * workspace. Automatic type acquisition is off, so the server never runs npm.
 *
 * @since 1.0.0
 * @private
 */
export declare const typescript: (workspaceRoot: string, environment: Readonly<Record<string, string | undefined>>) => NodeLanguageServer.Config | undefined;
/**
 * The host's language servers for `workspaceRoot`, started lazily in the
 * current scope through the given spawner, or `undefined` when the host has
 * none.
 *
 * @since 1.0.0
 * @private
 */
export declare const make: (workspaceRoot: string, environment: Readonly<Record<string, string | undefined>>) => Effect.Effect<LanguageServer.LanguageServer | undefined, never, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope>;
/**
 * `services` with `server` bound, for the flows that keep it in step: the
 * file flows and `bash`.
 *
 * @since 1.0.0
 * @private
 */
export declare const bind: <S>(services: Context.Context<S>, server: LanguageServer.LanguageServer | undefined) => Context.Context<S>;
