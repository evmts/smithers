import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { writeOperatorTokenFile } from "../src/cli/OperatorTokenFile.ts"

it("atomically replaces an existing token with a private file without following symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "operator-token-"))
  try {
    const target = join(root, "target")
    const path = join(root, "token")
    await writeFile(target, "untouched", { mode: 0o644 })
    await symlink(target, path)
    await writeOperatorTokenFile(path, "session-one")
    expect(await readFile(path, "utf8")).toBe("session-one\n")
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect(await readFile(target, "utf8")).toBe("untouched")
    await writeOperatorTokenFile(path, "session-two")
    expect(await readFile(path, "utf8")).toBe("session-two\n")
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    await expect(writeOperatorTokenFile(join(root, "missing", "token"), "private")).rejects.toThrow()
    expect((await readdir(root)).sort()).toEqual(["target", "token"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
