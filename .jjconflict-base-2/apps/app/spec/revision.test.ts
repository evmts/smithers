import { test, expect } from "bun:test"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { revision } from "./revision"

test("CLI revision lookup reconciles two divergent operation heads", async () => {
  const cwd = await mkdtemp(resolve(tmpdir(), "spec-revision-"))
  const jj = (...args: string[]) => execFileSync("jj", args, { cwd, encoding: "utf8", env: { ...process.env, RAYON_NUM_THREADS: "2" } }).trim()
  try {
    jj("git", "init")
    const operation = jj("op", "log", "--no-graph", "-T", "id", "--limit", "1")
    jj("--at-operation", operation, "describe", "-m", "first operation")
    jj("--at-operation", operation, "describe", "-m", "second operation")
    const old = spawnSync("jj", ["--at-operation=@", "log", "-r", "@", "--no-graph", "-T", "commit_id"], { cwd, encoding: "utf8" })
    expect(old.status).not.toBe(0)
    expect(old.stderr).toContain("more than one operation")
    expect(revision(cwd)).toMatch(/^[0-9a-f]{40}$/)
    expect(revision(cwd)).toBe(jj("--ignore-working-copy", "log", "-r", "@", "--no-graph", "-T", "commit_id"))
  } finally { await rm(cwd, { recursive: true, force: true }) }
}, 30000)
