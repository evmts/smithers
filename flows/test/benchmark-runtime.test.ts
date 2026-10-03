import { Schema } from "effect"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test, type TestContext } from "node:test"
import { setTimeout } from "node:timers/promises"
import { tokenTrials, usageSample } from "../benchmark-meter/runtime.ts"
import { retainedFailure } from "../benchmark/flow.ts"
import { command } from "../benchmark/process.ts"
import {
  driver,
  finalize,
  planTrials,
  prepare,
  requireExportProtocol,
  retainedSummary,
  runTrial,
  selectTasks,
  trialSummary
} from "../benchmark/runtime.ts"
import { BenchmarkFailed, defaults, Input, type Prepared, type Trial } from "../benchmark/schema.ts"

const input: Input = { suite: "noop", arms: ["smithers"], tasks: ["noop"], job: "runtime-proof" }
const planned: Trial = { id: "trial-1", task: "noop", arm: "smithers", attempt: 1 }
const completed = {
  started_at: "2026-10-02T12:00:00.000Z",
  finished_at: "2026-10-02T12:00:02.500Z",
  agent_result: { n_input_tokens: 120, n_cache_tokens: 20, n_output_tokens: 8, metadata: { account: "codex-3" } },
  verifier_result: { rewards: { reward: 1 } }
}
const temporary = async (t: TestContext) => {
  const root = await mkdtemp(join(tmpdir(), "smithers-benchmark-runtime-test-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test("action journal summaries and both typed and native failures redact nested credential values", () => {
  const secret = "private-\"token\"-é"
  const environment = {
    BENCHMARK_SMITHERS_TOKEN: "scoped-private-token",
    BENCHMARK_CODEX_AUTH_BUNDLES: JSON.stringify({
      "codex-1": { tokens: { access_token: secret, account_id: "private-account-id" } }
    })
  }
  const measured = {
    ...trialSummary(planned, input, completed, "private-account-id"),
    commit: "a".repeat(40),
    task: secret,
    exception: `ToolFailed:${secret}`
  }
  const retained = retainedSummary(measured, environment)
  assert.equal(retained.task, "[REDACTED]")
  assert.equal(retained.account, "[REDACTED]")
  assert.equal(retained.exception, "ToolFailed:[REDACTED]")
  assert.equal(retained.uncached, 100)
  for (
    const error of [
      new Error(`failed ${secret}`),
      new BenchmarkFailed({ code: "credentials", message: `failed ${encodeURIComponent(secret)}` })
    ]
  ) {
    const failure = retainedFailure(error, "export", environment)
    assert.equal(failure.message, "failed [REDACTED]")
    assert.equal(failure.code, error instanceof BenchmarkFailed ? "credentials" : "export")
  }
  assert.equal(
    retainedFailure(new Error("scoped-private-token"), "driver", {
      ...environment,
      BENCHMARK_CODEX_AUTH_BUNDLES: "invalid"
    }).message,
    "[REDACTED]"
  )
  assert.equal(retainedFailure(null, "driver", environment).message, "Benchmark operation failed")
})

test("typed payload defaults and duplicate arms/accounts preserve only the benchmark pool", () => {
  const config = defaults(Schema.decodeUnknownSync(Input)(input))
  assert.equal(config.k, 1)
  assert.equal(config.concurrency, 1)
  assert.equal(config.model, "openai/gpt-6.1-sol")
  assert.equal(config.effort, "max")
  assert.deepEqual(config.accounts, ["codex-1", "codex-3", "codex-acct-1"])
  assert.equal(config.resultsRepo, "smithers-canary/bench-results")
  assert.equal(config.environment, "cloud")
  assert.equal(defaults({ ...input, environment: "docker" }).environment, "docker")
  assert.deepEqual(defaults({ ...input, arms: ["codex", "codex"], accounts: ["codex-1", "codex-1"] }).arms, ["codex"])
  for (const account of ["codex-2", "codex-4", "codex-5", "other"]) {
    assert.throws(() => Schema.decodeUnknownSync(Input)({ ...input, accounts: [account] }))
  }
  for (
    const invalid of [
      { arms: [] },
      { arms: ["other"] },
      { tasks: [] },
      { tasks: { sample: 0, seed: 1 } },
      { k: 0 },
      { concurrency: 33 },
      { concurrency: 0 },
      { concurrency: 1.5 },
      { job: "../escape" },
      { job: "bad/name" },
      { resultsRepo: "https://example.com" },
      { effort: "unknown" },
      { environment: "other" }
    ]
  ) assert.throws(() => Schema.decodeUnknownSync(Input)({ ...input, ...invalid }))
})

test("task selection is seeded, population-order independent, bounded and deduplicated", () => {
  const population = ["e", "a", "d", "b", "c", "a"]
  assert.deepEqual(selectTasks(population, "all"), ["a", "b", "c", "d", "e"])
  assert.deepEqual(selectTasks(population, ["b", "a", "b"]), ["b", "a"])
  const sample = selectTasks(population, { sample: 3, seed: 42 })
  assert.equal(sample.length, 3)
  assert.equal(new Set(sample).size, 3)
  assert.deepEqual(selectTasks(population.toReversed(), { sample: 3, seed: 42 }), sample)
  assert.notDeepEqual(selectTasks(population, { sample: 3, seed: 43 }), sample)
  assert.throws(() => selectTasks(population, ["missing"]), /Unknown benchmark task/)
  assert.throws(() => selectTasks(population, { sample: 6, seed: 1 }), /exceeds/)
  for (
    const invalid of [{ sample: 0, seed: 1 }, { sample: -1, seed: 1 }, { sample: 1, seed: NaN }, {
      sample: 1.5,
      seed: 1
    }]
  ) {
    assert.throws(() => selectTasks(population, invalid), /Invalid/)
  }
  const trials = planTrials(["a", "b", "a"], { ...input, arms: ["smithers", "codex"], k: 2 })
  assert.equal(trials.length, 8)
  assert.equal(new Set(trials.map((trial) => trial.id)).size, 8)
  assert.deepEqual(trials.map((trial) => trial.attempt), [1, 2, 1, 2, 1, 2, 1, 2])
})

test("trial summaries preserve measured cost, timestamps, missing fields and exception classes", () => {
  const summary = trialSummary(planned, input, completed, "codex-1")
  assert.equal(summary.wall, 2.5)
  assert.equal(summary.account, "codex-1")
  assert.equal(summary.uncached, 100)
  assert.equal(summary.cached, 20)
  assert.equal(summary.output, 8)
  assert.equal(summary.reward, 1)
  assert.equal(trialSummary(planned, input, completed, null).account, "codex-3")
  const missing = trialSummary(planned, input, {
    ...completed,
    agent_result: {},
    verifier_result: {},
    exception_info: { exception_type: "PlueUnplaceable" }
  }, null)
  assert.deepEqual([missing.account, missing.uncached, missing.cached, missing.output, missing.reward], [
    null,
    null,
    null,
    null,
    null
  ])
  assert.equal(missing.exception, "PlueUnplaceable")
  assert.deepEqual(tokenTrials([missing]).incomplete, [planned.id])
})

test("invalid timestamps and impossible token counts cannot become a successful summary", () => {
  for (
    const invalid of [
      { started_at: "invalid" },
      { finished_at: "invalid" },
      { finished_at: "2026-10-02T11:59:59Z" },
      { started_at: null },
      { finished_at: undefined }
    ]
  ) assert.throws(() => trialSummary(planned, input, { ...completed, ...invalid }, null), /timestamps/)
  for (const value of [-1, 1.5, NaN, Infinity, "10", Number.MAX_SAFE_INTEGER + 1]) {
    for (const key of ["n_input_tokens", "n_cache_tokens", "n_output_tokens"]) {
      assert.throws(
        () =>
          trialSummary(
            planned,
            input,
            { ...completed, agent_result: { ...completed.agent_result, [key]: value } },
            null
          ),
        /token/
      )
    }
  }
  assert.throws(
    () =>
      trialSummary(
        planned,
        input,
        { ...completed, agent_result: { ...completed.agent_result, n_cache_tokens: 121 } },
        null
      ),
    /exceed/
  )
  assert.throws(
    () => trialSummary(planned, input, { ...completed, config: { agent: { model_name: "different-model" } } }, null),
    /model differs/
  )
})

test("suite drivers retain one trial and select pinned model/effort without leaking secrets into argv", () => {
  const prepared: Prepared = { root: "/controller", input: { ...input, suite: "tb4" }, trials: [planned] }
  const argv = driver(prepared, { ...planned, arm: "codex" })
  assert.equal(argv[0], "/controller/tools/harbor/bin/harbor")
  assert.equal(argv[argv.indexOf("-k") + 1], "1")
  assert.equal(argv[argv.indexOf("-n") + 1], "1")
  assert.equal(argv.includes("evals.harbor.codex_pool:PooledCodex"), true)
  assert.equal(argv.includes("reasoning_effort=max"), true)
  assert.equal(argv.includes("CODEX_FORCE_AUTH_JSON=1"), true)
  assert.equal(argv[argv.indexOf("-e") + 1], "evals.harbor.plue_env:PlueEnvironment")
  assert.equal(
    driver({ ...prepared, input: { ...input, suite: "deepswe" } }, planned)[0],
    "/controller/tools/pier/bin/pier"
  )
  assert.throws(
    () => driver({ ...prepared, input: { ...input, suite: "swebench" } }, planned),
    /per-instance Cloud driver/
  )
})

test("both suites select their native Docker environment and retain guests until export", () => {
  for (const suite of ["tb4", "deepswe"] as const) {
    const prepared: Prepared = {
      root: "/controller",
      input: { ...input, suite, environment: "docker" },
      trials: [planned]
    }
    const argv = driver(prepared, planned)
    assert.equal(argv[argv.indexOf("-e") + 1], "docker")
    assert.equal(argv[argv.indexOf("--ek") + 1], "keep_containers=true")
    assert.equal(argv.some((value) => value.includes("Plue")), false)
    assert.equal(argv.includes("--environment-import-path"), false)
    assert.equal(defaults(prepared.input).resultsRepo, "smithers-canary/bench-results")
  }
  const cloud = driver({
    root: "/controller",
    input: { ...input, suite: "deepswe", environment: "cloud" },
    trials: [planned]
  }, planned)
  assert.equal(cloud[cloud.indexOf("--environment-import-path") + 1], "evals.harbor.plue_env:PluePierEnvironment")
  assert.equal(cloud.includes("-e"), false)
  assert.equal(cloud.includes("keep_containers=true"), false)
})

test("SWE-bench explicit instances refuse before creating a job or launching the unrelated fullbench queue", async (t) => {
  const root = await temporary(t)
  const options = {
    checkout: root,
    environment: {
      ...process.env,
      BENCHMARK_SMITHERS_TOKEN: "test-token",
      BENCHMARK_TOKEN_EXPIRES_AT: new Date(Date.now() + 3_600_000).toISOString()
    }
  }
  const config: Input = { ...input, suite: "swebench", tasks: ["django__django-123"], arms: ["smithers"] }
  await assert.rejects(prepare(config, undefined, options), /does not honor explicit instance selection/)
  await assert.rejects(stat(join(root, ".flows")), /ENOENT/)
  await assert.rejects(requireExportProtocol("swebench"), /per-instance Cloud driver/)
  await assert.rejects(
    runTrial({ root, input: config, trials: [planned] }, planned, undefined, options),
    /per-instance Cloud driver/
  )
})

test("usage decoding converts reset seconds into epoch milliseconds and rejects malformed counters", () => {
  assert.deepEqual(
    usageSample("codex-1", 1_000, { rate_limit: { primary_window: { used_percent: 12, reset_at: 100 } } }),
    { account: "codex-1", timestamp: 1_000, usedPercent: 12, resetAt: 100_000 }
  )
  for (
    const value of [null, {}, { rate_limit: {} }, {
      rate_limit: { primary_window: { used_percent: NaN, reset_at: 100 } }
    }]
  ) {
    assert.throws(() => usageSample("codex-1", 1000, value), /Invalid usage/)
  }
})

test("process stdout and persisted logs redact secrets split across chunks and UTF-8 bytes", async (t) => {
  const root = await temporary(t), log = join(root, "driver.log")
  const secret = "token-é-\"quoted\"\nend"
  const asciiJson = JSON.stringify(secret).slice(1, -1).replace(
    /[\u0080-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  )
  const forms = [
    secret,
    JSON.stringify(secret).slice(1, -1),
    asciiJson,
    encodeURIComponent(secret),
    Buffer.from(secret).toString("base64")
  ]
  const script =
    `const forms=JSON.parse(process.env.FORMS); for(const form of forms) { const bytes=Buffer.from('α🧪 before '+form+' after ω🚀\\n'); for (let i=0;i<bytes.length;i+=3) { process.stdout.write(bytes.subarray(i,i+3)); await new Promise(r=>setTimeout(r,2)); } }`
  const output = await command([process.execPath, "--input-type=module", "-e", script], {
    log,
    env: { ...process.env, FORMS: JSON.stringify(forms) },
    secrets: [secret, ""]
  })
  const recorded = await readFile(log, "utf8")
  for (const form of forms) {
    assert.equal(output.includes(form), false)
    assert.equal(recorded.includes(form), false)
  }
  assert.equal(output.includes("α🧪 before [REDACTED] after ω🚀"), true)
  assert.equal(recorded, output + "\n")
  assert.equal(output.split("[REDACTED]").length - 1, forms.length)
  await command([
    process.execPath,
    "--input-type=module",
    "-e",
    `const text='stderr '+process.env.SECRET+' done';for(let i=0;i<text.length;i+=2){process.stderr.write(text.slice(i,i+2));await new Promise(r=>setTimeout(r,2));}`
  ], { log, env: { ...process.env, SECRET: secret }, secrets: [secret] })
  assert.equal((await readFile(log, "utf8")).endsWith("stderr [REDACTED] done"), true)
  assert.equal((await stat(log)).mode & 0o777, 0o600)
})

test("process failures hide diagnostics, enforce limits and support explicitly allowed exit codes", async (t) => {
  assert.equal(await command([process.execPath, "-e", "process.stdout.write(' okay ')"]), "okay")
  await assert.rejects(
    command([process.execPath, "-e", "process.stderr.write('private-token');process.exit(4)"]),
    (error: Error) => error.message.endsWith("exited 4") && !error.message.includes("private-token")
  )
  assert.equal(
    await command([process.execPath, "-e", "process.stdout.write('refused');process.exit(3)"], { allowed: [0, 3] }),
    "refused"
  )
  await assert.rejects(command(["/nonexistent/benchmark-tool"]), /could not start/)
  await assert.rejects(command([]), /empty/)
  await assert.rejects(command([process.execPath, "-e", "process.stdout.write('x'.repeat(1024*1024))"]), /exceeded/)
  const root = await temporary(t), log = join(root, "large.log")
  const output = await command([process.execPath, "-e", "process.stdout.write('x'.repeat(1024*1024+10))"], { log })
  assert.equal(output.length, 1024 * 1024)
  assert.equal((await stat(log)).size, 1024 * 1024 + 10)
})

test(
  "cancellation kills a resistant process group and prevents a late descendant write",
  { timeout: 10_000 },
  async (t) => {
    const root = await temporary(t), ready = join(root, "ready"), late = join(root, "late")
    const script =
      `const {spawn}=require('node:child_process'),fs=require('node:fs');process.on('SIGTERM',()=>{}); const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setTimeout(()=>require('node:fs').writeFileSync(process.env.LATE,'orphan'),1200);setInterval(()=>{},1000)"],{env:process.env,stdio:'inherit'}); fs.writeFileSync(process.env.READY,String(child.pid));setInterval(()=>{},1000);`
    const controller = new AbortController()
    const running = command([process.execPath, "-e", script], {
      signal: controller.signal,
      env: { ...process.env, READY: ready, LATE: late }
    })
    const settled = assert.rejects(running, /cancelled/)
    while (!await stat(ready).then(() => true, () => false)) await setTimeout(10)
    controller.abort()
    await settled
    await setTimeout(1400)
    await assert.rejects(readFile(late), /ENOENT/)
    await assert.rejects(
      command([process.execPath, "-e", "process.exit(0)"], { signal: controller.signal }),
      /cancelled/
    )
  }
)

test(
  "real noop runtime exports before aggregating and a fresh clone fetches its LFS artifact",
  { timeout: 60_000 },
  async (t) => {
    const root = await temporary(t), remote = join(root, "remote.git")
    await command(["git", "init", "--bare", "--initial-branch=main", remote])
    const options = {
      checkout: root,
      resultsRemote: remote,
      environment: {
        ...process.env,
        BENCHMARK_SMITHERS_TOKEN: "test-scoped-token",
        BENCHMARK_TOKEN_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString()
      }
    }
    const prepared = await prepare(input, undefined, options)
    const summary = await runTrial(prepared, prepared.trials[0]!, undefined, options)
    assert.match(summary.commit, /^[a-f0-9]{40}$/)
    assert.equal(summary.account, null)
    assert.deepEqual([summary.uncached, summary.cached, summary.output], [0, 0, 0])
    const source = join(prepared.root, "raw", summary.id)
    assert.equal(JSON.parse(await readFile(join(source, ".exported.json"), "utf8")).commit, summary.commit)
    assert.equal(
      JSON.parse(await readFile(join(prepared.root, "aggregate", "smithers", summary.id, "journal.jsonl"), "utf8"))
        .modelCalls,
      0
    )
    assert.deepEqual(await runTrial(prepared, prepared.trials[0]!, undefined, options), summary)
    const privateTemp = join(root, "credential-homes")
    await mkdir(privateTemp)
    const previousTemp = process.env.TMPDIR
    // This file's tests run sequentially in their own Node worker. Credentials use the real OS temp-directory API.
    process.env.TMPDIR = privateTemp
    let receipt: Awaited<ReturnType<typeof finalize>>
    try {
      receipt = await finalize(prepared, [summary], undefined, options)
      assert.deepEqual(await readdir(privateTemp), [])
      await assert.rejects(
        finalize(prepared, [summary], undefined, { ...options, resultsRemote: join(root, "other.git") }),
        /another remote/
      )
      assert.deepEqual(await readdir(privateTemp), [])
    } finally {
      if (previousTemp === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = previousTemp
    }
    assert.equal(receipt.trials, 1)
    assert.equal(receipt.publishable, false)
    const fresh = join(root, "fresh")
    await command(["git", "clone", remote, fresh], { env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" } })
    assert.deepEqual(JSON.parse(await readFile(join(fresh, "jobs", input.job, "trials.json"), "utf8")), [summary])
    const archive = `jobs/${input.job}/${summary.id}.tar.zst`
    await command(["git", "lfs", "install", "--local"], { cwd: fresh })
    await command(["git", "lfs", "pull", "--include", archive], { cwd: fresh })
    const extracted = join(root, "extracted")
    await mkdir(extracted)
    await command(["tar", "--zstd", "-xf", join(fresh, archive), "-C", extracted], { log: join(root, "tar.log") })
      .catch(async (error) => {
        throw new Error(`${error.message}: ${await readFile(join(root, "tar.log"), "utf8")}`)
      })
    assert.equal(JSON.parse(await readFile(join(extracted, "journal.jsonl"), "utf8")).modelCalls, 0)
    await assert.rejects(prepare({ ...input, k: 2 }, undefined, options), /different input/)
  }
)
