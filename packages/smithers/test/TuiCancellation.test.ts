import { getEventListeners, once } from "node:events"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import * as Tui from "../src/commands/Tui.ts"

const roots: Array<string> = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const fixture = (body: string) => {
  const root = mkdtempSync(join(tmpdir(), "smithers-tui-cancellation-"))
  roots.push(root)
  const script = join(root, "tui.cjs")
  writeFileSync(script, body)
  return { root, script, packageRoot: pathToFileURL(`${root}/`) }
}

describe("local TUI cancellation", () => {
  it("preserves normal exit status and removes the abort listener after completion", async () => {
    const { script, packageRoot } = fixture("process.exit(7)")
    const controller = new AbortController()
    expect(
      await Tui.run(
        { directory: script },
        { SMITHERS_TUI_BIN: process.execPath },
        packageRoot,
        Tui.host,
        controller.signal
      )
    ).toBe(7)
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
    controller.abort()
  })

  it("removes the abort listener when spawning fails", async () => {
    const { root, packageRoot } = fixture("")
    const controller = new AbortController()
    const listeners = ["SIGINT", "SIGTERM", "SIGHUP"].map((event) => process.listenerCount(event))
    await expect(Tui.run(
      {},
      { SMITHERS_TUI_BIN: root },
      packageRoot,
      Tui.host,
      controller.signal
    )).rejects.toMatchObject({ code: "EACCES" })
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
    expect(["SIGINT", "SIGTERM", "SIGHUP"].map((event) => process.listenerCount(event))).toEqual(listeners)
  })

  it("does not spawn for an already aborted signal", async () => {
    const { root, script, packageRoot } = fixture(
      "require(\"node:fs\").writeFileSync(process.env.MARKER, \"started\")"
    )
    const marker = join(root, "started")
    const reason = new Error("Cancelled before launch")
    const controller = new AbortController()
    controller.abort(reason)
    const result = await Tui.run(
      { directory: script },
      { SMITHERS_TUI_BIN: process.execPath, MARKER: marker },
      packageRoot,
      Tui.host,
      controller.signal
    ).then((status) => ({ status }), (error: unknown) => ({ error }))
    expect(existsSync(marker)).toBe(false)
    expect(result).toEqual({ error: reason })
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
  })

  it("terminates a running child and removes cancellation and process listeners", async () => {
    const server = createServer()
    server.listen(0, "127.0.0.1")
    await once(server, "listening")
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("Missing listener address")
    const { script, packageRoot } = fixture(`
      const socket = require("node:net").createConnection(${address.port}, "127.0.0.1")
      socket.on("connect", () => socket.write("ready"))
      socket.on("end", () => process.exit(0))
    `)
    const controller = new AbortController()
    const listeners = ["SIGINT", "SIGTERM", "SIGHUP"].map((event) => process.listenerCount(event))
    const connected = once(server, "connection")
    let settled = false
    const running = Tui.run(
      { directory: script },
      { SMITHERS_TUI_BIN: process.execPath },
      packageRoot,
      Tui.host,
      controller.signal
    ).finally(() => {
      settled = true
    })
    const [socket] = await connected
    try {
      await once(socket, "data")
      controller.abort()
      await expect.poll(() => settled, { timeout: 2_000 }).toBe(true)
      expect(await running).toBe(130)
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
      expect(["SIGINT", "SIGTERM", "SIGHUP"].map((event) => process.listenerCount(event))).toEqual(listeners)
    } finally {
      socket.end()
      await running
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
