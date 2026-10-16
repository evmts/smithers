import { runSync } from "./test-child"
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { requiresMacOS } from "./RequiresMacOS"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as HostService from "../../../packages/smithers/src/internal/backend/HostService"

const script = join(import.meta.dir, "bundle-cli.ts")
const root = mkdtempSync(join(tmpdir(), "bundle-cli-"))
const binary = join(root, "smthrs")

/*
 * What the toolchain said, or nothing. A compile reported as exit 1 alone sent
 * the reader looking for a binary that was never written, and said neither
 * which command ran nor what it refused.
 *
 * `process.execPath` is the Bun running this suite, the one the preload has
 * already held to the root `engines` floor (require-toolchain.mjs). The bare
 * name `bun` is resolved from the PATH the child is given instead, and
 * whatever answers to it there decides what `build` means.
 */
const compileFailure = (outfile: string, env?: Record<string, string | undefined>): string => {
  const result = runSync([process.execPath, "build", "--compile", script, "--outfile", outfile], env === undefined ? {} : { env })
  return result.exitCode === 0 ? "" : `bun build --compile exited ${result.exitCode}: ${new TextDecoder().decode(result.stderr).trim()}`
}

// Each case starts the compiled binary. Beside the rest of the unit suite on a
// CI runner that start alone passes Bun's five-second default (#3483), so the
// deadline only has to catch a command that never returns.
setDefaultTimeout(30_000)

// Compilation is fixture setup.
beforeAll(() => {
  expect(compileFailure(binary)).toBe("")
}, 30_000)
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

/*
 * A wrapper answering to the name `bun` and first on PATH is how a reviewed
 * agent toolchain pins one. `bun build` resolved from that PATH reached the
 * wrapper, which ran the workspace's `build` script instead, so the fixture
 * compiled nothing and the suite blamed a missing binary. The compile has to
 * reach this repository's Bun through such a PATH, and what it produces has to
 * be this CLI.
 */
test("a bun wrapper first on PATH cannot take the fixture's compile", () => {
  const wrapper = mkdtempSync(join(tmpdir(), "bundle-cli-path-"))
  try {
    const impostor = join(wrapper, "bun")
    writeFileSync(impostor, '#!/bin/sh\necho "wrapper took: $*" >&2\nexit 1\n')
    chmodSync(impostor, 0o755)
    const outfile = join(wrapper, "smthrs")
    expect(compileFailure(outfile, { ...process.env, PATH: `${wrapper}:${process.env.PATH ?? ""}` })).toBe("")
    expect(existsSync(outfile)).toBe(true)
    const refusal = runSync([outfile, "unknown"], { env: { HOME: wrapper, PATH: "/usr/bin:/bin" } })
    expect(refusal.exitCode).toBe(1)
    expect(new TextDecoder().decode(refusal.stderr)).toContain("Use smthrs host")
  } finally {
    rmSync(wrapper, { recursive: true, force: true })
  }
}, 30_000)

for (const args of [["unknown"], ["host", "stop", "extra"], ["host", "status", "extra"], ["host", "start", "--bundle"], ["host", "start", "--bind"], ["host", "start", "--origin"], ["host", "start", "extra"], ["host", "start", "--unknown"]]) {
  test(`compiled bundle CLI refuses ${args.join(" ")} before service effects`, () => {
    const result = runSync([binary, ...args], { env: { HOME: root, PATH: "/usr/bin:/bin" } })
    expect(result.exitCode).toBe(1)
    expect(new TextDecoder().decode(result.stderr)).toContain("Use smthrs host")
    expect(existsSync(join(root, "Library/LaunchAgents/sh.smithers.host.plist"))).toBe(false)
  })
}

test("the bundle README shows the lines host start prints", () => {
  // The Stage-1 section of this README ships as the bundle's README.md
  // (server-bundle.integration.test.ts). It showed `{"setup_urls":[...]}`,
  // which is what `--json` prints. The command it tells the reader to run
  // prints the links, one per line; a real install on 2026-10-08 found the
  // difference.
  const readme = readFileSync(join(import.meta.dir, "README.md"), "utf8")
  const stage = readme.split("## Stage-1 service\n")[1]!.split("\n## ")[0]!
  expect(stage).toContain("./bin/smthrs host start --bundle .\n")
  const shown = /After readiness it prints[^\n]*\n\n```text\n([\s\S]*?)\n```/.exec(stage)?.[1]
  expect(shown).toBeDefined()
  const urls = shown!.split("\n")
  expect(urls).toEqual(["http://localhost:4000/setup?token=...", "http://127.0.0.1:4000/setup?token=..."])
  expect(HostService.startText({ setup_urls: urls })).toBe(shown!)
  expect(stage).not.toContain('"setup_urls"')
})

// Off macOS, host start refuses at the launchd platform check first
// (packages/smithers/test/HostService.test.ts covers that refusal).
requiresMacOS("compiled bundle CLI refuses invalid bundles before service effects", () => {
  const bundle = join(root, "bundle")
  mkdirSync(bundle)
  writeFileSync(join(bundle, "manifest.json"), "{}")
  const result = runSync([binary, "host", "start", "--bundle", bundle], { env: { HOME: root, PATH: "/usr/bin:/bin" } })
  expect(result.exitCode).toBe(1)
  expect(new TextDecoder().decode(result.stderr)).toContain("Invalid bundle manifest")
    for (const flags of [
      ["--bind", "127.0.0.1", "--origin", "https://smithers.example", "--origin", "https://team.example"],
      ["--origin=https://smithers.example", "--bind=127.0.0.1"],
      ["--json", "--bind", "0.0.0.0", "--origin", "http://10.0.0.59:4000"]
    ]) {
      const accepted = runSync([binary, "host", "start", ...flags, "--bundle", bundle], { env: { HOME: root, PATH: "/usr/bin:/bin" } })
      expect(accepted.exitCode).toBe(1)
      expect(new TextDecoder().decode(accepted.stderr)).toContain("Invalid bundle manifest")
    }
    for (const flags of [
      ["--bind", "not-an-address"],
      ["--origin", "https://smithers.example/path"],
      ["--origin", "https://smithers.example", "--origin", "https://smithers.example"]
    ]) {
      const refused = runSync([binary, "host", "start", "--bundle", bundle, ...flags], { env: { HOME: root, PATH: "/usr/bin:/bin" } })
      expect(refused.exitCode).toBe(1)
      expect(new TextDecoder().decode(refused.stderr)).toMatch(/Invalid (bind address|public origin)/)
    }
  expect(existsSync(join(root, "Library/LaunchAgents/sh.smithers.host.plist"))).toBe(false)
    const status = runSync([binary, "host", "status", "--json"], { env: { HOME: root, PATH: "/usr/bin:/bin" } })
    expect(status.exitCode).toBe(1)
    expect(new TextDecoder().decode(status.stderr)).not.toContain("Use smthrs host")
})

requiresMacOS("compiled bundle CLI forwards serving flags to the existing host boundary", () => {
  const missing = join(root, "missing-serving-bundle")
  const result = runSync([binary, "host", "start", "--bundle", missing, "--bind", "0.0.0.0", "--origin", "http://mini.lan:4000", "--origin", "https://proxy.example", "--json"], { env: { HOME: root, PATH: "/usr/bin:/bin" } })
  expect(result.exitCode).toBe(1)
  const stderr = new TextDecoder().decode(result.stderr)
  expect(stderr).toContain(missing)
  expect(stderr).not.toContain("Use smthrs host")
  expect(existsSync(join(root, "Library/LaunchAgents/sh.smithers.host.plist"))).toBe(false)
})

for (const [flag, value, message] of [["--bind", "bad", "Invalid bind address"], ["--origin", "ftp://mini.lan", "Invalid public origin"]]) {
  requiresMacOS(`compiled bundle CLI forwards invalid ${flag} before bundle or service effects`, () => {
    const result = runSync([binary, "host", "start", "--bundle", join(root, "missing"), flag!, value!], { env: { HOME: root, PATH: "/usr/bin:/bin" } })
    expect(result.exitCode).toBe(1)
    expect(new TextDecoder().decode(result.stderr)).toContain(message!)
    expect(existsSync(join(root, "Library/LaunchAgents/sh.smithers.host.plist"))).toBe(false)
  })
}
