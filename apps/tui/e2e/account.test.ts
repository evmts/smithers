/** Controlled real HTTP proves terminal ordering; live Go/PostgreSQL acceptance is a separate App probe. */
import { expect, it } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { key, Tui } from "./tmux"

it("keeps Chat editable and deduplicates Account while its persisted HTTP read is unresolved", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-account-http-"))
  const sessions = join(root, "sessions")
  const held = Promise.withResolvers<void>()
  const admitted = Promise.withResolvers<void>()
  let dispatches = 0
  let running = true
  const requestIds: string[] = []
  let reads = 0
  let failed = false
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      expect(new URL(request.url).pathname).toBe("/api/workflow/rpc")
      expect(request.method).toBe("POST")
      expect(request.headers.get("authorization")).toBe("token owned-http-token")
      const body = await request.json()
      expect(body.payload.name).toBe("account.show")
      if (body.procedure === "Operation.Dispatch") {
        dispatches++
        requestIds.push(body.payload.requestId)
        expect(body.payload.input).toEqual({})
        await admitted.promise
        return Response.json({
          operationId: `job-${dispatches}`,
          requestId: body.payload.requestId,
          kind: "requested",
          state: "accepted",
          acceptedAt: "2026-10-01T00:00:00Z"
        })
      }
      expect(body.procedure).toBe("Operation.Read")
      expect(body.payload.requestId).toBe(requestIds.at(-1))
      reads++
      if (running) {
        return Response.json({
          operationId: `job-${dispatches}`,
          requestId: body.payload.requestId,
          actor: "api",
          state: "running"
        })
      }
      await held.promise
      return failed
        ? Response.json({ message: "private-http-failure" }, { status: 503 })
        : Response.json({
          operationId: `job-${dispatches}`,
          requestId: body.payload.requestId,
          actor: "api",
          state: "completed",
          result: { login: "owned-http-account" }
        })
    }
  })
  let tui: Tui | undefined
  const history = () =>
    readdirSync(sessions, { recursive: true }).filter((file): file is string =>
      typeof file === "string" && file.endsWith(".jsonl")
    )
      .map((file) => readFileSync(join(sessions, file), "utf8")).join("\n")
  const request = async () => {
    await tui!.type("/account.show")
    await tui!.press(key.enter)
  }
  try {
    tui = await Tui.start({
      cwd: root,
      cols: 110,
      rows: 40,
      command: `bun ${resolve(import.meta.dir, "../src/main.tsx")} --model cerebras:qwen-3.8-27b`,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: root,
        XDG_CONFIG_HOME: root,
        SMITHERS_DISABLE_SYSTEM_KEYRING: "1",
        SMITHERS_TUI_SESSION_DIR: sessions,
        SMITHERS_API_ORIGIN: server.url.origin,
        SMITHERS_TOKEN: "owned-http-token"
      }
    })
    await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20000, "Account protocol startup")
    await request()
    await tui.until(() => dispatches === 1, 5000, "held Account admission")
    expect(history()).toContain("\"state\":\"requested\"")
    expect(history()).not.toContain("\"state\":\"complete\"")
    await request()
    await tui.type("owned draft while Account is unresolved")
    await tui.until(
      (screen) => screen.includes("owned draft while Account is unresolved"),
      5000,
      "editable Chat during held read"
    )
    expect(dispatches).toBe(1)
    expect(reads).toBe(0)
    admitted.resolve()
    await tui.until(() => reads >= 1, 5000, "running server Account operation")
    expect(history()).toContain("job-1")
    expect(history()).not.toContain("\"state\":\"complete\"")
    expect(tui.screen()).toContain("owned draft while Account is unresolved")
    running = false
    expect(history()).not.toContain("\"state\":\"complete\"")
    failed = true
    held.resolve()
    await tui.until((screen) => screen.includes("That command could not run."), 5000, "safe Account failure")
    expect(history()).toContain("\"state\":\"failed\"")
    expect(tui.screen()).not.toContain("private-http-failure")
    // Clear only the unsent editor draft; never submit a model turn.
    await tui.press(key.ctrlA)
    await tui.press(key.ctrlK)
    failed = false
    await request()
    await tui.until((screen) => screen.includes("@owned-http-account"), 5000, "Account retry completion")
    expect(dispatches).toBe(2)
    expect(new Set(requestIds).size).toBe(2)
    expect(history()).toContain("\"state\":\"complete\"")
    for (const marker of ["owned-http-token", "private-http-value", "private-http-failure", "owned-http-account"]) {
      expect(history()).not.toContain(marker)
    }
    expect(history()).not.toContain("\"model-requested\"")
  } finally {
    admitted.resolve()
    held.resolve()
    try {
      await tui?.stop()
    } finally {
      try {
        await server.stop(true)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  }
}, 60000)

for (const acknowledged of [false, true]) {
  it(
    `reconnects ${acknowledged ? "acknowledged" : "interrupted admission"} Account pointers through --continue`,
    async () => {
      const root = mkdtempSync(join(tmpdir(), "tui-account-resume-"))
      const sessions = join(root, "sessions")
      const held = Promise.withResolvers<void>()
      const dispatchIds: string[] = []
      const readIds: string[] = []
      let restarted = false
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
          expect(new URL(request.url).pathname).toBe("/api/workflow/rpc")
          expect(request.method).toBe("POST")
          expect(request.headers.get("authorization")).toBe("token owned-resume-token")
          const body = await request.json()
          expect(body.payload.name).toBe("account.show")
          if (body.procedure === "Operation.Dispatch") {
            dispatchIds.push(body.payload.requestId)
            expect(body.payload.input).toEqual({})
            if (!acknowledged && !restarted) await held.promise
            return Response.json({
              operationId: "owned-resume-operation",
              requestId: body.payload.requestId,
              kind: "requested",
              state: "accepted",
              acceptedAt: "2026-10-01T00:00:00Z"
            })
          }
          expect(body.procedure).toBe("Operation.Read")
          readIds.push(body.payload.requestId)
          if (!restarted) await held.promise
          return Response.json({
            operationId: "owned-resume-operation",
            requestId: body.payload.requestId,
            actor: "api",
            state: "completed",
            result: { login: "owned-resumed-account" }
          })
        }
      })
      let tui: Tui | undefined
      const history = () =>
        readdirSync(sessions, { recursive: true })
          .filter((file): file is string => typeof file === "string" && file.endsWith(".jsonl"))
          .map((file) => readFileSync(join(sessions, file), "utf8")).join("\n")
      const start = (resume: boolean) =>
        Tui.start({
          cwd: root,
          cols: 110,
          rows: 40,
          command: `bun ${resolve(import.meta.dir, "../src/main.tsx")} --model cerebras:qwen-3.8-27b${
            resume ? " --continue" : ""
          }`,
          env: {
            PATH: process.env.PATH ?? "",
            HOME: root,
            XDG_CONFIG_HOME: root,
            SMITHERS_DISABLE_SYSTEM_KEYRING: "1",
            SMITHERS_TUI_SESSION_DIR: sessions,
            SMITHERS_API_ORIGIN: server.url.origin,
            SMITHERS_TOKEN: "owned-resume-token"
          }
        })
      try {
        tui = await start(false)
        await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20000, "Account resume startup")
        await tui.type("/account.show")
        await tui.press(key.enter)
        await tui.until(
          () => dispatchIds.length === 1 && (!acknowledged || readIds.length === 1),
          5000,
          "retained Account admission boundary"
        )
        const original = dispatchIds[0]
        if (original === undefined) throw new Error("Account dispatch was not observed")
        expect(history()).toContain(original)
        expect(history().includes("owned-resume-operation")).toBe(acknowledged)
        expect(history()).not.toContain("\"state\":\"complete\"")
        await tui.stop()
        tui = undefined
        restarted = true
        held.resolve()
        tui = await start(true)
        await tui.until(
          (screen) => screen.includes("@owned-resumed-account"),
          20000,
          "same Account request reconnected"
        )
        expect(dispatchIds).toEqual(acknowledged ? [original] : [original, original])
        expect(readIds.length).toBeGreaterThan(0)
        expect(new Set(readIds)).toEqual(new Set([original]))
        expect(history()).toContain("\"state\":\"complete\"")
        for (const marker of ["owned-resume-token", "owned-resumed-account", "\"model-requested\""]) {
          expect(history()).not.toContain(marker)
        }
        await tui.type("unsent draft after reconnect")
        await tui.until((screen) => screen.includes("unsent draft after reconnect"), 5000, "Chat after reconnect")
      } finally {
        held.resolve()
        try {
          await tui?.stop()
        } finally {
          try {
            await server.stop(true)
          } finally {
            rmSync(root, { recursive: true, force: true })
          }
        }
      }
    },
    60000
  )
}
