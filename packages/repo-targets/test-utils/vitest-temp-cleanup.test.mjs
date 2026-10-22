import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { test } from "node:test"
import { createVitest } from "vitest/node"
import { registerRootCleanup } from "./vitest-root-temp.mjs"

for (const fails of [false, true]) {
  test(`Vitest removes root SSR transforms after ${fails ? "failure" : "success"}`, async () => {
    const parent = resolve(".cache")
    mkdirSync(parent, { recursive: true })
    const root = mkdtempSync(join(parent, "vitest-cleanup-"))
    const previousExitCode = process.exitCode
    let runner
    let scratch
    try {
      writeFileSync(
        join(root, "case.test.js"),
        `import { test, expect } from 'vitest'; test('real transform', () => expect(1).toBe(${fails ? 2 : 1}));`
      )
      runner = await createVitest("test", {
        config: false,
        root,
        watch: false,
        include: ["case.test.js"],
        coverage: { enabled: false },
        reporters: [],
        maxWorkers: 1
      })
      // Pinned to Vitest 5: this is the directory its root module fetcher writes.
      registerRootCleanup(runner)
      scratch = runner._tmpDir
      assert.equal(typeof scratch, "string")
      await runner.start()
      assert.equal(existsSync(join(scratch, "ssr")), true, "exercise actual disk transforms")
      assert.equal(runner.state.getCountOfFailedTests() > 0, fails)
    } finally {
      try {
        await runner?.close()
      } finally {
        process.exitCode = previousExitCode
        rmSync(root, { recursive: true, force: true })
      }
    }
    assert.equal(existsSync(scratch), false, "close must reclaim its own transform directory")
  })
}

test("root cleanup refuses a directory outside the current temporary owner", async () => {
  const parent = resolve(".cache")
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, "vitest-ownership-"))
  const foreign = join(root, "foreign")
  mkdirSync(foreign)
  const keys = ["TMPDIR", "TMP", "TEMP"]
  const previous = keys.map((key) => process.env[key])
  let runner
  const restore = () =>
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key]
      else process.env[key] = previous[index]
    })
  try {
    runner = await createVitest("test", { config: false, root, watch: false, reporters: [] })
    for (const key of keys) process.env[key] = foreign
    assert.throws(() => registerRootCleanup(runner), /root scratch ownership/)
    assert.equal(existsSync(foreign), true)
    restore()
    registerRootCleanup(runner)
  } finally {
    restore()
    try {
      await runner?.close()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})
