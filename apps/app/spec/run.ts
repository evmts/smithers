import { chromium, type Page } from "@playwright/test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { pathToFileURL } from "node:url"
import { execFileSync } from "node:child_process"
import { prepare } from "../e2e/showcase/driver"
import { journey, interpolate, interpolateData, type Journey, type Assertion, type Step } from "./journey"
import { element, observe, type Decode, type Exchange } from "./observe"
import { results, type Mode, type RunResult, type StepResult } from "./results"

export interface RunOptions {
  readonly mode: Mode
  readonly origin: string
  readonly output: string
  readonly revision: string
  readonly decode: Decode
  readonly readWorld?: (definition: Journey, read: string) => Promise<unknown>
  readonly capture?: (exchange: Exchange) => Promise<void>
}
const pick = (body: unknown, path: string): string => {
  if (path === "firstHeading" || path === "lastLine" || path === "fileText") {
    const data = body as { content: string; encoding?: string }
    const text = data.encoding === "base64" ? Buffer.from(data.content, "base64").toString() : data.content
    if (path === "fileText") return text
    if (path === "lastLine") return text.trimEnd().split("\n").at(-1)!
    const heading = /^#{1,6}\s+(.+)$/m.exec(text)?.[1]
    if (!heading) throw new Error("Binding firstHeading: missing heading")
    return heading
  }
  let value = body
  for (const key of path.split(".")) value = (value as Record<string, unknown>)[key]
  if (typeof value !== "string") throw new Error(`Binding ${path}: expected string`)
  return value
}
/** One fresh signed-out browser context per journey. No route interception. */
export const runJourney = async (page: Page, definition: Journey, options: RunOptions): Promise<RunResult> => {
  const startedAt = new Date().toISOString()
  const steps: StepResult[] = []
  const base = { journey: definition.id, mode: options.mode, revision: options.revision, startedAt, steps }
  if (options.mode === "live" && "skip" in definition.live) return { ...base, state: "unverified", reason: definition.live.skip }
  const bindings: Record<string, string> = { ...("subject" in definition.live ? definition.live.subject : {}) }
  const exchanges: Exchange[] = []
  const pending = new Set<Promise<void>>()
  const errors: string[] = []
  const response = (res: import("@playwright/test").Response) => {
    if (!new URL(res.url()).pathname.startsWith("/api/")) return
    const task = (async () => {
      const body = await res.json().catch(() => null)
      const exchange = { method: res.request().method(), url: res.url(), status: res.status(), body }
      exchanges.push(exchange)
      await options.capture?.(exchange)
    })().catch(error => { errors.push(String(error)) })
    pending.add(task)
    void task.finally(() => pending.delete(task))
  }
  page.on("response", response)
  page.setDefaultTimeout(5000)
  const driver = await prepare(page, false)
  try {
    for (const [name, binding] of Object.entries(definition.bind ?? {})) {
      const read = interpolate(binding.read, bindings).replace(":repo", bindings.repo ?? "")
      if (!read.startsWith("GET /api/")) throw new Error(`Read-only binding required: ${read}`)
      const body = options.mode === "mock"
        ? await options.readWorld?.(definition, read)
        : await (async () => {
          const res = await page.request.get(new URL(read.slice(4), options.origin).href)
          if (!res.ok()) throw new Error(`Binding ${name}: HTTP ${res.status()}`)
          return res.json()
        })()
      bindings[name] = pick(body, binding.pick)
    }
    const planned: ReadonlyArray<Step> = definition.steps.length ? definition.steps : [{ caption: definition.id, go: definition.go, expect: definition.expect ?? [] }]
    let lastNavigation = 0
    for (const [index, step] of planned.entries()) {
      await Promise.all([...pending])
      exchanges.length = 0
      const at = Date.now()
      const screenshot = resolve(options.output, definition.id, `${index + 1}.png`)
      const assertions = []
      try {
        if (step.viewport) await page.setViewportSize(step.viewport)
        const expand = (value: string) => interpolate(value, bindings)
        if (step.go !== undefined) {
          if (options.mode === "live") await new Promise(r => setTimeout(r, Math.max(0, 1000 - (Date.now() - lastNavigation))))
          lastNavigation = Date.now()
          const destination = new URL(expand(step.go), options.origin)
          if (options.mode === "live" && destination.origin !== new URL(options.origin).origin) throw new Error("Live navigation must stay on target origin")
          await page.goto(destination.href, { waitUntil: "domcontentloaded" })
        }
        if (step.click) {
          if (options.mode === "live") {
            const control = element(page, step.click)
            const safe = await control.evaluate(node => {
              const link = node.closest("a")
              if (link) return new URL(link.href).origin === location.origin && !/\/(?:auth|login|logout|sign-in)(?:\/|$)/.test(new URL(link.href).pathname)
              return /^(?:files|file|issues|repo\.home)(?:\s|$)/.test(node.getAttribute("data-flow") ?? "")
            })
            if (!safe) throw new Error("Live control is not a same-origin read navigation")
            await new Promise(r => setTimeout(r, Math.max(0, 1000 - (Date.now() - lastNavigation))))
            lastNavigation = Date.now()
          }
          await driver.app.click(element(page, step.click))
        }
        if (step.type) {
          if (options.mode === "live") throw new Error("Live typing is not permitted")
          await driver.app.type(element(page, step.type.into), expand(step.type.text))
        }
        if (step.say) {
          if (options.mode === "live") throw new Error("Live form submission is not permitted")
          await driver.app.say(expand(step.say))
        }
        for (const assertion of step.expect) {
          const expanded = interpolateData(assertion, bindings) as Assertion
          await Promise.all([...pending])
          assertions.push(await observe(page, expanded, exchanges, options.decode))
        }
        await Promise.all([...pending])
        if (errors.length) throw new Error(errors.join("\n"))
      } catch (error) {
        assertions.push({ kind: "action", ok: false, expected: step, actual: null, reason: String(error) })
      }
      await mkdir(dirname(screenshot), { recursive: true })
      await page.screenshot({ path: screenshot, fullPage: true })
      steps.push({ caption: step.caption, spec: step.spec ?? definition.spec, status: assertions.some(a => a.ok === false) ? "failed" : assertions.some(a => a.ok === null) ? "skipped" : "passed", assertions, screenshot, ms: Date.now() - at })
    }
    return { ...base, state: steps.some(s => s.status === "failed") ? (options.mode === "mock" ? "stale" : "unverified") : "unverified", reason: "Pair mock/live evidence in drift before assigning shipped or ahead" }
  } catch (error) {
    return { ...base, state: "unverified", reason: String(error) }
  } finally { page.off("response", response) }
}

export const main = async (argv: string[]): Promise<number> => {
  const [command, ...args] = argv
  if (!["mock", "live", "capture"].includes(command ?? "")) throw new Error("Usage: run.ts mock|live|capture <journey...> [--results-file path]")
  if (command === "capture" && !args.includes("--live")) throw new Error("capture requires --live")
  const mode: Mode = command === "mock" ? "mock" : "live"
  const resultAt = args.indexOf("--results-file")
  const resultsFile = resultAt < 0 ? undefined : args[resultAt + 1]
  if (resultAt >= 0 && !resultsFile) throw new Error("--results-file requires a path")
  const names = args.filter((arg, i) => !arg.startsWith("--") && (resultAt < 0 || i !== resultAt + 1))
  if (!names.length) throw new Error("At least one journey required")
  const output = process.env.SPEC_OUTPUT ?? resolve(process.env.HOME ?? ".", "smithers-lanes/out/spec2-runner")
  const revision = execFileSync("jj", ["log", "-r", "@", "--no-graph", "-T", "commit_id"], { encoding: "utf8" }).trim()
  const { decode } = await import("./wire")
  let mockUnavailable: string | undefined
  const server = mode === "mock" && !process.env.SPEC_MOCK_URL ? await (await import("./serve")).serve(resolve(import.meta.dirname, "../dist-spec")).catch(error => { mockUnavailable = `Spec build unavailable: ${String(error)}`; return undefined }) : undefined
  const browser = await chromium.launch({ headless: true }).catch(async error => { await server?.close(); throw error })
  const runs: RunResult[] = []
  try {
    for (const name of names) {
      const file = name.endsWith(".ts") ? resolve(name) : resolve(import.meta.dirname, "journeys", `${name}.journey.ts`)
      const definition = journey((await import(pathToFileURL(file).href)).default)
      const origin = mode === "mock" ? process.env.SPEC_MOCK_URL ?? server?.origin : "target" in definition.live ? ({ default: "https://smithers.sh", smithers: "https://smithers.sh", effeck: "https://effeck.dev" } as Record<string, string>)[definition.live.target] ?? definition.live.target : "https://smithers.sh"
      if (!origin || mode === "mock" && definition.world.base !== "default") {
        runs.push({ journey: definition.id, mode, revision, startedAt: new Date().toISOString(), steps: [], state: "unverified", reason: mode === "mock" && definition.world.base !== "default" ? "world arrives at M" : mockUnavailable ?? "SPEC_MOCK_URL must point at a served dist-spec" })
        continue
      }
      const context = await browser.newContext({ serviceWorkers: "block" })
      try {
        runs.push(await runJourney(await context.newPage(), definition, { mode, origin, output, revision, decode,
          readWorld: async (_definition, read) => {
            const world = JSON.parse(await readFile(process.env.SPEC_WORLD_READS ?? resolve(output, "world-reads.json"), "utf8")) as Record<string, unknown>
            if (!(read in world)) throw new Error(`Missing world binding: ${read}`)
            return world[read]
          },
          ...(command === "capture" ? { capture: async (exchange: Exchange) => {
            const { capture } = await import("./wire")
            await capture(exchange, output, revision)
          } } : {})
        }))
      } finally { await context.close() }
    }
  } finally { await browser.close(); await server?.close() }
  if (resultsFile) {
    await mkdir(dirname(resolve(resultsFile)), { recursive: true })
    await writeFile(resultsFile, JSON.stringify(results(runs), null, 2) + "\n")
  }
  console.log(JSON.stringify(runs, null, 2))
  if (runs.some(run => run.steps.some(step => step.status === "failed"))) return 1
  return runs.some(run => run.reason && run.steps.length === 0) ? 5 : 0
}
if (import.meta.main) main(process.argv.slice(2)).then(code => { process.exitCode = code }).catch(error => { console.error(error); process.exitCode = 1 })
