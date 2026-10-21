import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import {
  type Cookie,
  LOW_ROLE_RETRY_MS,
  personOf,
  readJson,
  RENEW_BEFORE_MS,
  renewal,
  sessionCookieName,
  sessionState,
  writePrivate,
} from "./session"

const ORIGIN = "https://smithers.example.workers.dev"
const NOW = Date.UTC(2026, 9, 21, 12)
const DAY = 24 * 60 * 60 * 1000

const cookie = (fields: Partial<Cookie>): Cookie => ({
  name: "__Host-smithers_session",
  value: "signed",
  domain: "smithers.example.workers.dev",
  path: "/",
  expires: (NOW + 30 * DAY) / 1000,
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
  ...fields,
})

describe("the stored session", () => {
  it("is the app's own session cookie on the app's host, and nothing else: no GitHub cookie is ever kept", () => {
    const github = cookie({ name: "user_session", domain: "github.com" })
    const githubDotted = cookie({ name: "__Host-smithers_session", domain: ".github.com" })
    const otherApp = cookie({ domain: "other.example.workers.dev" })
    const signIn = cookie({ name: "__Host-smithers_sign_in" })
    const session = cookie({})
    expect(sessionState([github, githubDotted, otherApp, signIn, session], ORIGIN)).toEqual({ cookies: [session], origins: [] })
  })

  it("is the unprefixed cookie over plain http, as a local stack serves it", () => {
    expect(sessionCookieName("http://localhost:1338")).toBe("smithers_session")
    expect(sessionCookieName(ORIGIN)).toBe("__Host-smithers_session")
    const plain = cookie({ name: "smithers_session", domain: "localhost", secure: false })
    expect(sessionState([cookie({ domain: "localhost" }), plain], "http://localhost:1338")).toEqual({ cookies: [plain], origins: [] })
  })

  it("is missing when the browser holds no session for the app", () => {
    expect(sessionState([cookie({ name: "logged_in", domain: "github.com" })], ORIGIN)).toBeUndefined()
  })
})

describe("the session's person", () => {
  it("is the test account with its role", () => {
    expect(personOf({ signedIn: true, login: "codeplanesmithers", personId: "p1", role: "member" }, "codeplanesmithers")).toEqual({
      login: "codeplanesmithers",
      personId: "p1",
      role: "member",
    })
    expect(personOf({ signedIn: true, login: "codeplanesmithers", personId: "p1" }, "codeplanesmithers")).toMatchObject({ role: null })
  })

  it("is refused when signed out, someone else, or not a session answer", () => {
    expect(personOf({ signedIn: false }, "codeplanesmithers")).toEqual({ refused: "signed out" })
    expect(personOf({ signedIn: true, login: "willcory", personId: "p2", role: "admin" }, "codeplanesmithers")).toEqual({
      refused: "signed in as willcory, not the test account codeplanesmithers",
    })
    expect(personOf({ signedIn: true, personId: "p1" }, "codeplanesmithers")).toEqual({ refused: "the session answer has no login" })
    expect(personOf({ signedIn: true, login: "codeplanesmithers", personId: "p1", role: "owner" }, "codeplanesmithers")).toEqual({
      refused: "unknown role owner",
    })
  })
})

describe("renewal", () => {
  const state = { cookies: [cookie({})], origins: [] }
  const member = { login: "codeplanesmithers", personId: "p1", role: "member" as const }
  const guest = { ...member, role: "guest" as const }

  it("keeps a checked session of the test account that lasts past the next 3 days", () => {
    expect(renewal({ state, person: member, signedInAt: NOW - 20 * DAY, now: NOW, fresh: false })).toBeUndefined()
    expect(renewal({ state: { cookies: [cookie({ expires: -1 })], origins: [] }, person: member, signedInAt: NOW, now: NOW, fresh: false })).toBeUndefined()
  })

  it("signs in again with no session, a refused one, or one about to expire", () => {
    expect(renewal({ state: undefined, person: undefined, signedInAt: undefined, now: NOW, fresh: false })).toBe("no stored session")
    expect(renewal({ state: { cookies: [], origins: [] }, person: undefined, signedInAt: undefined, now: NOW, fresh: false })).toBe("no stored session")
    expect(renewal({ state, person: undefined, signedInAt: NOW, now: NOW, fresh: false })).toBe("the stored session wasn't checked")
    expect(renewal({ state, person: { refused: "signed out" }, signedInAt: NOW, now: NOW, fresh: false })).toBe("the stored session is refused: signed out")
    const soon = { cookies: [cookie({ expires: (NOW + RENEW_BEFORE_MS - 1) / 1000 })], origins: [] }
    expect(renewal({ state: soon, person: member, signedInAt: NOW, now: NOW, fresh: false })).toBe("the stored session expires within 3 days")
  })

  it("signs a Guest in again at most every 6 hours, since a raised role arrives only with a new sign-in", () => {
    expect(renewal({ state, person: guest, signedInAt: NOW - LOW_ROLE_RETRY_MS, now: NOW, fresh: false })).toBeUndefined()
    expect(renewal({ state, person: guest, signedInAt: NOW - LOW_ROLE_RETRY_MS - 1, now: NOW, fresh: false })).toBe(
      "the stored session's role is guest, read more than 6 hours ago",
    )
    expect(renewal({ state, person: { ...member, role: null }, signedInAt: undefined, now: NOW, fresh: false })).toBe(
      "the stored session's role is none, read more than 6 hours ago",
    )
  })

  it("always signs in again when E2E_FRESH_SIGN_IN asks", () => {
    expect(renewal({ state, person: member, signedInAt: NOW, now: NOW, fresh: true })).toBe("E2E_FRESH_SIGN_IN is set")
  })
})

describe("private files", () => {
  const root = mkdtempSync(join(tmpdir(), "e2e-session-"))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it("are readable by this user only, in a folder only this user can open, replaced whole", async () => {
    const path = join(root, "host", "session.json")
    await writePrivate(path, '{"cookies":[]}')
    await writePrivate(path, '{"cookies":[1]}')
    expect(readFileSync(path, "utf8")).toBe('{"cookies":[1]}')
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(statSync(join(root, "host")).mode & 0o777).toBe(0o700)
  })

  it("read back as JSON, or undefined when there is none; anything else unreadable fails", async () => {
    expect(await readJson(join(root, "none.json"))).toBeUndefined()
    writeFileSync(join(root, "a.json"), '{"a":1}')
    expect(await readJson(join(root, "a.json"))).toEqual({ a: 1 })
    writeFileSync(join(root, "broken.json"), "{")
    await expect(readJson(join(root, "broken.json"))).rejects.toThrow(SyntaxError)
    await expect(readJson(root)).rejects.toMatchObject({ code: "EISDIR" })
  })
})
