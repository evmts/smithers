import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"

// Supply the actual npm release tarball, not a source-tree fixture:
// SMTHRS_PLATFORM_NODE_TARBALL=/absolute/platform-node.tgz node --test <this file>
test("#4248: the published POSIX helper can be executed after extraction", {
  skip: process.platform === "win32"
}, () => {
  assert.ok(process.env.SMTHRS_PLATFORM_NODE_TARBALL, "supply the published platform-node tarball")
  const archive = resolve(process.env.SMTHRS_PLATFORM_NODE_TARBALL)
  const directory = mkdtempSync(join(tmpdir(), "issue-4248-"))
  try {
    execFileSync("tar", ["-xpf", archive, "-C", directory])
    const helper = join(directory, "package", "bin", `${process.platform}-${process.arch}`, "smithers-jj-export")
    const result = spawnSync(helper, [], { encoding: "utf8", input: "", timeout: 5000 })
    // No request deliberately exercises the helper's real usage response.
    assert.equal(result.error, undefined, `cannot execute packaged helper: ${result.error?.code}`)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /usage: smithers-jj-export/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
