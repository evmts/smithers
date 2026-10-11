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
 * No token or account id enters an error message, a log or a journal.
 *
 * @since 1.0.0
 * @private
 */

import { isRecord } from "@smthrs/canonical/Record"
import type * as Auth from "@smthrs/model/Auth"
import { ModelError } from "@smthrs/model/ModelError"
import * as ScopedProcess from "@smthrs/platform-node/ScopedProcess"
import { Clock, Effect, Semaphore, Stream } from "effect"
import { randomUUID } from "node:crypto"
import {
  accessSync,
  closeSync,
  constants,
  fsyncSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { codexEnvironment } from "../Agents.ts"
import * as Environment from "../Environment.ts"
import { packageVersion } from "../Version.ts"
import { errorCode } from "./ErrorCode.ts"

/** How long before its JWT `exp` an access token is treated as already stale. */
const expiryMarginMillis = 5 * 60_000

/** How long one refresh waits for another Smithers process to finish its own. */
const lockWaitMillis = 60_000

/** The age after which a lock left by a dead process is recoverable. */
const staleLockMillis = 5 * 60_000

/** The poll interval while another live process holds the refresh lock. */
const lockPollMillis = 25

/** How long the Codex CLI has to answer a refresh request. */
const refreshDeadlineMillis = 30_000

/**
 * Where the login lives for an environment: `$CODEX_HOME/auth.json`, and
 * `~/.codex/auth.json` when the variable is unset or empty, as Codex resolves
 * it. A different path would sign with a session Codex has rotated away.
 *
 * @since 1.0.0
 * @private
 */
export const locate = (
  environment: Environment.Source,
  homeDirectory: string = homedir()
): string => {
  const home = environment["CODEX_HOME"]
  return join(home === undefined || home === "" ? join(homeDirectory, ".codex") : home, "auth.json")
}

/**
 * The `codex` on `environment`'s `PATH`, or `undefined` when there is none.
 *
 * @since 1.0.0
 * @private
 */
export const executable = (environment: Environment.Source): string | undefined =>
  (Environment.read(environment, "PATH") ?? "").split(delimiter).filter((directory) => directory !== "")
    .map((directory) => join(directory, "codex")).find((file) => {
      try {
        accessSync(file, constants.X_OK)
        return true
      } catch {
        return false
      }
    })

/**
 * What one `auth.json` text holds for a model request: the access token and
 * the account id, or the reason it holds none. An API-key login has no token
 * set and cannot serve a subscription seat.
 *
 * @since 1.0.0
 * @private
 */
export type Parsed =
  | { readonly usable: true; readonly access: string; readonly accountId: string | undefined }
  | { readonly usable: false; readonly reason: "invalid-json" | "no-tokens" }

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined

/**
 * Reads the access token and account id out of the text of one `auth.json`.
 * Pure, and the one parser of the layout. The refresh token is not read.
 *
 * @since 1.0.0
 * @private
 */
export const parse = (text: string): Parsed => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { usable: false, reason: "invalid-json" }
  }
  const tokens = isRecord(parsed) && isRecord(parsed.tokens) ? parsed.tokens : undefined
  const access = tokens === undefined ? undefined : nonEmptyString(tokens.access_token)
  return tokens === undefined || access === undefined
    ? { usable: false, reason: "no-tokens" }
    : { usable: true, access, accountId: nonEmptyString(tokens.account_id) }
}

/**
 * Why a login file cannot serve a subscription seat, without its contents.
 *
 * @since 1.0.0
 * @private
 */
export const unusable = (file: string, text: string | undefined): string | undefined => {
  if (text === undefined) return `no ChatGPT login at ${file}`
  const parsed = parse(text)
  return parsed.usable
    ? undefined
    : parsed.reason === "invalid-json"
    ? `${file} is not valid JSON`
    : `${file} holds no ChatGPT login (an API-key login cannot serve this seat)`
}

const authenticationError = (message: string): ModelError => new ModelError({ code: "authentication", message })

/**
 * The access token's JWT expiry in epoch milliseconds, or `undefined` when its
 * payload cannot be read. An unreadable expiry is assumed valid: a 401
 * recovers from a wrong assumption, while assuming expired would ask for a
 * refresh on every request.
 */
const expiryMillis = (access: string): number | undefined => {
  const payload = access.split(".")[1]
  if (payload === undefined) return undefined
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    return isRecord(decoded) && typeof decoded.exp === "number" && Number.isFinite(decoded.exp)
      ? decoded.exp * 1000
      : undefined
  } catch {
    return undefined
  }
}

const isFresh = (access: string, now: number): boolean => {
  const expiry = expiryMillis(access)
  return expiry === undefined || now < expiry - expiryMarginMillis
}

/**
 * One login file as a model credential. Build one per file and share it across
 * every seat that signs with that file, so their refreshes are one flight.
 *
 * @since 1.0.0
 * @private
 */
export interface Store {
  readonly auth: Auth.Auth
}

/**
 * The login file, and how its owner is asked to refresh it. `refresh` rewrites
 * the file or fails; the store reads the file again after it returns. Both are
 * parameters so a test points at a scratch file and a scripted owner.
 *
 * @since 1.0.0
 * @private
 */
export interface MakeOptions {
  readonly file: string
  readonly refresh: Effect.Effect<void, ModelError>
}

interface Tokens {
  readonly access: string
  readonly accountId: string | undefined
}

/**
 * Builds the credential over one login file. See the module header for the
 * refresh rule.
 *
 * @since 1.0.0
 * @private
 */
export const make = (options: MakeOptions): Store => {
  const { file } = options
  const gate = Semaphore.makeUnsafe(1)
  const lockFile = `${file}.refresh.lock`
  // The token the last request was signed with: what a 401 was answered to.
  let signed: string | undefined

  const read: Effect.Effect<Tokens, ModelError> = Effect.suspend(() => {
    let text: string | undefined
    try {
      text = readFileSync(file, "utf8")
    } catch {
      text = undefined
    }
    const parsed = text === undefined ? undefined : parse(text)
    return parsed?.usable === true
      ? Effect.succeed({ access: parsed.access, accountId: parsed.accountId })
      : Effect.fail(authenticationError(`${unusable(file, text)}; sign in with \`codex login\``))
  })

  /** A lock is recoverable only when its recorded process is provably gone. */
  const lockOwnerAlive = (token: string): boolean => {
    const separator = token.indexOf(":")
    const pid = Number(token.slice(0, separator < 0 ? token.length : separator))
    if (!Number.isSafeInteger(pid) || pid <= 0) return false
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return errorCode(error) !== "ESRCH"
    }
  }

  /**
   * Takes the cross-process lock, waiting a bounded time for a live owner. A
   * directory that refuses the lock file yields no lock: the owner's refresh
   * then reports what is wrong with the directory.
   */
  const acquireLock: Effect.Effect<string | undefined, ModelError> = Effect.gen(function*() {
    const token = `${process.pid}:${randomUUID()}`
    const startedAt = yield* Clock.currentTimeMillis
    for (;;) {
      let descriptor: number | undefined
      try {
        descriptor = openSync(lockFile, "wx", 0o600)
        writeFileSync(descriptor, token, "utf8")
        fsyncSync(descriptor)
        closeSync(descriptor)
        return token
      } catch (error) {
        if (descriptor !== undefined) {
          try {
            closeSync(descriptor)
          } catch {
            // The failed write may already have closed it.
          }
          try {
            rmSync(lockFile, { force: true })
          } catch {
            // Nothing more to release.
          }
        }
        if (errorCode(error) !== "EEXIST") return undefined
      }
      const now = yield* Clock.currentTimeMillis
      try {
        const observed = readFileSync(lockFile, "utf8")
        if (now - statSync(lockFile).mtimeMs >= staleLockMillis && !lockOwnerAlive(observed)) {
          // Read the owner again just before removal, so an old observation
          // never deletes the lock that replaced it.
          if (readFileSync(lockFile, "utf8") === observed) {
            rmSync(lockFile, { force: true })
            continue
          }
        }
      } catch (error) {
        if (errorCode(error) === "ENOENT") continue
        return undefined
      }
      if (now - startedAt >= lockWaitMillis) {
        return yield* Effect.fail(
          authenticationError(`The Codex login at ${file} is busy refreshing; retry the request`)
        )
      }
      yield* Effect.sleep(`${lockPollMillis} millis`)
    }
  })

  /** Removes only the lock this acquisition created, never its replacement. */
  const releaseLock = (token: string | undefined): Effect.Effect<void> =>
    Effect.sync(() => {
      if (token === undefined) return
      try {
        if (readFileSync(lockFile, "utf8") === token) rmSync(lockFile, { force: true })
      } catch {
        // A stale-lock recovery may have replaced this lock; it is the new owner's.
      }
    })

  // The single flight. `stale` is the token the caller found wanting: near its
  // expiry, or answered with a 401. A different, fresh token in the file means
  // Codex or another entrant already refreshed, and nobody is asked again.
  const renew = (stale: string): Effect.Effect<Tokens, ModelError> =>
    gate.withPermits(1)(Effect.scoped(Effect.gen(function*() {
      yield* Effect.acquireRelease(acquireLock, releaseLock)
      const before = yield* read
      const now = yield* Clock.currentTimeMillis
      if (before.access !== stale && isFresh(before.access, now)) return before
      yield* options.refresh
      const after = yield* read
      return after.access === before.access
        ? yield* Effect.fail(
          authenticationError(`Codex did not refresh its login at ${file}; sign in again with \`codex login\``)
        )
        : after
    })))

  return {
    auth: {
      sign: Effect.fn("Auth.sign")((headers) =>
        Effect.gen(function*() {
          const found = yield* read
          const now = yield* Clock.currentTimeMillis
          const tokens = isFresh(found.access, now) ? found : yield* renew(found.access)
          signed = tokens.access
          return {
            ...headers,
            Authorization: `Bearer ${tokens.access}`,
            ...(tokens.accountId === undefined ? {} : { "chatgpt-account-id": tokens.accountId })
          }
        })
      ),
      refresh: Effect.gen(function*() {
        const stale = signed ?? (yield* read).access
        yield* renew(stale)
      }),
      credentialHeaders: ["Authorization", "chatgpt-account-id"]
    }
  }
}

const line = (message: unknown): string => `${JSON.stringify(message)}\n`

/** True when one app-server output line answers request `id`, as a result or an error. */
const answers = (text: string, id: number): boolean => {
  try {
    const message: unknown = JSON.parse(text)
    return isRecord(message) && message.id === id && ("result" in message || "error" in message)
  } catch {
    return false
  }
}

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
export const cliRefresh = (options: {
  readonly environment: Environment.Source
  readonly timeoutMs?: number | undefined
}): Effect.Effect<void, ModelError> =>
  Effect.suspend(() => {
    const command = executable(options.environment)
    if (command === undefined) {
      return Effect.fail(authenticationError(
        "The Codex login needs a refresh and Codex is not installed; install Codex, then run `codex login`"
      ))
    }
    const unanswered = authenticationError(
      "Codex could not refresh its login; update Codex, or sign in again with `codex login`"
    )
    const requests = new TextEncoder().encode(
      line({
        id: 0,
        method: "initialize",
        params: { clientInfo: { name: "smithers", title: "Smithers", version: packageVersion }, capabilities: null }
      }) +
        line({ method: "initialized" }) +
        line({ id: 1, method: "account/read", params: { refreshToken: true } })
    )
    return Effect.scoped(Effect.gen(function*() {
      // The contained spawner: closing this scope kills the CLI's whole process group.
      const child = yield* ScopedProcess.spawn({
        command,
        args: ["app-server", "--listen", "stdio://"],
        cwd: tmpdir(),
        env: codexEnvironment(options.environment),
        stdin: "pipe",
        killSignal: "SIGKILL",
        forceKillAfter: 0,
        windowsHide: true
      }).pipe(Effect.mapError(() => unanswered))
      // Standard input stays open until the scope closes: the server stops at end of input.
      yield* Effect.forkScoped(
        Effect.ignore(Stream.run(Stream.concat(Stream.make(requests), Stream.never), child.stdin))
      )
      yield* Effect.forkScoped(Effect.ignore(Stream.runDrain(child.stderr)))
      const answered = yield* child.stdout.pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.filter((text) => answers(text, 1)),
        Stream.runHead,
        Effect.mapError(() => unanswered)
      )
      if (answered._tag === "None") return yield* Effect.fail(unanswered)
    })).pipe(
      Effect.timeoutOrElse({
        duration: options.timeoutMs ?? refreshDeadlineMillis,
        orElse: () => Effect.fail(unanswered)
      })
    )
  })
