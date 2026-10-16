import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { quickstart } from "../examples/quickstart.ts"

describe("examples", () => {
  const directories: Array<string> = []
  const scratch = () => {
    const root = mkdtempSync(join(tmpdir(), "engine-store-quickstart-"))
    directories.push(root)
    mkdirSync(join(root, ".flows"))
    return { filename: join(root, ".flows", "engine.db"), root }
  }

  // The quickstart is a SQLite program; an operator's PostgreSQL settings
  // must not redirect it to a shared server.
  beforeEach(() => {
    vi.stubEnv("SMITHERS_BACKEND", "sqlite")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  })

  it("quickstart runs the sealed step once and replays it on a second engine", async () => {
    const { filename, root } = scratch()
    expect(await quickstart(filename, root)).toEqual({ first: "42", second: "42", executions: 1 })
  })

  it("quickstart over a file that already holds the attempt replays on both engines", async () => {
    const { filename, root } = scratch()
    await quickstart(filename, root)
    expect(await quickstart(filename, root)).toEqual({ first: "42", second: "42", executions: 0 })
  })
})
