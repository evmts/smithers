import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Cookie } from "@playwright/test"
import { OwnerSessionCookies, withOwnerAuthRetry, type OwnerSessionScope } from "./owner-session"
import { acquireAuthenticatedProfile, isWaitlistedOAuthReturn, parseAuthenticatedUser } from "./profile"

describe("matrix authenticated-user probe", () => {
  test("reads the canonical GET /api/user shape", () => {
    expect(parseAuthenticatedUser(200, { username: "owner", is_admin: true })).toEqual({
      login: "owner",
      admin: true
    })
    expect(parseAuthenticatedUser(200, { username: "member" })).toEqual({
      login: "member",
      admin: false
    })
  })

  test("treats canonical unauthorized as signed out and rejects old session bodies", () => {
    expect(parseAuthenticatedUser(401, undefined)).toBeUndefined()
    expect(() => parseAuthenticatedUser(200, { login: "legacy" } as never)).toThrow("unrecognized user body")
  })
})

const scope: OwnerSessionScope = {
  appOrigin: "http://127.0.0.1:4000/owner/repo", apiOrigin: "http://127.0.0.1:4000",
  username: "owner", password: "unit-test-password", bootstrapToken: "unit-bootstrap"
}
const cookies = (): Cookie[] => [{
  name: "session", value: "issued-session", domain: "127.0.0.1", path: "/",
  expires: -1, httpOnly: true, secure: false, sameSite: "Lax"
}]

describe("verified owner session cookies", () => {
  test("isolates browser-context copies and keeps only cookies", () => {
    const cache = new OwnerSessionCookies()
    const original = cookies()
    cache.remember(scope, original)
    original[0]!.value = "changed after save"
    const first = cache.read(scope)
    expect(first[0]!.value).toBe("issued-session")
    first[0]!.value = "changed by one context"
    expect(cache.read(scope)[0]!.value).toBe("issued-session")
    expect(cache.read({ ...scope, appOrigin: "http://127.0.0.1:4000/another/repo" })).toEqual(cookies())
  })

  test("never reuses another origin, owner, or credential envelope", () => {
    const cache = new OwnerSessionCookies()
    cache.remember(scope, cookies())
    for (const change of [
      { appOrigin: "http://127.0.0.1:4001" }, { apiOrigin: "http://127.0.0.1:4001" },
      { username: "another-owner" }, { password: "rotated-password" }, { bootstrapToken: "new-installation" }
    ]) expect(cache.read({ ...scope, ...change })).toEqual([])
  })

  test("forgets a rejected session without clearing a different owner", () => {
    const cache = new OwnerSessionCookies()
    const another = { ...scope, username: "another-owner" }
    cache.remember(scope, cookies())
    cache.remember(another, cookies())
    cache.forget(scope)
    expect(cache.read(scope)).toEqual([])
    expect(cache.read(another)).toEqual(cookies())
  })

  test("separate workers do not share mutable credential state", () => {
    const first = new OwnerSessionCookies(), second = new OwnerSessionCookies()
    first.remember(scope, cookies())
    expect(second.read(scope)).toEqual([])
  })
})

const timer = () => {
  let now = Date.UTC(2026, 0, 1)
  const waits: number[] = []
  return { now: () => now, wait: async (ms: number) => { waits.push(ms); now += ms }, waits }
}

describe("owner authentication Retry-After", () => {
  test("honors seconds and HTTP dates before retrying an actually rejected request", async () => {
    const time = timer()
    const replies = [
      { status: 429, retryAfter: "2" },
      { status: 429, retryAfter: new Date(time.now() + 5_000).toUTCString() },
      { status: 200, retryAfter: null, token: "issued-token" }
    ]
    const result = await withOwnerAuthRetry(async () => replies.shift()!, time)
    expect(result).toEqual({ status: 200, retryAfter: null, token: "issued-token" })
    expect(time.waits).toEqual([2_000, 3_000])
  })

  test("does not retry invalid credentials, server errors, or successful writes", async () => {
    for (const status of [200, 201, 401, 403, 500, 503]) {
      let calls = 0
      const time = timer()
      expect(await withOwnerAuthRetry(async () => { calls++; return { status, retryAfter: "1" } }, time))
        .toEqual({ status, retryAfter: "1" })
      expect(calls).toBe(1)
      expect(time.waits).toEqual([])
    }
  })

  test("leaves missing, invalid, stale, and over-budget retry headers as failures", async () => {
    for (const retryAfter of [null, "invalid", "-1", "61", "", "Thu, 01 Jan 1970 00:00:00 GMT"]) {
      const time = timer()
      expect((await withOwnerAuthRetry(async () => ({ status: 429, retryAfter }), time)).status).toBe(429)
      expect(time.waits).toEqual([])
    }
  })

  test("bounds repeated throttling and never spins on Retry-After zero", async () => {
    const time = timer()
    let calls = 0
    await withOwnerAuthRetry(async () => { calls++; return { status: 429, retryAfter: "0" } }, time)
    expect(calls).toBe(6)
    expect(time.waits).toEqual([1, 1, 1, 1, 1])
    const slow = timer()
    await withOwnerAuthRetry(async () => ({ status: 429, retryAfter: "40" }), slow)
    expect(slow.waits).toEqual([40_000])
  })
})


test("a deployed waitlist redirect remains an authentication failure on the initiating origin only", () => {
  expect(isWaitlistedOAuthReturn("https://product.invalid/?waitlist=1&position=7", "https://product.invalid")).toBe(true)
  expect(isWaitlistedOAuthReturn("https://product.invalid/owner/repo?signed-in=1", "https://product.invalid")).toBe(false)
  expect(isWaitlistedOAuthReturn("https://github.com/login?waitlist=1", "https://product.invalid")).toBe(false)
  expect(isWaitlistedOAuthReturn("https://other.invalid/?waitlist=1", "https://product.invalid")).toBe(false)
})


test("an atomic profile lease permits one contender and never removes a replaced ownership record", async () => {
  const folder = await mkdtemp(join(tmpdir(), "smithers-profile-lease-"))
  const environment = `SMITHERS_LEASE_TEST_${crypto.randomUUID().replaceAll("-", "_")}`
  process.env[environment] = folder
  const lock = `${folder}.smithers-real-e2e.lock`
  try {
    const results = await Promise.allSettled([acquireAuthenticatedProfile(environment), acquireAuthenticatedProfile(environment)])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1)
    const winner = results.find(result => result.status === "fulfilled")!
    if (winner.status !== "fulfilled") throw new Error("profile lease had no winner")
    expect((await stat(lock)).isFile()).toBe(true)
    await winner.value.lease.release()
    await expect(stat(lock)).rejects.toThrow()
    const acquired = await acquireAuthenticatedProfile(environment)
    const replacement = JSON.stringify({ pid: process.pid, nonce: "replacement-owned-by-another-contender" })
    await writeFile(lock, replacement)
    await expect(acquired.lease.release()).rejects.toThrow("ownership changed")
    expect(await readFile(lock, "utf8")).toBe(replacement)
    await writeFile(lock, "unreadable ownership")
    await expect(acquireAuthenticatedProfile(environment)).rejects.toThrow("stale or unreadable lock")
    expect(await readFile(lock, "utf8")).toBe("unreadable ownership")
  } finally {
    delete process.env[environment]
    await rm(lock, { force: true })
    await rm(folder, { recursive: true, force: true })
  }
})
