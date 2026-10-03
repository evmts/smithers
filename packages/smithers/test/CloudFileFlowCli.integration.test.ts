import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { makeCli } from "../src/Cli.ts"

// Exercise the shipped executable and HTTP transport. The local server stands
// in for the hosted service, whose launch/runtime is outside this CLI change.
const executable = fileURLToPath(new URL("../bin/smithers.mjs", import.meta.url))
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})
const fixture = async (respond?: (res: ServerResponse) => void) => {
  const home = await mkdtemp(join(tmpdir(), "cloud-file-flow-cli-"))
  cleanup.push(() => rm(home, { recursive: true, force: true }))
  const calls: Array<{ method: string; path: string; authorization: string | undefined; body: unknown }> = []
  const server = createServer(async (req, res) => {
    let raw = ""
    for await (const chunk of req) raw += chunk
    calls.push({
      method: req.method!,
      path: req.url!,
      authorization: req.headers.authorization,
      body: raw ? JSON.parse(raw) : undefined
    })
    if (req.url === "/api/repos/owner/repo/runs/42/logs") {
      res.writeHead(200, { "content-type": "text/event-stream" })
      res.end(
        "event: log\ndata: {\"content\":\"noop smithers reward=1\"}\n\nevent: done\ndata: {\"status\":\"completed\"}\n\n"
      )
    } else if (respond) respond(res)
    else if (req.method === "POST" && req.url === "/api/repos/owner/repo/invoke") {
      res.writeHead(201, { "content-type": "application/json" })
      res.end(JSON.stringify({ id: 42, run_id: 42, flow: "benchmark", status: "queued" }))
    } else {
      res.writeHead(404, { "content-type": "application/json" })
      res.end("{\"message\":\"Unexpected route\"}")
    }
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  cleanup.push(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
  const environment = {
    HOME: home,
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
    NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE,
    XDG_CONFIG_HOME: home,
    XDG_DATA_HOME: home,
    SMITHERS_API_ORIGIN: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    SMITHERS_TOKEN: "file-flow-session-secret",
    SMITHERS_DISABLE_SYSTEM_KEYRING: "1"
  }
  const run = async (args: string[]) => {
    let output = "", error = ""
    const child = spawn(process.execPath, ["--no-warnings", executable, ...args, "--format", "json"], {
      cwd: home,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 180_000
    })
    child.stdout.on("data", (chunk) => output += chunk)
    child.stderr.on("data", (chunk) => error += chunk)
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject)
      child.on("close", resolve)
    })
    expect(output + error).not.toContain(environment.SMITHERS_TOKEN)
    return { code, output, error }
  }
  const serve = async (args: string[]) => {
    let output = "", code = 0
    const cli = makeCli({ environment, exit: (value) => void (code = value) })
    await cli.serve([...args, "--format", "json"], {
      env: environment,
      stdout: (text) => void (output += text),
      exit: (value) => void (code = value)
    })
    return { code, output }
  }
  return { calls, run, serve }
}

const start = ["flow", "start", "benchmark", "--cloud", "-R", "owner/repo"]
describe("cloud file-flow CLI", () => {
  it("starts a typed file flow without legacy lookup and fetches its logs from another CLI process", async () => {
    const f = await fixture()
    const input = {
      suite: "noop",
      arms: ["smithers"],
      k: 2,
      enabled: false,
      tasks: { sample: 1, seed: 0 },
      empty: null
    }
    const result = await f.run([...start, "--payload", JSON.stringify(input)])
    expect(result.code, result.error + result.output).toBe(0)
    expect(JSON.parse(result.output)).toEqual({ id: 42, run_id: 42, flow: "benchmark", status: "queued" })
    expect(f.calls).toEqual([{
      method: "POST",
      path: "/api/repos/owner/repo/invoke",
      authorization: "token file-flow-session-secret",
      body: { flow: "benchmark", input }
    }])
    const logs = await f.run(["runs", "logs", "42", "--cloud", "-R", "owner/repo"])
    expect(logs.code, logs.error + logs.output).toBe(0)
    expect(JSON.parse(logs.output)).toEqual([
      { type: "log", data: { content: "noop smithers reward=1" } },
      { type: "done", data: { status: "completed" } }
    ])
    expect(f.calls.map((call) => [call.method, call.path])).toEqual([
      ["POST", "/api/repos/owner/repo/invoke"],
      ["GET", "/api/repos/owner/repo/runs/42/logs"]
    ])
  }, 420_000)
  it("passes an empty payload when omitted and preserves an explicit flow path", async () => {
    const f = await fixture()
    const result = await f.serve(["flow", "start", "flows/benchmark/flow.ts", "-R", "owner/repo"])
    expect(result.code, result.output).toBe(0)
    expect(f.calls.map((call) => call.body)).toEqual([{ flow: "flows/benchmark/flow.ts", input: {} }])
    expect(JSON.parse(result.output).run_id).toBe(42)
  })
  it.each(["{", "", "[]", "null", "true", "17", "\"text\""])(
    "rejects malformed/object-incompatible payload %j without HTTP",
    async (payload) => {
      const f = await fixture()
      const result = await f.serve([...start, "--payload", payload])
      expect(result.code).toBe(2)
      expect(result.output).toContain("--payload must contain one valid JSON object")
      expect(f.calls).toEqual([])
    }
  )
  it("reports the backend's missing-flow refusal without falling back to CI lookup", async () => {
    const f = await fixture((res) => {
      res.writeHead(404, { "content-type": "application/json" })
      res.end("{\"message\":\"Flow benchmark was not found\"}")
    })
    const result = await f.run(start)
    expect(result.code).toBe(1)
    expect(result.output + result.error).toContain("Flow benchmark was not found")
    expect(f.calls.map((call) => [call.method, call.path])).toEqual([["POST", "/api/repos/owner/repo/invoke"]])
  }, 210_000)
})
