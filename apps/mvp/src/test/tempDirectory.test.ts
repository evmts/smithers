import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll, expect, test } from "vitest"
import { tempDirectory } from "./tempDirectory"

// Vitest runs afterAll hooks in reverse registration order. Check after both finalizers.
afterAll(() => {
  expect(existsSync(directory)).toBe(false)
  expect(existsSync(other)).toBe(false)
})

const directory = tempDirectory("mvp-temp-cleanup-")
const other = tempDirectory("mvp-temp-cleanup-")

test("suite scratch survives reloads and owns nested files independently", () => {
  expect(directory).not.toBe(other)
  mkdirSync(join(directory, "nested"))
  writeFileSync(join(directory, "nested", "device.sqlite"), "device")
  writeFileSync(join(other, "device.sqlite-wal"), "journal")
  expect(existsSync(directory)).toBe(true)
})
