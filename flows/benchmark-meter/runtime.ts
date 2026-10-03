import { randomUUID } from "node:crypto"
import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { setTimeout } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { cloudEnvironment, type Credentials, credentials, secretValues } from "../benchmark/credentials.ts"
import { BenchmarkFailed } from "../benchmark/schema.ts"
import { createSink } from "../benchmark/sink.ts"
import { estimateMeter, type MeterSample, type MeterTrial } from "./meter.ts"

export interface MeterInput {
  readonly accounts: ReadonlyArray<"codex-1" | "codex-3" | "codex-acct-1">
  readonly job: string
  readonly run?: number | undefined
  readonly benchmarkRepo?: string | undefined
  readonly durationSeconds?: number | undefined
  readonly resultsRepo?: string | undefined
}
export interface MeterRuntimeOptions {
  readonly environment?: NodeJS.ProcessEnv
  readonly checkout?: string
  readonly resultsRemote?: string
  readonly usageEndpoint?: string
  readonly apiOrigin?: string
  readonly now?: () => number
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  readonly credentials?: (
    accounts: MeterInput["accounts"],
    models: boolean,
    environment: NodeJS.ProcessEnv
  ) => Promise<Credentials>
}

export function usageSample(account: string, timestamp: number, value: unknown): MeterSample {
  const usage = value as {
    rate_limit?: { primary_window?: { used_percent?: unknown; reset_at?: unknown; limit_window_seconds?: unknown } }
  } | null
  const window = usage?.rate_limit?.primary_window
  if (
    !window || (window.limit_window_seconds !== undefined && window.limit_window_seconds !== 604800) ||
    typeof window.used_percent !== "number" || window.used_percent < 0 || window.used_percent > 100 ||
    !Number.isInteger(window.used_percent) || typeof window.reset_at !== "number" ||
    !Number.isSafeInteger(window.reset_at) || !Number.isSafeInteger(window.reset_at * 1000) ||
    window.reset_at * 1000 <= timestamp || !Number.isSafeInteger(timestamp) || timestamp < 0
  ) {
    throw new BenchmarkFailed({ code: "driver", message: `Invalid usage response for ${account}` })
  }
  return { account, timestamp, usedPercent: window.used_percent, resetAt: window.reset_at * 1000 }
}
const checkCancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new BenchmarkFailed({ code: "driver", message: "Meter cancelled" })
}
async function json(url: string, headers: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  checkCancelled(signal)
  let response: Response
  try {
    response = await fetch(url, {
      headers,
      redirect: "error",
      signal: signal === undefined
        ? AbortSignal.timeout(15_000)
        : AbortSignal.any([signal, AbortSignal.timeout(15_000)])
    })
  } catch {
    checkCancelled(signal)
    throw new BenchmarkFailed({ code: "driver", message: "Meter request failed" })
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new BenchmarkFailed({ code: "driver", message: `Meter request failed: HTTP ${response.status}` })
  }
  try {
    return await response.json()
  } catch {
    checkCancelled(signal)
    throw new BenchmarkFailed({ code: "driver", message: "Invalid JSON meter response" })
  }
}
export async function sampleAccounts(
  accounts: MeterInput["accounts"],
  home: string,
  signal?: AbortSignal,
  options: Pick<MeterRuntimeOptions, "usageEndpoint" | "now"> = {}
): Promise<Array<MeterSample>> {
  return Promise.all(accounts.map(async (account) => {
    let auth: { tokens?: { access_token?: string; account_id?: string } }
    try {
      auth = JSON.parse(await readFile(join(home, ".smithers", "accounts", account, "auth.json"), "utf8"))
    } catch {
      throw new BenchmarkFailed({ code: "credentials", message: `Invalid Codex bundle for ${account}` })
    }
    if (!auth?.tokens?.access_token || !auth.tokens.account_id) {
      throw new BenchmarkFailed({ code: "credentials", message: `Missing Codex bundle for ${account}` })
    }
    const response = await json(options.usageEndpoint ?? "https://chatgpt.com/backend-api/wham/usage", {
      Authorization: `Bearer ${auth.tokens.access_token}`,
      "ChatGPT-Account-Id": auth.tokens.account_id,
      originator: "codex_cli_rs",
      "User-Agent": "codex_cli_rs"
    }, signal)
    return usageSample(account, (options.now ?? Date.now)(), response)
  }))
}
export function tokenTrials(summaries: ReadonlyArray<Record<string, unknown>>) {
  const trials: Array<MeterTrial> = [], incomplete: Array<string> = []
  for (const summary of summaries) {
    if (
      typeof summary.account !== "string" || !summary.account ||
      ["model", "suite", "arm", "id", "start", "end"].some((field) =>
        typeof summary[field] !== "string" || !summary[field].trim()
      ) ||
      !Number.isFinite(Date.parse(String(summary.start))) || !Number.isFinite(Date.parse(String(summary.end))) ||
      Date.parse(String(summary.end)) < Date.parse(String(summary.start)) ||
      ["uncached", "cached", "output"].some((field) =>
        typeof summary[field] !== "number" || !Number.isSafeInteger(summary[field]) || summary[field] < 0
      )
    ) {
      incomplete.push(String(summary.id))
      continue
    }
    trials.push({
      id: String(summary.id),
      account: summary.account,
      model: String(summary.model),
      suite: String(summary.suite),
      arm: String(summary.arm),
      start: String(summary.start),
      end: String(summary.end),
      uncached: summary.uncached as number,
      cached: summary.cached as number,
      output: summary.output as number
    })
  }
  return { trials, incomplete }
}
const atomicWrite = async (path: string, content: string) => {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content, { mode: 0o600, flag: "wx" })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

/** Endpoints, clocks and credentials are supplied by the trusted host, never flow payloads. */
export async function runMeter(input: MeterInput, signal?: AbortSignal, options: MeterRuntimeOptions = {}) {
  checkCancelled(signal)
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(input.job)
    || !input.accounts.length ||
    input.accounts.some((account) => !["codex-1", "codex-3", "codex-acct-1"].includes(account))
    || (input.run !== undefined && (!Number.isSafeInteger(input.run) || input.run < 1))
    || (input.durationSeconds !== undefined &&
      (!Number.isSafeInteger(input.durationSeconds) || input.durationSeconds < 1 || input.durationSeconds > 172800))
    || [input.resultsRepo, input.benchmarkRepo].some((repo) =>
      repo !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo)
    )
  ) {
    throw new BenchmarkFailed({ code: "configuration", message: "Invalid meter input" })
  }
  if (input.run === undefined && input.durationSeconds === undefined) {
    throw new BenchmarkFailed({ code: "configuration", message: "Meter requires run or durationSeconds" })
  }
  const environment = options.environment ?? process.env
  const env = cloudEnvironment(environment), resultsRepo = input.resultsRepo ?? "smithers-canary/bench-results"
  const now = options.now ?? Date.now
  const sleep = options.sleep ??
    ((milliseconds: number, signal?: AbortSignal) =>
      setTimeout(milliseconds, undefined, signal === undefined ? {} : { signal }))
  const root = resolve(
    options.checkout ?? fileURLToPath(new URL("../../", import.meta.url)),
    ".flows",
    "benchmark-meter",
    input.job
  )
  await mkdir(root, { recursive: true, mode: 0o700 })
  const auth = await (options.credentials ?? credentials)(input.accounts, true, environment)
  try {
    const identity = JSON.stringify({
      accounts: [...new Set(input.accounts)].sort(),
      job: input.job,
      run: input.run ?? null,
      durationSeconds: input.durationSeconds ?? null,
      benchmarkRepo: input.benchmarkRepo ?? "smithers-canary/bench",
      resultsRepo
    })
    const manifest = join(root, "input.json")
    let started: number
    try {
      let saved: { identity?: unknown; started?: unknown }
      try {
        saved = JSON.parse(await readFile(manifest, "utf8"))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw error
        throw new BenchmarkFailed({ code: "configuration", message: "Invalid meter checkpoint JSON" })
      }
      if (saved?.identity !== identity) {
        throw new BenchmarkFailed({ code: "configuration", message: "Meter job exists with different input" })
      }
      if (
        typeof saved.started !== "number" || !Number.isSafeInteger(saved.started) || saved.started < 0 ||
        saved.started > now()
      ) {
        throw new BenchmarkFailed({ code: "configuration", message: "Invalid meter checkpoint timestamp" })
      }
      started = saved.started
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      started = now()
      await atomicWrite(manifest, JSON.stringify({ identity, started }))
    }
    const samplesPath = join(root, "samples.jsonl")
    const samples: Array<MeterSample> = []
    let recoveredPartialSample = false
    try {
      const text = await readFile(samplesPath, "utf8")
      const lines = text.split("\n")
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index]!
        if (!line.trim()) continue
        try {
          samples.push(JSON.parse(line))
        } catch {
          if (index === lines.length - 1 && !text.endsWith("\n")) {
            recoveredPartialSample = true
            break
          }
          throw new BenchmarkFailed({ code: "configuration", message: "Invalid meter sample checkpoint" })
        }
      }
      try {
        estimateMeter(samples, [])
        if (
          samples.some((sample) =>
            !input.accounts.includes(sample.account as MeterInput["accounts"][number])
            || typeof sample.timestamp !== "number" || sample.timestamp < started || sample.timestamp > now()
          )
        ) {
          throw new Error("Invalid saved sample")
        }
      } catch {
        throw new BenchmarkFailed({ code: "configuration", message: "Invalid meter sample checkpoint" })
      }
      // A write interrupted before its final newline cannot contaminate the next sample.
      if (recoveredPartialSample || (text.length > 0 && !text.endsWith("\n"))) {
        await atomicWrite(samplesPath, samples.map((sample) => JSON.stringify(sample) + "\n").join(""))
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    for (;;) {
      checkCancelled(signal)
      let finished = false
      if (input.run !== undefined) {
        const status = await json(
          `${options.apiOrigin ?? env.SMITHERS_API_ORIGIN}/api/repos/${
            input.benchmarkRepo ?? "smithers-canary/bench"
          }/runs/${input.run}`,
          { Authorization: `Bearer ${env.SMITHERS_TOKEN}` },
          signal
        ) as { status?: string } | null
        if (!status || typeof status.status !== "string" || !status.status.trim()) {
          throw new BenchmarkFailed({ code: "driver", message: "Benchmark run returned no status" })
        }
        finished = ["success", "failure", "completed", "failed", "cancelled", "canceled", "succeeded"].includes(
          status.status
        )
      }
      // Sample after the completion check so the final usage includes the run's final interval.
      const current = await sampleAccounts(input.accounts, auth.home, signal, options)
      samples.push(...current)
      await appendFile(samplesPath, current.map((sample) => JSON.stringify(sample) + "\n").join(""), { mode: 0o600 })
      if (finished || (input.durationSeconds !== undefined && now() >= started + input.durationSeconds * 1000)) break
      const untilEnd = input.durationSeconds === undefined
        ? 60_000
        : Math.min(60_000, started + input.durationSeconds * 1000 - now())
      try {
        await sleep(Math.max(1, untilEnd), signal)
      } catch (error) {
        checkCancelled(signal)
        throw error
      }
    }
    const results = join(root, "results")
    const sink = createSink({
      checkout: results,
      remote: options.resultsRemote ?? `${env.SMITHERS_API_ORIGIN}/${resultsRepo}.git`,
      job: input.job,
      env: auth.env,
      secrets: secretValues(environment),
      ...(signal === undefined ? {} : { signal })
    })
    await sink.refresh()
    const summaries: Array<Record<string, unknown>> = []
    const jobRoot = join(results, "jobs", input.job)
    for (
      const entry of await readdir(jobRoot, { withFileTypes: true }).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
        throw error
      })
    ) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        const summary = JSON.parse(await readFile(join(jobRoot, entry.name, "summary.json"), "utf8")) as unknown
        if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
          throw new BenchmarkFailed({ code: "driver", message: "Invalid trial summary" })
        }
        summaries.push(summary as Record<string, unknown>)
      }
    }
    const { trials, incomplete } = tokenTrials(summaries)
    const estimate = {
      ...estimateMeter(samples, trials),
      incompleteTokenRecords: incomplete,
      samples,
      benchmarkRun: input.run ?? null,
      sampleIntervalSeconds: 60,
      recoveredPartialSample
    }
    const { commit } = await sink.writeReports({ "meter.json": JSON.stringify(estimate, null, 2) + "\n" })
    return { job: input.job, resultsRepo, samples: samples.length, trials: trials.length, commit }
  } finally {
    await auth.close()
  }
}
