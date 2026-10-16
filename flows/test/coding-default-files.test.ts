import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { defaultFiles } from "../coding/build.mjs"

// A packaged default that is also a workspace package has a node_modules whose
// links lead back into the workspace. Node's recursive readdir follows them, so
// listing the whole directory walked the workspace without end and the host
// build ran out of memory. Only flow.ts and src/ ship, so only they are listed.
test("a default ships flow.ts and its src tree, and a linked node_modules beside them is never walked", async () => {
  const root = await mkdtemp(join(tmpdir(), "smithers-default-files-"))
  try {
    const directory = join(root, "review")
    await mkdir(join(directory, "src", "nested"), { recursive: true })
    await mkdir(join(directory, "seeded-bugs", "node_modules"), { recursive: true })
    await writeFile(join(directory, "flow.ts"), "export default 1\n")
    await writeFile(join(directory, "README.md"), "# Review\n")
    await writeFile(join(directory, "src", "a.ts"), "export {}\n")
    await writeFile(join(directory, "src", "nested", "b.ts"), "export {}\n")
    await writeFile(join(directory, "src", "notes.md"), "not shipped\n")
    // A cycle: the link leads back above the default itself.
    await symlink(root, join(directory, "seeded-bugs", "node_modules", "workspace"))
    assert.deepEqual(await defaultFiles(directory), ["flow.ts", "src/a.ts", "src/nested/b.ts"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("a default with no src ships its flow.ts alone", async () => {
  const directory = await mkdtemp(join(tmpdir(), "smithers-default-files-"))
  try {
    await writeFile(join(directory, "flow.ts"), "export default 1\n")
    assert.deepEqual(await defaultFiles(directory), ["flow.ts"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
