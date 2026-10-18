/**
 * The local Codex login as the credential of a ChatGPT-subscription seat.
 *
 * `codex login` writes `$CODEX_HOME/auth.json` (`~/.codex/auth.json` by
 * default), and the Codex CLI is that file's only writer. This module reads the
 * access token and the account id from it to sign a model request. It never
 * writes the file, never reads its refresh token, and never calls the token
 * endpoint.
 *
 * `sign` reads the file on every request, so a token Codex rotated is picked
 * up at once. When the access token is within five minutes of its expiry, or
 * the backend answers 401, the store asks the login's owner to refresh it
 * ({@link cliRefresh}: the Codex CLI's own `account/read` with
 * `refreshToken`) and reads the file again. A login the owner did not refresh
 * fails typed, naming the file and `codex login`.
 *
 * One refresh is asked for at a time: a permit within this process, and a lock
 * file beside the login across Smithers processes. Each entrant reads the file
 * again before asking, so a token that Codex or another process has already
 * rotated is used as it is.
 *
 * No token or account id enters an error message, a log or a journal. What a
 * resolution cost is reported to {@link MakeOptions.record}: its reads of the
 * file, its wait for the refresh flight, and the refresh it ran.
 *
 * @since 1.0.0
 * @private
 */
import type * as Auth from "@smthrs/model/Auth";
import { ModelError } from "@smthrs/model/ModelError";
import { Effect } from "effect";
import * as Environment from "../Environment.ts";
import type * as Telemetry from "./Telemetry.ts";
/**
 * Where the login lives for an environment: `$CODEX_HOME/auth.json`, and
 * `~/.codex/auth.json` when the variable is unset or empty, as Codex resolves
 * it. A different path would sign with a session Codex has rotated away.
 *
 * @since 1.0.0
 * @private
 */
export declare const locate: (environment: Environment.Source, homeDirectory?: string) => string;
/**
 * The `codex` on `environment`'s `PATH`, or `undefined` when there is none.
 *
 * @since 1.0.0
 * @private
 */
export declare const executable: (environment: Environment.Source) => string | undefined;
/**
 * What one `auth.json` text holds for a model request: the access token and
 * the account id, or the reason it holds none. An API-key login has no token
 * set and cannot serve a subscription seat.
 *
 * @since 1.0.0
 * @private
 */
export type Parsed = {
    readonly usable: true;
    readonly access: string;
    readonly accountId: string | undefined;
} | {
    readonly usable: false;
    readonly reason: "invalid-json" | "no-tokens";
};
/**
 * Reads the access token and account id out of the text of one `auth.json`.
 * Pure, and the one parser of the layout. The refresh token is not read.
 *
 * @since 1.0.0
 * @private
 */
export declare const parse: (text: string) => Parsed;
/**
 * Why a login file cannot serve a subscription seat, without its contents.
 *
 * @since 1.0.0
 * @private
 */
export declare const unusable: (file: string, text: string | undefined) => string | undefined;
/**
 * One login file as a model credential. Build one per file and share it across
 * every seat that signs with that file, so their refreshes are one flight.
 *
 * @since 1.0.0
 * @private
 */
export interface Store {
    readonly auth: Auth.Auth;
}
/**
 * The login file, and how its owner is asked to refresh it. `refresh` rewrites
 * the file or fails; the store reads the file again after it returns. Both are
 * parameters so a test points at a scratch file and a scripted owner.
 *
 * `record` receives what each resolution cost, once it has ended either way.
 *
 * @since 1.0.0
 * @private
 */
export interface MakeOptions {
    readonly file: string;
    readonly refresh: Effect.Effect<void, ModelError>;
    readonly record?: ((resolution: Telemetry.SignIn) => Effect.Effect<void>) | undefined;
}
/**
 * Builds the credential over one login file. See the module header for the
 * refresh rule.
 *
 * @since 1.0.0
 * @private
 */
export declare const make: (options: MakeOptions) => Store;
/**
 * Asks the Codex CLI to refresh its own login: one `codex app-server` over
 * stdio, `initialize`, then `account/read` with `refreshToken: true`, which
 * runs Codex's refresh-token flow and has Codex rewrite `auth.json`
 * (codex-cli 0.160, probed 2026-10-12; `codex login status` does not refresh).
 * The process is stopped once that request is answered.
 *
 * API credentials are kept out of the CLI's environment, so an ambient key
 * cannot stand in for the login. The answer itself is not read: the caller
 * reads the file Codex wrote.
 *
 * @since 1.0.0
 * @private
 */
export declare const cliRefresh: (options: {
    readonly environment: Environment.Source;
    readonly timeoutMs?: number | undefined;
}) => Effect.Effect<void, ModelError>;
