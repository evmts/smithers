import { createHash } from "node:crypto"
import { access, cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { cloudEnvironment, credentials, secretValues } from "./credentials.ts"
import { command, redactDiagnostic } from "./process.ts"
import { BenchmarkFailed, defaults, type Input, type Prepared, type Summary, type Trial } from "./schema.ts"
import { createSink } from "./sink.ts"

const checkout = fileURLToPath(new URL("../../", import.meta.url))
/** Host dependencies are injected for local integration tests; they are never flow payload fields. */
export interface RuntimeOptions {
  readonly environment?: NodeJS.ProcessEnv
  readonly resultsRemote?: string
  readonly checkout?: string
}
/** Return only credential-safe strings to the action journal as well as to the artifact sink. */
export function retainedSummary(summary: Summary, environment?: NodeJS.ProcessEnv): Summary {
  environment ??= process.env
  const secrets = secretValues(environment)
  const safe = Object.fromEntries(
    Object.entries(summary).map((
      [key, value]
    ) => [key, typeof value === "string" ? redactDiagnostic(value, secrets) : value])
  ) as Summary
  if (safe.arm !== summary.arm) {
    throw new BenchmarkFailed({ code: "export", message: "Summary conflicts with credential redaction" })
  }
  return safe
}
export const versions = { harbor: "0.23.0", pier: "0.3.1", codex: "0.155.1", smthrs: "source" } as const

/** Stable sampling: sorted population, Mulberry32, backward Fisher-Yates. */
export function selectTasks(population: ReadonlyArray<string>, selection: Input["tasks"]): Array<string> {
  const names = [...new Set(population)].sort()
  if (selection === "all") return names
  if (Array.isArray(selection)) {
    if (selection.some((name) => !names.includes(name))) {
      throw new BenchmarkFailed({ code: "configuration", message: "Unknown benchmark task" })
    }
    return [...new Set(selection)]
  }
  const sample = selection as { sample: number; seed: number }
  if (!sample || !Number.isSafeInteger(sample.sample) || sample.sample < 1 || !Number.isSafeInteger(sample.seed)) {
    throw new BenchmarkFailed({ code: "configuration", message: "Invalid task sample" })
  }
  if (sample.sample > names.length) {
    throw new BenchmarkFailed({ code: "configuration", message: "Sample exceeds dataset size" })
  }
  let state = sample.seed >>> 0
  const random = () => {
    let n = state += 0x6D2B79F5
    n = Math.imul(n ^ n >>> 15, n | 1)
    n ^= n + Math.imul(n ^ n >>> 7, n | 61)
    return ((n ^ n >>> 14) >>> 0) / 4294967296
  }
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[names[i], names[j]] = [names[j]!, names[i]!]
  }
  return names.slice(0, sample.sample)
}
export function planTrials(tasks: ReadonlyArray<string>, input: Input): Array<Trial> {
  const config = defaults(input)
  return [...new Set(tasks)].flatMap((task) =>
    config.arms.flatMap((arm) =>
      Array.from({ length: config.k }, (_, index) => ({
        task,
        arm,
        attempt: index + 1,
        id: `${arm}-${createHash("sha256").update(task).digest("hex").slice(0, 16)}-${index + 1}`
      }))
    )
  )
}
const exists = async (path: string) => access(path).then(() => true, () => false)
const unsupportedSwe = () =>
  new BenchmarkFailed({
    code: "driver",
    message:
      "SWE-bench requires a per-instance Cloud driver and common export contract; the fullbench queue does not honor explicit instance selection"
  })
async function taskDirectories(root: string): Promise<Array<string>> {
  const entries = await readdir(root, { withFileTypes: true })
  const result: Array<string> = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const path = join(root, entry.name)
    if (await exists(join(path, "task.toml"))) result.push(path)
    else result.push(...await taskDirectories(path))
  }
  return result.sort()
}

/** Fail before spending tokens until the shared adapter can retain a guest through the remote export. */
export async function requireExportProtocol(
  suite: Input["suite"],
  signal?: AbortSignal,
  environment: "docker" | "cloud" = "cloud"
): Promise<void> {
  if (suite === "noop") return
  if (suite === "swebench") throw unsupportedSwe()
  const module = environment === "cloud" ? "evals.harbor.plue_env" : "evals.harbor.smithers_agent"
  try {
    await command([
      "python3",
      "-c",
      `import importlib; m=importlib.import_module('${module}'); assert getattr(m, 'BENCHMARK_EXPORT_PROTOCOL', 0) == 1`
    ], { cwd: checkout, ...(signal === undefined ? {} : { signal }) })
  } catch {
    throw new BenchmarkFailed({
      code: "driver",
      message: `${module} must support BENCHMARK_EXPORT_PROTOCOL=1; see flows/benchmark/README.md`
    })
  }
}
export async function prepare(input: Input, signal?: AbortSignal, options: RuntimeOptions = {}): Promise<Prepared> {
  const config = defaults(input)
  cloudEnvironment(options.environment)
  await requireExportProtocol(input.suite, signal, config.environment)
  const root = resolve(options.checkout ?? checkout, ".flows", "benchmarks", config.job)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const manifest = join(root, "input.json")
  const encoded = JSON.stringify(config)
  if (await exists(manifest) && await readFile(manifest, "utf8") !== encoded) {
    throw new BenchmarkFailed({ code: "configuration", message: "Job already exists with different input" })
  }
  await writeFile(manifest, encoded, { mode: 0o600 })
  let population: Array<string>
  if (input.suite === "noop") {
    population = Array.isArray(input.tasks) ? [...input.tasks] : ["noop"]
  } else {
    const env = cloudEnvironment(options.environment)
    const tools = join(root, "tools")
    await mkdir(tools, { recursive: true })
    const run = (argv: ReadonlyArray<string>) =>
      command(argv, { cwd: checkout, env, ...(signal === undefined ? {} : { signal }) })
    // The 1.0 CLI is built from this repository; its packages are not published to npm yet.
    await run(["pnpm", "--workspace-concurrency=2", "--filter", "@smthrs/cli", "build"])
    await run([
      "npm",
      "install",
      "--prefix",
      join(tools, "node"),
      "--no-audit",
      "--no-fund",
      `@openai/codex@${versions.codex}`
    ])
    for (
      const [name, packageName, version] of [["harbor", "harbor", versions.harbor], [
        "pier",
        "datacurve-pier",
        versions.pier
      ]]
    ) {
      const venv = join(tools, name!)
      if (!await exists(join(venv, "bin", "python"))) await run(["python3", "-m", "venv", venv])
      await run([join(venv, "bin", "python"), "-m", "pip", "install", `${packageName}==${version}`])
    }
    const sourceCommit = await run(["git", "rev-parse", "HEAD"])
    const dirty = (await run(["git", "status", "--porcelain"])).length > 0
    const lockSha256 = createHash("sha256").update(await readFile(join(checkout, "pnpm-lock.yaml"))).digest("hex")
    await writeFile(
      join(root, "versions.json"),
      JSON.stringify({ ...versions, source: { commit: sourceCommit, dirty, lockSha256 } }) + "\n"
    )
    const dataset = input.suite === "tb4" ? "terminal-bench/terminal-bench@4.0.0" : "datacurve/deep-swe-1-1"
    const tasks = join(root, "dataset")
    if (!await exists(tasks)) await run([join(tools, "harbor/bin/harbor"), "dataset", "download", dataset, "-o", tasks])
    population = (await taskDirectories(tasks)).map((path) => path.slice(tasks.length + 1))
  }
  return { root, input: config, trials: planTrials(selectTasks(population, input.tasks), config) }
}

/** One CLI invocation per scored attempt, so every completion becomes its own durable action receipt. */
export function driver(prepared: Prepared, trial: Trial): ReadonlyArray<string> {
  const input = defaults(prepared.input)
  const tools = join(prepared.root, "tools")
  if (input.suite === "swebench") throw unsupportedSwe()
  const program = input.suite === "deepswe" ? "pier" : "harbor"
  const agent = trial.arm === "smithers" ?
    "evals.harbor.smithers_agent:SmithersAgent"
    : trial.arm === "codex"
    ? "evals.harbor.codex_pool:PooledCodex"
    : "oracle"
  const environment = input.environment === "docker" ? "docker" : input.suite === "deepswe"
    ? "evals.harbor.plue_env:PluePierEnvironment"
    : "evals.harbor.plue_env:PlueEnvironment"
  return [
    join(tools, program, "bin", program),
    "run",
    "-p",
    join(prepared.root, "dataset", trial.task),
    "-a",
    agent,
    "-m",
    input.model,
    ...(input.suite === "deepswe" && input.environment === "cloud" ? ["--environment-import-path"] : ["-e"]),
    environment,
    ...(input.environment === "docker" ? ["--ek", "keep_containers=true"] : []),
    "-k",
    "1",
    "-n",
    "1",
    "-o",
    join(prepared.root, "raw"),
    "--job-name",
    trial.id,
    "-y",
    ...(trial.arm === "codex"
      ? [
        "--ak",
        `version=${versions.codex}`,
        "--ak",
        `reasoning_effort=${input.effort}`,
        "--ae",
        "CODEX_FORCE_AUTH_JSON=1"
      ] :
      [])
  ]
}
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null
const object = (value: unknown): Record<string, any> =>
  value !== null && typeof value === "object" ? value as Record<string, any> : {}
export function trialSummary(trial: Trial, input: Input, result: unknown, account: unknown): Omit<Summary, "commit"> {
  const data = object(result), agent = object(data.agent_result), tokens = object(agent.metadata)
  const model = object(object(data.config).agent).model_name ?? tokens.model
  if (model !== undefined && model !== defaults(input).model) {
    throw new BenchmarkFailed({ code: "driver", message: `${trial.id}: result model differs from requested model` })
  }
  const started = typeof data.started_at === "string" ? data.started_at : undefined
  const ended = typeof data.finished_at === "string" ? data.finished_at : undefined
  if (
    !started || !ended || !Number.isFinite(Date.parse(started)) || !Number.isFinite(Date.parse(ended)) ||
    Date.parse(ended) < Date.parse(started)
  ) {
    throw new BenchmarkFailed({ code: "driver", message: `${trial.id}: missing completion timestamps` })
  }
  const total = number(agent.n_input_tokens), cached = number(agent.n_cache_tokens)
  const output = number(agent.n_output_tokens)
  for (
    const [name, value, raw] of [["input", total, agent.n_input_tokens], ["cached", cached, agent.n_cache_tokens], [
      "output",
      output,
      agent.n_output_tokens
    ]] as const
  ) {
    if (
      (raw !== undefined && raw !== null && value === null) ||
      (value !== null && (!Number.isSafeInteger(value) || value < 0))
    ) {
      throw new BenchmarkFailed({ code: "driver", message: `${trial.id}: invalid ${name} token count` })
    }
  }
  if (total !== null && cached !== null && cached > total) {
    throw new BenchmarkFailed({ code: "driver", message: `${trial.id}: cached tokens exceed input tokens` })
  }
  return {
    id: trial.id,
    task: trial.task,
    suite: input.suite,
    arm: trial.arm,
    model: defaults(input).model,
    account: typeof account === "string" && account
      ? account
      : typeof tokens.account === "string" && tokens.account
      ? tokens.account
      : null,
    start: started,
    end: ended,
    wall: (Date.parse(ended) - Date.parse(started)) / 1000,
    reward: number(object(data.verifier_result).rewards?.reward),
    uncached: total === null || cached === null ? null : total - cached,
    cached,
    output,
    exception: typeof data.exception_info?.exception_type === "string" ? data.exception_info.exception_type : null
  }
}
export async function runTrial(
  prepared: Prepared,
  trial: Trial,
  signal?: AbortSignal,
  options: RuntimeOptions = {}
): Promise<Summary> {
  const input = defaults(prepared.input)
  if (input.suite === "swebench") throw unsupportedSwe()
  const source = join(prepared.root, "raw", trial.id)
  await mkdir(source, { recursive: true, mode: 0o700 })
  const hostEnvironment = { ...(options.environment ?? process.env) }
  if (input.environment === "docker" && input.suite !== "noop") {
    // Resolve the host's context before credentials isolate HOME. A socket path
    // grants access to the selected daemon without copying registry credentials.
    hostEnvironment.DOCKER_HOST ??= await command([
      "docker",
      "context",
      "inspect",
      "--format",
      "{{.Endpoints.docker.Host}}"
    ], { env: hostEnvironment, ...(signal === undefined ? {} : { signal }) })
    delete hostEnvironment.DOCKER_CONTEXT
  }
  const auth = await credentials(input.accounts, input.suite !== "noop" && trial.arm !== "oracle", hostEnvironment)
  try {
    const env = {
      ...auth.env,
      PYTHONPATH: checkout,
      SMITHERS_CLI: join(checkout, "packages/smithers/bin/smithers.mjs"),
      PATH: `${join(prepared.root, "tools/node/node_modules/.bin")}:${auth.env.PATH ?? ""}`,
      SMITHERS_OPENAI_AUTH: "chatgpt",
      PLUE_REPO: (options.environment ?? process.env).BENCHMARK_WORKSPACE_REPO ?? "smithers-canary/bench",
      SMITHERS_BENCHMARK_RETAIN_UNTIL_EXPORT: "1",
      SMITHERS_BENCHMARK_EXPORT_ROOT: source,
      SMITHERS_BENCHMARK_EFFORT: input.effort
    }
    let summary: Omit<Summary, "commit">
    let completedRoot = source
    if (input.suite === "noop") {
      const date = new Date().toISOString()
      const resultPath = join(source, "result.json")
      const result = await exists(resultPath) ? JSON.parse(await readFile(resultPath, "utf8")) : {
        started_at: date,
        finished_at: date,
        agent_result: { n_input_tokens: 0, n_cache_tokens: 0, n_output_tokens: 0 },
        verifier_result: { rewards: { reward: 1 } }
      }
      await writeFile(resultPath, JSON.stringify(result) + "\n")
      await writeFile(
        join(source, "journal.jsonl"),
        JSON.stringify({ kind: "noop", task: trial.task, modelCalls: 0 }) + "\n"
      )
      summary = trialSummary(trial, input, result, null)
    } else {
      await command(driver(prepared, trial), {
        cwd: checkout,
        env,
        log: join(source, "driver.log"),
        secrets: auth.secrets,
        ...(signal === undefined ? {} : { signal })
      })
      const paths = await readdir(source, { withFileTypes: true })
      const completed = paths.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      if (completed.length !== 1) {
        throw new BenchmarkFailed({ code: "driver", message: `${trial.id}: expected one completed trial` })
      }
      const trialRoot = join(source, completed[0]!.name)
      completedRoot = trialRoot
      const result = JSON.parse(await readFile(join(trialRoot, "result.json"), "utf8"))
      let account: unknown = null
      for (const name of ["smithers-run.json", "codex-account.json"]) {
        const path = join(trialRoot, "agent", name)
        if (await exists(path)) account = JSON.parse(await readFile(path, "utf8")).account ?? account
      }
      summary = trialSummary(trial, input, result, account)
    }
    const sink = await createSink({
      checkout: join(prepared.root, "results"),
      remote: options.resultsRemote ?? `${auth.env.SMITHERS_API_ORIGIN}/${input.resultsRepo}.git`,
      job: input.job,
      env: auth.env,
      secrets: auth.secrets,
      ...(signal === undefined ? {} : { signal })
    })
    const exported = await sink.exportTrial({ id: trial.id, source, summary })
    // The shared adapter may delete retained guests ONLY after this remote commit receipt exists.
    await writeFile(join(source, ".exported.json"), JSON.stringify(exported) + "\n", { mode: 0o600 })
    // Reports consume actual completed trial files, only after their remote export is acknowledged.
    const aggregate = join(prepared.root, "aggregate", trial.arm)
    await mkdir(aggregate, { recursive: true })
    await cp(completedRoot, join(aggregate, trial.id), { recursive: true, force: true, errorOnExist: false })
    return retainedSummary({ ...summary, commit: exported.commit }, options.environment)
  } finally {
    await auth.close()
  }
}
export async function finalize(
  prepared: Prepared,
  summaries: ReadonlyArray<Summary>,
  signal?: AbortSignal,
  options: RuntimeOptions = {}
) {
  const input = defaults(prepared.input)
  const auth = await credentials(input.accounts, false, options.environment)
  try {
    const env = auth.env
    let publishable = false, report: string, health: string
    if (input.suite === "noop") {
      report =
        `# Noop sink proof\n\n${summaries.length} synthetic trials. Model calls: 0. This is not a benchmark score.\n`
      health = `# Noop health\n\n${summaries.length} exports acknowledged by the results remote.\n`
    } else {
      const python = join(prepared.root, "tools/harbor/bin/python")
      const jobs = join(prepared.root, "aggregate")
      await mkdir(jobs, { recursive: true })
      // runTrial copies each exported completion into the arm's job directory.
      await command([python, join(checkout, "evals/harbor/health.py"), jobs, join(jobs, "health.md"), ...input.arms], {
        cwd: checkout,
        env,
        allowed: [0, 3],
        ...(signal === undefined ? {} : { signal })
      })
      health = await readFile(join(jobs, "health.md"), "utf8")
      const baseline = input.arms.includes("codex") ? "codex" : "oracle"
      if (input.arms.includes("smithers") && input.arms.includes(baseline)) {
        await command([
          python,
          join(checkout, "evals/harbor/report.py"),
          join(jobs, "smithers"),
          join(jobs, baseline),
          jobs
        ], { cwd: checkout, env, allowed: [0, 3], ...(signal === undefined ? {} : { signal }) })
        report = await readFile(join(jobs, "report.md"), "utf8")
        publishable = JSON.parse(await readFile(join(jobs, "report.json"), "utf8")).publishable === true
      } else report = "# Unpaired benchmark\n\nNo paired publication report; see retained trial summaries.\n"
    }
    const sink = await createSink({
      checkout: join(prepared.root, "results"),
      remote: options.resultsRemote ?? `${env.SMITHERS_API_ORIGIN}/${input.resultsRepo}.git`,
      job: input.job,
      env,
      secrets: auth.secrets,
      ...(signal === undefined ? {} : { signal })
    })
    const { commit } = await sink.writeReports({
      "report.md": report,
      "health.md": health,
      "trials.json": JSON.stringify(summaries) + "\n"
    })
    return { job: input.job, resultsRepo: input.resultsRepo, trials: summaries.length, commit, publishable }
  } finally {
    await auth.close()
  }
}
