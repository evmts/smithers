import { describe, expect, test } from "bun:test"
import { createLauncherSeam, smithersUpdatesOf, SMITHERS_RELEASES_ENDPOINT, UPDATES_SHOWN } from "./LauncherSeam"
import type { PublicFetch } from "./LauncherSeam"

/*
 * The launcher's two public reads (M-45). The news must be real, dated and
 * from one source; an unread source is absent, never "no updates"; and
 * neither read may carry an account.
 */

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const release = (over: Record<string, unknown> = {}) => ({
  name: "Smithers 1.2", tag_name: "1.2.0", published_at: "2026-10-14T10:00:00Z",
  html_url: "https://github.com/smithersai/smithers/releases/tag/1.2.0", draft: false, ...over
})

describe("the published entries one releases page carries", () => {
  test("keeps the source's own date, title and page, newest first", () => {
    expect(smithersUpdatesOf([
      release({ name: "1.1.0", published_at: "2026-09-01T00:00:00Z", html_url: "https://github.com/smithersai/smithers/releases/tag/1.1.0" }),
      release()
    ])).toEqual([
      { id: "https://github.com/smithersai/smithers/releases/tag/1.2.0", title: "Smithers 1.2", date: "2026-10-14T10:00:00.000Z", url: "https://github.com/smithersai/smithers/releases/tag/1.2.0" },
      { id: "https://github.com/smithersai/smithers/releases/tag/1.1.0", title: "1.1.0", date: "2026-09-01T00:00:00.000Z", url: "https://github.com/smithersai/smithers/releases/tag/1.1.0" }
    ])
  })

  test("an entry this app would have to invent is left out, never written", () => {
    for (const row of [
      release({ draft: true }),
      release({ published_at: null }),
      release({ published_at: "not a date" }),
      release({ html_url: "https://evil.example/releases/1" }),
      release({ html_url: "http://github.com/smithersai/smithers/releases/tag/v1" }),
      release({ name: null, tag_name: null }),
      null,
      "a release"
    ]) expect(smithersUpdatesOf([row])).toEqual([])
  })

  test("a title falls back to the tag the source published, never to a version string of ours", () => {
    expect(smithersUpdatesOf([release({ name: "   " })])?.[0]?.title).toBe("1.2.0")
  })

  test("a body that is not a list of entries is unreadable, not empty", () => {
    for (const body of [null, undefined, {}, "", { releases: [] }]) expect(smithersUpdatesOf(body)).toBeNull()
    // An answered empty page IS authoritative: the source published nothing yet.
    expect(smithersUpdatesOf([])).toEqual([])
  })

  test("the page is bounded", () => {
    const page = Array.from({ length: 40 }, (_, index) => release({
      published_at: `2026-10-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      html_url: `https://github.com/smithersai/smithers/releases/tag/v${index}`
    }))
    expect(smithersUpdatesOf(page)).toHaveLength(UPDATES_SHOWN)
  })
})

describe("the launcher seam", () => {
  const seamWith = (fetch: PublicFetch, loadCatalog?: () => Promise<boolean>) =>
    createLauncherSeam({ fetch, ...(loadCatalog === undefined ? {} : { loadCatalog }) })

  test("reads the one fixed public source with no credentials, account or referrer", async () => {
    const calls: Array<[string, RequestInit | undefined]> = []
    const seam = seamWith(async (input, init) => { calls.push([input, init]); return json([release()]) })
    seam.snapshots.subscribe(() => {})
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(calls).toHaveLength(1)
    expect(calls[0]![0]).toBe(SMITHERS_RELEASES_ENDPOINT)
    expect(calls[0]![1]?.credentials).toBe("omit")
    expect(calls[0]![1]?.referrerPolicy).toBe("no-referrer")
    expect(JSON.stringify(calls[0]![1]?.headers)).not.toContain("uthorization")
    expect(JSON.stringify(calls[0]![1]?.headers)).not.toContain("ookie")
    seam.dispose()
  })

  test("a refusal, an unreachable source and an unreadable body are all honest absence", async () => {
    for (const answer of [async () => json({}, 503), async () => { throw new TypeError("ECONNRESET socket-detail") }, async () => json({ releases: [] })]) {
      const seam = seamWith(answer)
      seam.snapshots.subscribe(() => {})
      await seam.retry()
      expect(seam.snapshots.get().updates).toEqual({ kind: "unreadable" })
      seam.dispose()
    }
  })

  test("the first subscriber reads once however many mount; only Retry reads again", async () => {
    let reads = 0
    const settle = async () => { for (let tick = 0; tick < 5; tick += 1) await Promise.resolve() }
    const seam = seamWith(async () => { reads += 1; return json([release()]) })
    const stop = seam.snapshots.subscribe(() => {})
    const stopAgain = seam.snapshots.subscribe(() => {})
    await settle()
    expect(reads).toBe(1)
    // A remount does not re-read: the answer is cached for the app's lifetime.
    stop(); stopAgain()
    seam.snapshots.subscribe(() => {})
    await settle()
    expect(reads).toBe(1)
    await seam.retry()
    expect(reads).toBe(2)
    seam.dispose()
  })

  test("a refused catalog is unreadable, never an empty shelf", async () => {
    const refused = seamWith(async () => json([]), async () => false)
    refused.snapshots.subscribe(() => {})
    await refused.retryCatalog()
    expect(refused.snapshots.get().catalog).toEqual({ kind: "unreadable" })
    refused.dispose()
    const read = seamWith(async () => json([]), async () => true)
    read.snapshots.subscribe(() => {})
    await read.retryCatalog()
    expect(read.snapshots.get().catalog).toEqual({ kind: "read" })
    read.dispose()
  })

  test("a disposed seam publishes nothing", async () => {
    const seam = seamWith(async () => json([release()]))
    seam.snapshots.subscribe(() => {})
    seam.dispose()
    await seam.retry()
    expect(seam.snapshots.get().updates).toBeUndefined()
  })
})
