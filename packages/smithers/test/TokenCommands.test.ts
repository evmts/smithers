import * as Audience from "@smthrs/build-cli/Audience"
import type { RuntimeConfig } from "@smthrs/build-cli/Cli"
import * as ScopedToken from "@smthrs/control/ScopedToken"
import { Effect } from "effect"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { makeCli } from "../src/Cli.ts"
import * as TokenCommands from "../src/cli/TokenCommands.ts"

const key = "gateway-root-secret"
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

const cloudFixture = async (respond?: (res: ServerResponse, body: Record<string, unknown>) => void) => {
  const home = await mkdtemp(join(tmpdir(), "cloud-token-cli-"))
  cleanup.push(() => rm(home, { recursive: true, force: true }))
  const calls: Array<
    { path: string; method: string; authorization: string | undefined; body: Record<string, unknown> }
  > = []
  const server = createServer(async (req, res) => {
    let raw = ""
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw) as Record<string, unknown>
    calls.push({ path: req.url!, method: req.method!, authorization: req.headers.authorization, body })
    if (respond) respond(res, body)
    else {
      res.writeHead(201, { "content-type": "application/json" })
      res.end(
        JSON.stringify({
          id: 73,
          token: "smithers_new-scoped-token",
          name: body.name,
          scopes: body.scopes,
          expires_at: body.expires_at
        })
      )
    }
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  cleanup.push(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
  const environment = {
    HOME: home,
    XDG_CONFIG_HOME: home,
    XDG_DATA_HOME: home,
    SMITHERS_API_ORIGIN: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    SMITHERS_TOKEN: key,
    SMITHERS_DISABLE_SYSTEM_KEYRING: "1"
  }
  return {
    calls,
    run: (args: string[], terminal = false) => invoke(["token", "mint", "--cloud", ...args], environment, terminal)
  }
}

const invoke = async (
  args: Array<string>,
  environment: Record<string, string | undefined> = {},
  terminal = false
) => {
  const result = { stdout: "", stderr: "", codes: [] as Array<number> }
  const config: RuntimeConfig = {
    environment,
    stdout: {
      isTTY: terminal,
      columns: 80,
      write: (text) => {
        result.stdout += text
      }
    },
    stderr: {
      isTTY: false,
      columns: 80,
      write: (text) => {
        result.stderr += text
      }
    },
    exit: (code) => {
      result.codes.push(code)
    }
  }
  const presentation = Audience.fromArguments(args, {
    env: config.environment,
    stdout: config.stdout?.isTTY,
    stderr: config.stderr?.isTTY
  })
  await makeCli({ ...config, presentation }).serve(Audience.incurArguments(args, presentation), {
    env: config.environment,
    stdout: (text) => {
      result.stdout += text
    },
    exit: (code) => {
      result.codes.push(code)
    }
  })
  return result
}

describe("smthrs token mint", () => {
  it("mints a token the gateway credential verifies, with the grant and expiry it carries", async () => {
    const before = Date.now()
    const result = await invoke(
      ["token", "mint", "--scope", "read:runs", "--scope", "approve:runs", "--ttl", "1h", "--run", "run-1", "--json"],
      { SMITHERS_TOKEN: key }
    )

    expect(result.codes).toEqual([])
    expect(result.stderr).toBe("")
    const document = JSON.parse(result.stdout) as TokenCommands.MintedToken
    expect(document).toMatchObject({
      scopes: ["read:runs", "approve:runs"],
      procedures: [
        "List",
        "Watch",
        "Projection.Snapshot",
        "Projection.Subscribe",
        "Approve",
        "Deny",
        "Approval.Submit"
      ],
      runId: "run-1"
    })
    expect(document).not.toHaveProperty("flowId")
    const expiresAt = Date.parse(document.expiresAt)
    expect(expiresAt).toBeGreaterThanOrEqual(before + 60 * 60 * 1000)
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000)
    const claims = await Effect.runPromise(ScopedToken.verify(key, document.token, Date.now()))
    expect(claims.exp).toBe(expiresAt)
    expect(claims.runId).toBe("run-1")
    // Signed under the credential, so another credential's gateway refuses it.
    await expect(Effect.runPromise(ScopedToken.verify("another-secret", document.token, Date.now()))).rejects.toThrow()
  })

  it("prints only the token for a person, and defaults the lifetime to one hour", async () => {
    const result = await invoke(
      ["token", "mint", "--scope", "write:runs", "--flow", "demo", "--audience", "human", "--silent"],
      { SMITHERS_TOKEN: key },
      true
    )

    expect(result.codes).toEqual([])
    const [title, token, ...rest] = result.stdout.split("\n")
    expect(title).toBe("token mint")
    expect(token!.startsWith("smt1.")).toBe(true)
    expect(rest.join("\n").trim()).toBe("")
    expect(result.stdout).not.toContain("procedures")
    const claims = await Effect.runPromise(ScopedToken.verify(key, token!, Date.now()))
    expect(claims.exp - claims.iat).toBe(60 * 60 * 1000)
    expect(claims.flowId).toBe("demo")
    expect(claims.procedures).toEqual(["Plan", "Run", "Steer", "Signal", "Cancel", "Resume", "Run.Fork", "Run.Verify"])
  })

  it("refuses to mint without SMITHERS_TOKEN, with an unknown scope, or with a bad lifetime", async () => {
    const missing = await invoke(["token", "mint", "--scope", "read:runs"], {})
    expect(missing.codes).toEqual([2])
    expect(missing.stdout + missing.stderr).toContain("Set SMITHERS_TOKEN")

    const blank = await invoke(["token", "mint", "--scope", "read:runs"], { SMITHERS_TOKEN: "  " })
    expect(blank.codes).toEqual([2])
    expect(blank.stdout + blank.stderr).toContain("Set SMITHERS_TOKEN")

    for (const ttl of ["0s", "soon", "-1h", "1y"]) {
      const bad = await invoke(["token", "mint", "--scope", "read:runs", "--ttl", ttl], { SMITHERS_TOKEN: key })
      expect([ttl, bad.codes]).toEqual([ttl, [2]])
      expect(bad.stdout + bad.stderr).toContain("--ttl must be a positive duration")
      expect(bad.stdout + bad.stderr).not.toContain("smt1.")
    }

    // The parser refuses an unknown scope and a missing one before the handler runs.
    for (const args of [["--scope", "everything"], []]) {
      const refused = await invoke(["token", "mint", ...args], { SMITHERS_TOKEN: key })
      expect(refused.codes.length).toBeGreaterThan(0)
      expect(refused.codes.every((code) => code !== 0)).toBe(true)
      expect(refused.stdout + refused.stderr).not.toContain("smt1.")
    }
  })

  it("is not a removed verb any more", async () => {
    const help = await invoke(["token", "--help"])
    expect(help.codes).not.toContain(1)
    expect(help.stdout).toContain("mint")
    expect(help.stdout).not.toContain("was removed in 1.0.0-rc.0")
  })
})

describe("smthrs token mint --cloud", () => {
  it("mints an expiring API token with typed scopes and a revocation id without printing the login", async () => {
    const f = await cloudFixture()
    const before = Date.now()
    const result = await f.run([
      "--name",
      "benchmark",
      "--scope",
      "write:repository",
      "--scope",
      "write:workspace",
      "--scope",
      "write:repository",
      "--ttl",
      "2h",
      "--json"
    ])
    expect(result.codes).toEqual([])
    expect(result.stderr).toBe("")
    const minted = JSON.parse(result.stdout) as TokenCommands.MintedToken
    expect(minted).toEqual({
      id: 73,
      token: "smithers_new-scoped-token",
      name: "benchmark",
      scopes: ["write:repository", "write:workspace"],
      expiresAt: minted.expiresAt,
      procedures: []
    })
    expect(Date.parse(minted.expiresAt)).toBeGreaterThanOrEqual(before + 2 * 60 * 60 * 1000)
    expect(Date.parse(minted.expiresAt)).toBeLessThanOrEqual(Date.now() + 2 * 60 * 60 * 1000)
    expect(f.calls).toEqual([{
      method: "POST",
      path: "/api/user/tokens",
      authorization: `token ${key}`,
      body: { name: "benchmark", scopes: minted.scopes, expires_at: minted.expiresAt }
    }])
    expect(result.stdout + result.stderr).not.toContain(key)
  })
  it("prints the new Cloud token for a person and uses a one-hour default expiry", async () => {
    const f = await cloudFixture()
    const before = Date.now()
    const result = await f.run(["--scope", "read:repository", "--audience", "human", "--silent"], true)
    expect(result.codes).toEqual([])
    expect(result.stdout.split("\n").filter(Boolean)).toEqual(["token mint", "smithers_new-scoped-token"])
    expect(f.calls[0]!.body.name).toBe("smthrs")
    expect(Date.parse(String(f.calls[0]!.body.expires_at))).toBeGreaterThanOrEqual(before + 60 * 60 * 1000)
    expect(result.stdout + result.stderr).not.toContain(key)
  })
  it.each([
    ["--scope", "read:runs"],
    ["--scope", "write:repository", "--run", "42"],
    ["--scope", "write:repository", "--flow", "benchmark"],
    ["--scope", "write:repository", "--name", " "],
    ["--scope", "write:repository", "--ttl", "0s"],
    ["--scope", "write:repository", "--ttl", "-1h"],
    ["--scope", "write:repository", "--ttl", "soon"],
    ["--scope", "write:repository", "--ttl", "2499999999h"],
    ["--scope", "write:repository", "--ttl", "999999999999999999999999999999999999999999999999999999h"],
    ["--scope", "unknown"],
    []
  ])("refuses unsupported or unbounded grants before HTTP: %j", async (...args) => {
    const f = await cloudFixture()
    const result = await f.run([...args, "--json"])
    expect(result.codes).toEqual([args.length === 0 || args[1] === "unknown" ? 1 : 2])
    expect(f.calls).toEqual([])
    expect(result.stdout + result.stderr).not.toContain("smithers_new-scoped-token")
    expect(result.stdout + result.stderr).not.toContain(key)
  })
  it.each(["read:repository", "write:workspace", "read:approval", "write:agent", "admin", "all"])(
    "accepts backend permission scope %s",
    async (scope) => {
      const f = await cloudFixture()
      const result = await f.run(["--scope", scope, "--json"])
      expect(result.codes).toEqual([])
      expect(JSON.parse(result.stdout).scopes).toEqual([scope])
    }
  )
  it("reports backend scope deescalation refusal and redacts its echoed login", async () => {
    const f = await cloudFixture((res) => {
      res.writeHead(403, { "content-type": "application/json" })
      res.end(JSON.stringify({ message: `a token cannot create a token with scopes it does not hold (${key})` }))
    })
    const result = await f.run(["--scope", "write:workspace", "--json"])
    expect(result.codes).toEqual([1])
    expect(result.stdout + result.stderr).toContain("a token cannot create a token with scopes it does not hold")
    expect(result.stdout + result.stderr).not.toContain(key)
    expect(result.stdout + result.stderr).not.toContain("smithers_new-scoped-token")
    expect(f.calls).toHaveLength(1)
  })
  it.each([{}, { id: 73, token: "smithers_new-scoped-token", scopes: [], expires_at: "invalid" }])(
    "refuses an incomplete mint response %j",
    async (response) => {
      const f = await cloudFixture((res) => {
        res.writeHead(201, { "content-type": "application/json" })
        res.end(JSON.stringify(response))
      })
      const result = await f.run(["--scope", "write:repository", "--json"])
      expect(result.codes).toEqual([1])
      expect(result.stdout + result.stderr).toContain("Token response was incomplete")
      expect(result.stdout + result.stderr).not.toContain("smithers_new-scoped-token")
    }
  )
  it.each([
    { scopes: ["all"] },
    { scopes: [] },
    { expires_at: "2000-01-01T00:00:00.000Z" },
    { expires_at: "invalid" },
    { expires_at: "2100-01-01T00:00:00.000Z" },
    { id: 0 },
    { token: "" }
  ])("refuses a response that changes the grant or expiry: %j", async (override) => {
    const f = await cloudFixture((res, body) => {
      res.writeHead(201, { "content-type": "application/json" })
      res.end(
        JSON.stringify({
          id: 73,
          token: "smithers_new-scoped-token",
          scopes: body.scopes,
          expires_at: body.expires_at,
          ...override
        })
      )
    })
    const result = await f.run(["--scope", "write:repository", "--json"])
    expect(result.codes).toEqual([1])
    expect(result.stdout + result.stderr).toContain("Token response was incomplete")
    expect(result.stdout + result.stderr).not.toContain("smithers_new-scoped-token")
  })
  it("keeps backend scopes and names unavailable to gateway minting", async () => {
    for (const args of [["--scope", "write:repository"], ["--scope", "read:runs", "--name", "cloud-only"]]) {
      const result = await invoke(["token", "mint", ...args, "--json"], { SMITHERS_TOKEN: key })
      expect(result.codes).toEqual([2])
      expect(result.stdout + result.stderr).not.toContain("smt1.")
      expect(result.stdout + result.stderr).not.toContain(key)
    }
  })
})
