import * as CloudSession from "@smthrs/cli/CloudSession"
import { afterEach, describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as IssueViews from "../src/issue-views.ts"
import * as Log from "../src/log.ts"
import * as Panels from "../src/panels.ts"
import { TabError } from "../src/tab-error.ts"

const views = [
  { id: "bugs", title: "Open bugs", state: "open", labels: ["bug", "p1"] },
  { id: "everything", title: "Everything", state: "all" }
]
const issue = (number: number, state = "open") => ({ number, title: `Issue ${number}`, state, labels: [] })

/** A deferred answer the test settles by hand. */
const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

/** Getter doubles represent one terminal page; real HTTP tests cover continuation independently. */
const encodedPage = (body: unknown, nextCursor = "") => ({
  body,
  nextCursor,
  bytes: new TextEncoder().encode(JSON.stringify(body)).length
})

const terminalCloud = ({ get }: Pick<IssueViews.Cloud, "get">): IssueViews.Cloud => ({
  get,
  getPage: async (path, signal) => encodedPage(await get(path, signal))
})

/** A session whose GETs answer from `answer` and are recorded. */
const session = (answer: (path: string) => Promise<unknown> | unknown) => {
  const paths: Array<string> = []
  const cloud: IssueViews.Cloud = terminalCloud({ get: async (path) => (paths.push(path), await answer(path)) })
  return { cloud, paths }
}

const valid = (panel: Panels.Panel) => expect(Panels.decode(panel)).toEqual(panel)

describe("issue views data source", () => {
  it("reads the declared views, dropping malformed entries, and lists one view's first page", async () => {
    const { cloud, paths } = session((path) =>
      path.endsWith("/issue-views")
        ? [...views, { id: "Bad", title: "x" }, { id: "ok", title: " " }, "junk"]
        : [issue(9), { title: "no number" }, issue(7, "fixed")]
    )
    expect(await IssueViews.loadViews(cloud.get, "o/r")).toEqual(views)
    expect(await IssueViews.loadIssues(cloud.getPage, "o/r", "bugs")).toEqual({
      issues: [{ number: 9, title: "Issue 9", state: "open" }, { number: 7, title: "Issue 7", state: "fixed" }]
    })
    expect(paths).toEqual(["/api/repos/o/r/issue-views", "/api/repos/o/r/issues?view=bugs&limit=100"])
    const full = session(() => Array.from({ length: IssueViews.pageSize }, (_, i) => issue(i + 1)))
    expect((await IssueViews.loadIssues(full.cloud.getPage, "o/r", "bugs")).issues).toHaveLength(100)
    await expect(IssueViews.loadViews(session(() => ({})).cloud.get, "o/r")).rejects.toThrow("unreadable")
    await expect(IssueViews.loadIssues(session(() => null).cloud.getPage, "o/r", "bugs")).rejects.toThrow("unreadable")
  })

  it("deduplicates page overlap while retaining authoritative replacement rows", async () => {
    const paths: Array<string> = []
    const pages = [
      encodedPage([issue(8), issue(7)], "opaque"),
      encodedPage([issue(7, "closed"), issue(6)])
    ]
    const result = await IssueViews.loadIssues(
      async (path) => {
        paths.push(path)
        return pages.shift()!
      },
      "o/r",
      "bugs",
      undefined,
      3
    )
    expect(result.issues).toEqual([
      { number: 8, title: "Issue 8", state: "open" },
      { number: 7, title: "Issue 7", state: "closed" },
      { number: 6, title: "Issue 6", state: "open" }
    ])
    expect(paths).toEqual([
      "/api/repos/o/r/issues?view=bugs&limit=100",
      "/api/repos/o/r/issues?view=bugs&limit=100&cursor=opaque"
    ])
  })

  it("refuses cursor cycles and over-cap views instead of returning partial success", async () => {
    let calls = 0
    await expect(IssueViews.loadIssues(
      async () => {
        calls++
        return encodedPage([issue(calls)], "repeated")
      },
      "o/r",
      "bugs"
    )).rejects.toMatchObject({ code: "backend_protocol" })
    expect(calls).toBe(2)
    calls = 0
    await expect(IssueViews.loadIssues(
      async () => {
        calls++
        return encodedPage([issue(2), issue(1)])
      },
      "o/r",
      "bugs",
      undefined,
      1
    )).rejects.toMatchObject({ code: "pagination_limit" })
    expect(calls).toBe(1)
  })

  it("names view rows so the host can route Enter to select", () => {
    expect(IssueViews.rowId("bugs")).toBe("issue-view:bugs")
    expect(IssueViews.viewOf("issue-view:bugs")).toBe("bugs")
    expect(IssueViews.viewOf("issue-view:Bugs")).toBeUndefined()
    expect(IssueViews.viewOf("issue-view-issue:bugs:9")).toBeUndefined()
    expect(IssueViews.viewOf("factory:todo")).toBeUndefined()
  })
})

describe("issue views controller", () => {
  it("selects a view, lists its issues, and renders both as a valid panel", async () => {
    const states: Array<IssueViews.State["phase"]> = []
    const { cloud, paths } = session((path) => path.endsWith("/issue-views") ? views : [issue(9), issue(8)])
    const control = IssueViews.controller(async () => cloud, "o/r", (state) => states.push(state.phase))
    expect(IssueViews.panel(control.state()).summary).toBe("Reading views")
    await control.refresh()
    valid(IssueViews.panel(control.state()))
    expect(IssueViews.panel(control.state()).summary).toBe("2 views")
    const loading = control.select("bugs")
    const pending = IssueViews.panel(control.state())
    expect(pending.rows[0]).toMatchObject({
      id: "issue-view:bugs",
      status: "requested",
      details: [{ text: "open · bug · p1" }]
    })
    await loading
    const shown = IssueViews.panel(control.state())
    valid(shown)
    expect(shown.summary).toBe("Open bugs · 2")
    expect(shown.rows.map((row) => row.label)).toEqual(["Open bugs", "Everything", "#9 Issue 9", "#8 Issue 8"])
    expect(shown.rows[0]!.status).toBe("done")
    expect(shown.rows[1]).toEqual({ id: "issue-view:everything", label: "Everything", details: [] })
    expect(paths).toEqual(["/api/repos/o/r/issue-views", "/api/repos/o/r/issues?view=bugs&limit=100"])
    expect(states).toEqual(["ready", "ready", "ready"])
  })

  it("joins a repeated selection and never lets an older answer replace a newer one", async () => {
    const bugs = deferred<unknown>()
    const everything = deferred<unknown>()
    const { cloud, paths } = session((path) =>
      path.endsWith("/issue-views") ? views : path.includes("view=bugs") ? bugs.promise : everything.promise
    )
    const control = IssueViews.controller(async () => cloud, "o/r")
    await control.refresh()
    const first = control.select("bugs")
    const again = control.select("bugs")
    expect(again).toBe(first)
    const second = control.select("everything")
    everything.resolve([issue(3, "closed")])
    await second
    bugs.resolve([issue(9)])
    await first
    const state = control.state()
    expect(state.phase === "ready" && state.selected).toMatchObject({
      id: "everything",
      phase: "loaded",
      issues: [{ number: 3 }]
    })
    // The superseded selection read at most once and never showed.
    expect(paths.filter((path) => path.includes("view=bugs")).length).toBeLessThanOrEqual(1)
  })

  it("keeps a failed read visible and retries it on the next selection", async () => {
    let fail = true
    const { cloud } = session((path) => {
      if (path.endsWith("/issue-views")) return views
      if (fail) throw new Error("HTTP 404: issue view \"bugs\" not found")
      return [issue(9)]
    })
    const control = IssueViews.controller(async () => cloud, "o/r")
    await control.refresh()
    await control.select("bugs")
    const failed = IssueViews.panel(control.state())
    valid(failed)
    expect(failed.rows[0]!.status).toBe("failed")
    expect(failed.rows.at(-1)).toMatchObject({
      status: "failed",
      label: "Issues could not be read. Details: /conversation"
    })
    fail = false
    await control.select("bugs")
    expect(IssueViews.panel(control.state()).summary).toBe("Open bugs · 1")
  })

  it("ignores undeclared views and keeps a selection only while it is still declared", async () => {
    let declared: ReadonlyArray<unknown> = views
    const { cloud, paths } = session((path) => path.endsWith("/issue-views") ? declared : [issue(1)])
    const control = IssueViews.controller(async () => cloud, "o/r")
    await control.select("bugs")
    expect(control.state().phase).toBe("idle")
    await control.refresh()
    await control.select("missing")
    expect(paths).toEqual(["/api/repos/o/r/issue-views"])
    await control.select("bugs")
    await control.refresh()
    expect(control.state()).toMatchObject({ phase: "ready", selected: { id: "bugs", phase: "loaded" } })
    declared = [views[1]]
    await control.refresh()
    expect(control.state()).toEqual({
      phase: "ready",
      views: [{ id: "everything", title: "Everything", state: "all" }]
    })
  })

  it("says signed out without a session or when Cloud refuses it, and reports other failures", async () => {
    const out = IssueViews.controller(async () => undefined, "o/r")
    await out.refresh()
    expect(IssueViews.panel(out.state())).toEqual({
      id: "issue-views",
      title: "Issue views",
      summary: "Sign in: smthrs auth login",
      rows: []
    })
    let signIns = 0
    const refusing = IssueViews.controller(async () => (signIns++,
      terminalCloud({
        get: async () => {
          throw new Error("HTTP 401: sign in")
        }
      })), "o/r")
    await refusing.refresh()
    expect(refusing.state().phase).toBe("signed-out")
    await refusing.refresh()
    expect(signIns).toBe(2)
    const broken = IssueViews.controller(async () => (terminalCloud({
      get: async () => {
        throw new Error("")
      }
    })), "o/r")
    await broken.refresh()
    const panel = IssueViews.panel(broken.state())
    valid(panel)
    expect(panel.rows).toEqual([{
      id: "issue-views:failed",
      label: "Issue views could not be read. Details: /conversation",
      status: "failed",
      details: []
    }])
    const none = IssueViews.controller(async () => {
      throw new Error("unused")
    }, undefined)
    expect((await none.refresh()).phase).toBe("idle")
  })

  it("drops a kept selection whose view's filters changed, and orders refreshes", async () => {
    let declared: ReadonlyArray<IssueViews.View> = views
    const { cloud } = session((path) => path.endsWith("/issue-views") ? declared : [issue(1)])
    const control = IssueViews.controller(async () => cloud, "o/r")
    await control.refresh()
    await control.select("bugs")
    declared = [{ ...views[0]!, state: "closed" }, views[1]!]
    await control.refresh()
    expect(control.state()).toEqual({ phase: "ready", views: declared })

    const first = deferred<unknown>()
    const second = deferred<unknown>()
    const queue = [first, second]
    let gets = 0
    const ordered = IssueViews.controller(
      async () => (terminalCloud({ get: () => (gets++, queue.shift()!.promise) })),
      "o/r"
    )
    const older = ordered.refresh()
    while (gets === 0) await Promise.resolve()
    const newer = ordered.refresh()
    while (gets === 1) await Promise.resolve()
    second.resolve([views[1]!])
    await newer
    first.resolve(views)
    await older
    expect(ordered.state()).toEqual({ phase: "ready", views: [views[1]!] })
  })

  it("never shows an answer read as a session Cloud has since refused", async () => {
    const bugs = deferred<unknown>()
    let refuse = false
    const cloud: IssueViews.Cloud = terminalCloud({
      get: async (path) => {
        if (path.endsWith("/issue-views")) {
          if (refuse) throw new Error("HTTP 401: sign in")
          return views
        }
        return path.includes("view=bugs") ? bugs.promise : Promise.reject(new Error("HTTP 403: forbidden"))
      }
    })
    const control = IssueViews.controller(async () => cloud, "o/r")
    await control.refresh()
    const pending = control.select("bugs")
    refuse = true
    await control.refresh()
    expect(control.state().phase).toBe("signed-out")
    bugs.resolve([issue(9)])
    await pending
    expect(control.state().phase).toBe("signed-out")
    refuse = false
    await control.refresh()
    await control.select("everything")
    expect(control.state().phase).toBe("signed-out")
  })

  it("drops answers after the caller aborts", async () => {
    const answer = deferred<unknown>()
    const { cloud } = session((path) => path.endsWith("/issue-views") ? views : answer.promise)
    const control = IssueViews.controller(async () => cloud, "o/r")
    await control.refresh()
    const abort = new AbortController()
    const run = control.select("bugs", abort.signal)
    abort.abort()
    answer.resolve([issue(1)])
    await run
    // A cancelled read leaves what was shown before it: here, no selection.
    expect(control.state()).toEqual({ phase: "ready", views })
    const stale = deferred<unknown>()
    const late = IssueViews.controller(async () => (terminalCloud({ get: () => stale.promise })), "o/r")
    const aborted = new AbortController()
    const refreshing = late.refresh(aborted.signal)
    aborted.abort()
    stale.resolve(views)
    expect((await refreshing).phase).toBe("idle")
  })
})

const servers: Array<() => void> = []
afterEach(() => {
  for (const close of servers.splice(0)) close()
})

it("reads views and a view's issues from Cloud as the signed-in person", async () => {
  const received: Array<{ path: string; auth: string | undefined }> = []
  const server = createServer((request, response) => {
    received.push({ path: request.url ?? "", auth: request.headers.authorization })
    const body = request.url === "/api/repos/o/r/issue-views" ? views : [issue(5)]
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify(body))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  servers.push(() => server.close())
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const control = IssueViews.controller(
    () =>
      CloudSession.signedIn({
        HOME: mkdtempSync(join(tmpdir(), "tui-views-")),
        XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "tui-views-")),
        SMITHERS_API_ORIGIN: origin,
        SMITHERS_TOKEN: "tok_views"
      }),
    "o/r"
  )
  await control.refresh()
  await control.select("everything")
  expect(IssueViews.panel(control.state()).summary).toBe("Everything · 1")
  expect(received.map((each) => each.path)).toEqual([
    "/api/repos/o/r/issue-views",
    "/api/repos/o/r/issues?view=everything&limit=100"
  ])
  expect(received.every((each) => each.auth === "token tok_views")).toBe(true)
})

// Getter faults exercise values a real HTTP parser cannot produce; the real
// CloudSession HTTP cases below independently cover transport and recovery.
for (const boundary of ["refresh", "select"] as const) {
  for (const kind of ["error", "string", "tagged"] as const) {
    it(`keeps ${boundary} ${kind} diagnostics out of the panel and recovers`, async () => {
      const marker = `issue-view-${kind}-${crypto.randomUUID()}`
      const fault = kind === "error"
        ? new Error(marker)
        : kind === "string"
        ? marker
        : new TabError("unknown_tab", marker, "missing-view")
      let fail = true
      const cloud: IssueViews.Cloud = terminalCloud({
        get: async (path) => {
          if (path.endsWith("/issue-views")) {
            if (boundary === "refresh" && fail) throw fault
            return views
          }
          if (fail) throw fault
          return [issue(9)]
        }
      })
      const control = IssueViews.controller(async () => cloud, "o/r")
      if (boundary === "select") await control.refresh()
      const offset = existsSync(Log.path()) ? readFileSync(Log.path(), "utf8").length : 0
      if (boundary === "refresh") await control.refresh()
      else await control.select("bugs")
      const panel = IssueViews.panel(control.state())
      valid(panel)
      expect(panel.rows.at(-1)?.label).toBe(
        kind === "tagged"
          ? "No tab missing-view."
          : `${boundary === "refresh" ? "Issue views" : "Issues"} could not be read. Details: /conversation`
      )
      expect(JSON.stringify(panel)).not.toContain(marker)
      if (kind !== "tagged") {
        const appended = readFileSync(Log.path(), "utf8").slice(offset)
        expect(appended).toContain(marker)
        expect(appended).toContain(`failure.${boundary === "refresh" ? "issue-views" : "issues"}`)
      }
      fail = false
      await control.refresh()
      await control.select("bugs")
      expect(IssueViews.panel(control.state()).summary).toBe("Open bugs · 1")
    })
  }
}

for (const boundary of ["refresh", "select"] as const) {
  it(`does not revoke a ${boundary} session for a nested authentication diagnostic`, async () => {
    const fault = new Error("Cloud: HTTP 503 upstream unavailable", { cause: new Error("prior probe: HTTP 401") })
    const cloud: IssueViews.Cloud = terminalCloud({
      get: async (path) => {
        if (boundary === "select" && path.endsWith("/issue-views")) return views
        throw fault
      }
    })
    const control = IssueViews.controller(async () => cloud, "o/r")
    await control.refresh()
    if (boundary === "select") await control.select("bugs")
    expect(control.state().phase).toBe(boundary === "refresh" ? "failed" : "ready")
    expect(IssueViews.panel(control.state()).rows.at(-1)?.label).toContain("could not be read")
  })
}

for (const status of [401, 403, 503]) {
  for (const boundary of ["refresh", "select"] as const) {
    it(`recovers a real Cloud ${boundary} HTTP ${status} refusal without showing diagnostics`, async () => {
      let fail = true
      const received: Array<{ path: string; auth: string | undefined }> = []
      const server = createServer((request, response) => {
        const path = request.url ?? ""
        received.push({ path, auth: request.headers.authorization })
        const listing = path.endsWith("/issue-views")
        const failing = fail && (boundary === "refresh" ? listing : !listing)
        response.writeHead(failing ? status : 200, { "content-type": "application/json" })
        response.end(JSON.stringify(failing ? { error: "diagnostic unavailable" } : listing ? views : [issue(5)]))
      })
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
      servers.push(() => server.close())
      const home = mkdtempSync(join(tmpdir(), "tui-views-failure-"))
      const control = IssueViews.controller(() =>
        CloudSession.signedIn({
          HOME: home,
          XDG_CONFIG_HOME: home,
          SMITHERS_API_ORIGIN: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
          SMITHERS_TOKEN: "tok_views"
        }), "o/r")
      const offset = existsSync(Log.path()) ? readFileSync(Log.path(), "utf8").length : 0
      await control.refresh()
      if (boundary === "select") await control.select("bugs")
      const panel = IssueViews.panel(control.state())
      valid(panel)
      if (status === 401 || status === 403) {
        expect(control.state().phase).toBe("signed-out")
        expect(panel.summary).toBe("Sign in: smthrs auth login")
        expect(panel.rows).toEqual([])
      } else {
        expect(panel.rows.at(-1)?.label).toBe(
          "That command could not run. Details: /conversation"
        )
        const appended = readFileSync(Log.path(), "utf8").slice(offset)
        expect(appended).toContain("HTTP 503")
        expect(appended).toContain(boundary === "refresh" ? "/api/repos/o/r/issue-views" : "view=bugs&limit=100")
      }
      expect(JSON.stringify(panel)).not.toContain("HTTP")
      expect(received.every((request) => request.auth === "token tok_views")).toBe(true)
      fail = false
      await control.refresh()
      await control.select("bugs")
      expect(IssueViews.panel(control.state()).summary).toBe("Open bugs · 1")
      expect(received.at(-1)?.path).toBe("/api/repos/o/r/issues?view=bugs&limit=100")
    })
  }
}

it("ignores an older authentication failure after a newer view is already displayed", async () => {
  const older = deferred<unknown>()
  let started!: () => void
  const pending = new Promise<void>((resolve) => {
    started = resolve
  })
  const marker = `stale-issue-read-${crypto.randomUUID()}`
  const cloud: IssueViews.Cloud = terminalCloud({
    get: async (path) => {
      if (path.endsWith("/issue-views")) return views
      if (path.includes("view=bugs")) {
        started()
        return older.promise
      }
      return [issue(3, "closed")]
    }
  })
  const control = IssueViews.controller(async () => cloud, "o/r")
  await control.refresh()
  const stale = control.select("bugs")
  await pending
  await control.select("everything")
  const before = IssueViews.panel(control.state())
  const offset = existsSync(Log.path()) ? readFileSync(Log.path(), "utf8").length : 0
  older.reject(new Error(`HTTP 401 ${marker}`))
  await stale
  expect(IssueViews.panel(control.state())).toEqual(before)
  expect(before.summary).toBe("Everything · 1")
  expect(control.state().phase).toBe("ready")
  const appended = existsSync(Log.path()) ? readFileSync(Log.path(), "utf8").slice(offset) : ""
  expect(appended).not.toContain(marker)
})

it("cancels a held real Cloud selection while preserving the already displayed view", async () => {
  let started!: () => void
  const requested = new Promise<void>((resolve) => {
    started = resolve
  })
  const received: Array<string> = []
  const server = createServer((request, response) => {
    const path = request.url ?? ""
    received.push(path)
    if (path.includes("view=bugs")) {
      started()
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify(path.endsWith("/issue-views") ? views : [issue(3)]))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  servers.push(() => {
    server.closeAllConnections()
    server.close()
  })
  const home = mkdtempSync(join(tmpdir(), "tui-views-abort-"))
  const control = IssueViews.controller(() =>
    CloudSession.signedIn({
      HOME: home,
      XDG_CONFIG_HOME: home,
      SMITHERS_API_ORIGIN: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      SMITHERS_TOKEN: "tok_views"
    }), "o/r")
  await control.refresh()
  await control.select("everything")
  const before = IssueViews.panel(control.state())
  const abort = new AbortController()
  const running = control.select("bugs", abort.signal)
  await requested
  expect(IssueViews.panel(control.state()).rows[0]?.status).toBe("requested")
  abort.abort()
  await running
  expect(IssueViews.panel(control.state())).toEqual(before)
  expect(before.summary).toBe("Everything · 1")
  expect(received).toContain("/api/repos/o/r/issues?view=bugs&limit=100")
})

it("aggregates returned opaque cursors, preserves view scope, and publishes no partial page", async () => {
  const received: Array<string> = []
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered!: () => void
  const continuation = new Promise<void>((resolve) => {
    entered = resolve
  })
  const server = createServer(async (request, response) => {
    const path = request.url ?? ""
    received.push(path)
    if (path.endsWith("/issue-views")) {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify(views))
      return
    }
    const url = new URL(path, "http://127.0.0.1")
    const cursor = url.searchParams.get("cursor")
    if (cursor === null) {
      response.writeHead(200, {
        "content-type": "application/json",
        Link: "</api/repos/o/r/issues?view=bugs&limit=100&cursor=MTAw>; rel=\"next\""
      })
      response.end(JSON.stringify(Array.from({ length: 100 }, (_, index) => issue(200 - index))))
    } else {
      entered()
      await held
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify([issue(99)]))
    }
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  servers.push(() => server.close())
  const at = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const home = mkdtempSync(join(tmpdir(), "views-page-"))
  const control = IssueViews.controller(
    () =>
      CloudSession.signedIn({
        HOME: home,
        XDG_CONFIG_HOME: home,
        SMITHERS_API_ORIGIN: at,
        SMITHERS_TOKEN: "tok_view_page"
      }),
    "o/r"
  )
  try {
    await control.refresh()
    const read = control.select("bugs")
    const joined = control.select("bugs")
    expect(joined).toBe(read)
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        continuation,
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new Error("No actual continuation request")), 2000)
        })
      ])
    } finally {
      clearTimeout(deadline)
    }
    expect(control.state()).toMatchObject({ phase: "ready", selected: { id: "bugs", phase: "loading" } })
    expect(IssueViews.panel(control.state()).rows.some((row) => row.id.startsWith("issue-view-issue:"))).toBe(false)
    release()
    await read
    const state = control.state()
    expect(state).toMatchObject({ phase: "ready", selected: { id: "bugs", phase: "loaded" } })
    if (state.phase !== "ready" || state.selected?.phase !== "loaded") throw new Error("Missing complete page read")
    expect(state.selected.issues.map((row) => row.number)).toEqual([
      ...Array.from({ length: 100 }, (_, index) => 200 - index),
      99
    ])
    expect(received).toEqual([
      "/api/repos/o/r/issue-views",
      "/api/repos/o/r/issues?view=bugs&limit=100",
      "/api/repos/o/r/issues?view=bugs&limit=100&cursor=MTAw"
    ])
  } finally {
    control.dispose()
    release()
    server.closeAllConnections()
    rmSync(home, { recursive: true, force: true })
  }
})

it("deduplicates unresolved session acquisition, publishes subscriptions, and disposes owned reads", async () => {
  const signed = deferred<IssueViews.Cloud>()
  const page = deferred<Awaited<ReturnType<IssueViews.Cloud["getPage"]>>>()
  let signs = 0
  let requested!: () => void
  const entered = new Promise<void>((resolve) => {
    requested = resolve
  })
  let signal: AbortSignal | undefined
  const cloud: IssueViews.Cloud = {
    get: async () => views,
    getPage: async (_path, current) => {
      signal = current
      requested()
      return page.promise
    }
  }
  const control = IssueViews.controller(() => {
    signs++
    return signed.promise
  }, "o/r")
  let notifications = 0
  const unsubscribe = control.subscribe(() => {
    notifications++
  })
  const first = control.refresh()
  const second = control.refresh()
  expect(signs).toBe(1)
  expect(control.pending()).toBeDefined()
  signed.resolve(cloud)
  await Promise.all([first, second])
  expect(control.state()).toMatchObject({ phase: "ready", views })
  expect(control.pending()).toBeUndefined()
  const read = control.select("bugs")
  await entered
  expect(control.pending()).toBeDefined()
  expect(signal?.aborted).toBe(false)
  control.dispose()
  control.dispose()
  expect(signal?.aborted).toBe(true)
  const before = control.state()
  const count = notifications
  page.resolve(encodedPage([issue(5)]))
  await read
  expect(control.state()).toEqual(before)
  expect(notifications).toBe(count)
  await control.refresh()
  await control.select("bugs")
  expect(signs).toBe(1)
  unsubscribe()
})

it("refreshing changed filters aborts the old physical read and permits a fresh same-view selection", async () => {
  let declared = views
  let reads = 0
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered!: () => void
  const requested = new Promise<void>((resolve) => {
    entered = resolve
  })
  const server = createServer(async (request, response) => {
    response.writeHead(200, { "content-type": "application/json" })
    if (request.url?.endsWith("/issue-views")) {
      response.end(JSON.stringify(declared))
      return
    }
    reads++
    if (reads === 1) {
      entered()
      await held
      response.end(JSON.stringify([issue(99)]))
    } else response.end(JSON.stringify([issue(8, "closed")]))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  servers.push(() => {
    server.closeAllConnections()
    server.close()
  })
  const home = mkdtempSync(join(tmpdir(), "views-filters-"))
  const control = IssueViews.controller(() =>
    CloudSession.signedIn({
      HOME: home,
      XDG_CONFIG_HOME: home,
      SMITHERS_TOKEN: "tok_filter",
      SMITHERS_API_ORIGIN: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    }), "o/r")
  try {
    await control.refresh()
    const old = control.select("bugs")
    await requested
    declared = [{ ...views[0]!, state: "closed" }, views[1]!]
    await control.refresh()
    expect(control.state()).toEqual({ phase: "ready", views: declared })
    expect(control.pending()).toBeUndefined()
    const fresh = control.select("bugs")
    expect(fresh).not.toBe(old)
    await fresh
    release()
    await old
    expect(control.state()).toMatchObject({
      phase: "ready",
      selected: { id: "bugs", phase: "loaded", issues: [{ number: 8, state: "closed" }] }
    })
    expect(reads).toBe(2)
  } finally {
    control.dispose()
    release()
    server.closeAllConnections()
    rmSync(home, { recursive: true, force: true })
  }
})

it("refuses aggregate wire bytes from padded pages instead of publishing their tiny parsed bodies", async () => {
  let requests = 0
  const server = createServer((_request, response) => {
    requests++
    response.writeHead(200, {
      "content-type": "application/json",
      ...(requests === 1 ? { Link: "</api/repos/o/r/issues?view=bugs&limit=100&cursor=next>; rel=\"next\"" } : {})
    })
    response.end(" ".repeat(2 * 1024 * 1024) + JSON.stringify([issue(requests)]))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  servers.push(() => {
    server.closeAllConnections()
    server.close()
  })
  const home = mkdtempSync(join(tmpdir(), "views-wire-budget-"))
  try {
    const cloud = await CloudSession.signedIn({
      HOME: home,
      XDG_CONFIG_HOME: home,
      SMITHERS_TOKEN: "tok_budget",
      SMITHERS_API_ORIGIN: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    })
    expect(cloud).toBeDefined()
    await expect(IssueViews.loadIssues(cloud!.getPage, "o/r", "bugs")).rejects.toMatchObject({
      code: "pagination_limit"
    })
    expect(requests).toBe(2)
  } finally {
    server.closeAllConnections()
    rmSync(home, { recursive: true, force: true })
  }
})
