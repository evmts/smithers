import { spawnSync } from "node:child_process"
import * as Fs from "node:fs/promises"
import * as Os from "node:os"
import * as Path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import * as PackageTree from "../src/PackageTree.ts"
import { writeExecutable } from "./helpers/Executable.ts"

let root: string
beforeEach(async () => {
  root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "native-fixture-"))
})
afterEach(async () => {
  await Fs.rm(root, { recursive: true, force: true })
})

it.each(["sh", "node"])("executes the %s fixture natively with literal argv and pipes", async (interpreter) => {
  const path = Path.join(root, "program")
  const source = interpreter === "sh"
    ? `#!/bin/sh\n# raw delimiters "# "##\ncat\nprintf '%s\\0' "$@"\nprintf diagnostic >&2\nexit 23\n`
    : `#!/usr/bin/env node\nprocess.stdin.pipe(process.stdout); process.stdin.on("end", () => { process.stdout.write(process.argv.slice(2).join("\\0") + "\\0"); process.stderr.write("diagnostic"); process.exitCode = 23 })\n`
  await Fs.writeFile(path, source, { mode: 0o755 })
  const environment = { PATH: root, PATHEXT: ".EXE" }
  expect(PackageTree.findOnPath("program", environment, { platform: "win32" })).toBeUndefined()
  const executable = await writeExecutable(path, source, "win32")
  expect(PackageTree.findOnPath("program", environment, { platform: "win32" })).toBe(executable)
  const args = ["space argument", "$(never-evaluate)", "a\"b", "trailing\\", "é", "line\nbreak", "single'quote"]
  const result = spawnSync(executable, args, { input: "stdin\n", encoding: "utf8" })
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(23)
  expect(result.stdout).toBe(`stdin\n${args.join("\0")}\0`)
  expect(result.stderr).toBe("diagnostic")
  await Fs.writeFile(path, `${source}\n`)
  const stale = spawnSync(executable, args, { encoding: "utf8" })
  expect(stale.status).toBe(95)
  expect(stale.stderr).toContain("source changed without recompilation")
})

it("writes the POSIX script unchanged and rejects an unknown Windows interpreter", async () => {
  const path = Path.join(root, "program")
  const source = "#!/bin/sh\nexit 0\n"
  expect(await writeExecutable(path, source, "darwin")).toBe(path)
  expect(await Fs.readFile(path, "utf8")).toBe(source)
  await expect(writeExecutable(path, "unrecognized", "win32")).rejects.toThrow("Unknown fixture interpreter")
})
