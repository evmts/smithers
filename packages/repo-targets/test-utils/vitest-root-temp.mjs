import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"

const registered = Symbol.for("@smthrs/testing/vitest-root-temp")

// Vitest 5 removes project scratch but omits its root module fetcher's directory.
// This pinned integration fails closed if that internal shape changes.
export const registerRootCleanup = (runner) => {
  if (runner[registered]) return
  const directory = runner._tmpDir
  if (
    typeof directory !== "string" || dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !/^[\w-]{21}$/.test(basename(directory))
  ) {
    throw new Error("Review Vitest root scratch ownership before running tests")
  }
  runner[registered] = true
  runner.onClose(async () => {
    try {
      await rm(directory, { recursive: true, force: true })
    } finally {
      delete runner[registered]
    }
  })
}
