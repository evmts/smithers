import assert from "node:assert/strict"
import { appendFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { createServer, type IncomingHttpHeaders } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test, type TestContext } from "node:test"
import { setTimeout } from "node:timers/promises"
import { type MeterInput, type MeterRuntimeOptions, runMeter, usageSample } from "../benchmark-meter/runtime.ts"
import { credentials } from "../benchmark/credentials.ts"
import { command } from "../benchmark/process.ts"
import { createSink } from "../benchmark/sink.ts"

const fixture = async (t: TestContext) => {
  const root = await mkdtemp(join(tmpdir(), "smithers-meter-runtime-test-"))
  const remote = join(root, "results.git")
  await command(["git", "init", "--bare", "--initial-branch=main", remote])
  const accounts: MeterInput["accounts"] = ["codex-1", "codex-3", "codex-acct-1"]
  const token = "synthetic-scoped-meter-token"
  const bundles = Object.fromEntries(accounts.map((account) => [account, {
    tokens: {
      access_token: `synthetic-access-${account}`,
      refresh_token: `synthetic-refresh-${account}`,
      account_id: `synthetic-account-${account}`
    }
  }]))
  const environment = {
    ...process.env,
    BENCHMARK_SMITHERS_TOKEN: token,
    BENCHMARK_TOKEN_EXPIRES_AT: new Date(Date.now() + 3_600_000).toISOString(),
    BENCHMARK_CODEX_AUTH_BUNDLES: JSON.stringify(bundles)
  }
  const state = {
    time: Math.floor(Date.now() / 1000) * 1000,
    usageStatus: 200,
    malformedUsage: false,
    windowSeconds: 604800,
    holdUsage: false,
    runStatuses: ["running", "completed"] as Array<string | null>
  }
  const baseline = state.time
  const requests: Array<{ path: string; headers: IncomingHttpHeaders }> = []
  const usageCounts = new Map<string, number>()
  let announceUsage: () => void = () => {}
  const usageStarted = new Promise<void>((accept) => {
    announceUsage = accept
  })
  const server = createServer((request, response) => {
    requests.push({ path: request.url ?? "", headers: request.headers })
    if (request.url === "/usage") {
      announceUsage()
      if (state.holdUsage) return
      response.statusCode = state.usageStatus
      response.setHeader("content-type", "application/json")
      if (state.usageStatus !== 200) {
        response.end(JSON.stringify({ private: token }))
        return
      }
      if (state.malformedUsage) {
        response.end(`{"private":"${token}",`)
        return
      }
      const account = String(request.headers["chatgpt-account-id"])
      const count = usageCounts.get(account) ?? 0
      usageCounts.set(account, count + 1)
      response.end(
        JSON.stringify({
          rate_limit: {
            primary_window: {
              used_percent: count * 2,
              reset_at: Math.floor((baseline + 7 * 86400_000) / 1000),
              limit_window_seconds: state.windowSeconds
            }
          }
        })
      )
    } else if (request.url === "/api/repos/smithers-canary/bench/runs/123") {
      const status = state.runStatuses.length > 1 ? state.runStatuses.shift()! : state.runStatuses[0]
      response.setHeader("content-type", "application/json")
      response.end(JSON.stringify({ status }))
    } else {
      response.statusCode = 404
      response.end()
    }
  })
  await new Promise<void>((accept) => server.listen(0, "127.0.0.1", accept))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const origin = `http://127.0.0.1:${address.port}`
  const homes: Array<string> = []
  const sleeps: Array<number> = []
  const options: MeterRuntimeOptions = {
    checkout: root,
    environment,
    resultsRemote: remote,
    usageEndpoint: `${origin}/usage`,
    apiOrigin: origin,
    now: () => state.time,
    sleep: async (milliseconds, signal) => {
      signal?.throwIfAborted()
      sleeps.push(milliseconds)
      state.time += milliseconds
    },
    credentials: async (selected, models, env) => {
      const auth = await credentials(selected, models, env)
      homes.push(auth.home)
      assert.equal((await stat(auth.home)).mode & 0o777, 0o700)
      assert.equal(Object.keys(auth.env).some((name) => /^GIT_CONFIG_(?:KEY|VALUE)_/.test(name)), false)
      const gitConfig = auth.env.GIT_CONFIG_GLOBAL
      assert.ok(gitConfig)
      assert.ok(gitConfig.startsWith(auth.home + "/"))
      assert.equal((await stat(gitConfig)).mode & 0o777, 0o600)
      assert.ok((await readFile(gitConfig, "utf8")).includes(token))
      for (const account of selected) {
        const path = join(auth.home, ".smithers/accounts", account, "auth.json")
        assert.equal((await stat(path)).mode & 0o777, 0o600)
        assert.equal(JSON.parse(await readFile(path, "utf8")).tokens.access_token, `synthetic-access-${account}`)
      }
      return auth
    }
  }
  const input: MeterInput = { accounts: ["codex-1"], job: "meter-proof", run: 123 }
  const checkpoint = join(root, ".flows/benchmark-meter", input.job)
  const assertCleaned = async () => {
    assert.ok(homes.length > 0)
    for (const home of homes) await assert.rejects(stat(home), /ENOENT/)
  }
  const readMeter = async () =>
    JSON.parse(await command(["git", "--git-dir", remote, "show", `main:jobs/${input.job}/meter.json`]))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>((accept) => server.close(() => accept()))
    await rm(root, { recursive: true, force: true })
    for (const home of homes) await rm(home, { recursive: true, force: true })
  })
  return {
    root,
    remote,
    environment,
    input,
    options,
    state,
    baseline,
    homes,
    sleeps,
    requests,
    usageStarted,
    checkpoint,
    assertCleaned,
    readMeter
  }
}

test("active run samples once per minute, takes a final sample, refreshes finished trials and pushes real meter results", async (t) => {
  const f = await fixture(t)
  const source = join(f.root, "trial")
  await mkdir(source)
  await writeFile(join(source, "journal.jsonl"), "{\"modelCalls\":0}\n")
  const writer = createSink({
    checkout: join(f.root, "writer"),
    remote: f.remote,
    job: f.input.job,
    env: f.environment,
    secrets: []
  })
  await writer.exportTrial({
    id: "finished",
    source,
    summary: {
      id: "finished",
      suite: "tb4",
      arm: "smithers",
      account: "codex-1",
      model: "openai/gpt-6.1-sol",
      start: new Date(f.baseline).toISOString(),
      end: new Date(f.baseline + 60_000).toISOString(),
      uncached: 100,
      cached: 0,
      output: 0
    }
  })
  const receipt = await runMeter(f.input, undefined, f.options)
  assert.deepEqual(f.sleeps, [60_000])
  assert.equal(receipt.samples, 2)
  assert.equal(receipt.trials, 1)
  assert.match(receipt.commit, /^[a-f0-9]{40}$/)
  const estimate = await f.readMeter()
  assert.deepEqual(estimate.samples.map((sample: { usedPercent: number }) => sample.usedPercent), [0, 2])
  assert.equal(estimate.cases[0].medianPercent, 2)
  assert.equal(estimate.cases[0].errorBoundPercent, 1)
  assert.deepEqual(estimate.incompleteTokenRecords, [])
  assert.equal(estimate.benchmarkRun, 123)
  assert.equal(estimate.sampleIntervalSeconds, 60)
  assert.deepEqual(f.requests.map((request) => request.path), [
    "/api/repos/smithers-canary/bench/runs/123",
    "/usage",
    "/api/repos/smithers-canary/bench/runs/123",
    "/usage"
  ])
  for (const request of f.requests) {
    assert.equal(
      request.headers.authorization,
      request.path === "/usage" ? "Bearer synthetic-access-codex-1" : "Bearer synthetic-scoped-meter-token"
    )
    if (request.path === "/usage") {
      assert.equal(request.headers["chatgpt-account-id"], "synthetic-account-codex-1")
      assert.equal(request.headers.originator, "codex_cli_rs")
      assert.equal(request.headers["user-agent"], "codex_cli_rs")
    }
  }
  assert.equal((await stat(join(f.checkpoint, "input.json"))).mode & 0o777, 0o600)
  assert.equal((await stat(join(f.checkpoint, "samples.jsonl"))).mode & 0o777, 0o600)
  const tree = await command(["git", "--git-dir", f.remote, "ls-tree", "-r", "main"])
  assert.equal(tree.includes("auth.json"), false)
  for (const secret of ["synthetic-access-codex-1", "synthetic-refresh-codex-1", "synthetic-scoped-meter-token"]) {
    assert.equal(JSON.stringify(estimate).includes(secret), false)
  }
  await f.assertCleaned()
})

test("a short duration samples all benchmark accounts and ends without waiting a full minute", async (t) => {
  const f = await fixture(t)
  const input: MeterInput = { accounts: ["codex-1", "codex-3", "codex-acct-1"], job: f.input.job, durationSeconds: 1 }
  const receipt = await runMeter(input, undefined, f.options)
  assert.equal(receipt.samples, 6)
  assert.equal(receipt.trials, 0)
  assert.deepEqual(f.sleeps, [1000])
  assert.ok(f.requests.every((request) => request.path === "/usage"))
  const estimate = await f.readMeter()
  assert.deepEqual(
    estimate.windows.map((window: { account: string }) => window.account).sort(),
    [...input.accounts].sort()
  )
  assert.equal(estimate.benchmarkRun, null)
  assert.deepEqual(estimate.samples.map((sample: { timestamp: number }) => sample.timestamp), [
    f.baseline,
    f.baseline,
    f.baseline,
    f.baseline + 1000,
    f.baseline + 1000,
    f.baseline + 1000
  ])
  await f.assertCleaned()
})

test("HTTP 403 and invalid JSON errors reveal no response credentials and close auth homes", async (t) => {
  const f = await fixture(t)
  f.state.usageStatus = 403
  await assert.rejects(
    runMeter(f.input, undefined, f.options),
    (error: Error) => /HTTP 403/.test(error.message) && !error.message.includes("synthetic-scoped-meter-token")
  )
  await f.assertCleaned()
  f.state.usageStatus = 200
  f.state.malformedUsage = true
  await assert.rejects(
    runMeter(f.input, undefined, f.options),
    (error: Error) => /Invalid JSON/.test(error.message) && !error.message.includes("synthetic-scoped-meter-token")
  )
  await f.assertCleaned()
  await assert.rejects(command(["git", "--git-dir", f.remote, "rev-parse", "main"]))
})

test("cancellation aborts an unresolved HTTP sample, closes auth and leaves no successful receipt", async (t) => {
  const f = await fixture(t)
  f.state.holdUsage = true
  const controller = new AbortController()
  const pending = runMeter(f.input, controller.signal, f.options)
  const rejected = assert.rejects(pending, /Meter cancelled/)
  await f.usageStarted
  controller.abort()
  await rejected
  await f.assertCleaned()
  await assert.rejects(command(["git", "--git-dir", f.remote, "rev-parse", "main"]))
  await assert.rejects(runMeter(f.input, controller.signal, f.options), /Meter cancelled/)
})

test("resume keeps the original baseline, repairs a torn final JSON line and joins a final sample", async (t) => {
  const f = await fixture(t)
  const controller = new AbortController()
  await assert.rejects(
    runMeter(f.input, controller.signal, {
      ...f.options,
      sleep: async (_milliseconds, signal) => {
        controller.abort()
        await setTimeout(1, undefined, { signal })
      }
    }),
    /Meter cancelled/
  )
  assert.equal((await readFile(join(f.checkpoint, "samples.jsonl"), "utf8")).trim().split("\n").length, 1)
  const original = JSON.parse(await readFile(join(f.checkpoint, "input.json"), "utf8"))
  await appendFile(join(f.checkpoint, "samples.jsonl"), "{\"account\":\"codex-1\",\"timestamp\":")
  f.state.time += 60_000
  const receipt = await runMeter(f.input, undefined, f.options)
  assert.equal(receipt.samples, 2)
  assert.equal(JSON.parse(await readFile(join(f.checkpoint, "input.json"), "utf8")).started, original.started)
  const estimate = await f.readMeter()
  assert.equal(estimate.recoveredPartialSample, true)
  assert.deepEqual(estimate.samples.map((sample: { usedPercent: number }) => sample.usedPercent), [0, 2])
  assert.equal((await readFile(join(f.checkpoint, "samples.jsonl"), "utf8")).trim().split("\n").length, 2)
  await f.assertCleaned()
})

test("mismatched input, torn manifest and malformed complete samples fail closed without contacting usage", async (t) => {
  const f = await fixture(t)
  f.state.runStatuses = ["completed"]
  await runMeter(f.input, undefined, f.options)
  const calls = f.requests.length
  await assert.rejects(runMeter({ ...f.input, run: 124 }, undefined, f.options), /different input/)
  const manifestPath = join(f.checkpoint, "input.json")
  const original = await readFile(manifestPath, "utf8")
  await writeFile(manifestPath, "{\"identity\":")
  await assert.rejects(runMeter(f.input, undefined, f.options), /Invalid meter checkpoint JSON/)
  await writeFile(manifestPath, original)
  await writeFile(join(f.checkpoint, "samples.jsonl"), "broken-complete-record\n")
  await assert.rejects(runMeter(f.input, undefined, f.options), /Invalid meter sample checkpoint/)
  assert.equal(f.requests.length, calls)
  await f.assertCleaned()
})

test("nonweekly usage windows and missing Cloud run status never publish meter results", async (t) => {
  const f = await fixture(t)
  f.state.windowSeconds = 18_000
  await assert.rejects(runMeter(f.input, undefined, f.options), /Invalid usage response/)
  f.state.windowSeconds = 604800
  f.state.runStatuses = [null]
  await assert.rejects(runMeter(f.input, undefined, f.options), /returned no status/)
  await assert.rejects(command(["git", "--git-dir", f.remote, "rev-parse", "main"]))
  await f.assertCleaned()
})

test("weekly usage boundary validation accepts only valid reset epochs and weekly window lengths", () => {
  const window = { used_percent: 0, reset_at: 2, limit_window_seconds: 604800 }
  assert.equal(usageSample("codex-1", 1000, { rate_limit: { primary_window: window } }).resetAt, 2000)
  for (const invalid of [0, -1, 18_000, "604800", null]) {
    assert.throws(
      () =>
        usageSample("codex-1", 1000, { rate_limit: { primary_window: { ...window, limit_window_seconds: invalid } } }),
      /Invalid usage/
    )
  }
  for (const reset_at of [1, 0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(
      () => usageSample("codex-1", 1000, { rate_limit: { primary_window: { ...window, reset_at } } }),
      /Invalid usage/
    )
  }
})

test("runtime rejects unsafe repository names and invalid bounds before creating auth or issuing requests", async (t) => {
  const f = await fixture(t)
  const invalid: Array<Partial<MeterInput>> = [
    { accounts: [] },
    { job: "../escape" },
    { run: 0 },
    { run: 1.5 },
    { durationSeconds: 0 },
    { durationSeconds: 172801 },
    { durationSeconds: Infinity },
    ...["../x", "./x", "owner/../x", "owner/.x", "owner/-x"].flatMap((
      repo
    ) => [{ resultsRepo: repo }, { benchmarkRepo: repo }])
  ]
  for (const changes of invalid) {
    await assert.rejects(runMeter({ ...f.input, ...changes }, undefined, f.options), /Invalid meter input/)
  }
  await assert.rejects(
    runMeter({ accounts: f.input.accounts, job: f.input.job }, undefined, f.options),
    /requires run or durationSeconds/
  )
  assert.equal(f.homes.length, 0)
  assert.equal(f.requests.length, 0)
})
