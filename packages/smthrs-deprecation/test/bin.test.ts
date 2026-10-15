import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Run the shipped wrapper with an isolated CLI dependency. The executable
 * fixture isolates forwarding from CLI startup and never contacts a service;
 * the real dependency's --version is covered by publication.test.ts.
 */
const run = (source: string | undefined, args: ReadonlyArray<string> = [], input?: string) => {
  const root = mkdtempSync(join(tmpdir(), "smthrs-bin-"))
  try {
    const installed = join(root, "installed")
    const cwd = join(root, "caller")
    mkdirSync(installed)
    mkdirSync(cwd)
    const bin = join(installed, "smthrs.mjs")
    copyFileSync(new URL("../bin/smthrs.mjs", import.meta.url), bin)
    const dependency = join(installed, "node_modules", "@smthrs", "cli")
    if (source !== undefined) {
      mkdirSync(join(dependency, "bin"), { recursive: true })
      writeFileSync(join(dependency, "package.json"), JSON.stringify({ name: "@smthrs/cli", type: "module" }))
      writeFileSync(join(dependency, "bin", "smithers.mjs"), source)
    }
    // A caller-controlled package must never win over the installed dependency.
    const hostile = join(cwd, "node_modules", "@smthrs", "cli")
    mkdirSync(join(hostile, "bin"), { recursive: true })
    writeFileSync(join(hostile, "package.json"), JSON.stringify({ name: "@smthrs/cli", type: "module" }))
    writeFileSync(join(hostile, "bin", "smithers.mjs"), "console.log('HOSTILE'); process.exitCode = 99")
    return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", input, timeout: 10_000 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe("the published command wrapper", () => {
  it("preserves argument boundaries and ignores a hostile caller directory", () => {
    const args = ["migrate", "a project", "", "--", "$(touch never)", "雪", "line\nbreak"]
    const result = run("console.log(JSON.stringify(process.argv.slice(2)))", args)
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(args)
    expect(result.stderr).toBe("")
  })

  it("preserves the CLI's output and nonzero exit status", () => {
    const result = run("console.log('out'); console.error('err'); process.exitCode = 23")
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(23)
    expect(result.stdout).toBe("out\n")
    expect(result.stderr).toBe("err\n")
  })

  it("leaves standard input available to the CLI", () => {
    const input = "first line\n雪\u0000last line\n"
    const result = run("process.stdin.pipe(process.stdout)", [], input)
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(input)
    expect(result.stderr).toBe("")
  })

  it("preserves signal termination rather than converting it to success", () => {
    const result = run("process.kill(process.pid, 'SIGTERM')")
    expect(result.error).toBeUndefined()
    expect(result.status).toBeNull()
    expect(result.signal).toBe("SIGTERM")
    expect(result.stdout).toBe("")
    expect(result.stderr).toBe("")
  })

  it("fails visibly when CLI evaluation rejects", () => {
    const result = run("await Promise.reject(new Error('CLI startup rejected'))")
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("CLI startup rejected")
    expect(result.stdout).toBe("")
  })

  it("refuses a missing dependency instead of loading the caller's package", () => {
    const result = run(undefined)
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("ERR_MODULE_NOT_FOUND")
    expect(result.stderr).toContain("@smthrs/cli")
    expect(result.stdout).toBe("")
  })
})
