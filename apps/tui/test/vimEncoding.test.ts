import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// These are test-only external-editor invocations; source and packaged tests must share UTF-8 even under C locale.
for (const [file, count] of [["tui.test.ts", 3], ["packaged-runtime.test.ts", 1]] as const) {
  test(`${file} gives every owned Vim fixture an explicit UTF-8 startup command`, () => {
    const source = readFileSync(new URL(`../e2e/${file}`, import.meta.url), "utf8")
    const commands = [...source.matchAll(/vim -u NONE -U NONE -i NONE -n[^\n]*/g)].map((match) => match[0])
    expect(commands).toHaveLength(count)
    for (const command of commands) expect(command).toContain("--cmd 'set encoding=utf-8'")
  })
}

test.skipIf(Bun.which("vim") === null)(
  "the owned Vim flags decode Unicode as characters and preserve exact UTF-8 bytes under C locale",
  () => {
    const directory = mkdtempSync(join(tmpdir(), "vim-utf8-fixture-"))
    const file = join(directory, "prompt.md")
    const draft = "fixture 中文 🦉"
    try {
      writeFileSync(file, draft)
      const answer = spawnSync("vim", [
        "-u",
        "NONE",
        "-U",
        "NONE",
        "-i",
        "NONE",
        "-n",
        "--cmd",
        "set encoding=utf-8",
        "-es",
        "-c",
        "if &encoding !=# \"utf-8\" || strchars(getline(1)) != 12 | cquit | endif",
        "-c",
        "wq",
        file
      ], { env: { ...process.env, LANG: "C", LC_ALL: "C" }, encoding: "utf8", timeout: 5_000 })
      expect(answer.error).toBeUndefined()
      expect(answer.status).toBe(0)
      expect(readFileSync(file)).toEqual(Buffer.from(draft + "\n", "utf8"))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  },
  10_000
)
