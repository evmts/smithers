/* Chat archive and history (#3827): the tree's grouping, a chat's line, and the seam's host calls. */
import { describe, expect, test } from "bun:test"
import type { ControllerContext } from "../controller/context"
import { TOAST_SUPERSEDED } from "../controller/failures"
import { archiveTitle, createChatArchiveSeam, historyTree, type ChatArchive } from "./ChatArchiveSeam"

const chat = (id: string, repository: string | null, branch: string | null, archived_at: number, more: Partial<ChatArchive> = {}): ChatArchive =>
  ({ id, repository, branch, title: `Chat ${id}`, summary: null, runs: [], entries: 1, first_at: archived_at - 10, last_at: archived_at - 1, archived_at, ...more })

describe("historyTree", () => {
  const archives = [
    chat("a", "acme/api", "main", 100), chat("b", "acme/api", "main", 300), chat("c", "acme/api", "feature", 200),
    chat("d", "acme/web", "main", 900), chat("e", null, null, 50), chat("f", "acme/api", null, 400), chat("g", "zeta/old", "main", 10)
  ]
  const shape = (label: { repository: string | null; branch: string | null }) => historyTree(archives, label)
    .map(repository => [repository.repository, repository.current, repository.branches.map(branch => [branch.branch, branch.current, branch.chats.map(each => each.id)])])

  test("groups by repository then branch; the header's pair leads and the rest follow by their newest chat", () => {
    expect(shape({ repository: "acme/api", branch: "feature" })).toEqual([
      ["acme/api", true, [["feature", true, ["c"]], [null, false, ["f"]], ["main", false, ["b", "a"]]]],
      ["acme/web", false, [["main", false, ["d"]]]],
      [null, false, [[null, false, ["e"]]]],
      ["zeta/old", false, [["main", false, ["g"]]]]
    ])
  })

  test("no selected repository marks the no-repository group, and an unknown one marks nothing", () => {
    expect(shape({ repository: null, branch: null }).map(row => [row[0], row[1]])).toEqual([[null, true], ["acme/web", false], ["acme/api", false], ["zeta/old", false]])
    expect(shape({ repository: "other/repo", branch: "main" }).map(row => row[1])).toEqual([false, false, false, false])
    // The same branch name in another repository is not the current branch.
    expect(shape({ repository: "acme/web", branch: "main" })[1]).toEqual(["acme/api", false, [[null, false, ["f"]], ["main", false, ["b", "a"]], ["feature", false, ["c"]]]])
  })

  test("an empty history is an empty tree, and equal times order by id", () => {
    expect(historyTree([], { repository: "acme/api", branch: "main" })).toEqual([])
    expect(historyTree([chat("z", "r/r", "b", 5), chat("y", "r/r", "b", 5)], { repository: null, branch: null })[0]!.branches[0]!.chats.map(each => each.id)).toEqual(["y", "z"])
  })
})

describe("archiveTitle", () => {
  test("is the title, else the summary's first sentence, else the archive date", () => {
    expect(archiveTitle(chat("a", null, null, 0, { title: "  Fix login  " }))).toBe("Fix login")
    expect(archiveTitle(chat("a", null, null, 0, { title: " ", summary: "You asked about login. It was fixed." }))).toBe("You asked about login.")
    // A chat whose summary was never written, and whose first prompt was empty, still has a line.
    expect(archiveTitle(chat("a", null, null, Date.UTC(2026, 9, 13, 6, 5), { title: "", summary: null }))).toBe("2026-10-13 06:05 UTC")
    expect(archiveTitle(chat("a", null, null, Date.UTC(2026, 9, 13, 6, 5), { title: "", summary: "  " }))).toBe("2026-10-13 06:05 UTC")
  })
})

interface Call { readonly url: string; readonly method: string; readonly body: unknown }
const harness = (respond: (call: Call) => Response | Promise<Response>) => {
  const calls: Call[] = [], toasts: Array<{ key: string; title: string; done: string; result: unknown }> = [], account = new Set<() => void>()
  let owner: string | null = "maya", signedIn = true, rereads = 0
  const ctx = {
    disposed: false, baseUrl: "https://host.test",
    store: { collections: { identitySessions: { get: () => signedIn ? { state: "signed-in" } : { state: "signed-out" } } } },
    accountOwner: () => owner,
    boundedFetch: async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined }
      calls.push(call)
      return respond(call)
    },
    withToast: async (key: string, title: string, done: string, work: () => Promise<unknown>) => {
      const result = await work()
      toasts.push({ key, title, done, result })
      return result
    },
    onAccountChange: (listener: () => void) => { account.add(listener); return () => { account.delete(listener) } },
    onDispose: () => {}
  } as unknown as ControllerContext
  const seam = createChatArchiveSeam(ctx, { branch: () => "feature x", label: () => ({ repository: "acme/api", branch: "feature x" }), reread: () => { rereads++ } })
  return { seam, calls, toasts, rereads: () => rereads, signOut: () => { signedIn = false; owner = null }, switchAccount: () => { owner = "ben"; for (const listener of account) listener() } }
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(done => setTimeout(done, 0)) }

describe("chat archive seam", () => {
  test("archive acknowledges at once, files the chat under the header's repository and branch, and rereads the live chat", async () => {
    const archived = chat("new", "acme/api", "feature x", 500)
    let release!: (response: Response) => void
    const h = harness(call => call.method === "POST" ? new Promise<Response>(resolve => { release = resolve }) : Response.json({ archives: [chat("old", "acme/api", "main", 100)] }))
    await h.seam.list()
    expect(h.seam.archive()).toEqual({ value: "Archive requested" })
    // The request is in flight: a second ask joins it instead of archiving twice.
    expect(h.seam.archive()).toEqual({ value: "Archive requested" })
    await settle()
    expect(h.calls.filter(call => call.method === "POST")).toEqual([{ url: "https://host.test/api/conversations/feature%20x/archive", method: "POST", body: { repository: "acme/api", branch: "feature x" } }])
    expect(h.toasts).toEqual([])
    expect(h.rereads()).toBe(0)
    release(Response.json({ archive: archived }))
    await settle()
    expect(h.toasts).toEqual([{ key: "chat.archive", title: "Archiving chat", done: "Archived", result: true }])
    expect(h.rereads()).toBe(1)
    expect(h.seam.get().archives?.map(each => each.id)).toEqual(["new", "old"])
    // Once settled, the next ask is a new request.
    expect(h.seam.archive()).toEqual({ value: "Archive requested" })
    await settle()
    expect(h.calls.filter(call => call.method === "POST")).toHaveLength(2)
  })

  test("a refusal is the sentence the toast shows, and nothing is reread", async () => {
    for (const [response, sentence] of [
      [new Response("{}", { status: 409 }), "A prompt is running or queued"],
      [new Response("{}", { status: 503 }), "Archive unavailable"],
      [Response.json({ archive: null }), "Nothing to archive"],
      [Response.json({ archive: { id: "" } }), "Archive unavailable"],
      [new Response("not json"), "Archive unavailable"]
    ] as const) {
      const h = harness(() => response)
      expect(h.seam.archive()).toEqual({ value: "Archive requested" })
      await settle()
      expect(h.toasts.map(toast => toast.result)).toEqual([sentence])
      expect(h.rereads()).toBe(0)
      expect(h.seam.get().archives).toBeUndefined()
    }
    const offline = harness(() => { throw new Error("offline") })
    offline.seam.archive()
    await settle()
    expect(offline.toasts.map(toast => toast.result)).toEqual(["Archive unavailable"])
  })

  test("signed out, nothing is sent", async () => {
    const h = harness(() => Response.json({ archives: [] }))
    h.signOut()
    expect(h.seam.archive()).toBe("Archive unavailable")
    await h.seam.list()
    expect(await h.seam.open("a")).toBe("History unavailable")
    expect(h.calls).toEqual([])
    expect(h.seam.get()).toEqual({ opened: {} })
  })

  test("an answer for a previous account is dropped", async () => {
    let release!: (response: Response) => void
    const h = harness(call => call.method === "POST" ? new Promise<Response>(resolve => { release = resolve }) : Response.json({ archives: [chat("mine", null, null, 1)] }))
    await h.seam.list()
    expect(h.seam.get().archives).toHaveLength(1)
    h.seam.archive()
    await settle()
    h.switchAccount()
    expect(h.seam.get()).toEqual({ opened: {} })
    release(Response.json({ archive: chat("stale", null, null, 2) }))
    await settle()
    expect(h.toasts.map(toast => toast.result)).toEqual([TOAST_SUPERSEDED])
    expect(h.seam.get()).toEqual({ opened: {} })
    expect(h.rereads()).toBe(0)
  })

  test("list keeps the rows it has when a refresh fails, and clears the error when one succeeds", async () => {
    let fail = false
    const h = harness(() => fail ? new Response("{}", { status: 500 }) : Response.json({ archives: [chat("a", "acme/api", "main", 1)] }))
    const seen: number[] = []
    const stop = h.seam.subscribe(() => seen.push(h.seam.get().archives?.length ?? -1))
    await h.seam.list()
    fail = true
    await h.seam.list()
    expect(h.seam.get().archives?.map(each => each.id)).toEqual(["a"])
    expect(h.seam.get().error).toBe("History unavailable")
    fail = false
    await h.seam.list()
    expect(h.seam.get().error).toBeUndefined()
    stop()
    await h.seam.list()
    expect(seen).toEqual([1, 1, 1])
    const broken = harness(() => Response.json({ archives: [{ id: "x" }] }))
    await broken.seam.list()
    expect(broken.seam.get()).toEqual({ opened: {}, error: "History unavailable" })
  })

  test("open reads an archived chat once and names a refusal", async () => {
    const h = harness(call => call.url.endsWith("/missing") ? new Response("{}", { status: 404 })
      : Response.json({ archive: chat("a/b", null, null, 1), conversation: { id: "archive-a/b", entries: [] } }))
    expect(await h.seam.open("a/b")).toBeUndefined()
    expect(await h.seam.open("a/b")).toBeUndefined()
    expect(h.calls.map(call => call.url)).toEqual(["https://host.test/api/conversation-archives/a%2Fb"])
    expect(h.seam.get().opened["a/b"]).toEqual({ id: "archive-a/b", entries: [] })
    expect(await h.seam.open("missing")).toBe("Archived chat unavailable")
    const garbled = harness(() => Response.json({ archive: null }))
    expect(await garbled.seam.open("a")).toBe("Archived chat unavailable")
    expect(garbled.seam.get().opened).toEqual({})
  })
})
