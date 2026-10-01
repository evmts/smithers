import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

/** Full public backend and model host with explicit owner/provider/operator fixture inputs. */
export async function startFullBackend(options: { readonly labels?: boolean } = {}) {
  const postgres = process.env.SMITHERS_POSTGRES_TEST_BIN
  if (!postgres) throw new Error("Set SMITHERS_POSTGRES_TEST_BIN to PostgreSQL 18 bin")
  const node = Bun.which("node")
  if (!node) throw new Error("Node 26 is required")
  const ffi = process.env.SMITHERS_FFI_LIBRARY_PATH
  if (!ffi) throw new Error("Set SMITHERS_FFI_LIBRARY_PATH to the source-built native library")
  const toolCache = Bun.spawnSync(["go", "env", "GOCACHE", "GOMODCACHE"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    stdout: "pipe",
    stderr: "pipe"
  })
  if (toolCache.exitCode !== 0) throw new Error("Go cache discovery failed")
  const [GOCACHE, GOMODCACHE] = new TextDecoder().decode(toolCache.stdout).trim().split("\n")
  const root = await mkdtemp(join(tmpdir(), "smithers-full-backend-"))
  const repository = resolve(import.meta.dir, "../../../..")
  const hosts = join(root, "hosts")
  const env = { PATH: process.env.PATH, HOME: root, TMPDIR: tmpdir(), GOTELEMETRY: "off" }
  const run = async (args: string[]) => {
    const child = Bun.spawn(args, {
      cwd: repository,
      env: { ...env, GOCACHE, GOMODCACHE, ...(args[0] === "go" ? { SDKROOT: process.env.SDKROOT } : {}) },
      stdout: "pipe",
      stderr: "pipe"
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited
    ])
    if (code !== 0) throw new Error(`${args[0]} failed: ${stderr || stdout}`)
  }
  let child: ReturnType<typeof Bun.spawn> | undefined
  const stop = async () => {
    const owned = child
    if (owned && owned.exitCode === null) {
      owned.kill("SIGTERM")
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          owned.exited,
          new Promise<void>((resolveStop) => {
            timer = setTimeout(() => {
              if (owned.exitCode === null) owned.kill("SIGKILL")
              resolveStop()
            }, 15000)
          })
        ])
      } finally {
        if (timer !== undefined) clearTimeout(timer)
      }
      await owned.exited
    }
    await rm(root, { recursive: true, force: true })
  }
  try {
    await mkdir(hosts)
    await run(["go", "build", "-o", join(root, "backend"), "./apps/backend"])
    await run([node, "flows/coding/build.mjs", join(hosts, "smithers-coding-host")])
    await run([node, "apps/model-host/build.mjs", join(hosts, "smithers-model-host")])
    await run([
      node,
      "distribution/flow-host-manifest.mjs",
      join(hosts, "flow-hosts.json"),
      join(hosts, "smithers-coding-host")
    ])
    const port = await new Promise<number>((resolvePort, reject) => {
      const listener = createServer().once("error", reject)
      listener.listen(0, "127.0.0.1", () => {
        const address = listener.address()
        if (!address || typeof address === "string") throw new Error("No loopback address")
        listener.close((error) => error ? reject(error) : resolvePort(address.port))
      })
    })
    const origin = `http://127.0.0.1:${port}`
    const bootstrap = randomUUID()
    child = Bun.spawn([join(root, "backend")], {
      cwd: repository,
      env: {
        ...env,
        SMITHERS_SERVER_ADDR: `127.0.0.1:${port}`,
        SMITHERS_PUBLIC_URL: origin,
        SMITHERS_DATA_ROOT: join(root, "state"),
        SMITHERS_NATIVE_POSTGRES_BIN: postgres,
        SMITHERS_FLOW_HOST_MANIFEST: join(hosts, "flow-hosts.json"),
        SMITHERS_MODEL_HOST_BUNDLE: join(hosts, "smithers-model-host"),
        SMITHERS_NODE_BINARY: node,
        SMITHERS_AUTH_BOOTSTRAP_TOKEN: bootstrap,
        SMITHERS_FFI_LIBRARY_PATH: ffi,
        ...(options.labels === true ? { SMITHERS_FEATURE_FLAGS_LABELS: "true" } : {})
      },
      stdout: "inherit",
      stderr: "inherit"
    })
    const deadline = Date.now() + 30000
    for (;;) {
      if (child.exitCode !== null) throw new Error(`Full backend exited ${child.exitCode}`)
      try {
        if ((await fetch(`${origin}/readyz`)).ok) break
      } catch {}
      if (Date.now() > deadline) throw new Error("Full backend readiness failed")
      await Bun.sleep(50)
    }
    const request = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
      const response = await fetch(origin + path, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body)
      })
      if (!response.ok) throw new Error(`${path}: ${response.status}`)
      return response.json() as Promise<Record<string, unknown>>
    }
    const username = "fixtureowner"
    const password = randomUUID() + "Aa1!"
    await request("/api/auth/local/bootstrap", { username, email: "fixtureowner@example.test", password }, {
      "x-smithers-bootstrap-token": bootstrap
    })
    const receipt = await request("/api/auth/local/token", { username, password, name: "full-backend-fixture" })
    if (typeof receipt.token !== "string" || !receipt.token) throw new Error("Missing owner token")
    const token = receipt.token
    const http = (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      headers.set("authorization", `token ${token}`)
      return fetch(new URL(String(input), origin), { ...init, headers })
    }
    const signIn = async (rendererOrigin: string) => {
      const target = new URL(rendererOrigin)
      if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.origin !== rendererOrigin) {
        throw new Error("Fixture sign-in requires a loopback renderer origin")
      }
      const response = await fetch(`${target.origin}/api/auth/local/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password })
      })
      if (!response.ok) throw new Error(`Fixture local sign-in refused (${response.status})`)
      const identity = await fetch(`${target.origin}/api/user`)
      if (!identity.ok) throw new Error(`Fixture owner readback refused (${identity.status})`)
      const user = await identity.json() as { username?: unknown; is_admin?: unknown }
      if (user.username !== username || user.is_admin !== true) throw new Error("Fixture owner readback mismatch")
    }
    return { origin, token, username, http, signIn, stop }
  } catch (error) {
    try {
      await stop()
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Fixture startup and cleanup failed")
    }
    throw error
  }
}
