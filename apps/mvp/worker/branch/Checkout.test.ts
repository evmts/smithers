// How a branch's machine checks its branch out (worker/branch/Checkout.ts), run for real against a local git
// repository in a scratch directory: the script clones once, keeps a checkout, and starts over after a broken one.
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, test } from "vitest"
import { WORKSPACE } from "../../src/features/terminal/contract.ts"
import { CHECKOUT_FAILURES, checkoutArgv, DEPTH, forgeRemote } from "./Checkout.ts"

const root = mkdtempSync(join(tmpdir(), "checkout-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const git = (cwd: string, ...args: Array<string>) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" })

/** A repository with `main` and `feature/x`, each with its own file. */
const remote = (() => {
  const dir = join(root, "remote")
  mkdirSync(dir)
  git(dir, "init", "-q", "-b", "main")
  writeFileSync(join(dir, "README.md"), "main\n")
  git(dir, "add", ".")
  git(dir, "commit", "-q", "-m", "first")
  git(dir, "checkout", "-q", "-b", "feature/x")
  writeFileSync(join(dir, "feature.txt"), "x\n")
  git(dir, "add", ".")
  git(dir, "commit", "-q", "-m", "feature")
  git(dir, "checkout", "-q", "main")
  return `file://${dir}`
})()

/** Runs the checkout with /workspace replaced by `workspace`, as the machine's shell would. */
const checkout = (workspace: string, branch: string, from = remote) => {
  const [shell, flag, script, name, ...args] = checkoutArgv(branch, from)
  return execFileSync(shell!, [flag!, script!.replaceAll(WORKSPACE, workspace), name!, ...args], { encoding: "utf8" })
}

/** The checkout's exit code, or 0. */
const exitOf = (run: () => unknown) => {
  try {
    run()
    return 0
  } catch (error) {
    return (error as { readonly status: number }).status
  }
}

describe("checkoutArgv failures", () => {
  test("say where the checkout broke: a forge that doesn't answer, a branch it lacks, a branch whose name only starts alike", () => {
    const workspace = join(root, "failures")
    mkdirSync(workspace)
    expect(exitOf(() => checkout(workspace, "main", `file://${join(root, "no-such-forge")}`))).toBe(70)
    expect(exitOf(() => checkout(workspace, "no-such-branch"))).toBe(71)
    // `feature/x` is there; `feature` alone, a prefix of it, isn't.
    expect(exitOf(() => checkout(workspace, "feature"))).toBe(71)
    expect(CHECKOUT_FAILURES).toEqual({ 70: "forge", 71: "branch", 72: "clone" })
    // Nothing was cloned.
    expect(exitOf(() => git(workspace, "rev-parse", "HEAD"))).not.toBe(0)
  })
})

describe("checkoutArgv", () => {
  test("clones the one branch into an empty workspace, shallow", () => {
    const workspace = join(root, "a")
    mkdirSync(workspace)
    checkout(workspace, "feature/x")
    expect(git(workspace, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("feature/x")
    expect(readFileSync(join(workspace, "feature.txt"), "utf8")).toBe("x\n")
    expect(git(workspace, "branch", "-r").trim()).toBe("origin/feature/x")
    expect(Number(git(workspace, "rev-list", "--count", "HEAD").trim())).toBeLessThanOrEqual(DEPTH)
  })

  test("keeps a checkout that is there: nothing in it changes", () => {
    const workspace = join(root, "b")
    mkdirSync(workspace)
    checkout(workspace, "main")
    writeFileSync(join(workspace, "work.txt"), "mine\n")
    checkout(workspace, "main")
    expect(readFileSync(join(workspace, "work.txt"), "utf8")).toBe("mine\n")
  })

  test("preserves files when a broken checkout cannot resolve HEAD", () => {
    const workspace = join(root, "c")
    mkdirSync(join(workspace, ".git"), { recursive: true })
    writeFileSync(join(workspace, "partial"), "")
    expect(() => checkout(workspace, "main")).toThrow()
    expect(readFileSync(join(workspace, "partial"), "utf8")).toBe("")
  })

  test("fails on a branch the remote doesn't have, and the branch is an argument, never script", () => {
    const workspace = join(root, "d")
    mkdirSync(workspace)
    expect(() => checkout(workspace, "nope; touch pwned")).toThrow()
    expect(() => readFileSync("pwned")).toThrow()
    expect(checkoutArgv("main", "r")[3]).toBe("checkout")
  })
})

describe("forgeRemote", () => {
  test("names the forge proxy's host and the repository, escaped, never a credential", () => {
    expect(forgeRemote("octocat", "Spoon-Knife")).toBe("http://forge.smithers.internal/octocat/Spoon-Knife")
    expect(forgeRemote("o", "a b")).toBe("http://forge.smithers.internal/o/a%20b")
  })
})
