import { appendFile, mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { z } from "zod"
import { AppBootstrapSchema } from "@smthrs/rpc/AppBootstrap"
import type { DriftInput } from "./drift"
import { driftCli } from "./driftCli"

const configuration = z.strictObject({
  root: z.string().min(1), resultsDirectory: z.string().min(1), manifest: z.string().min(1),
  journeys: z.array(z.string().min(1)).min(1),
  policy: z.string().min(1),
  /** Optional seat module path only; no credentials in config or receipts. */
  judgeSeat: z.string().min(1).optional()
})
/** One host-wide lease shared by rebuild, mock and live. A crash fails closed for owner inspection. */
export const cycle = async (kind: "sync" | "live", configPath: string, execute = async (argv: string[], cwd: string, env: NodeJS.ProcessEnv) => {
  const child = Bun.spawn(argv, { cwd, env, stdin: "ignore", stdout: "inherit", stderr: "inherit" })
  const abort = () => child.kill("SIGTERM")
  process.once("SIGTERM", abort); process.once("SIGINT", abort)
  try { return await child.exited } finally { process.off("SIGTERM", abort); process.off("SIGINT", abort) }
}) => {
  const config = configuration.parse(JSON.parse(await readFile(configPath, "utf8")))
  const root = resolve(config.root), directory = resolve(config.resultsDirectory)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const record = (status: string, code?: number) => appendFile(resolve(directory, "cycles.jsonl"), JSON.stringify({ kind, status, ...(code === undefined ? {} : { code }), at: new Date().toISOString() }) + "\n", { mode: 0o600 })
  const invalidate = async () => {
    await writeFile(resolve(directory, kind === "sync" ? "mock.json" : "live.json"), "[]\n", { mode: 0o600 })
    const path = resolve(directory, "drift.json")
    const previous = await Bun.file(path).json().catch(() => null) as { rows?: Array<{ state: string; wasShipped?: boolean; id: string }>; builtMinutes?: number; builtAt?: string } | null
    if (!previous?.rows) return
    const value = { ...(previous.builtAt ? { builtAt: previous.builtAt } : {}), builtMinutes: previous.builtMinutes, ahead: 0, regressed: 0, rows: previous.rows.map(row => ({ id: row.id, state: "unverified", wasShipped: row.state === "shipped" || row.wasShipped === true, reason: "Cycle did not produce fresh evidence" })), capability: [], wire: [] }
    const temporary = path + `.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(value) + "\n", { mode: 0o600 })
    await rename(temporary, path)
  }
  let lock
  try { lock = await open(resolve(directory, "browser.lock"), "wx", 0o600) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    await record("skipped: browser busy"); return 5
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, kind, at: new Date().toISOString() }))
    await record("started")
    const factory = JSON.parse(await readFile(resolve(config.policy), "utf8")) as { spec: { aheadMaxDays: number; live: { default?: string } } }
    const build = await Bun.file(resolve(root, "apps/app/dist-spec/__build.json")).json().catch(() => null) as { builtAt?: string } | null
    let overrides: Partial<DriftInput> = { productionCapabilities: undefined, aheadMaxDays: factory.spec.aheadMaxDays, ...(build?.builtAt ? { builtAt: build.builtAt } : {}) }
    const env = { ...process.env, SPEC_OUTPUT: resolve(directory, "out", kind), SPEC_JUDGE_POLICY: resolve(config.policy), ...(config.judgeSeat ? { SPEC_JUDGE_SEAT: config.judgeSeat } : {}) }
    if (kind === "sync") {
      const code = await execute(["pnpm", "-C", "apps/app", "exec", "vite", "build", "--configLoader", "runner", "--mode", "spec"], root, env)
      if (code) { await invalidate(); await record("build failed", code); return code }
      const stamp = await Bun.file(resolve(root, "apps/app/dist-spec/__build.json")).json() as { builtAt: string }
      overrides = { ...overrides, builtAt: stamp.builtAt }
    }
    const receipt = resolve(directory, `${kind === "sync" ? "mock" : "live"}.json`)
    const started = Date.now()
    const code = await execute(["bun", "apps/app/spec/run.ts", ...(kind === "sync" ? ["mock"] : config.judgeSeat ? ["judge", "--live", "--record"] : ["capture", "--live"]), ...config.journeys, "--results-file", receipt], root, env)
    // Failed assertions are evidence too. A launcher failure cannot reuse an older receipt.
    const stamp = await Bun.file(receipt).json().catch(() => null) as Array<{ startedAt?: string }> | null
    if (!stamp?.length || stamp.some(run => !run.startedAt || Date.parse(run.startedAt) < started)) { await invalidate(); await record("no receipt", code); return code || 5 }
    const other = resolve(directory, `${kind === "sync" ? "live" : "mock"}.json`)
    const files = [receipt, ...(await Bun.file(other).exists() ? [other] : [])]
    if (kind === "live" && factory.spec.live.default) {
      try {
        const response = await fetch(new URL("/api/bootstrap", factory.spec.live.default), { redirect: "error", credentials: "omit", signal: AbortSignal.timeout(10_000) })
        if (response.ok) {
          const raw: unknown = await response.json()
          const decoded = AppBootstrapSchema.safeParse(raw)
          overrides = { ...overrides, productionCapabilities: decoded.success ? decoded.data.capabilities : undefined, captures: [{ schema: "GET /api/bootstrap", response: raw }] }
        }
      } catch { /* Failed bootstrap is unknown, never an empty capability set. */ }
    }
    const captureDirectory = resolve(directory, "out", "live", "overrides")
    const captures = [...(overrides.captures ?? [])]
    for (const file of await readdir(captureDirectory).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error })) {
      if (!file.endsWith(".json")) continue
      const capture = JSON.parse(await readFile(resolve(captureDirectory, file), "utf8")) as { schema: string; response: unknown; unknownFields?: readonly unknown[] }
      captures.push(capture)
    }
    await driftCli(resolve(config.manifest), directory, files, { ...overrides, captures })
    await record(code === 0 ? "completed" : "failed or unverified", code)
    return code
  } catch (error) { await invalidate(); await record("cycle failed"); throw error }
  finally { await lock.close(); await unlink(resolve(directory, "browser.lock")) }
}
if (import.meta.main) {
  const [kind, config] = process.argv.slice(2)
  if ((kind !== "sync" && kind !== "live") || !config) throw new Error("cycle.ts sync|live <config.json>")
  process.exitCode = await cycle(kind, config)
}
