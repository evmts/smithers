import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import {
  appURLOf,
  describeBroken,
  describeNeed,
  guard,
  KNOWN_BROKEN,
  NEEDS,
  type NeedName,
  onThisMachine,
  parseDescription,
  readIdentity,
  type Run,
  sessionFiles,
  targetOf,
  UndeclaredNeed,
} from "./target"

const local: Run = { target: "local", role: () => "admin" }
const deployedAs = (role: ReturnType<Run["role"]>): Run => ({ target: "deployment", role: () => role })

describe("the target", () => {
  it("is local without BASE_URL, and for this machine's dev server on any port, over https or http", () => {
    expect(targetOf({})).toBe("local")
    expect(targetOf({ BASE_URL: "https://localhost:1443" })).toBe("local")
    expect(targetOf({ BASE_URL: "http://127.0.0.1:1338/" })).toBe("local")
  })

  it("is a deployment for any other host, and E2E_TARGET overrides the URL either way", () => {
    expect(targetOf({ BASE_URL: "https://smithers.example.workers.dev" })).toBe("deployment")
    expect(targetOf({ BASE_URL: "https://localhost.example.com" })).toBe("deployment")
    expect(targetOf({ BASE_URL: "http://localhost:1338", E2E_TARGET: "deployment" })).toBe("deployment")
    expect(targetOf({ BASE_URL: "https://smithers.example.workers.dev", E2E_TARGET: "local" })).toBe("local")
    expect(targetOf({ E2E_TARGET: "" })).toBe("local")
  })

  it("ignores a BASE_URL that isn't an http(s) URL, such as the \"/\" Vite gives vitest", () => {
    expect(targetOf({ BASE_URL: "/" })).toBe("local")
    expect(appURLOf({ BASE_URL: "/" })).toBeUndefined()
    expect(appURLOf({ BASE_URL: "https://smithers.example.workers.dev" })).toBe("https://smithers.example.workers.dev")
  })

  it("refuses an E2E_TARGET it doesn't know", () => {
    expect(() => targetOf({ E2E_TARGET: "prod" })).toThrow('E2E_TARGET is "prod": it must be local or deployment')
  })

  it("trusts a self-signed certificate only on this machine", () => {
    expect(onThisMachine("https://localhost:1443")).toBe(true)
    expect(onThisMachine("https://127.0.0.1")).toBe(true)
    expect(onThisMachine("https://localhostile.dev")).toBe(false)
    expect(onThisMachine("https://smithers.example.workers.dev")).toBe(false)
  })
})

describe("needs", () => {
  it("are all met locally, where local development's Admin is signed in, but GitHub sign-in", () => {
    const unmet = (Object.keys(NEEDS) as Array<NeedName>).filter((name) => !NEEDS[name].met(local))
    expect(unmet).toEqual(["githubSignIn"])
  })

  it("in a deployment, leave out every dev-only need, and meet a role need by the account's role", () => {
    const met = (role: ReturnType<Run["role"]>) => (Object.keys(NEEDS) as Array<NeedName>).filter((name) => NEEDS[name].met(deployedAs(role)))
    expect(met("guest")).toEqual(["githubSignIn"])
    expect(met(null)).toEqual(["githubSignIn"])
    expect(met("member")).toEqual(["githubSignIn", "member"])
    expect(met("maintainer")).toEqual(["githubSignIn", "member", "maintainer"])
    expect(met("admin")).toEqual(["githubSignIn", "member", "maintainer"])
  })

  it("read the role only when a role need asks, so a dev-only need never needs the setup", () => {
    const run: Run = { target: "deployment", role: () => { throw new Error("no identity") } }
    expect(NEEDS.faults.met(run)).toBe(false)
    expect(() => NEEDS.member.met(run)).toThrow("no identity")
  })

  it("each say why, and only a role need blocks the run", () => {
    for (const name of Object.keys(NEEDS) as Array<NeedName>) expect(NEEDS[name].reason.length, name).toBeGreaterThan(20)
    expect((Object.keys(NEEDS) as Array<NeedName>).filter((name) => NEEDS[name].blocked)).toEqual(["member", "maintainer"])
  })
})

describe("descriptions", () => {
  it("name the need, and the summary reads the name back", () => {
    expect(describeNeed("faults")).toMatch(/^needs faults: the app's faulty services/)
    expect(describeNeed("member")).toMatch(/^blocked member: /)
    expect(describeBroken("remoteFlows")).toMatch(/^broken remoteFlows: every remote flow fails MigrationError/)
    expect(parseDescription(describeNeed("faults"))).toEqual({ kind: "needs", name: "faults" })
    expect(parseDescription(describeNeed("member"))).toEqual({ kind: "blocked", name: "member" })
    expect(parseDescription(describeBroken("remoteFlows"))).toEqual({ kind: "broken", name: "remoteFlows" })
  })

  it("that name no declared need, or the wrong kind for it, are not declarations", () => {
    expect(parseDescription(undefined)).toBeUndefined()
    expect(parseDescription("BASE_URL is a deployment")).toBeUndefined()
    expect(parseDescription("needs telepathy: it reads minds")).toBeUndefined()
    expect(parseDescription("needs member: it asks")).toBeUndefined()
    expect(parseDescription("blocked faults: it throws a switch")).toBeUndefined()
    expect(parseDescription("broken faults: it throws a switch")).toBeUndefined()
  })

  it("every known-broken entry names its targets and why", () => {
    for (const [name, entry] of Object.entries(KNOWN_BROKEN)) {
      expect(entry.in.length, name).toBeGreaterThan(0)
      expect(entry.reason.length, name).toBeGreaterThan(20)
    }
  })
})

describe("guard", () => {
  it("lets a helper run where its need is met, and otherwise fails saying which requires is missing", () => {
    expect(() => guard("faults", local)).not.toThrow()
    const thrown = (() => {
      try {
        guard("faults", deployedAs("member"))
      } catch (error) {
        return error
      }
    })()
    expect(thrown).toBeInstanceOf(UndeclaredNeed)
    expect((thrown as UndeclaredNeed).need).toBe("faults")
    expect((thrown as Error).message).toContain('Declare it with requires("faults")')
  })
})

describe("the stored session's files", () => {
  const root = mkdtempSync(join(tmpdir(), "e2e-target-"))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it("sit in one folder per host, outside the repository, under E2E_SESSION_DIR when it is set", () => {
    const files = sessionFiles("https://smithers.example.workers.dev/app", { E2E_SESSION_DIR: root })
    expect(files).toEqual({
      dir: join(root, "smithers.example.workers.dev"),
      session: join(root, "smithers.example.workers.dev", "session.json"),
      identity: join(root, "smithers.example.workers.dev", "identity.json"),
    })
    expect(sessionFiles("http://localhost:1338", { E2E_SESSION_DIR: root }).dir).toBe(join(root, "localhost_1338"))
    expect(sessionFiles("https://smithers.example.workers.dev", {}).dir).toMatch(/\.smithers-e2e\/smithers\.example\.workers\.dev$/)
  })

  it("hold an identity the setup wrote, or none yet", () => {
    const path = join(root, "identity.json")
    expect(readIdentity(path)).toBeUndefined()
    writeFileSync(path, JSON.stringify({ origin: "https://a.dev", login: "codeplanesmithers", personId: "p1", role: "guest", signedInAt: 1 }))
    expect(readIdentity(path)).toEqual({ origin: "https://a.dev", login: "codeplanesmithers", personId: "p1", role: "guest" })
    writeFileSync(path, JSON.stringify({ origin: "https://a.dev", login: "codeplanesmithers", personId: "p1" }))
    expect(readIdentity(path)?.role).toBeNull()
  })

  it("refuse an identity file the setup didn't write", () => {
    const path = join(root, "bad.json")
    for (const bad of [{ login: "x", personId: "p" }, { origin: "o", login: "x", personId: "p", role: "owner" }, { origin: "o", personId: "p" }]) {
      writeFileSync(path, JSON.stringify(bad))
      expect(() => readIdentity(path)).toThrow("is not an identity the e2e setup wrote")
    }
  })
})
