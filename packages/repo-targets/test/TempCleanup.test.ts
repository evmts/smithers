import { execFileSync } from "node:child_process"
import { expect, test } from "vitest"

for (const source of ["vitest"]) {
  test(`${source} cleans up after real test runs`, () => {
    expect(() => execFileSync(process.execPath, ["--test", `test-utils/${source}-temp-cleanup.test.mjs`], {
      cwd: import.meta.dirname + "/..", encoding: "utf8", timeout: 25_000,
    })).not.toThrow()
  })
}
