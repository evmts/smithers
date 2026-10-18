import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "../../../scripts/test-child"
import { CHILD_BUDGET_MS, childRead, deployedSource, HOST_PIN_CONTEXT_ENV, hostProducer, readHostPin } from "../run-inspection/revisions"

/*
 * These cases build real repositories: each one runs a handful of real `git` processes, so the budget is theirs
 * rather than bun:test's 5 s default, which read them as hangs on a loaded runner (gate 1, run 38558094099). Each
 * launch is bounded in turn, so a wedged `git` is killed and named instead of spending the test's budget unseen.
 */
setDefaultTimeout(60_000)
const GIT_BUDGET_MS = 20_000

/*
 * Through `scripts/test-child`, not `node:child_process`: these are real `git`
 * processes under Bun, which is the runner that missed a finished child's exit
 * and reported it as a timeout (#3763). The fixture stays a real repository;
 * only who waits for each process changes.
 */
const git = (cwd: string, ...args: string[]): string => {
  const result = spawnSync("git", ["-c", "user.email=e2e@example.invalid", "-c", "user.name=e2e", ...args],
    { cwd, encoding: "utf8", timeout: GIT_BUDGET_MS, killSignal: "SIGKILL", env: { ...process.env } })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} in ${cwd}: ${String(result.stderr ?? "").trim()}`)
  return String(result.stdout).trim()
}

/** A directory on PATH holding one planted executable, removed afterwards. */
const planted = (name: string, script: string): string => {
  const bin = mkdtempSync(join(tmpdir(), "run-inspection-bin-"))
  plantedDirs.push(bin)
  writeFileSync(join(bin, name), script)
  chmodSync(join(bin, name), 0o755)
  return bin
}
const plantedDirs: string[] = []
afterEach(() => {
  for (const bin of plantedDirs.splice(0)) rmSync(bin, { recursive: true, force: true })
})

describe("run-inspection source evidence on a git-only clone", () => {
  let root = ""
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "run-inspection-git-"))
    git(root, "init", "-q")
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const commit = (path: string, content: string): string => {
    writeFileSync(join(root, path), content)
    git(root, "add", path)
    git(root, "commit", "-q", "-m", path)
    return git(root, "rev-parse", "HEAD")
  }

  test("deployed sources compare against the working copy without a jj checkout", () => {
    const deployed = commit("card.ts", "old\n")
    const started = Date.now()
    expect(deployedSource(deployed, ["card.ts"], root)._tag).toBe("DeployedSourceMatchesWorkingCopy")
    writeFileSync(join(root, "card.ts"), "new\n")
    expect(deployedSource(deployed, ["card.ts"], root)).toMatchObject({ _tag: "DeployedSourcePredatesWorkingCopy", files: ["card.ts"] })
    /*
     * jj refuses this clone and git answers it, which is the whole point of
     * the fallback — and the comparison is milliseconds of work. The failure
     * this bounds is not a slow `git`: it is the runner never hearing a
     * finished one, which spent the entire budget twice over before reporting
     * `spawnSync git ETIMEDOUT` (#3763, AppsDeploy 38957448693).
     */
    expect(Date.now() - started).toBeLessThan(CHILD_BUDGET_MS)
  })

  /*
   * The exact failure: git's answer arrived, Bun missed its exit, and the
   * tier reported a timeout as though the machine had no git at all. A
   * refusal names the command that made it and carries that command's own
   * words, so an operator reading the error can tell a clone without jj from
   * a child nobody waited for.
   */
  test("a revision neither jj nor git can read names both refusals, and neither is a timeout", () => {
    const bare = mkdtempSync(join(tmpdir(), "run-inspection-none-"))
    try {
      let thrown: unknown
      try { deployedSource("a".repeat(40), ["card.ts"], bare) } catch (error) { thrown = error }
      const message = thrown instanceof Error ? thrown.message : String(thrown)
      expect(message).toContain("Neither jj nor git")
      expect(message).toContain("jj:")
      expect(message).toContain("git:")
      expect(message).not.toContain("ETIMEDOUT")
    } finally { rmSync(bare, { recursive: true, force: true }) }
  })

  test("the host producer is read from ancestry without a jj checkout", () => {
    const producer = commit("a.txt", "a\n")
    const host = commit("b.txt", "b\n")
    const pin = { _tag: "HostPinRead" as const, sourceCommit: host, sha256: "0".repeat(64), object: "gs://pin" }
    expect(hostProducer(pin, producer, root)).toBe("HostContainsCommit")
    expect(hostProducer({ ...pin, sourceCommit: producer }, host, root)).toBe("HostPredatesCommit")
  })
})

/*
 * The child boundary this tier reads every revision through. Bun's own
 * synchronous spawn can miss the exit of a child that already finished
 * (#3763), so these cases pin WHO runs the child, that a refusal stays a
 * refusal, and that the caller's environment still reaches it.
 *
 * The budget itself is NOT re-proved here. `scripts/test-child.test.ts`
 * already holds it — ETIMEDOUT, SIGKILL, the bound and the diagnostics —
 * and it does so through a captured pipe. Driving a timeout through
 * `childRead` instead inherits this process's stderr, so the supervisor's
 * `lsof`/`sample` report lands in the suite's own output and fills the
 * bounded stderr window the runner keeps for a REAL failure. One budget
 * assertion that costs nothing is kept, on the integration case above:
 * the git-only comparison answers well inside it.
 */
describe("the bounded child read", () => {
  test("the child runs in its own process group, so the boundary can kill it whole", () => {
    const bin = planted("groupcmd", `#!/bin/sh\nprintf '%s %s' "$$" "$(ps -o pgid= -p $$ | tr -d ' ')"\n`)
    const saved = process.env.PATH
    process.env.PATH = `${bin}:${saved}`
    try {
      const [pid, pgid] = childRead("groupcmd", []).trim().split(" ")
      // A group leader's group is itself: that is the detached spawn the
      // supervisor makes, and what a native in-process spawn does not.
      expect(pid).toMatch(/^\d+$/)
      expect(pgid).toBe(pid)
    } finally { process.env.PATH = saved }
  })

  test("a non-zero exit is a refusal carrying the child's own words", () => {
    const bin = planted("refusecmd", "#!/bin/sh\necho 'the child refused' >&2\nexit 3\n")
    const saved = process.env.PATH
    process.env.PATH = `${bin}:${saved}`
    try {
      expect(() => childRead("refusecmd", ["--flag"])).toThrow("the child refused")
      expect(() => childRead("refusecmd", ["--flag"])).toThrow("refusecmd --flag")
    } finally { process.env.PATH = saved }
  })

  test("the environment the caller has at the call reaches the child", () => {
    const bin = planted("envcmd", '#!/bin/sh\nprintf \'%s\' "$SMITHERS_RUN_INSPECTION_PROBE"\n')
    const saved = process.env.PATH
    process.env.PATH = `${bin}:${saved}`
    process.env.SMITHERS_RUN_INSPECTION_PROBE = "reached"
    try {
      // The supervisor is started once and carries the environment it was
      // spawned with; a planted PATH or variable set after that must still
      // arrive, or a real binary answers in a fixture's place.
      expect(childRead("envcmd", [])).toBe("reached")
    } finally {
      process.env.PATH = saved
      delete process.env.SMITHERS_RUN_INSPECTION_PROBE
    }
  })
})

describe("the coding host pin", () => {
  let bin = ""
  let saved: string | undefined
  beforeEach(() => {
    bin = mkdtempSync(join(tmpdir(), "run-inspection-kubectl-"))
    // A kubectl on PATH that records its argv and answers with a manifest, so
    // the test observes which cluster the tier asked and whether it asked at all.
    writeFileSync(join(bin, "kubectl"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${join(bin, "argv")}"\nprintf '%s' '${JSON.stringify(
      { sourceCommit: "a".repeat(40), sha256: "b".repeat(64), object: "gs://pin" })}'\n`)
    chmodSync(join(bin, "kubectl"), 0o755)
    saved = process.env.PATH
    process.env.PATH = `${bin}:${saved}`
  })
  afterEach(() => {
    process.env.PATH = saved
    rmSync(bin, { recursive: true, force: true })
  })

  test("with no operator context the pin is unread and no cluster is contacted", () => {
    const pin = readHostPin(undefined)
    expect(pin).toMatchObject({ _tag: "HostPinUnread" })
    expect(pin._tag === "HostPinUnread" && pin.message).toContain(HOST_PIN_CONTEXT_ENV)
    expect(existsSync(join(bin, "argv"))).toBe(false)
    expect(hostProducer(pin, "c".repeat(40))).toBe("HostPinUnread")
  })

  test("an operator context names the cluster the pin is read from", () => {
    expect(readHostPin("gke_example_cluster")).toEqual(
      { _tag: "HostPinRead", sourceCommit: "a".repeat(40), sha256: "b".repeat(64), object: "gs://pin" })
    const argv = readFileSync(join(bin, "argv"), "utf8").trim().split("\n")
    expect(argv.slice(0, 2)).toEqual(["--context", "gke_example_cluster"])
    expect(argv.at(-1)).toBe("/usr/local/lib/smithers/coding-host.json")
  })
})
