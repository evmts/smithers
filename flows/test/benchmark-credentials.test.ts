import { Schema } from "effect"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test, type TestContext } from "node:test"
import { fileURLToPath } from "node:url"
import { Input as MeterInput } from "../benchmark-meter/flow.ts"
import { cloudEnvironment, credentials, secretValues } from "../benchmark/credentials.ts"
import { BenchmarkFailed, Input } from "../benchmark/schema.ts"

const accounts = ["codex-1", "codex-3", "codex-acct-1"] as const
const cloudToken = "scoped-cloud-token-fixture-do-not-print"
const bundle = (account: string) => ({
  tokens: {
    access_token: `access-${account}-fixture`,
    refresh_token: `refresh-${account}-fixture`,
    account_id: `id-${account}`
  }
})
const bundles = Object.fromEntries(accounts.map((account) => [account, bundle(account)])) as Record<
  typeof accounts[number],
  ReturnType<typeof bundle>
>
const environment = (): NodeJS.ProcessEnv => ({
  BENCHMARK_SMITHERS_TOKEN: cloudToken,
  BENCHMARK_TOKEN_EXPIRES_AT: new Date(Date.now() + 3_600_000).toISOString(),
  BENCHMARK_CODEX_AUTH_BUNDLES: JSON.stringify(bundles),
  SMITHERS_TOKEN: "host-root-token-fixture",
  OPENAI_API_KEY: "host-openai-key-fixture",
  ANTHROPIC_API_KEY: "host-anthropic-key-fixture",
  ANTHROPIC_AUTH_TOKEN: "host-anthropic-token-fixture",
  SMITHERS_AUTH_FILE: "/host/private-auth.json",
  CODEX_HOME: "/host/account-outside-pool",
  PATH: process.env.PATH
})
const temporary = async (t: TestContext) => {
  const root = await mkdtemp(join(tmpdir(), "benchmark-credential-test-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
const failure = (code: string) => (error: unknown) => error instanceof BenchmarkFailed && error.code === code
const command = async (program: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) => {
  const child = spawn(program, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 })
  let stdout = "", stderr = ""
  child.stdout.on("data", (chunk) => stdout += chunk)
  child.stderr.on("data", (chunk) => stderr += chunk)
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject)
    child.on("close", resolve)
  })
  return { code, stdout, stderr }
}

test("Cloud credentials require a future expiry, scoped token and a clean HTTPS origin", (t) => {
  const now = Date.parse("2026-10-02T00:00:00Z")
  t.mock.method(Date, "now", () => now)
  for (const expiry of ["", "invalid", new Date(now - 1).toISOString(), new Date(now).toISOString()]) {
    assert.throws(
      () => cloudEnvironment({ ...environment(), BENCHMARK_TOKEN_EXPIRES_AT: expiry }),
      failure("credentials")
    )
  }
  assert.throws(() => cloudEnvironment({ ...environment(), BENCHMARK_SMITHERS_TOKEN: "" }), failure("credentials"))
  for (
    const origin of [
      "invalid",
      "http://api.example.test",
      "https://user:password@api.example.test",
      "https://api.example.test/api",
      "https://api.example.test?token=x",
      "https://api.example.test#fragment",
      "https://api.example.test?",
      "https://api.example.test#"
    ]
  ) {
    assert.throws(() => cloudEnvironment({ ...environment(), SMITHERS_API_ORIGIN: origin }), failure("configuration"))
  }
  const env = cloudEnvironment({
    ...environment(),
    SMITHERS_API_ORIGIN: "https://API.example.test:443/",
    BENCHMARK_TOKEN_EXPIRES_AT: new Date(now + 1).toISOString(),
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: "Authorization: host-root-token-fixture",
    GIT_TRACE_CURL: "1",
    GIT_TRACE: "1",
    GIT_CURL_VERBOSE: "1"
  })
  assert.equal(env.SMITHERS_API_ORIGIN, "https://api.example.test")
  assert.equal(env.SMITHERS_TOKEN, cloudToken)
  assert.equal(env.GIT_TERMINAL_PROMPT, "0")
  assert.equal(Object.keys(env).some((name) => /^GIT_CONFIG|^GIT_TRACE|^GIT_CURL_VERBOSE$/.test(name)), false)
  assert.equal(cloudEnvironment(environment()).SMITHERS_API_ORIGIN, "https://api.jjhub.tech")
})

test("selected Codex bundles and Git credentials stay in owner-only files and close removes them", async (t) => {
  const source = environment()
  const auth = await credentials(["codex-3"], true, source)
  t.after(() => auth.close())
  assert.equal((await stat(auth.home)).mode & 0o777, 0o700)
  for (const path of [".smithers", ".smithers/accounts", ".smithers/accounts/codex-3"]) {
    assert.equal((await stat(join(auth.home, path))).mode & 0o777, 0o700)
  }
  const authPath = join(auth.home, ".smithers/accounts/codex-3/auth.json")
  assert.equal((await stat(authPath)).mode & 0o777, 0o600)
  assert.deepEqual(JSON.parse(await readFile(authPath, "utf8")), bundles["codex-3"])
  assert.deepEqual(await readdir(join(auth.home, ".smithers/accounts")), ["codex-3"])
  const gitConfig = auth.env.GIT_CONFIG_GLOBAL!
  assert.equal(gitConfig, join(auth.home, "gitconfig"))
  assert.equal((await stat(gitConfig)).mode & 0o777, 0o600)
  assert.equal((await readFile(gitConfig, "utf8")).includes(`Authorization: Bearer ${cloudToken}`), true)
  assert.equal(auth.env.GIT_CONFIG_NOSYSTEM, "1")
  assert.equal(auth.env.SMITHERS_CODEX_POOL, "codex-3")
  assert.equal(auth.env.HOME, auth.home)
  assert.equal(auth.env.SMITHERS_TOKEN, cloudToken)
  for (
    const name of [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "SMITHERS_AUTH_FILE",
      "CODEX_HOME",
      "BENCHMARK_SMITHERS_TOKEN",
      "BENCHMARK_CODEX_AUTH_BUNDLES"
    ]
  ) assert.equal(auth.env[name], undefined)
  assert.equal(source.SMITHERS_TOKEN, "host-root-token-fixture")
  assert.equal(source.OPENAI_API_KEY, "host-openai-key-fixture")
  assert.equal(auth.secrets.includes(bundles["codex-1"].tokens.access_token), true)
  await auth.close()
  await assert.rejects(stat(auth.home), { code: "ENOENT" })
  await auth.close()
})

test("noop needs no Codex bundles, and forbidden accounts fail before allocating credentials", async (t) => {
  const env = environment()
  delete env.BENCHMARK_CODEX_AUTH_BUNDLES
  const auth = await credentials(["codex-1"], false, env)
  t.after(() => auth.close())
  await assert.rejects(stat(join(auth.home, ".smithers/accounts")), { code: "ENOENT" })
  for (const models of [false, true]) {
    for (const account of ["codex-2", "codex-4", "codex-5", "../codex-1"]) {
      await assert.rejects(
        credentials([account] as NonNullable<Input["accounts"]>, models, environment()),
        failure("credentials")
      )
    }
    await assert.rejects(credentials([], models, environment()), failure("credentials"))
  }
})

test("malformed or partial bundles produce typed failures and remove partially written homes", async (t) => {
  const root = await temporary(t), previous = process.env.TMPDIR
  process.env.TMPDIR = root
  try {
    const invalid = ["invalid", "null", "[]", "17", "\"string\"", JSON.stringify({ "codex-1": bundles["codex-1"] })]
    for (
      const tokens of [
        { access_token: 42, account_id: "id" },
        { access_token: " ", account_id: "id" },
        { access_token: "valid-token", account_id: 42 },
        { access_token: "valid-token", account_id: " " },
        { access_token: "valid-token", account_id: "id", refresh_token: {} },
        { access_token: "valid-token", account_id: "id", refresh_token: " " }
      ]
    ) {
      invalid.push(JSON.stringify({ "codex-1": bundles["codex-1"], "codex-3": { tokens } }))
    }
    for (const bundle of invalid) {
      await assert.rejects(
        credentials(["codex-1", "codex-3"], true, {
          ...environment(),
          BENCHMARK_CODEX_AUTH_BUNDLES: bundle
        }),
        failure("credentials")
      )
      assert.deepEqual(await readdir(root), [])
    }
  } finally {
    if (previous === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = previous
  }
})

test("redaction inventory includes nested tokens, host secrets and the original bundle without duplicates", () => {
  const env = environment()
  const secrets = secretValues({ ...env, OTHER_SECRET: cloudToken, PUBLIC: "visible" })
  for (
    const value of [
      cloudToken,
      env.SMITHERS_TOKEN!,
      env.OPENAI_API_KEY!,
      env.BENCHMARK_CODEX_AUTH_BUNDLES!,
      ...Object.values(bundles).flatMap((bundle) => Object.values(bundle.tokens))
    ]
  ) assert.equal(secrets.includes(value), true)
  assert.equal(secrets.includes("visible"), false)
  assert.equal(new Set(secrets).size, secrets.length)
  assert.throws(() => secretValues({ BENCHMARK_CODEX_AUTH_BUNDLES: "invalid" }), failure("credentials"))
})

test("benchmark and meter admission reject repository path normalization", () => {
  const benchmark = { suite: "noop", arms: ["smithers"], tasks: ["noop"], job: "credential-test" }
  const meter = { accounts: ["codex-1"], job: "credential-test", durationSeconds: 1 }
  for (
    const repo of ["../x", "./x", "owner/../x", "owner/.x", "owner/-x", "_owner/x", "owner/_x", "owner/..", "owner/."]
  ) {
    assert.throws(() => Schema.decodeUnknownSync(Input)({ ...benchmark, resultsRepo: repo }))
    for (const key of ["resultsRepo", "benchmarkRepo"]) {
      assert.throws(() => Schema.decodeUnknownSync(MeterInput)({ ...meter, [key]: repo }))
    }
  }
  for (const repo of ["A/R", "owner.name/repo-name_v2", "1-owner/2.repo"]) {
    assert.equal(Schema.decodeUnknownSync(Input)({ ...benchmark, resultsRepo: repo }).resultsRepo, repo)
    assert.equal(
      Schema.decodeUnknownSync(MeterInput)({ ...meter, resultsRepo: repo, benchmarkRepo: repo }).resultsRepo,
      repo
    )
  }
})

test("real Git LFS failure logs contain config paths and no bearer credential", async (t) => {
  const root = await temporary(t), auth = await credentials(["codex-1"], false, environment())
  t.after(() => auth.close())
  const env = {
    ...auth.env,
    GIT_AUTHOR_NAME: "Fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid"
  }
  const server = createServer((_req, res) => {
    res.writeHead(500, { "content-type": "application/json" })
    res.end("{\"message\":\"fixture failure\"}")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
  const port = (server.address() as { port: number }).port
  assert.equal((await command("git", ["init", "-q"], root, env)).code, 0)
  await writeFile(join(root, ".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n")
  await writeFile(
    join(root, "trial.bin"),
    `version https://git-lfs.github.com/spec/v1\noid sha256:${"f".repeat(64)}\nsize 1\n`
  )
  assert.equal((await command("git", ["add", ".gitattributes", "trial.bin"], root, env)).code, 0)
  assert.equal((await command("git", ["commit", "-qm", "fixture"], root, env)).code, 0)
  assert.equal(
    (await command("git", ["remote", "add", "origin", `http://127.0.0.1:${port}/fixture.git`], root, env)).code,
    0
  )
  const failed = await command("git", ["-c", "lfs.transfer.maxretries=0", "lfs", "fetch", "origin"], root, env)
  assert.notEqual(failed.code, 0)
  const logs = await command("git", ["lfs", "logs", "last"], root, env)
  assert.equal(logs.code, 0, logs.stderr)
  assert.equal(logs.stdout.includes("GIT_CONFIG_GLOBAL="), true)
  for (const secret of auth.secrets) {
    assert.equal((logs.stdout + logs.stderr + failed.stdout + failed.stderr).includes(secret), false)
  }
  const files = await readdir(join(root, ".git/lfs/logs"))
  assert.equal(files.length > 0, true)
  for (const file of files) {
    assert.equal((await readFile(join(root, ".git/lfs/logs", file), "utf8")).includes(cloudToken), false)
  }
})

// External mint/secret/cool commands are replaced with executable fixtures:
// running them live would mutate repository secrets and subscription accounts.
// The operator itself is a real Python process, receiving secrets only via env/stdin.
const seedFixture = async (t: TestContext, fail = "") => {
  const root = await temporary(t), home = join(root, "home"), bin = join(root, "bin"), log = join(root, "calls.jsonl")
  await mkdir(bin)
  for (const account of accounts) {
    const path = join(home, ".smithers/accounts", account)
    await mkdir(path, { recursive: true })
    await writeFile(join(path, "auth.json"), JSON.stringify(bundles[account]), { mode: 0o600 })
  }
  const script = `#!/usr/bin/env node
const fs = require("node:fs"), crypto = require("node:crypto")
const argv = process.argv.slice(2), input = fs.readFileSync(0, "utf8")
const canonical = argv[2] === "BENCHMARK_CODEX_AUTH_BUNDLES" ? JSON.stringify(JSON.parse(input)) : input
fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify({argv, digest: crypto.createHash("sha256").update(canonical).digest("hex"), bytes: Buffer.byteLength(input)}) + "\\n")
if ((argv[0] === "token" && process.env.FIXTURE_FAIL === "mint") || (argv[0] === "cool" && process.env.FIXTURE_FAIL === "cool:" + argv[1])) {
  process.stdout.write("smithers_fixture-minted-token")
  process.stderr.write("host-root-token-fixture smithers_fixture-minted-token")
  process.exit(7)
}
process.stdout.write(JSON.stringify(argv[0] === "token" ? {token: "smithers_fixture-minted-token", expiresAt: "2030-01-01T00:00:00Z", id: 73} : {}))
`
  for (const name of ["fake-smthrs", "codex-rr"]) {
    const path = join(bin, name)
    await writeFile(path, script)
    await chmod(path, 0o700)
  }
  const run = (extra: string[] = []) =>
    command(
      "python3",
      [
        fileURLToPath(new URL("../benchmark/seed.py", import.meta.url)),
        "--cli",
        join(bin, "fake-smthrs"),
        "--repo",
        "owner/repo",
        ...extra
      ],
      root,
      {
        HOME: home,
        PATH: `${bin}:${process.env.PATH}`,
        SMITHERS_TOKEN: "host-root-token-fixture",
        FIXTURE_LOG: log,
        FIXTURE_FAIL: fail,
        RR_POOL: "benchmark"
      }
    )
  const calls = async () =>
    (await readFile(log, "utf8")).trim().split("\n").map((line) =>
      JSON.parse(line) as { argv: string[]; digest: string; bytes: number }
    )
  return { home, run, calls }
}

test("seed operator sends secrets only on stdin and cools every account before copying bundles", async (t) => {
  const f = await seedFixture(t), result = await f.run(["--models", "--cool-minutes", "15", "--ttl", "2h"])
  assert.equal(result.code, 0, result.stderr)
  const calls = await f.calls()
  assert.deepEqual(calls.slice(0, 3).map((call) => call.argv), accounts.map((account) => ["cool", account, "15"]))
  assert.deepEqual(calls[3]!.argv.slice(0, 3), ["token", "mint", "--cloud"])
  assert.deepEqual(calls.slice(4).map((call) => call.argv.slice(0, 3)), [
    ["secret", "set", "BENCHMARK_SMITHERS_TOKEN"],
    ["secret", "set", "BENCHMARK_TOKEN_EXPIRES_AT"],
    ["secret", "set", "BENCHMARK_CODEX_AUTH_BUNDLES"]
  ])
  for (const call of calls.slice(4)) {
    assert.equal(call.argv.includes("--body-stdin"), true)
    assert.equal(call.argv.includes("--main-only"), true)
    assert.equal(call.bytes > 0, true)
  }
  assert.deepEqual(
    calls.slice(4).map((call) => call.digest),
    ["smithers_fixture-minted-token", "2030-01-01T00:00:00Z", JSON.stringify(bundles)]
      .map((value) => createHash("sha256").update(value).digest("hex"))
  )
  assert.deepEqual(JSON.parse(result.stdout), {
    repo: "owner/repo",
    expiresAt: "2030-01-01T00:00:00Z",
    accounts: [...accounts],
    tokenId: 73
  })
  for (const secret of ["host-root-token-fixture", "smithers_fixture-minted-token", ...secretValues(environment())]) {
    assert.equal(JSON.stringify(calls.map((call) => call.argv)).includes(secret), false)
    assert.equal((result.stdout + result.stderr).includes(secret), false)
  }
})

test("mint failure performs no secret writes and suppresses secret-bearing child diagnostics", async (t) => {
  const f = await seedFixture(t, "mint"), result = await f.run()
  assert.equal(result.code, 1)
  assert.deepEqual((await f.calls()).map((call) => call.argv.slice(0, 2)), [["token", "mint"]])
  assert.equal(result.stdout, "")
  assert.equal(result.stderr.includes("Credential seeding failed"), true)
  for (const secret of ["host-root-token-fixture", "smithers_fixture-minted-token"]) {
    assert.equal(result.stderr.includes(secret), false)
  }
})

test("cooldown failure stops before minting and before any bundle is seeded", async (t) => {
  const f = await seedFixture(t, "cool:codex-3"), result = await f.run(["--models"])
  assert.equal(result.code, 1)
  assert.deepEqual((await f.calls()).map((call) => call.argv), [["cool", "codex-1", "180"], ["cool", "codex-3", "180"]])
  assert.equal(result.stdout, "")
  assert.equal(result.stderr.includes("smithers_fixture-minted-token"), false)
})
