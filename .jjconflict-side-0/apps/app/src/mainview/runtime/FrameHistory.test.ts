import { describe,expect,test } from "bun:test"
import type { FrameLocation } from "./FrameHistory"
import { createBrowserFrameHistory,framePath,parseFramePath,ROOT_APP_PATH } from "./FrameHistory"

describe("frame URLs", () => {
  test("round-trip opaque workspace, branch, and frame ids", () => {
    const location = {
      workspaceId: "workspace/acme",
      branchId: "branch:main",
      frameId: "frame-card:branch:card/1"
    }
    const path = framePath(location)
    expect(path).toBe("/w/workspace%2Facme/b/branch%3Amain/f/frame-card%3Abranch%3Acard%2F1")
    expect(parseFramePath(path)).toEqual(location)
  })

  test("rejects unrelated, incomplete, and malformed paths", () => {
    expect(parseFramePath("/")).toBeUndefined()
    expect(parseFramePath("/w/a/b/b")).toBeUndefined()
    expect(parseFramePath("/w/%E0%A4%A/b/b/f/f")).toBeUndefined()
  })
})

/** A browser: an entry stack with a cursor, where back/forward move the cursor and fire popstate. */
const browser = (pathname: string) => {
  const entries: Array<{ state: unknown; pathname: string }> = [{ state: null, pathname }]
  let index = 0
  const listeners = new Set<() => void>()
  const travel = (step: number): void => {
    const next = index + step
    if (next < 0 || next >= entries.length) return
    index = next
    for (const listener of listeners) listener()
  }
  const host = {
    location: {
      get pathname() { return new URL(entries[index]!.pathname, "https://smithers.sh").pathname },
      get search() { return new URL(entries[index]!.pathname, "https://smithers.sh").search }
    },
    history: {
      get state() { return entries[index]!.state },
      pushState: (state: unknown, _unused: string, url?: string | URL | null) => {
        entries.splice(index + 1)
        entries.push({ state, pathname: String(url) })
        index = entries.length - 1
      },
      replaceState: (state: unknown, _unused: string, url?: string | URL | null) => {
        entries[index] = { state, pathname: String(url) }
      },
      back: () => travel(-1),
      forward: () => travel(1)
    },
    addEventListener: (_type: "popstate", listener: () => void) => void listeners.add(listener),
    removeEventListener: (_type: "popstate", listener: () => void) => void listeners.delete(listener)
  }
  return { host, entries: () => entries.map((entry) => entry.pathname) }
}

const root: FrameLocation = { workspaceId: "workspace-default", branchId: "branch-main", frameId: "frame-root:branch-main" }
const card: FrameLocation = { workspaceId: "workspace-default", branchId: "branch-main", frameId: "frame-card:branch-main:card-1" }

describe("browser frame history", () => {
  test("legacy tutorial query does not change repository frame navigation", () => {
    const { host, entries } = browser("/smithersai/smithers/?tutorial")
    const history = createBrowserFrameHistory(host)
    history.replace(root)
    history.push(card)
    expect(entries()).toEqual(["/smithersai/smithers/", "/smithersai/smithers/"])
    const restored = createBrowserFrameHistory(host)
    restored.replace(card)
    expect(host.location.search).toBe("")
    restored.back()
    expect(restored.current()).toEqual(root)
  })

  test("booted from /owner/name, push and replace leave the pathname untouched and back/forward still report frames", () => {
    const { host, entries } = browser("/smithersai/smithers")
    const history = createBrowserFrameHistory(host)
    const seen: Array<FrameLocation | undefined> = []
    history.subscribe((location) => seen.push(location))

    expect(history.current()).toBeUndefined()
    history.replace(root)
    history.push(card)
    expect(host.location.pathname).toBe("/smithersai/smithers")
    expect(entries()).toEqual(["/smithersai/smithers", "/smithersai/smithers"])
    expect(history.current()).toEqual(card)

    history.back()
    expect(host.location.pathname).toBe("/smithersai/smithers")
    expect(seen).toEqual([root])
    history.forward()
    expect(seen).toEqual([root, card])
  })

  /*
   * #4039: a GitHub-shaped subject path is a repository path too, so the
   * address bar keeps the WHOLE target for the life of the page. A reload
   * re-enters the same pull request and tab, and frame navigation inside the
   * app neither rewrites nor loses it.
   */
  for (const entry of [
    "/roninjin10/e2e-verify/pull/2/files",
    "/roninjin10/e2e-verify/pull/2",
    "/roninjin10/e2e-verify/pulls",
    "/roninjin10/e2e-verify/issues/6"
  ]) test(`booted from ${entry}, the subject stays in the address bar across frames and history`, () => {
    const { host, entries } = browser(entry)
    const history = createBrowserFrameHistory(host)
    const seen: Array<FrameLocation | undefined> = []
    history.subscribe((location) => seen.push(location))
    history.replace(root)
    history.push(card)
    expect(host.location.pathname).toBe(entry)
    expect(entries()).toEqual([entry, entry])
    expect(history.current()).toEqual(card)
    history.back()
    expect(host.location.pathname).toBe(entry)
    expect(seen).toEqual([root])
  })

  /* An unsupported path is NOT pinned as a repository: it is not one. */
  test("a blob path is not a repository path, so it keeps the frame-pointer mode", () => {
    const { host } = browser("/roninjin10/e2e-verify/blob/main/src/index.ts")
    const history = createBrowserFrameHistory(host)
    history.push(card)
    expect(host.location.pathname).toBe(framePath(card))
  })

  /*
   * The kept root keeps its own address (#4041): `/` is the launcher and
   * remounts the app, so a frame write no longer moves the visitor to
   * `/?tutorial`, and an explicit entry keeps the address it arrived on.
   */
  for (const entry of ["/", "/?tutorial"]) test(`mounted from ${entry}, frames keep that root address`, () => {
    const { host, entries } = browser(entry)
    const history = createBrowserFrameHistory(host, { keepUrl: true })
    history.replace(root)
    history.push(card)
    expect(entries()).toEqual([entry, entry])
    expect(history.current()).toEqual(card)
    history.back()
    expect(history.current()).toEqual(root)
    history.forward()
    expect(history.current()).toEqual(card)
  })

  for (const entry of ["/?signed-in=github", "/?auth=failed", "/?auth=error"]) {
    test(`mounted from ${entry}, frames write the address boot left, never the spent marker`, () => {
      const { host, entries } = browser(entry)
      const history = createBrowserFrameHistory(host, { keepUrl: true })
      // What ControllerBoot does with a consumed authentication return.
      host.history.replaceState(host.history.state, "", ROOT_APP_PATH)
      history.replace(root)
      history.push(card)
      expect(entries()).toEqual([ROOT_APP_PATH, ROOT_APP_PATH])
      expect(history.current()).toEqual(card)
    })
  }

  test("booted from /, push and replace write the frame path and read it back", () => {
    const { host, entries } = browser("/")
    const history = createBrowserFrameHistory(host)
    history.replace(root)
    history.push(card)
    expect(host.location.pathname).toBe(framePath(card))
    expect(entries()).toEqual([framePath(root), framePath(card)])
    expect(history.current()).toEqual(card)
    const seen: Array<FrameLocation | undefined> = []
    history.subscribe((location) => seen.push(location))
    history.back()
    expect(seen).toEqual([root])
  })

  test("booted from a frame path, the entry is the current frame and pushes keep writing frame paths", () => {
    const { host } = browser(framePath(root))
    const history = createBrowserFrameHistory(host)
    expect(history.current()).toEqual(root)
    history.push(card)
    expect(host.location.pathname).toBe(framePath(card))
  })

  test("a foreign entry's state on a repository path is no frame", () => {
    const { host } = browser("/smithersai/smithers")
    host.history.replaceState({ smithersFrame: true, location: { workspaceId: 1 } }, "", "/smithersai/smithers")
    expect(createBrowserFrameHistory(host).current()).toBeUndefined()
  })
})
