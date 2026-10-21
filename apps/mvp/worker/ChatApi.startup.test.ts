// ChatApi's startup (docs/infrastructure.md#limits): Cloudflare refuses a deploy whose Worker takes longer than its
// startup limit (1 s of CPU) to evaluate its modules, and on 2026-10-21 one deploy failed that way at random: ChatApi's
// bundle then took 416 to 735 ms on Cloudflare's own measurement (a scratch Worker's `startup_time_ms`). The test bundles
// worker/ChatApi.ts with the bundler and plugins Alchemy bundles it with (rolldown and
// `@alchemy.run/cloudflare-runtime/rolldown`, as worker/AgentSandbox.workerd.test.ts does), then loads the bundle in a
// fresh Node process, three times, and holds the median module evaluation under a budget well under the limit.
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { readFile as readFileAsync } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterAll, beforeAll, describe, expect, test } from "vitest"


const MVP = fileURLToPath(new URL("..", import.meta.url))
const ENTRY = fileURLToPath(new URL("./ChatApi.ts", import.meta.url))
const EVALUATE = fileURLToPath(new URL("./test/startup/evaluate.mjs", import.meta.url))

/** ChatApi's compatibility (worker/ChatApi.ts `props`). */
const COMPATIBILITY = { date: "2026-10-01", flags: ["nodejs_compat", "enable_request_signal", "global_fetch_strictly_public"] }

/**
 * The most a bundle's module evaluation may take in Node on a development machine. Cloudflare measured ChatApi about
 * 1.2 to 1.9 times Node's time, so this keeps it under 400 ms there, 40% of the limit.
 */
export const BUDGET_MS = 200

/** The root of installed package `name`, found from the module `from` resolves to. */
const packageRoot = async (from: string, name: string): Promise<string> => {
  let dir = dirname(from)
  for (;;) {
    const manifest = JSON.parse(await readFileAsync(join(dir, "package.json"), "utf8").catch(() => "{}")) as { name?: string }
    if (manifest.name === name) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`no ${name} above ${from}`)
    dir = parent
  }
}

/** The ES module entry package `root` exports at `subpath`. */
const importEntry = async (root: string, subpath: string): Promise<string> => {
  const manifest = JSON.parse(await readFileAsync(join(root, "package.json"), "utf8")) as {
    exports: Record<string, string | { import?: string | { default: string } }>
  }
  const entry = manifest.exports[subpath]!
  const target = typeof entry === "string" ? entry : entry.import!
  return join(root, typeof target === "string" ? target : target.default)
}

interface Output {
  readonly type: "chunk" | "asset"
  readonly fileName: string
  readonly code?: string
  readonly source?: string | Uint8Array
}

/** ChatApi as Alchemy's bundler emits it. */
const bundle = async (): Promise<ReadonlyArray<Output>> => {
  const alchemy = await packageRoot(fileURLToPath(import.meta.resolve("alchemy")), "alchemy")
  const [rolldownEntry, cloudflareEntry] = await Promise.all([
    importEntry(join(alchemy, "..", "rolldown"), "."),
    importEntry(join(alchemy, "..", "@alchemy.run", "cloudflare-runtime"), "./rolldown"),
  ])
  const rolldown = (await import(pathToFileURL(rolldownEntry).href)) as {
    rolldown: (options: Record<string, unknown>) => Promise<{
      generate: (options: Record<string, unknown>) => Promise<{ output: ReadonlyArray<Output> }>
      close: () => Promise<void>
    }>
  }
  const cloudflare = (await import(pathToFileURL(cloudflareEntry).href)).default as (options: {
    readonly compatibilityDate: string
    readonly compatibilityFlags: ReadonlyArray<string>
  }) => Array<unknown>
  const build = await rolldown.rolldown({
    input: ENTRY,
    cwd: MVP,
    external: ["lightningcss", "fsevents"],
    plugins: cloudflare({ compatibilityDate: COMPATIBILITY.date, compatibilityFlags: COMPATIBILITY.flags }) as never,
    checks: { unresolvedImport: false, ineffectiveDynamicImport: false },
  })
  const { output } = await build.generate({ format: "esm", entryFileNames: "ChatApi.js", strictExecutionOrder: true })
  await build.close()
  return output
}

describe("ChatApi's startup", () => {
  let dir = ""
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "chatapi-startup-"))
    for (const file of await bundle()) {
      const path = join(dir, file.fileName)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, file.type === "chunk" ? file.code! : file.source!)
    }
  }, 180_000)
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  test(`evaluates its bundle's modules in under ${BUDGET_MS} ms (the median of three fresh loads)`, () => {
    const runs = [0, 1, 2].map(() => {
      const ran = spawnSync(process.execPath, ["--no-warnings", EVALUATE, join(dir, "ChatApi.js")], { encoding: "utf8" })
      expect(ran.status, ran.stderr).toBe(0)
      return (JSON.parse(ran.stdout.trim().split("\n").at(-1)!) as { evaluationMs: number }).evaluationMs
    }).sort((a, b) => a - b)
    console.info(`ChatApi module evaluation: ${runs.map((ms) => Math.round(ms)).join(", ")} ms`)
    expect(runs[1]).toBeLessThan(BUDGET_MS)
  }, 120_000)
})
