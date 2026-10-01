/** Controlled loopback HTTP exercises the production terminal's declared-view door.
 * It proves transport/keyboard ordering, not live Cloud deployment or SQL filters.
 */
import { expect, it } from "bun:test"
import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import * as Session from "../src/session.ts"
import { key, Tui } from "./tmux.ts"

it("opens declared repository issue views from the existing Smithers keyboard door", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-issue-views-"))
  const seen: Array<{ path: string; authorization: string | null }> = []
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered!: () => void
  const continuation = new Promise<void>((resolve) => {
    entered = resolve
  })
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      seen.push({ path: url.pathname + url.search, authorization: request.headers.get("authorization") })
      if (url.pathname === "/api/repos/o/r/mythical") {
        return Response.json({
          repository: "o/r",
          state: "active",
          generation: 1,
          mainBehind: false,
          changes: [],
          items: [],
          lanes: [],
          limits: { maxParallel: 3 }
        })
      }
      if (url.pathname === "/api/repos/o/r/issue-views") {
        return Response.json([{ id: "bugs", title: "Open bugs", state: "open", labels: ["bug"] }])
      }
      if (url.pathname === "/api/repos/o/r/issues" && url.searchParams.get("view") === "bugs") {
        if (url.searchParams.get("cursor") === "opaque_601") {
          entered()
          await held
          return Response.json([{ number: 600, title: "Continued issue", state: "open" }])
        }
        return Response.json([{ number: 601, title: "Filtered issue", state: "open" }], {
          headers: {
            Link: "</api/repos/o/r/issues?view=bugs&limit=100&cursor=opaque_601>; rel=\"next\"",
            "X-Total-Count": "2"
          }
        })
      }
      return new Response("unexpected request", { status: 404 })
    }
  })
  const tui = await Tui.start({
    cwd: root,
    cols: 110,
    rows: 40,
    command: `bun ${resolve(import.meta.dir, "../src/main.tsx")}`,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: root,
      XDG_CONFIG_HOME: root,
      SMITHERS_TUI_SESSION_DIR: join(root, "sessions"),
      SMITHERS_TUI_REPLAY: resolve(import.meta.dir, "../test/fixtures/pong.jsonl"),
      SMITHERS_TOKEN: "tok_issue_views_fixture",
      SMITHERS_REPO: "o/r",
      SMITHERS_API_ORIGIN: `http://127.0.0.1:${server.port}`
    }
  })
  try {
    await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "production startup")
    await tui.type("/smithers")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("Issue views"), 5_000, "existing Smithers declared-view door")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("Open bugs"), 5_000, "declared view list")
    await tui.press(key.enter)
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        continuation,
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new Error("Missing public continuation request")), 5000)
        })
      ])
    } finally {
      clearTimeout(deadline)
    }
    expect(tui.screen()).not.toContain("#601 Filtered issue")
    await tui.press(key.enter)
    expect(seen.filter((request) => request.path.includes("/issues?")).length).toBe(2)
    await tui.press(key.escape)
    await tui.type("prove chat remains usable")
    await tui.press(key.enter)
    const outcome = () => {
      const sessions = join(root, "sessions")
      const folders = readdirSync(sessions, { withFileTypes: true }).filter((entry) => entry.isDirectory())
      if (folders.length !== 1) return undefined
      const folder = join(sessions, folders[0]!.name)
      const journal = readdirSync(folder).find((name) => name.endsWith(".jsonl"))
      return journal === undefined
        ? undefined
        : Session.load(join(folder, journal)).findLast((record) => record.type === "outcome")
    }
    await tui.until(() => outcome() !== undefined, 10_000, "durable Chat outcome during held issue read")
    expect(outcome()).toMatchObject({ type: "outcome", outcome: { _tag: "done", answer: "pong" } })
    release()
    await tui.type("/smithers")
    await tui.press(key.enter)
    await tui.press(key.up)
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("#601 Filtered issue"), 5_000, "repository filtered readback")
    await tui.until(
      (screen) => screen.includes("#600 Continued issue") && screen.includes("Open bugs · 2"),
      5_000,
      "complete returned-cursor view"
    )
    expect(seen.filter((request) => request.path.includes("issue-views"))).toEqual(Array.from({ length: 2 }, () => ({
      path: "/api/repos/o/r/issue-views",
      authorization: "token tok_issue_views_fixture"
    })))
    expect(seen.filter((request) => request.path.includes("/issues?"))).toEqual([{
      path: "/api/repos/o/r/issues?view=bugs&limit=100",
      authorization: "token tok_issue_views_fixture"
    }, {
      path: "/api/repos/o/r/issues?view=bugs&limit=100&cursor=opaque_601",
      authorization: "token tok_issue_views_fixture"
    }])
    expect(tui.screen()).not.toContain("unexpected request")
  } finally {
    release()
    await tui.stop()
    server.stop(true)
    rmSync(root, { recursive: true, force: true })
  }
}, 45_000)

it("keeps declared-view failures safe and retries explicitly after transport and session refusal", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-view-recovery-"))
  let reads = 0
  let lists = 0
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname.endsWith("/mythical")) {
        return Response.json({
          repository: "o/r",
          state: "active",
          generation: 1,
          mainBehind: false,
          changes: [],
          items: [],
          lanes: [],
          limits: { maxParallel: 3 }
        })
      }
      if (url.pathname.endsWith("/issue-views")) {
        lists++
        return Response.json([{ id: "bugs", title: "Open bugs", state: "open", labels: ["bug"] }])
      }
      if (url.pathname.endsWith("/issues") && url.searchParams.get("view") === "bugs") {
        reads++
        if (reads === 1) return Response.json({ message: "PRIVATE_REMOTE_FAILURE" }, { status: 503 })
        if (reads === 3) return Response.json({ message: "PRIVATE_SESSION_FAILURE" }, { status: 401 })
        return Response.json([{ number: 610 + reads, title: "Recovered issue", state: "open" }])
      }
      return new Response("unexpected", { status: 404 })
    }
  })
  let tui: Tui | undefined
  try {
    tui = await Tui.start({
      cwd: root,
      cols: 110,
      rows: 40,
      command: `bun ${resolve(import.meta.dir, "../src/main.tsx")}`,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: root,
        XDG_CONFIG_HOME: root,
        SMITHERS_TUI_SESSION_DIR: join(root, "sessions"),
        SMITHERS_TUI_REPLAY: resolve(import.meta.dir, "../test/fixtures/pong.jsonl"),
        SMITHERS_TOKEN: "tok_views_recovery",
        SMITHERS_REPO: "o/r",
        SMITHERS_API_ORIGIN: `http://127.0.0.1:${server.port}`
      }
    })
    await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "production startup")
    await tui.type("/smithers")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("Issue views"), 5_000, "declared view door")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("Open bugs"), 5_000, "declared view list")
    await tui.press(key.enter)
    await tui.until(
      (screen) => screen.includes("That command could not run.") && screen.includes("Details: /conversation"),
      5_000,
      "safe retryable failure"
    )
    expect(reads).toBe(1)
    expect(tui.screen()).not.toContain("PRIVATE_REMOTE_FAILURE")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("#612 Recovered issue"), 5_000, "explicit issue read retry")
    expect(reads).toBe(2)
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("Sign in: smthrs auth login"), 5_000, "session refusal")
    expect(tui.screen()).not.toContain("#612 Recovered issue")
    expect(tui.screen()).not.toContain("PRIVATE_SESSION_FAILURE")
    expect(reads).toBe(3)
    await tui.press(key.escape)
    await tui.type("/smithers")
    await tui.press(key.enter)
    await tui.press(key.up)
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("Open bugs"), 5_000, "fresh signed-in declared views")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("#614 Recovered issue"), 5_000, "fresh-session recovery")
    expect(reads).toBe(4)
    expect(lists).toBe(2)
  } finally {
    await tui?.stop()
    server.stop(true)
    rmSync(root, { recursive: true, force: true })
  }
}, 45_000)

it("keeps a background issue-view failure visible in Chat and recovers through the existing door", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-view-background-"))
  let reads = 0
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered!: () => void
  const requested = new Promise<void>((resolve) => {
    entered = resolve
  })
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname.endsWith("/mythical")) {
        return Response.json({
          repository: "o/r",
          state: "active",
          generation: 1,
          mainBehind: false,
          changes: [],
          items: [],
          lanes: [],
          limits: { maxParallel: 3 }
        })
      }
      if (url.pathname.endsWith("/issue-views")) {
        return Response.json([{ id: "bugs", title: "Open bugs", state: "open", labels: ["bug"] }])
      }
      if (url.pathname.endsWith("/issues") && url.searchParams.get("view") === "bugs") {
        reads++
        if (reads === 1) {
          entered()
          await held
          return Response.json({ message: "PRIVATE_BACKGROUND_FAILURE" }, { status: 503 })
        }
        return Response.json([{ number: 620, title: "Recovered background issue", state: "open" }])
      }
      return new Response("unexpected", { status: 404 })
    }
  })
  let tui: Tui | undefined
  try {
    tui = await Tui.start({
      cwd: root,
      cols: 110,
      rows: 40,
      command: `bun ${resolve(import.meta.dir, "../src/main.tsx")}`,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: root,
        XDG_CONFIG_HOME: root,
        SMITHERS_TUI_SESSION_DIR: join(root, "sessions"),
        SMITHERS_TUI_REPLAY: resolve(import.meta.dir, "../test/fixtures/pong.jsonl"),
        SMITHERS_TOKEN: "tok_views_background",
        SMITHERS_REPO: "o/r",
        SMITHERS_API_ORIGIN: `http://127.0.0.1:${server.port}`
      }
    })
    await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "production startup")
    await tui.type("/smithers")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("Issue views"), 5_000, "existing issue-view door")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("Open bugs"), 5_000, "declared view list")
    await tui.press(key.enter)
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        requested,
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new Error("Missing held public issue request")), 5000)
        })
      ])
    } finally {
      clearTimeout(deadline)
    }
    await tui.press(key.escape)
    await tui.type("keep Chat usable during background issue read")
    await tui.press(key.enter)
    const outcome = () => {
      const folders = readdirSync(join(root, "sessions"), { withFileTypes: true }).filter((entry) =>
        entry.isDirectory()
      )
      if (folders.length !== 1) return undefined
      const folder = join(root, "sessions", folders[0]!.name)
      const journal = readdirSync(folder).find((name) => name.endsWith(".jsonl"))
      return journal === undefined
        ? undefined
        : Session.load(join(folder, journal)).findLast((record) => record.type === "outcome")
    }
    await tui.until(() => outcome() !== undefined, 10_000, "durable Chat completion while view unresolved")
    expect(outcome()).toMatchObject({ type: "outcome", outcome: { _tag: "done", answer: "pong" } })
    release()
    await tui.until(
      (screen) => screen.includes("That command could not run.") && screen.includes("Details: /conversation"),
      5_000,
      "background failure diagnostic in Chat"
    )
    expect(tui.screen()).not.toContain("PRIVATE_BACKGROUND_FAILURE")
    expect(reads).toBe(1)
    await tui.type("/smithers")
    await tui.press(key.enter)
    await tui.press(key.up)
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("Open bugs"), 5_000, "existing view reopened after failure")
    await tui.press(key.enter)
    await tui.until(
      (screen) => screen.includes("#620 Recovered background issue"),
      5_000,
      "successful background read retry"
    )
    expect(reads).toBe(2)
    await tui.press(key.escape)
    await tui.until(
      (screen) => !screen.includes("That command could not run."),
      5_000,
      "settled failure notice cleared"
    )
  } finally {
    release()
    await tui?.stop()
    server.stop(true)
    rmSync(root, { recursive: true, force: true })
  }
}, 45_000)
