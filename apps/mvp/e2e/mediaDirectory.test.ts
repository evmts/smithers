import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { expect, test } from "vitest"
import { tempDirectory } from "../src/test/tempDirectory"
import { withMediaDirectory } from "./mediaDirectory"

for (const fails of [false, true]) {
  test(`media scratch stays inside output and is removed on ${fails ? "failure" : "success"}`, async () => {
    const root = tempDirectory("mvp-media-test-")
    const output = join(root, "test-results")
    let used = ""
    const rendering = withMediaDirectory(output, async (directory) => {
      used = directory
      expect(relative(output, directory)).toMatch(/^e2e-media-/)
      mkdirSync(join(directory, "frames"))
      writeFileSync(join(directory, "frames", "frame.png"), "frame")
      if (fails) throw new Error("render failed")
      return "rendered"
    })
    if (fails) await expect(rendering).rejects.toThrow("render failed")
    else await expect(rendering).resolves.toBe("rendered")
    expect(existsSync(used)).toBe(false)
    expect(readdirSync(output)).toEqual([])
  })
}
