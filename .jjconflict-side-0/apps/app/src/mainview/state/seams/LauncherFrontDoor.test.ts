import { afterEach, expect, test } from "bun:test"
import { FrontDoor, DEFAULT_CHOICE } from "@smthrs/rpc/FrontDoor"
import { placeholderRules, visitFacts } from "@smthrs/rpc/fixtures/FrontDoor"
import type { FrontDoorAccount } from "./LauncherSeam"
import { createLauncherSeam, captureArrival } from "./LauncherSeam"

const seams: ReturnType<typeof createLauncherSeam>[] = []
afterEach(() => { for (const s of seams.splice(0)) s.dispose() })
const start = (over: Record<string, unknown> = {}) => {
  const requests: string[] = [], counts: unknown[] = [], writes: string[] = []
  const storage = { getItem: () => null, setItem: (k: string, v: string) => { writes.push(k + v) } }
  const seam = createLauncherSeam({
    fetch: async (url) => {
      requests.push(url)
      return Response.json(url.includes("/contents/") ? { content: JSON.stringify(placeholderRules), encoding: "utf-8" } : [])
    },
    frontDoor: {
      reference: { repo: "smithers/smithers", path: ".smithers/front-door.json" },
      href: "https://smithers.sh/?utm_source=effeck", referrer: "",
      replaceUrl: () => {}, random: () => 0.9, storage,
      account: () => ({ owner: "signed-out", facts: visitFacts }),
      sendCount: (event: unknown) => { counts.push(event) },
      ...over
    }
  })
  seams.push(seam)
  seam.snapshots.subscribe(() => {})
  return { seam, requests, counts, writes }
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

test("the real launcher seam resolves an Effeck fixture, caches only rules, and exposes one counts seam", async () => {
  const { seam, requests, writes, counts } = start()
  await settle()
  expect(seam.snapshots.get().frontDoor?.choice.journey).toBe("effeck-anon")
  expect(requests.some(x => x === "/api/repos/smithers/smithers/contents/.smithers/front-door.json")).toBe(true)
  expect(writes).toHaveLength(1)
  expect(writes[0]).not.toContain("sourceHost")
  seam.shown()
  seam.shown()
  seam.acted()
  expect(counts.map((x: any) => x.step)).toEqual(["shown", "acted"])
})

test("DNT and GPC adapt in memory with no storage access and no counts", async () => {
  for (const privacy of [{ doNotTrack: "1" }, { globalPrivacyControl: true }]) {
    const { seam, counts, writes } = start({ ...privacy,
      storage: { getItem: () => { throw new Error("must not read storage") }, setItem: () => { throw new Error("must not write storage") } } })
    await settle()
    expect(seam.snapshots.get().frontDoor?.choice.journey).toBe("effeck-anon")
    seam.shown(); seam.acted()
    expect(counts).toEqual([])
    expect(writes).toEqual([])
  }
})

test("signed-in zero repos leads; unknown reads and account changes never reuse the previous answer", async () => {
  let account: FrontDoorAccount = { owner: "alice", facts: { ...visitFacts, signedIn: true, ownRepos: { state: "known" as const, value: 0 } } }
  const { seam } = start({ account: () => account, random: () => 0 })
  await settle()
  expect(seam.snapshots.get().frontDoor?.choice.journey).toBe("no-repo")
  account = { owner: "bob", facts: { ...visitFacts, signedIn: true } }
  // get() must clear synchronously, even before collection subscribers run.
  expect(seam.snapshots.get().frontDoor?.choice).toEqual(DEFAULT_CHOICE)
})

test("the 400ms deadline drops late rules and stale account answers", async () => {
  const held = Promise.withResolvers<Response>()
  const { seam } = start({ readRules: () => held.promise })
  await Bun.sleep(420)
  expect(seam.snapshots.get().frontDoor?.choice).toEqual(DEFAULT_CHOICE)
  held.resolve(Response.json(placeholderRules))
  await settle()
  expect(seam.snapshots.get().frontDoor?.choice).toEqual(DEFAULT_CHOICE)
})

test("live then fresh valid cache then bundle then launcher; invalid and expired caches fail closed", async () => {
  for (const [cached, bundle, expected] of [
    [{ at: Date.now(), rules: placeholderRules }, null, "effeck-anon"],
    [{ at: Date.now() - 600001, rules: placeholderRules }, null, "default"],
    [{ at: Date.now(), rules: {} }, placeholderRules, "effeck-anon"],
    [null, {}, "default"]
  ] as const) {
    const { seam } = start({ readRules: async () => Response.json({}, { status: 503 }),
      snapshot: bundle, storage: { getItem: () => JSON.stringify(cached), setItem: () => {} } })
    await settle()
    expect(seam.snapshots.get().frontDoor?.choice.journey).toBe(expected)
  }
})

test("committed empty rules return exactly the default", async () => {
  const { seam } = start({ readRules: async () => Response.json(FrontDoor.parse({ version: 1, journeys: [] })) })
  await settle()
  expect(seam.snapshots.get().frontDoor?.choice).toEqual(DEFAULT_CHOICE)
})

test("arrival uses a fixed host table, strips all UTMs, preserves other query/hash and skips returns", () => {
  const urls: string[] = []
  const arrive = (href: string, referrer = "https://effeck.dev/private?q=secret") =>
    captureArrival({ href, referrer, replaceUrl: (url: string) => { urls.push(url) } })
  expect(arrive("https://smithers.sh/?utm_source=github&utm_term=secret&keep=yes#here").source).toBe("github")
  expect(urls).toEqual(["/?keep=yes#here"])
  expect(arrive("https://smithers.sh/").source).toBe("effeck")
  expect(arrive("https://smithers.sh/", "https://effeck.dev.evil.example/").source).toBe("other")
  for (const suffix of ["signed-in=github", "auth=failed", "installation_id=123&setup_action=install", "tutorial"]) {
    expect(arrive("https://smithers.sh/?" + suffix + "&utm_source=github").source).toBe("direct")
  }
})

test("existing account reads may finish inside the same deadline; late account reads cannot change the visit", async () => {
  let account: FrontDoorAccount = { owner: "boot", settled: false, facts: visitFacts }
  const { seam } = start({ account: () => account })
  await settle()
  account = { owner: "alice", facts: { ...visitFacts, signedIn: true, ownRepos: { state: "known", value: 0 } } }
  seam.accountChanged()
  await Bun.sleep(420)
  expect(seam.snapshots.get().frontDoor?.choice.journey).toBe("no-repo")
  account = { owner: "bob", facts: { ...visitFacts, signedIn: true, ownRepos: { state: "known", value: 0 } } }
  expect(seam.snapshots.get().frontDoor?.choice).toEqual(DEFAULT_CHOICE)
  seam.accountChanged()
  expect(seam.snapshots.get().frontDoor?.choice).toEqual(DEFAULT_CHOICE)
})

test("deep links and a deployment without a rules reference bypass capture and the rules read", async () => {
  const replaced: string[] = []
  const { seam, requests } = start({ href: "https://smithers.sh/owner/repo?utm_source=effeck",
    replaceUrl: (url: string) => { replaced.push(url) } })
  await settle()
  expect(seam.snapshots.get().frontDoor).toBeUndefined()
  expect(requests.filter(url => url.includes("/contents/"))).toEqual([])
  expect(replaced).toEqual([])
})

test("holdout is drawn per load in memory and never includes a signed-in account", async () => {
  const { seam, writes } = start({ random: () => 0.05 })
  await settle()
  expect(seam.snapshots.get().frontDoor?.choice).toEqual(DEFAULT_CHOICE)
  expect(writes[0]).not.toContain('"arm"')
  const signedIn = start({ random: () => 0.05, account: () => ({ owner: "alice", facts: {
    ...visitFacts, signedIn: true, ownRepos: { state: "known", value: 0 }
  } }) })
  await settle()
  expect(signedIn.seam.snapshots.get().frontDoor?.choice.journey).toBe("no-repo")
})

test("base64 contents use the existing anonymous route encoding", async () => {
  const { seam } = start({ readRules: async () => Response.json({
    content: btoa(JSON.stringify(placeholderRules)), encoding: "base64"
  }) })
  await settle()
  expect(seam.snapshots.get().frontDoor?.choice.journey).toBe("effeck-anon")
})
