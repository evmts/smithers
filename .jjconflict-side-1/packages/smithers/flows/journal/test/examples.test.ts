import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { quickstart } from "../examples/quickstart.ts"

describe("examples", () => {
  const directories: Array<string> = []
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  })

  it("quickstart prints what docs/quickstart.md promises: redacted, canonical, one seq line", async () => {
    const directory = mkdtempSync(join(tmpdir(), "journal-quickstart-"))
    directories.push(directory)
    expect(await quickstart(join(directory, "quickstart.db"))).toEqual([
      "durable: Accepted seq 0",
      "0 run.created {\"flow\":\"build\",\"token\":\"[REDACTED]\"}",
      "1 step.progress {\"percent\":40,\"step\":\"compile\"}",
      "hasMore: false"
    ])
  })

  it("quickstart rerun on the same file appends the next seq instead of replacing history", async () => {
    const directory = mkdtempSync(join(tmpdir(), "journal-quickstart-"))
    directories.push(directory)
    const filename = join(directory, "quickstart.db")
    await quickstart(filename)
    const second = await quickstart(filename)
    expect(second[0]).toBe("durable: Accepted seq 2")
    expect(second.at(-1)).toBe("hasMore: false")
    expect(second).toHaveLength(6)
  })
})
