/**
 * The local Codex login as a model credential: reading and refusing the
 * file's states, signing with the bearer and account id, and the refresh rule.
 * Smithers never writes `auth.json` and never spends its refresh token; it asks
 * the Codex CLI to refresh and reads the file again. Every token in these
 * fixtures is fabricated.
 */
import { ModelError } from "@smthrs/model/ModelError"
import { Deferred, Effect, Exit, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { spawn } from "node:child_process"
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import * as CodexLogin from "../src/internal/CodexLogin.ts"
import * as Telemetry from "../src/internal/Telemetry.ts"

/** A syntactically valid JWT whose payload carries only the given expiry. */
const jwt = (expiresAtSeconds: number, marker = "fake"): string =>
  `eyJhbGciOiJub25lIn0.${
    Buffer.from(JSON.stringify({ exp: expiresAtSeconds, marker })).toString("base64url")
  }.signature`

const hourSeconds = 3600
const freshJwt = (marker = "fresh") => jwt(Math.floor(Date.now() / 1000) + hourSeconds, marker)
const expiredJwt = () => jwt(Math.floor(Date.now() / 1000) - hourSeconds, "expired")

const authJson = (tokens: Record<string, unknown>, extra: Record<string, unknown> = {}): string =>
  `${
    JSON.stringify({
      OPENAI_API_KEY: null,
      auth_mode: "chatgpt",
      tokens,
      last_refresh: "2026-08-19T19:35:39.648449Z",
      ...extra
    })
  }\n`

const directories: Array<string> = []

const scratch = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "flows-codex-login-"))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    chmodSync(directory, 0o700)
    rmSync(directory, { recursive: true, force: true })
  }
})

const loginFile = (content: string): string => {
  const file = join(scratch(), "auth.json")
  writeFileSync(file, content, { mode: 0o600 })
  return file
}

const never = Effect.die(new Error("Codex was not expected to be asked for a refresh"))

/** The login's owner, scripted: counts its calls and rewrites the file as Codex would. */
const owner = (file: string, next: () => string | undefined) => {
  const state = { calls: 0 }
  const refresh = Effect.sync(() => {
    state.calls += 1
    const access = next()
    if (access !== undefined) {
      writeFileSync(
        file,
        authJson({ access_token: access, refresh_token: "rotated-by-codex", account_id: "acct-fake" })
      )
    }
  })
  return { state, refresh }
}

const sign = (file: string, refresh: Effect.Effect<void, ModelError> = never) =>
  Effect.runPromise(CodexLogin.make({ file, refresh }).auth.sign({}))

const signError = (file: string, refresh: Effect.Effect<void, ModelError> = never) =>
  Effect.runPromise(Effect.flip(CodexLogin.make({ file, refresh }).auth.sign({})))

describe("CodexLogin.locate", () => {
  it("resolves $CODEX_HOME/auth.json, defaulting to ~/.codex exactly as codex does", () => {
    expect(CodexLogin.locate({ CODEX_HOME: "/lane/codex-home" })).toBe("/lane/codex-home/auth.json")
    // An empty value is treated like an unset one, the resolver's convention.
    expect(CodexLogin.locate({ CODEX_HOME: "" })).toBe(CodexLogin.locate({}))
    expect(CodexLogin.locate({}, "/home/op")).toBe("/home/op/.codex/auth.json")
  })
})

describe("CodexLogin.parse", () => {
  it("reads the access token and account id and nothing else", () => {
    const parsed = CodexLogin.parse(authJson({
      id_token: "fake-id-token",
      access_token: "fake-access",
      refresh_token: "fake-refresh-token",
      account_id: "acct-fake-123"
    }))

    expect(parsed).toEqual({ usable: true, access: "fake-access", accountId: "acct-fake-123" })
    expect(JSON.stringify(parsed)).not.toContain("fake-refresh-token")
  })

  it.each([
    ["text that is not JSON", "fake-secret-soup{{{", "invalid-json"],
    ["an API-key login", JSON.stringify({ OPENAI_API_KEY: "sk-fake", auth_mode: "apikey" }), "no-tokens"],
    ["a JSON array", "[]", "no-tokens"],
    ["a token list", JSON.stringify({ tokens: [] }), "no-tokens"],
    ["an empty access token", JSON.stringify({ tokens: { access_token: "", refresh_token: "r" } }), "no-tokens"]
  ])("finds no login in %s", (_state, text, reason) => {
    expect(CodexLogin.parse(text)).toEqual({ usable: false, reason })
  })
})

describe("CodexLogin sign", () => {
  it("signs with the bearer and the account id without asking Codex for anything", async () => {
    const access = freshJwt()
    const file = loginFile(authJson({
      id_token: "fake-id-token",
      access_token: access,
      refresh_token: "fake-refresh-token",
      account_id: "acct-fake-123"
    }))

    expect(await sign(file)).toEqual({ Authorization: `Bearer ${access}`, "chatgpt-account-id": "acct-fake-123" })
  })

  it("names both signed headers as credentials for redaction", () => {
    expect(CodexLogin.make({ file: "/unused", refresh: never }).auth.credentialHeaders).toEqual([
      "Authorization",
      "chatgpt-account-id"
    ])
  })

  it("omits the account header when the login holds no account id", async () => {
    const access = freshJwt()
    const file = loginFile(authJson({ access_token: access, refresh_token: "fake-refresh-token" }))

    expect(await sign(file)).toEqual({ Authorization: `Bearer ${access}` })
  })

  it("reads the file on every request, so a token Codex rotated is used at once", async () => {
    const file = loginFile(authJson({ access_token: freshJwt("first"), refresh_token: "r" }))
    const store = CodexLogin.make({ file, refresh: never })
    const first = await Effect.runPromise(store.auth.sign({}))
    const rotated = freshJwt("rotated-by-codex")
    writeFileSync(file, authJson({ access_token: rotated, refresh_token: "r2" }))

    const second = await Effect.runPromise(store.auth.sign({}))

    expect(first.Authorization).not.toBe(second.Authorization)
    expect(second).toEqual({ Authorization: `Bearer ${rotated}` })
  })

  it("assumes an unreadable token payload is valid rather than asking for a refresh on every request", async () => {
    // A 401 recovers from a wrong assumption; assuming expired would ask every time.
    const file = loginFile(authJson({ access_token: "opaque-not-a-jwt", refresh_token: "fake-refresh-token" }))
    expect(await sign(file)).toEqual({ Authorization: "Bearer opaque-not-a-jwt" })

    const malformed = loginFile(authJson({ access_token: "header.!!!!.signature", refresh_token: "refresh" }))
    expect(await sign(malformed)).toEqual({ Authorization: "Bearer header.!!!!.signature" })
  })

  it("refuses a missing login by naming the file and the login command", async () => {
    const file = join(scratch(), "auth.json")

    const error = await signError(file)

    expect(error).toMatchObject({ code: "authentication" })
    expect(error.message).toContain(file)
    expect(error.message).toContain("codex login")
  })

  it("refuses a login that is not JSON without echoing its contents", async () => {
    const error = await signError(loginFile("fake-secret-soup{{{"))

    expect(error).toMatchObject({ code: "authentication" })
    expect(error.message).not.toContain("soup")
  })

  it("refuses an API-key login, which holds no ChatGPT token set", async () => {
    const error = await signError(loginFile(`${JSON.stringify({ OPENAI_API_KEY: "sk-fake", auth_mode: "apikey" })}\n`))

    expect(error).toMatchObject({ code: "authentication" })
    expect(error.message).toContain("an API-key login cannot serve this seat")
    expect(error.message).not.toContain("sk-fake")
  })
})

describe("CodexLogin refresh rule", () => {
  it("asks Codex to refresh a token near its expiry and signs with what Codex wrote", async () => {
    const rotated = freshJwt("rotated")
    // Four minutes left is inside the five-minute margin.
    const nearExpiry = jwt(Math.floor(Date.now() / 1000) + 4 * 60, "near-expiry")
    const file = loginFile(
      authJson({ access_token: nearExpiry, refresh_token: "fake-refresh-0", account_id: "acct-fake" })
    )
    const codex = owner(file, () => rotated)

    const headers = await sign(file, codex.refresh)

    expect(codex.state.calls).toBe(1)
    expect(headers).toEqual({ Authorization: `Bearer ${rotated}`, "chatgpt-account-id": "acct-fake" })
    // The only writer was the scripted owner, and no lock is left beside the login.
    expect(JSON.parse(readFileSync(file, "utf8")).tokens.refresh_token).toBe("rotated-by-codex")
    expect(readdirSync(join(file, ".."))).toEqual(["auth.json"])
  })

  it("leaves a token outside the expiry margin alone", async () => {
    const access = jwt(Math.floor(Date.now() / 1000) + 6 * 60, "six-minutes-left")
    const file = loginFile(authJson({ access_token: access, refresh_token: "fake-refresh-0" }))

    expect(await sign(file)).toEqual({ Authorization: `Bearer ${access}` })
  })

  it("never writes the login itself: a login Codex did not refresh fails typed and stays byte-identical", async () => {
    const file = loginFile(
      authJson({ access_token: expiredJwt(), refresh_token: "fake-refresh-0" }, { custom: "kept" })
    )
    const original = readFileSync(file, "utf8")
    const codex = owner(file, () => undefined)

    const error = await signError(file, codex.refresh)

    expect(codex.state.calls).toBe(1)
    expect(error).toMatchObject({ code: "authentication" })
    expect(error.message).toContain(file)
    expect(error.message).toContain("codex login")
    expect(error.message).not.toContain("fake-refresh-0")
    expect(readFileSync(file, "utf8")).toBe(original)
    expect(readdirSync(join(file, ".."))).toEqual(["auth.json"])
  })

  it("passes the owner's own typed failure through and releases the lock", async () => {
    const file = loginFile(authJson({ access_token: expiredJwt(), refresh_token: "fake-refresh-0" }))
    const failure = new ModelError({ code: "authentication", message: "Codex is not installed" })

    expect(await signError(file, Effect.fail(failure))).toBe(failure)
    expect(readdirSync(join(file, ".."))).toEqual(["auth.json"])
  })

  it("asks once across concurrent signs: the second entrant uses the token the first one's ask produced", async () => {
    const rotated = freshJwt("rotated")
    const file = loginFile(authJson({ access_token: expiredJwt(), refresh_token: "fake-refresh-0" }))
    const codex = owner(file, () => rotated)
    const auth = CodexLogin.make({ file, refresh: codex.refresh }).auth

    const [first, second] = await Effect.runPromise(
      Effect.all([auth.sign({}), auth.sign({})], { concurrency: "unbounded" })
    )

    expect(codex.state.calls).toBe(1)
    expect(first).toEqual({ Authorization: `Bearer ${rotated}`, "chatgpt-account-id": "acct-fake" })
    expect(second).toEqual(first)
  })

  it("after a 401 asks Codex even when the token still looks fresh, then signs with the new one", async () => {
    const rotated = freshJwt("rotated")
    const file = loginFile(authJson({ access_token: freshJwt("revoked"), refresh_token: "fake-refresh-0" }))
    const codex = owner(file, () => rotated)
    const auth = CodexLogin.make({ file, refresh: codex.refresh }).auth
    await Effect.runPromise(auth.sign({}))

    await Effect.runPromise(auth.refresh!)

    expect(codex.state.calls).toBe(1)
    expect(await Effect.runPromise(auth.sign({}))).toMatchObject({ Authorization: `Bearer ${rotated}` })
  })

  it("after a 401 does not ask when Codex already rotated the token that was refused", async () => {
    const file = loginFile(authJson({ access_token: freshJwt("refused"), refresh_token: "fake-refresh-0" }))
    const codex = owner(file, () => freshJwt("unexpected"))
    const auth = CodexLogin.make({ file, refresh: codex.refresh }).auth
    await Effect.runPromise(auth.sign({}))
    // Codex refreshed on its own between the request and its 401.
    const rotated = freshJwt("rotated-by-codex")
    writeFileSync(file, authJson({ access_token: rotated, refresh_token: "fake-refresh-1" }))

    await Effect.runPromise(auth.refresh!)

    expect(codex.state.calls).toBe(0)
    expect(await Effect.runPromise(auth.sign({}))).toEqual({ Authorization: `Bearer ${rotated}` })
  })

  it("after a 401 fails typed when Codex leaves the refused token in place", async () => {
    const file = loginFile(authJson({ access_token: freshJwt("revoked"), refresh_token: "fake-refresh-0" }))
    const codex = owner(file, () => undefined)
    const auth = CodexLogin.make({ file, refresh: codex.refresh }).auth
    await Effect.runPromise(auth.sign({}))

    const error = await Effect.runPromise(Effect.flip(auth.refresh!))

    expect(codex.state.calls).toBe(1)
    expect(error).toMatchObject({ code: "authentication" })
    expect(error.message).toContain("codex login")
  })

  it("serializes asks across distinct stores through the lock beside the login", async () => {
    const rotated = freshJwt("rotated")
    const file = loginFile(authJson({ access_token: expiredJwt(), refresh_token: "fake-refresh-0" }))

    const observed = await Effect.runPromise(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      let calls = 0
      const refresh = Effect.gen(function*() {
        calls += 1
        yield* Deferred.succeed(started, undefined)
        yield* Deferred.await(release)
        writeFileSync(file, authJson({ access_token: rotated, refresh_token: "rotated-by-codex" }))
      })
      const first = CodexLogin.make({ file, refresh }).auth
      const second = CodexLogin.make({ file, refresh }).auth
      const firstFiber = yield* Effect.forkChild(first.sign({}), { startImmediately: true })
      yield* Deferred.await(started)
      const held = readdirSync(join(file, ".."))
      const secondFiber = yield* Effect.forkChild(second.sign({}), { startImmediately: true })
      yield* Effect.sleep("50 millis")
      yield* Deferred.succeed(release, undefined)
      const headers = yield* Effect.all([Fiber.join(firstFiber), Fiber.join(secondFiber)])
      return { calls, headers, held }
    }))

    expect(observed.held).toEqual(["auth.json", "auth.json.refresh.lock"])
    expect(observed.calls).toBe(1)
    expect(observed.headers).toEqual([
      { Authorization: `Bearer ${rotated}` },
      { Authorization: `Bearer ${rotated}` }
    ])
    expect(readdirSync(join(file, ".."))).toEqual(["auth.json"])
  })

  it("recovers only an old lock whose owner is not live", async () => {
    const rotated = freshJwt("rotated")
    const file = loginFile(authJson({ access_token: expiredJwt(), refresh_token: "fake-refresh-0" }))
    const lock = `${file}.refresh.lock`
    writeFileSync(lock, "2147483647", { mode: 0o600 })
    utimesSync(lock, 0, 0)
    const codex = owner(file, () => rotated)

    await sign(file, codex.refresh)

    expect(codex.state.calls).toBe(1)
    expect(readdirSync(join(file, ".."))).toEqual(["auth.json"])
  })

  it("treats a non-positive stale-lock pid as dead without probing it", async () => {
    const rotated = freshJwt("rotated")
    const file = loginFile(authJson({ access_token: expiredJwt(), refresh_token: "fake-refresh-0" }))
    const lock = `${file}.refresh.lock`
    writeFileSync(lock, "0:invalid", { mode: 0o600 })
    utimesSync(lock, 0, 0)

    expect(await sign(file, owner(file, () => rotated).refresh)).toMatchObject({ Authorization: `Bearer ${rotated}` })
  })

  it("does not recover a stale lock while its recorded process is alive, and gives up after a minute", async () => {
    const file = loginFile(authJson({ access_token: jwt(0), refresh_token: "fake-refresh-0" }))
    const lock = `${file}.refresh.lock`
    writeFileSync(lock, `${process.pid}:live`, { mode: 0o600 })
    utimesSync(lock, 0, 0)
    const codex = owner(file, () => freshJwt())

    const exit = await Effect.runPromise(
      Effect.gen(function*() {
        yield* TestClock.setTime(10 * 60_000)
        const fiber = yield* Effect.forkChild(
          CodexLogin.make({ file, refresh: codex.refresh }).auth.sign({}),
          { startImmediately: true }
        )
        yield* Effect.yieldNow
        yield* TestClock.adjust("61 seconds")
        return yield* Effect.exit(Fiber.join(fiber))
      }).pipe(Effect.provide(TestClock.layer()))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    expect(codex.state.calls).toBe(0)
    // The live owner's lock is not this entrant's to remove.
    expect(readFileSync(lock, "utf8")).toBe(`${process.pid}:live`)
  })

  it("asks without a lock when the login's directory refuses one, so the owner's failure is what is reported", async () => {
    const directory = scratch()
    const file = join(directory, "auth.json")
    writeFileSync(file, authJson({ access_token: expiredJwt(), refresh_token: "fake-refresh-0" }), { mode: 0o600 })
    chmodSync(directory, 0o500)
    const codex = owner(file, () => undefined)

    const error = await signError(file, codex.refresh)

    expect(codex.state.calls).toBe(1)
    expect(error.message).toContain("Codex did not refresh its login")
  })
})

/** The resolutions one store reported, in order. */
const recorded = () => {
  const resolutions: Array<Telemetry.SignIn> = []
  return {
    resolutions,
    record: (resolution: Telemetry.SignIn) => Effect.sync(() => void resolutions.push(resolution))
  }
}

describe("CodexLogin timing", () => {
  it("records a fresh login as one read, with no wait and no refresh", async () => {
    const file = loginFile(authJson({ access_token: freshJwt(), refresh_token: "r", account_id: "acct-fake-123" }))
    const { record, resolutions } = recorded()

    await Effect.runPromise(
      CodexLogin.make({ file, refresh: never, record }).auth.sign({}).pipe(Effect.provide(TestClock.layer()))
    )

    expect(resolutions).toEqual([
      { trigger: "request", readMs: 0, lockWaitMs: 0, refreshed: false, totalMs: 0, ok: true }
    ])
  })

  it("records the wait under a lock another process holds, then the refresh it ran", async () => {
    const rotated = freshJwt("rotated")
    const file = loginFile(authJson({ access_token: jwt(0), refresh_token: "fake-refresh-0" }))
    const lock = `${file}.refresh.lock`
    // A live owner's fresh lock: this entrant can only wait for it.
    writeFileSync(lock, `${process.pid}:live`, { mode: 0o600 })
    const { record, resolutions } = recorded()
    const refresh = Effect.sleep("1500 millis").pipe(Effect.andThen(Effect.sync(() => {
      writeFileSync(file, authJson({ access_token: rotated, refresh_token: "rotated-by-codex" }))
    })))

    const headers = await Effect.runPromise(
      Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(
          CodexLogin.make({ file, refresh, record }).auth.sign({}),
          { startImmediately: true }
        )
        yield* Effect.yieldNow
        yield* TestClock.adjust("4 seconds")
        rmSync(lock)
        // The next poll takes the lock and asks; the owner answers 1.5 s later.
        yield* TestClock.adjust("25 millis")
        yield* TestClock.adjust("1500 millis")
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer()))
    )

    expect(headers).toEqual({ Authorization: `Bearer ${rotated}` })
    expect(resolutions).toEqual([{
      trigger: "request",
      readMs: 0,
      lockWaitMs: 4025,
      refreshed: true,
      refreshMs: 1500,
      refreshOutcome: "rotated",
      totalMs: 5525,
      ok: true
    }])
  })

  it("records the whole minute it waited for a lock that never freed", async () => {
    const file = loginFile(authJson({ access_token: jwt(0), refresh_token: "fake-refresh-0" }))
    writeFileSync(`${file}.refresh.lock`, `${process.pid}:live`, { mode: 0o600 })
    const { record, resolutions } = recorded()

    const exit = await Effect.runPromise(
      Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(
          CodexLogin.make({ file, refresh: never, record }).auth.sign({}),
          { startImmediately: true }
        )
        yield* Effect.yieldNow
        yield* TestClock.adjust("61 seconds")
        return yield* Effect.exit(Fiber.join(fiber))
      }).pipe(Effect.provide(TestClock.layer()))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    expect(resolutions).toEqual([
      { trigger: "request", readMs: 0, lockWaitMs: 60_000, refreshed: false, totalMs: 60_000, ok: false }
    ])
  })

  it("records the wait for this process's own flight without a second refresh", async () => {
    const rotated = freshJwt("rotated")
    const file = loginFile(authJson({ access_token: jwt(0), refresh_token: "fake-refresh-0" }))
    const { record, resolutions } = recorded()
    const refresh = Effect.sleep("2 seconds").pipe(Effect.andThen(Effect.sync(() => {
      writeFileSync(file, authJson({ access_token: rotated, refresh_token: "rotated-by-codex" }))
    })))
    const auth = CodexLogin.make({ file, refresh, record }).auth

    await Effect.runPromise(
      Effect.gen(function*() {
        const fibers = yield* Effect.forEach([0, 1], () => Effect.forkChild(auth.sign({}), { startImmediately: true }))
        yield* Effect.yieldNow
        yield* TestClock.adjust("2 seconds")
        yield* Effect.forEach(fibers, Fiber.join)
      }).pipe(Effect.provide(TestClock.layer()))
    )

    expect(resolutions).toEqual([
      expect.objectContaining({ lockWaitMs: 0, refreshed: true, refreshMs: 2000, refreshOutcome: "rotated", ok: true }),
      // The second entrant waited out the first one's ask and found the token rotated.
      { trigger: "request", readMs: 0, lockWaitMs: 2000, refreshed: false, totalMs: 2000, ok: true }
    ])
  })

  it.each([
    ["an owner that answers and leaves the token in place", Effect.sleep("300 millis"), "unchanged"],
    [
      "an owner that fails",
      Effect.sleep("300 millis").pipe(
        Effect.andThen(Effect.fail(new ModelError({ code: "authentication", message: "Codex is not installed" })))
      ),
      "failed"
    ]
  ])("records a refresh that did not rotate the login: %s", async (_state, refresh, refreshOutcome) => {
    const file = loginFile(authJson({ access_token: jwt(0), refresh_token: "fake-refresh-0" }))
    const { record, resolutions } = recorded()

    const exit = await Effect.runPromise(
      Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(
          CodexLogin.make({ file, refresh, record }).auth.sign({}),
          { startImmediately: true }
        )
        yield* Effect.yieldNow
        yield* TestClock.adjust("300 millis")
        return yield* Effect.exit(Fiber.join(fiber))
      }).pipe(Effect.provide(TestClock.layer()))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    expect(resolutions).toEqual([{
      trigger: "request",
      readMs: 0,
      lockWaitMs: 0,
      refreshed: true,
      refreshMs: 300,
      refreshOutcome,
      totalMs: 300,
      ok: false
    }])
  })

  it("records the refresh a 401 asks for as its own resolution", async () => {
    const rotated = freshJwt("rotated")
    const file = loginFile(authJson({ access_token: freshJwt("revoked"), refresh_token: "fake-refresh-0" }))
    const codex = owner(file, () => rotated)
    const { record, resolutions } = recorded()
    const auth = CodexLogin.make({ file, refresh: codex.refresh, record }).auth

    await Effect.runPromise(
      Effect.andThen(auth.sign({}), auth.refresh!).pipe(Effect.provide(TestClock.layer()))
    )

    expect(resolutions.map((resolution) => resolution.trigger)).toEqual(["request", "rejected"])
    expect(resolutions[1]).toEqual({
      trigger: "rejected",
      readMs: 0,
      lockWaitMs: 0,
      refreshed: true,
      refreshMs: 0,
      refreshOutcome: "rotated",
      totalMs: 0,
      ok: true
    })
  })

  it("records a login it cannot read as a failed resolution", async () => {
    const { record, resolutions } = recorded()

    await Effect.runPromise(
      Effect.flip(CodexLogin.make({ file: join(scratch(), "auth.json"), refresh: never, record }).auth.sign({})).pipe(
        Effect.provide(TestClock.layer())
      )
    )

    expect(resolutions).toEqual([
      { trigger: "request", readMs: 0, lockWaitMs: 0, refreshed: false, totalMs: 0, ok: false }
    ])
  })

  it("keeps the token, the account id and the login's path out of every record", async () => {
    const stale = jwt(0, "stale-marker")
    const issued: Array<string> = []
    const file = loginFile(
      authJson({ access_token: stale, refresh_token: "fake-refresh-0", account_id: "acct-fake-123" })
    )
    const codex = owner(file, () => issued[issued.push(freshJwt(`rotated-marker-${issued.length}`)) - 1])
    const { record, resolutions } = recorded()
    const auth = CodexLogin.make({ file, refresh: codex.refresh, record }).auth

    await Effect.runPromise(Effect.andThen(auth.sign({}), auth.refresh!))

    expect(resolutions).toHaveLength(2)
    const written = JSON.stringify(resolutions)
    for (const secret of [stale, ...issued, "fake-refresh-0", "rotated-by-codex", "acct-fake", join(file, "..")]) {
      expect(written).not.toContain(secret)
    }
    // Every field is one the record declares, and none is free text.
    for (const resolution of resolutions) {
      expect(Schema.decodeUnknownSync(Telemetry.SignIn, { onExcessProperty: "error" })(resolution)).toEqual(resolution)
    }
  })
})

/**
 * A `codex` whose `app-server` answers `account/read` the way the CLI does:
 * it records each request it was sent, and on `refreshToken: true` rewrites
 * `$CODEX_HOME/auth.json` itself.
 */
const fakeCodex = (script: string): string => {
  const directory = scratch()
  writeFileSync(join(directory, "codex"), `#!${process.execPath}\n${script}`, { mode: 0o755 })
  return directory
}

const appServer = (access: string) =>
  `const fs = require("node:fs"), path = require("node:path")
const here = path.dirname(process.argv[1])
fs.appendFileSync(path.join(here, "argv"), JSON.stringify(process.argv.slice(2)) + "\\n")
fs.appendFileSync(path.join(here, "environment"), JSON.stringify(Object.keys(process.env).sort()) + "\\n")
let buffered = ""
process.stdin.setEncoding("utf8").on("data", (chunk) => {
  buffered += chunk
  for (;;) {
    const end = buffered.indexOf("\\n")
    if (end < 0) break
    const message = JSON.parse(buffered.slice(0, end))
    buffered = buffered.slice(end + 1)
    fs.appendFileSync(path.join(here, "requests"), JSON.stringify(message) + "\\n")
    if (message.method === "initialize") process.stdout.write(JSON.stringify({ id: message.id, result: { userAgent: "fake" } }) + "\\n")
    if (message.method === "account/read") {
      process.stdout.write(JSON.stringify({ method: "account/updated", params: {} }) + "\\n")
      if (message.params.refreshToken === true) {
        const file = path.join(process.env.CODEX_HOME, "auth.json")
        const login = JSON.parse(fs.readFileSync(file, "utf8"))
        login.tokens.access_token = ${JSON.stringify(access)}
        login.tokens.refresh_token = "rotated-by-codex"
        fs.writeFileSync(file, JSON.stringify(login))
      }
      process.stdout.write(JSON.stringify({ id: message.id, result: { account: null, requiresOpenaiAuth: true } }) + "\\n")
    }
  }
})
`

const lines = (file: string): ReadonlyArray<unknown> =>
  readFileSync(file, "utf8").trim().split("\n").map((text) => JSON.parse(text))

describe("CodexLogin.cliRefresh", () => {
  it("has the Codex CLI refresh its own login over app-server, then stops it", async () => {
    const rotated = freshJwt("rotated")
    const bin = fakeCodex(appServer(rotated))
    const file = loginFile(
      authJson({ access_token: expiredJwt(), refresh_token: "fake-refresh-0", account_id: "acct" })
    )
    const environment = {
      PATH: bin,
      CODEX_HOME: join(file, ".."),
      HOME: join(file, ".."),
      OPENAI_API_KEY: "ambient-key",
      CODEX_API_KEY: "ambient-codex-key"
    }

    const headers = await sign(file, CodexLogin.cliRefresh({ environment }))

    expect(headers).toEqual({ Authorization: `Bearer ${rotated}`, "chatgpt-account-id": "acct" })
    expect(lines(join(bin, "argv"))).toEqual([["app-server", "--listen", "stdio://"]])
    expect(lines(join(bin, "requests"))).toEqual([
      {
        id: 0,
        method: "initialize",
        params: {
          clientInfo: { name: "smithers", title: "Smithers", version: expect.any(String) },
          capabilities: null
        }
      },
      { method: "initialized" },
      { id: 1, method: "account/read", params: { refreshToken: true } }
    ])
    // An ambient API key cannot stand in for the login the CLI refreshes.
    const [variables] = lines(join(bin, "environment")) as [ReadonlyArray<string>]
    expect(variables).toContain("CODEX_HOME")
    expect(variables).not.toContain("OPENAI_API_KEY")
    expect(variables).not.toContain("CODEX_API_KEY")
    // Codex wrote the login; Smithers left only that file behind.
    expect(JSON.parse(readFileSync(file, "utf8")).tokens.refresh_token).toBe("rotated-by-codex")
    expect(readdirSync(join(file, ".."))).toEqual(["auth.json"])
  })

  it("records the CLI's refresh with its duration and outcome, and nothing of the login", async () => {
    const rotated = freshJwt("rotated")
    const bin = fakeCodex(appServer(rotated))
    const file = loginFile(
      authJson({ access_token: expiredJwt(), refresh_token: "fake-refresh-0", account_id: "acct-fake-123" })
    )
    const { record, resolutions } = recorded()
    const environment = { PATH: bin, CODEX_HOME: join(file, ".."), HOME: join(file, "..") }

    await Effect.runPromise(
      CodexLogin.make({ file, refresh: CodexLogin.cliRefresh({ environment }), record }).auth.sign({})
    )

    expect(resolutions).toEqual([{
      trigger: "request",
      readMs: expect.any(Number),
      lockWaitMs: expect.any(Number),
      refreshed: true,
      refreshMs: expect.any(Number),
      refreshOutcome: "rotated",
      totalMs: expect.any(Number),
      ok: true
    }])
    // The stub is a real process: its ask is inside the whole, and nothing is negative.
    const [resolution] = resolutions
    expect(resolution!.refreshMs!).toBeGreaterThanOrEqual(0)
    expect(resolution!.totalMs).toBeGreaterThanOrEqual(resolution!.refreshMs! + resolution!.lockWaitMs)
    expect(JSON.stringify(resolutions)).not.toMatch(/acct-fake|rotated-by-codex|fake-refresh|eyJ/)
  })

  it("fails typed when Codex is not installed", async () => {
    const file = loginFile(authJson({ access_token: expiredJwt(), refresh_token: "fake-refresh-0" }))

    const error = await signError(file, CodexLogin.cliRefresh({ environment: { PATH: scratch() } }))

    expect(error).toMatchObject({ code: "authentication" })
    expect(error.message).toContain("install Codex")
    expect(error.message).toContain("codex login")
  })

  it.each([
    [
      "exits without answering, as a CLI with no app-server does",
      "process.stderr.write('unrecognized subcommand\\n'); process.exit(2)\n"
    ],
    [
      "answers a different request only",
      "process.stdout.write(JSON.stringify({ id: 0, result: {} }) + '\\n'); process.stdin.resume(); process.stdin.on('data', () => {}); setTimeout(() => process.exit(0), 150)\n"
    ],
    ["prints text that is not a protocol message", "process.stdout.write('not json\\n'); process.exit(0)\n"]
  ])("fails typed when the CLI %s", async (_state, script) => {
    const file = loginFile(authJson({ access_token: expiredJwt(), refresh_token: "fake-refresh-0" }))

    const error = await signError(file, CodexLogin.cliRefresh({ environment: { PATH: fakeCodex(script) } }))

    expect(error).toMatchObject({ code: "authentication" })
    expect(error.message).toContain("Codex could not refresh its login")
  })

  it("bounds a CLI that never answers and leaves no process behind", async () => {
    // A shell stub records its pid within milliseconds of the spawn; a Node
    // stub under a loaded machine can miss the deadline before its first line.
    const bin = scratch()
    writeFileSync(join(bin, "codex"), "#!/bin/sh\necho $$ > \"${0%/*}/pid\"\nexec /bin/sleep 600\n", { mode: 0o755 })
    const file = loginFile(authJson({ access_token: expiredJwt(), refresh_token: "fake-refresh-0" }))

    const error = await signError(file, CodexLogin.cliRefresh({ environment: { PATH: bin }, timeoutMs: 500 }))

    expect(error).toMatchObject({ code: "authentication" })
    const pid = Number(readFileSync(join(bin, "pid"), "utf8"))
    await expect.poll(() => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    }, { timeout: 5_000 }).toBe(false)
  })

  it("treats an error answer as answered: the file decides whether the login was refreshed", async () => {
    const bin = fakeCodex(
      "process.stdin.setEncoding('utf8').on('data', (chunk) => { if (chunk.includes('account/read')) process.stdout.write(JSON.stringify({ id: 1, error: { code: -32603, message: 'offline' } }) + '\\n') })\n"
    )
    const file = loginFile(authJson({ access_token: expiredJwt(), refresh_token: "fake-refresh-0" }))

    const error = await signError(file, CodexLogin.cliRefresh({ environment: { PATH: bin } }))

    expect(error.message).toContain("Codex did not refresh its login")
    expect(error.message).not.toContain("offline")
  })

  it("asks the CLI once across two real Smithers processes sharing one login", async () => {
    const rotated = freshJwt("rotated")
    const bin = fakeCodex(appServer(rotated))
    const file = loginFile(authJson({ access_token: expiredJwt(), refresh_token: "one-use-refresh" }))
    const child = fileURLToPath(new URL("./fixtures/codex-login-refresh-child.ts", import.meta.url))
    const childSign = (): Promise<Record<string, string>> =>
      new Promise((resolve, reject) => {
        const spawned = spawn(
          process.execPath,
          ["--no-warnings", "--experimental-strip-types", child, file, bin],
          { cwd: fileURLToPath(new URL("../../..", import.meta.url)) }
        )
        let stdout = ""
        let stderr = ""
        spawned.stdout.setEncoding("utf8").on("data", (chunk: string) => {
          stdout += chunk
        })
        spawned.stderr.setEncoding("utf8").on("data", (chunk: string) => {
          stderr += chunk
        })
        spawned.once("error", reject)
        spawned.once("close", (code) => {
          if (code !== 0) reject(new Error(`refresh child exited ${code}: ${stderr}`))
          else resolve(JSON.parse(stdout))
        })
      })

    const headers = await Promise.all([childSign(), childSign()])

    expect(headers).toEqual([{ Authorization: `Bearer ${rotated}` }, { Authorization: `Bearer ${rotated}` }])
    expect(lines(join(bin, "argv"))).toHaveLength(1)
    expect(readdirSync(join(file, ".."))).toEqual(["auth.json"])
  }, 30_000)
})
