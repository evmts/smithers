/*
 * The browser canary's contract with the alert decision
 * (apps/server/scripts/canary/uptime-checks.ts `browserVerdict`): result.json
 * always carries a `status`, and an unconfigured canary is a `skip` that names
 * the unset variables, never a failure that files "smithers.sh is failing".
 * These cases stop before Chromium launches, so no network is touched.
 */
import { runSync } from "./test-child"
import { describe, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

const script = join(import.meta.dir, "canary-browser.ts")
const WORKSPACE = "11111111-2222-3333-4444-555555555555"
/* Each case spawns bun and loads Playwright; no case launches Chromium. */
const SPAWN_TIMEOUT_MS = 30_000

/*
 * The child's stderr is the only account of a child that wrote no result, and
 * every value these cases configure has a secret's shape. Each one is named,
 * never quoted, on its way into a test report.
 */
const redact = (text: string, env: Record<string, string>): string =>
  Object.entries(env).reduce((out, [name, value]) => (value === "" ? out : out.replaceAll(value, `<${name}>`)), text)

/*
 * `path` and `child` are the two parts of the launch a case needs to vary: the
 * PATH the child is given, and a stand-in child for the report of a child that
 * writes no result. Neither is a seam in the canary itself.
 */
const run = (env: Record<string, string>, { path = process.env.PATH ?? "", child: launched = script }: { path?: string; child?: string } = {}): { exitCode: number; stdout: string; stderr: string; result: Record<string, unknown> } => {
  const evidence = mkdtempSync(join(tmpdir(), "canary-browser-"))
  try {
    // The Bun running this suite, by path, the one the preload has already held
    // to the root `engines` floor (require-toolchain.mjs). A bare `bun` is
    // resolved from the PATH stated below instead, and a wrapper that answers
    // to the name there launches in its place.
    const child = runSync([process.execPath, launched], {
      cwd: join(import.meta.dir, ".."),
      // Stated, not inherited: a developer's canary cookie must never reach a unit test.
      env: {
        PATH: path,
        HOME: process.env.HOME ?? "",
        CANARY_BROWSER_EVIDENCE: evidence,
        ...env
      },
      timeout: SPAWN_TIMEOUT_MS
    })
    const stdout = new TextDecoder().decode(child.stdout)
    const stderr = new TextDecoder().decode(child.stderr)
    const answer = join(evidence, "result.json")
    // The canary writes its result on every path it takes, so an absent file is
    // a child that never got as far as the canary. Say that, with the exit code
    // and what the child reported: an ENOENT on the evidence path named the
    // reader's own temporary directory and nothing about the launch.
    if (!existsSync(answer)) throw new Error(`${basename(launched)} exited ${child.exitCode} before writing result.json; child stderr: ${redact(stderr, env).trim() || "(empty)"}`)
    return { exitCode: child.exitCode, stdout, stderr, result: JSON.parse(readFileSync(answer, "utf8")) as Record<string, unknown> }
  } finally {
    rmSync(evidence, { recursive: true, force: true })
  }
}

describe("canary-browser.ts", () => {
  test("a URL override cannot redirect the production session", () => {
    const { result } = run({ CANARY_URL: "https://staging.test" })
    expect(result.origin).toBe("https://smithers.sh")
  }, SPAWN_TIMEOUT_MS)

  test("with nothing configured it skips out loud, names every unset variable and exits 0", () => {
    const { exitCode, stdout, result } = run({})
    expect(exitCode).toBe(0)
    expect(result.status).toBe("skip")
    expect(result.missing).toEqual(["CANARY_SESSION_COOKIE", "CANARY_BROWSER_FLOW", "CANARY_BROWSER_WORKSPACE"])
    expect(stdout).toContain("skip: browser canary not configured")
    expect(stdout).toContain("CANARY_SESSION_COOKIE")
  }, SPAWN_TIMEOUT_MS)

  test("the workflow's empty-string secrets count as unset", () => {
    const { exitCode, result } = run({ CANARY_SESSION_COOKIE: "", CANARY_BROWSER_FLOW: "", CANARY_BROWSER_WORKSPACE: "" })
    expect(exitCode).toBe(0)
    expect(result.status).toBe("skip")
  }, SPAWN_TIMEOUT_MS)

  test("a configured cookie with no declared login fails instead of guessing whose it is", () => {
    const { exitCode, stderr, result } = run({
      CANARY_SESSION_COOKIE: "smithers_session=probe",
      CANARY_BROWSER_FLOW: "canary",
      CANARY_BROWSER_WORKSPACE: WORKSPACE
    })
    expect(exitCode).toBe(1)
    expect(result.status).toBe("fail")
    expect(String(result.error)).toContain("CANARY_SESSION_LOGIN")
    expect(stderr).toContain("Browser canary failed")
    expect(JSON.stringify(result)).not.toContain("smithers_session=probe")
  }, SPAWN_TIMEOUT_MS)

  /*
   * A wrapper that answers to the name `bun` and is first on PATH is how a
   * reviewed agent toolchain pins one, and the child's PATH is part of the
   * fixture. The launch has to reach this repository's script through it, and
   * the cookie in this process's own environment has to stay out of the child
   * whatever PATH holds.
   */
  test("a bun wrapper first on the child's PATH takes neither the launch nor the parent's cookie", () => {
    const wrapper = mkdtempSync(join(tmpdir(), "canary-browser-path-"))
    const planted = "smithers_session=this-process-only"
    const inherited = process.env.CANARY_SESSION_COOKIE
    try {
      const impostor = join(wrapper, "bun")
      writeFileSync(impostor, '#!/bin/sh\necho "wrapper refused this launch" >&2\nexit 1\n')
      chmodSync(impostor, 0o755)
      process.env.CANARY_SESSION_COOKIE = planted
      const { exitCode, result } = run({}, { path: `${wrapper}:${process.env.PATH ?? ""}` })
      expect(exitCode).toBe(0)
      expect(result.status).toBe("skip")
      expect(result.missing).toContain("CANARY_SESSION_COOKIE")
      expect(JSON.stringify(result)).not.toContain(planted)
    } finally {
      if (inherited === undefined) delete process.env.CANARY_SESSION_COOKIE
      else process.env.CANARY_SESSION_COOKIE = inherited
      rmSync(wrapper, { recursive: true, force: true })
    }
  }, SPAWN_TIMEOUT_MS)

  /*
   * The report for a child that writes no result, which is how the shim
   * refusal and the misrouted compile both arrived. A stand-in child chooses
   * the exit code and prints the configured value back, so the case can hold
   * the message to the exit, the stage and a value named rather than quoted,
   * and can see the evidence directory the helper made is gone afterwards.
   */
  test("a child that writes no result is reported by its exit and stage, with configured values named not quoted", () => {
    const standIn = mkdtempSync(join(tmpdir(), "canary-browser-child-"))
    const fake = "smithers_session=synthetic-never-issued"
    try {
      const child = join(standIn, "writes-no-result.ts")
      const echo = join(standIn, "evidence-path.txt")
      writeFileSync(child, [
        'import { writeFileSync } from "node:fs"',
        "writeFileSync(process.env.CANARY_BROWSER_CHILD_ECHO!, process.env.CANARY_BROWSER_EVIDENCE!)",
        "console.error(`stand-in child refusing with ${process.env.CANARY_SESSION_COOKIE}`)",
        "process.exit(3)",
        ""
      ].join("\n"))
      let message = ""
      try { run({ CANARY_SESSION_COOKIE: fake, CANARY_BROWSER_CHILD_ECHO: echo }, { child }) }
      catch (error) { message = String(error) }
      expect(message).toContain("writes-no-result.ts exited 3 before writing result.json")
      expect(message).toContain("child stderr: stand-in child refusing with <CANARY_SESSION_COOKIE>")
      expect(message).not.toContain(fake)
      const evidence = readFileSync(echo, "utf8")
      expect(evidence).toContain("canary-browser-")
      expect(existsSync(evidence)).toBe(false)
    } finally {
      rmSync(standIn, { recursive: true, force: true })
    }
  }, SPAWN_TIMEOUT_MS)
})
