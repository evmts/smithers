import { expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

const script = resolve(import.meta.dirname, "labels-handoff.ts")
test("nightly CLI hands off new labels once, leaves the source workspace and main untouched", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "labels-cli-"))
  const repo = resolve(root, "repo"); const labels = resolve(root, "labels"); const queue = resolve(root, "queue")
  const jj = (...args: string[]) => execFileSync("jj", args, { cwd: repo, encoding: "utf8", env: { ...process.env, RAYON_NUM_THREADS: "2" }, stdio: ["ignore", "pipe", "pipe"] }).trim()
  const run = async () => {
    const child = Bun.spawn(["bun", script, "--repo", repo, "--labels", labels, "--queue", queue, "--base", "main"], { stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    if (code !== 0) throw new Error(stderr)
    return JSON.parse(stdout)
  }
  try {
    await mkdir(repo); await mkdir(labels); await mkdir(queue)
    execFileSync("jj", ["git", "init", repo], { stdio: "pipe", env: { ...process.env, RAYON_NUM_THREADS: "2" } })
    jj("config", "set", "--repo", "user.name", "Spec test"); jj("config", "set", "--repo", "user.email", "spec@example.invalid")
    await writeFile(resolve(repo, "README.md"), "Labels CLI fixture\n"); jj("commit", "-m", "base"); jj("bookmark", "create", "main", "-r", "@-")
    const before = jj("log", "-r", "@", "--no-graph", "-T", "commit_id")
    const main = jj("log", "-r", "main", "--no-graph", "-T", "commit_id")
    const label = { journey: "default/repo-read-signed-out", step: 0, mode: "live", revision: "test", thumb: "up", assertions: [], by: "will", at: "2026-10-18T02:00:00Z" }
    await writeFile(resolve(labels, "journey.jsonl"), JSON.stringify(label) + "\n")
    const first = await run()
    expect(first.labels).toBe(1)
    expect(jj("log", "-r", "@", "--no-graph", "-T", "commit_id")).toBe(before)
    expect(jj("log", "-r", "main", "--no-graph", "-T", "commit_id")).toBe(main)
    expect(JSON.parse(jj("file", "show", "-r", first.commit, "apps/app/spec/labels/journey.jsonl"))).toEqual(label)
    expect(await readFile(resolve(first.directory, "HOLD.txt"), "utf8")).toContain("HOLD: land after the launch tag")
    expect(await readFile(resolve(first.directory, "change.patch"), "utf8")).toContain(label.journey)
    expect((await run()).labels).toBe(0)
    await appendFile(resolve(labels, "journey.jsonl"), JSON.stringify({ ...label, thumb: "down", note: "wrong" }) + "\n")
    const second = await run()
    expect(second.labels).toBe(1)
    expect(jj("file", "show", "-r", second.commit, "apps/app/spec/labels/journey.jsonl")).toContain('"thumb":"down"')
    expect(jj("file", "show", "-r", second.commit, "apps/app/spec/labels/journey.jsonl")).toContain('"thumb":"up"')
    expect(await readFile(resolve(second.directory, "HOLD.txt"), "utf8")).toContain(first.directory.split("/").at(-1)!)
    await writeFile(resolve(labels, "journey.jsonl"), "changed\n")
    await expect(run()).rejects.toThrow("Label history changed")
  } finally { await rm(root, { recursive: true, force: true }) }
}, 180_000)
