import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { triggers } from "./triggers"
import { cycle } from "./cycle"

test("registration uses supported CLI schedules; removal disables only owned rows", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "spec-triggers-"))
  const config = resolve(root, "config.json"); await writeFile(config, "{}")
  const calls: string[][] = []
  try {
    const run = async (args: string[]) => { calls.push(args) }
    await triggers("register", config, root, run)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain("*/10 * * * *"); expect(calls[1]).toContain("*/30 * * * *")
    expect(calls.every(args => args.includes("skip") && args.includes("none"))).toBe(true)
    await triggers("after-deploy", config, root, run); expect(calls.at(-1)).toEqual(["fire", "spec-live"])
    await triggers("main-landed", config, root, run); expect(calls.at(-1)).toEqual(["fire", "spec-sync"])
    await triggers("remove", config, root, run); expect(calls.slice(-2)).toEqual([["disable", "spec-sync"], ["disable", "spec-live"]])
  } finally { await rm(root, { recursive: true, force: true }) }
})
test("one browser lock skips concurrent cycles without queuing; failure releases the lock", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "spec-cycle-"))
  const config = resolve(root, "config.json")
  await writeFile(resolve(root, "factory.json"), JSON.stringify({ spec: { aheadMaxDays: 14, live: {} } }))
  await writeFile(config, JSON.stringify({ root, resultsDirectory: root, manifest: resolve(root, "manifest.json"), journeys: ["default/test"], policy: resolve(root, "factory.json") }))
  let started!: () => void, finish!: () => void
  const entered = new Promise<void>(resolve => { started = resolve })
  const pending = new Promise<void>(resolve => { finish = resolve })
  try {
    const first = cycle("sync", config, async () => { started(); await pending; return 1 })
    await entered
    expect(await cycle("live", config, async () => { throw new Error("must not start") })).toBe(5)
    finish(); expect(await first).toBe(1)
    expect(await Bun.file(resolve(root, "browser.lock")).exists()).toBe(false)
    const rows = (await readFile(resolve(root, "cycles.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.map(row => row.status)).toEqual(["started", "skipped: browser busy", "build failed"])
  } finally { finish(); await rm(root, { recursive: true, force: true }) }
})
test("launch failure never reuses an older green receipt", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "spec-cycle-old-"))
  try {
    await writeFile(resolve(root, "factory.json"), JSON.stringify({ spec: { aheadMaxDays: 14, live: {} } }))
    await writeFile(resolve(root, "drift.json"), JSON.stringify({ builtMinutes: 1, ahead: 0, regressed: 0, rows: [{ id: "default/test", state: "shipped" }] }))
    await writeFile(resolve(root, "live.json"), JSON.stringify([{ startedAt: "2020-01-01T00:00:00Z" }]))
    await writeFile(resolve(root, "config.json"), JSON.stringify({ root, resultsDirectory: root, manifest: resolve(root, "missing.json"), journeys: ["default/test"], policy: resolve(root, "factory.json") }))
    expect(await cycle("live", resolve(root, "config.json"), async args => { expect(args).toContain("--results-file"); return 1 })).toBe(1)
    expect((await Bun.file(resolve(root, "drift.json")).json()).rows).toEqual([{ id: "default/test", state: "unverified", wasShipped: true, reason: "Cycle did not produce fresh evidence" }])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("registrations persist through the real Node Smithers CLI and removal preserves history", async () => {
  const child = Bun.spawn(["node", resolve(import.meta.dirname, "triggerProof.mjs")], { stdout: "pipe", stderr: "pipe" })
  const diagnostic = await new Response(child.stderr).text()
  expect(await child.exited, diagnostic).toBe(0)
}, 120_000)

test("a successful cycle publishes paired drift with factory policy and actual build time", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "spec-cycle-success-"))
  try {
    const builtAt = new Date().toISOString()
    await (await import("node:fs/promises")).mkdir(resolve(root, "apps/app/dist-spec"), { recursive: true })
    await writeFile(resolve(root, "apps/app/dist-spec/__build.json"), JSON.stringify({ builtAt }))
    await writeFile(resolve(root, "factory.json"), JSON.stringify({ spec: { aheadMaxDays: 3, live: {} } }))
    await writeFile(resolve(root, "manifest.json"), JSON.stringify({ journeys: [{ id: "default/test" }], ahead: {}, capabilities: [], aheadMaxDays: 14, builtAt: "2020-01-01T00:00:00Z" }))
    await writeFile(resolve(root, "config.json"), JSON.stringify({ root, resultsDirectory: root, manifest: resolve(root, "manifest.json"), journeys: ["default/test"], policy: resolve(root, "factory.json") }))
    const run = (mode: string) => ({ journey: "default/test", mode, startedAt: new Date().toISOString(), revision: "r", state: "unverified", reason: "Pair mock/live evidence in drift before assigning shipped or ahead", steps: [{ caption: "Read", spec: "D1", status: "passed", assertions: [{ kind: "see", ok: true, expected: true, actual: true }], screenshot: "1.png", ms: 1 }] })
    await writeFile(resolve(root, "mock.json"), JSON.stringify([run("mock")]))
    expect(await cycle("live", resolve(root, "config.json"), async (argv, cwd, env) => {
      expect(cwd).toBe(root); expect(argv).toContain("capture"); expect(env.SPEC_JUDGE_POLICY).toBe(resolve(root, "factory.json"))
      await writeFile(resolve(root, "live.json"), JSON.stringify([run("live")]))
      return 0
    })).toBe(0)
    expect(await Bun.file(resolve(root, "drift.json")).json()).toMatchObject({ builtMinutes: 0, rows: [{ id: "default/test", state: "shipped" }] })
  } finally { await rm(root, { recursive: true, force: true }) }
})
