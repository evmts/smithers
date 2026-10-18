import { chromium, type Page } from "@playwright/test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { pathToFileURL } from "node:url"
import { revision } from "./revision"
import { loadJourneys, journeyFiles } from "./loadJourneys"
import { prepare } from "../e2e/showcase/driver"
import { interpolate, interpolateData, type Journey, type Assertion, type Step } from "./journey"
import { element, observe, type Decode, type Exchange } from "./observe"
import { results, type Mode, type RunResult, type StepResult } from "./results"

import { judgeAssertion, type JudgeOptions } from "./judgeAssertion.ts"

export interface RunOptions {
  readonly judge?: JudgeOptions
  readonly mode: Mode
  readonly origin: string
  readonly output: string
  readonly revision: string
  readonly decode: Decode
  readonly readWorld?: (definition: Journey, read: string) => Promise<unknown>
  readonly assertionTimeoutMs?: number
  readonly beforeStep?: (page: Page, index: number) => Promise<void>
  readonly requireFixtureTransport?: boolean
  readonly checkTransport?: () => void
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
  let lastNavigation = 0
  const navigation = (request: import("@playwright/test").Request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) lastNavigation = Date.now()
  }
  const paceNavigation = async () => {
    if (options.mode !== "live") return
    while (Date.now() - lastNavigation < 1000) await new Promise(resolve => setTimeout(resolve, 1000 - (Date.now() - lastNavigation)))
  }
  page.on("request", navigation)
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
          const url = new URL(read.slice(4), options.origin).href
          const res = await page.request.get(url)
          const body = await res.json().catch(() => null)
          await options.capture?.({ method: "GET", url, status: res.status(), body })
          if (!res.ok()) throw new Error(`Binding ${name}: HTTP ${res.status()}`)
          if (body === null) throw new Error(`Binding ${name}: expected JSON (HTTP ${res.status()})`)
          return body
        })()
      bindings[name] = pick(body, binding.pick)
    }
    const planned: ReadonlyArray<Step> = definition.steps.length ? definition.steps : [{ caption: definition.id, go: definition.go, expect: definition.expect ?? [] }]
    for (const [index, step] of planned.entries()) {
      await Promise.all([...pending])
      exchanges.length = 0
      if (options.mode === "mock") await page.evaluate(() => { if (window.__spec) window.__spec.exchanges.length = 0 }).catch(() => {})
      const at = Date.now()
      const screenshot = resolve(options.output, options.mode, definition.id, startedAt.replace(/[:.]/g, "-"), `${index + 1}.png`)
      const assertions = []
      try {
        await options.beforeStep?.(page, index)
        if (step.viewport) await page.setViewportSize(step.viewport)
        const expand = (value: string) => interpolate(value, bindings)
        if (step.go !== undefined) {
          await paceNavigation()
          const destination = new URL(expand(step.go), options.origin)
          if (options.mode === "live" && (destination.origin !== new URL(options.origin).origin || /^\/(?:api\/)?(?:auth|login|logout|sign-in)(?:\/|$)/.test(destination.pathname))) throw new Error("Live navigation must stay on the read-only target")
          if (options.mode === "mock") for (const [key, value] of Object.entries(definition.world.variant ?? {})) destination.searchParams.set(key, value)
          await page.goto(destination.href, { waitUntil: "domcontentloaded" })
        }
        if (step.click) {
          if (options.mode === "live") {
            const control = element(page, step.click)
            const safe = await control.evaluate(node => {
              const link = node.closest("a")
              if (link) return new URL(link.href).origin === location.origin && !/^\/(?:api\/)?(?:auth|login|logout|sign-in)(?:\/|$)/.test(new URL(link.href).pathname)
              return /^(?:files|file|issues|repo\.home)(?:\s|$)/.test(node.getAttribute("data-flow") ?? "")
            })
            if (!safe) throw new Error("Live control is not a same-origin read navigation")
            await paceNavigation()
          }
          const control = element(page, step.click)
          const linkedPage = await control.evaluate(node => {
            const link = node.closest("a")
            return link?.target === "_blank" ? link.href : null
          })
          // Keep a linked document in the runner's observed stage, even when the app opens a tab.
          if (linkedPage) {
            if (new URL(linkedPage).origin !== new URL(options.origin).origin) throw new Error("Linked document must stay on the read-only target")
            await paceNavigation()
            await page.goto(linkedPage, { waitUntil: "domcontentloaded" })
          } else await driver.app.click(control)
        }
        if (step.type) {
          if (options.mode === "live") throw new Error("Live typing is not permitted")
          await driver.app.type(element(page, step.type.into), expand(step.type.text))
        }
        if (step.say) {
          if (options.mode === "live") throw new Error("Live form submission is not permitted")
          await driver.app.say(expand(step.say))
        }
        for (const [assertionIndex, assertion] of step.expect.entries()) {
          const expanded = interpolateData(assertion, bindings) as Assertion
          await Promise.all([...pending])
          const fixtureExchanges = options.mode === "mock" ? await page.evaluate(() => window.__spec?.exchanges ?? []) : []
          assertions.push("fuzzy" in expanded || "rubric" in expanded
            ? await judgeAssertion(page, expanded, definition, step, `${index}:${assertionIndex}`, options.judge)
            : await observe(page, expanded, [...exchanges, ...fixtureExchanges], options.decode, options.assertionTimeoutMs))
        }
        await Promise.all([...pending])
        if (options.mode === "mock") await page.evaluate(required => {
          if (required && !window.__spec) throw new Error("Not a spec build: fixture transport missing")
          window.__spec?.assertClean()
        }, options.requireFixtureTransport ?? false)
        options.checkTransport?.()
        if (errors.length) throw new Error(errors.join("\n"))
      } catch (error) {
        assertions.push({ kind: "action", ok: false, expected: step, actual: null, reason: String(error) })
      }
      await mkdir(dirname(screenshot), { recursive: true })
      await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled", timeout: 30000 })
      steps.push({ caption: step.caption, spec: step.spec ?? definition.spec, status: assertions.some(a => a.ok === false) ? "failed" : assertions.some(a => a.ok === null) ? "skipped" : "passed", assertions, screenshot, ms: Date.now() - at })
    }
    return { ...base, state: steps.some(s => s.status === "failed") ? (options.mode === "mock" ? "stale" : "unverified") : "unverified", reason: "Pair mock/live evidence in drift before assigning shipped or ahead" }
  } catch (error) {
    return { ...base, state: "unverified", reason: String(error) }
  } finally { page.off("response", response); page.off("request", navigation) }
}

export const main = async (argv: string[]): Promise<number> => {
  const [command, ...args] = argv
  if (!["mock", "live", "capture", "judge"].includes(command ?? "")) throw new Error("Usage: run.ts mock|live|capture <journey...> [--all] [--results-file path]")
  if (command === "capture" && !args.includes("--live")) throw new Error("capture requires --live")
  const recording = command === "judge"
  if (recording && !args.includes("--record")) throw new Error("judge requires --record")
  const mode: Mode = command === "mock" || recording && !args.includes("--live") ? "mock" : "live"
  const resultAt = args.indexOf("--results-file")
  const resultsFile = resultAt < 0 ? undefined : args[resultAt + 1]
  if (resultAt >= 0 && !resultsFile) throw new Error("--results-file requires a path")
  const timeoutAt = args.indexOf("--assertion-timeout-ms")
  const assertionTimeoutMs = timeoutAt < 0 ? undefined : Number(args[timeoutAt + 1])
  if (timeoutAt >= 0 && (!Number.isFinite(assertionTimeoutMs) || assertionTimeoutMs! <= 0)) throw new Error("--assertion-timeout-ms requires a positive number")
  const names = args.filter((arg, i) => !arg.startsWith("--") && (resultAt < 0 || i !== resultAt + 1) && (timeoutAt < 0 || i !== timeoutAt + 1))
  if (!names.length && !args.includes("--all")) throw new Error("At least one journey required")
  const definitions = await loadJourneys(args.includes("--all") ? await journeyFiles() : names)
  const output = process.env.SPEC_OUTPUT ?? resolve(process.env.HOME ?? ".", "smithers-lanes/out/spec2-runner")
  const sourceRevision = revision()
  const { decode } = await import("./wire")
  const siteDirectories = (mode === "mock" ? JSON.parse(process.env.SPEC_MOCK_SITE_DIRS ?? "{}") : {}) as Record<string, string>
  if (!siteDirectories || typeof siteDirectories !== "object" || Array.isArray(siteDirectories) || Object.values(siteDirectories).some(path => typeof path !== "string")) throw new Error("SPEC_MOCK_SITE_DIRS must map world names to directories")
  const factory = JSON.parse(
    await readFile(
      process.env.SPEC_JUDGE_POLICY ?? resolve(import.meta.dirname, "../../../.smithers/factory.json"),
      "utf8"
    )
  )
  const policy = factory.judges
  const runId = `spec-${crypto.randomUUID()}`
  const ledger = resolve(resultsFile ? dirname(resultsFile) : output, "review-budget.json")
  let evaluator: import("@smthrs/model/Evaluator").Evaluator | undefined
  let fuzzyEvaluator: import("@smthrs/model/Evaluator").Evaluator | undefined
  if (recording) {
    if (process.env.CI || !policy || !process.env.SPEC_JUDGE_SEAT) {
      console.error("Judgment inconclusive: recording requires local policy and SPEC_JUDGE_SEAT")
      return 5
    }
    const { seat, seats } = await import(pathToFileURL(resolve(process.env.SPEC_JUDGE_SEAT)).href)
    const { seatEvaluator } = await import("./seatEvaluator.ts")
    const { Effect } = await import("effect")
    try {
      evaluator = await Effect.runPromise(
        seatEvaluator(seats?.rubric ?? seat, policy.engines.rubric.model, policy.engines.rubric.engine)
      )
      fuzzyEvaluator = await Effect.runPromise(
        seatEvaluator(seats?.fuzzy ?? seat, policy.engines.fuzzy.model, policy.engines.fuzzy.engine)
      )
    } catch {
      console.error("Judgment inconclusive: seat does not match policy")
      return 5
    }
  }
  let mockUnavailable: string | undefined
  const server = mode === "mock" && !process.env.SPEC_MOCK_URL ? await (await import("./staticServer")).staticServer(resolve(import.meta.dirname, "../dist-spec")).catch(error => { mockUnavailable = `Spec build unavailable: ${String(error)}`; return undefined }) : undefined
  const browser = await chromium.launch({ headless: true }).catch(async error => { await server?.close(); throw error })
  const runs: RunResult[] = []
  const siteHosts = new Map<string, NonNullable<typeof server>>()
  try {
    for (const { definition, file } of definitions) {
      if (mode === "live" && "skip" in definition.live) {
        runs.push({ journey: definition.id, mode, revision: sourceRevision, startedAt: new Date().toISOString(), steps: [], state: "unverified", reason: definition.live.skip })
        continue
      }
      let mockHost = server
      let unavailable = mockUnavailable
      if (mode === "mock" && definition.world.base !== "default") {
        const directory = siteDirectories[definition.world.base]
        if (directory) {
          mockHost = siteHosts.get(definition.world.base)
          if (!mockHost) {
            mockHost = await (await import("./staticServer")).staticServer(directory).catch(error => { unavailable = String(error); return undefined })
            if (mockHost) siteHosts.set(definition.world.base, mockHost)
          }
        } else { mockHost = undefined; unavailable = "world arrives at M" }
      }
      const origin = mode === "mock" ? definition.world.base === "default" ? process.env.SPEC_MOCK_URL ?? mockHost?.origin : mockHost?.origin
        : "target" in definition.live ? ({ default: "https://smithers.sh", smithers: "https://smithers.sh", effeck: "https://effeck.dev" } as Record<string, string>)[definition.live.target] ?? definition.live.target : "https://smithers.sh"
      if (!origin) {
        runs.push({ journey: definition.id, mode, revision: sourceRevision, startedAt: new Date().toISOString(), steps: [], state: "unverified", reason: unavailable ?? "SPEC_MOCK_URL must point at a served dist-spec" })
        continue
      }
      if (mode === "live" && runs.length > 0) await new Promise(resolve => setTimeout(resolve, 1000))
      const sidecar = mode === "mock"
        ? file.replace(/(?:\.journey)?\.ts$/, ".judgments.json")
        : resolve(output, "live-judgments", `${definition.id}.judgments.json`)
      if (recording) await mkdir(dirname(sidecar), { recursive: true })
      const context = await browser.newContext({ serviceWorkers: "block" })
      try {
        let testedRevision = sourceRevision
        const stamp = await context.request.get(new URL("/__build.json", origin).href).then(response => response.json()).catch(() => null) as { gitSha?: unknown } | null
        if (typeof stamp?.gitSha === "string") testedRevision = stamp.gitSha
        else if (mode === "live") testedRevision = "unknown: deployed build stamp unavailable"
        runs.push(await runJourney(await context.newPage(), definition, { mode, origin, output, revision: testedRevision, decode, assertionTimeoutMs,
            judge: {
              policy,
              sidecar,
              labels: resolve(import.meta.dirname, "labels"),
              ...(evaluator
                ? {
                  record: {
                    evaluator,
                    fuzzyEvaluator,
                    ledger,
                    run: runId,
                    pendingLabels: resolve(resultsFile ? dirname(resultsFile) : output, "pending-labels.jsonl")
                  }
                }
                : {})
            },
          readWorld: (await import("./readWorld")).readWorld,
          requireFixtureTransport: mode === "mock" && definition.world.base === "default" && process.env.SPEC_MOCK_URL === undefined,
          checkTransport: () => { if (mockHost?.escapes.length) throw new Error(`Escaped mock transport: ${mockHost.escapes.join(", ")}`) },
          ...(command === "capture" ? { capture: async (exchange: Exchange) => {
            const { capture } = await import("./wire")
            await capture(exchange, output, testedRevision)
          } } : {})
        }))
      } finally { await context.close() }
    }
  } finally { await browser.close(); await server?.close(); for (const host of siteHosts.values()) await host.close() }
  if (resultsFile) {
    await mkdir(dirname(resolve(resultsFile)), { recursive: true })
    await writeFile(resultsFile, JSON.stringify(results(runs), null, 2) + "\n")
  }
  console.log(JSON.stringify(runs, null, 2))
  if (runs.some(run => run.steps.some(step => step.status === "failed"))) return 1
  return runs.some(run => run.reason && run.steps.length === 0 || run.steps.some(step => step.assertions.some(assertion => assertion.verdict === "inconclusive"))) ? 5 : 0
}
if (import.meta.main) main(process.argv.slice(2)).then(code => { process.exitCode = code }).catch(error => { console.error(error); process.exitCode = 1 })
