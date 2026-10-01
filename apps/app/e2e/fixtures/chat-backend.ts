import { randomBytes } from "node:crypto"
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const environment = Object.fromEntries(["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "GOCACHE", "GOMODCACHE"].flatMap(name =>
  process.env[name] === undefined ? [] : [[name, process.env[name]!]]))
const bounded = async <T>(operation: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([operation, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not finish`)), ms)
  })]) } finally { if (timer !== undefined) clearTimeout(timer) }
}
const root = resolve(import.meta.dir, "../../../..")
const port = () => new Promise<number>((done, reject) => {
  const socket = createServer()
  socket.once("error", reject)
  socket.listen(0, "127.0.0.1", () => {
    const address = socket.address()
    if (address === null || typeof address === "string") return reject(new Error("No fixture port"))
    socket.close(error => error ? reject(error) : done(address.port))
  })
})
const ready = async (child: ReturnType<typeof Bun.spawn>, protocol: string): Promise<string> => {
  if (typeof child.stdout === "number" || child.stdout === null) throw new Error("Missing fixture stdout")
  if (!child.stdout) throw new Error("Fixture readiness requires piped stdout")
  const reader = child.stdout.getReader()
  let output = ""
  try {
    for (;;) {
      const part = await bounded(reader.read(), 30_000, "Fixture readiness")
      if (part.done) throw new Error("Fixture exited before readiness")
      output += new TextDecoder().decode(part.value)
      if (output.includes("\n")) break
    }
    const line = JSON.parse(output.split("\n")[0]!)
    if (line.protocol !== protocol || typeof line.origin !== "string" || !line.origin.startsWith("http://127.0.0.1:"))
      throw new Error("Invalid fixture readiness identity")
    return line.origin
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
const stop = async (child: ReturnType<typeof Bun.spawn> | undefined) => {
  if (child === undefined) return
  if (child.exitCode === null) child.kill("SIGTERM")
  try { await bounded(child.exited, 10_000, "Fixture shutdown") }
  catch (error) { child.kill("SIGKILL"); await child.exited; throw error }
  if (child.exitCode !== 0) throw new Error("Fixture process did not stop cleanly")
}

/** Real Go admission/storage/authentication and the existing scoped TS producer. */
export const startFixtureChatBackend = async (options: { readonly stateDir?: string; readonly mode?: "durable" | "browser" | "graph" } = {}) => {
  const postgresBin = process.env.SMITHERS_POSTGRES_TEST_BIN?.trim()
  if (!postgresBin) throw new Error("Canonical chat fixtures require PostgreSQL 18: set SMITHERS_POSTGRES_TEST_BIN to its bin directory")
  const stateDir = options.stateDir ?? await mkdtemp(join(tmpdir(), "smithers-chat-fixture-"))
  await mkdir(stateDir, { recursive: true })
  const token = `smithers_${randomBytes(20).toString("hex")}`
  const hostToken = randomBytes(32).toString("hex")
  const address = `127.0.0.1:${await port()}`
  const binary = join(stateDir, "chatfixture")
  let backend: ReturnType<typeof Bun.spawn> | undefined
  let model: ReturnType<typeof Bun.spawn> | undefined
  try {
  const build = Bun.spawn(["go", "build", "-o", binary, "./packages/backend/testkit/chatfixture"], {
    cwd: root, env: { ...environment, SDKROOT: process.env.SDKROOT }, stdin: "ignore", stdout: "ignore", stderr: "inherit"
  })
  if (await build.exited !== 0) throw new Error("Canonical chat fixture build failed")
    model = Bun.spawn([Bun.which("bun")!, "apps/app/e2e/fixtures/chat-model-host.ts"], {
      cwd: root, stdin: "ignore", stdout: "pipe", stderr: "inherit",
      env: { ...environment, SMITHERS_CHAT_HOST_TOKEN: hostToken, SMITHERS_CHAT_CALLBACK_URL: `http://${address}`, SMITHERS_CHAT_HOST_PORT: "0", SMITHERS_CHAT_FIXTURE_MODE: options.mode ?? "durable" }
    })
    const modelOrigin = await ready(model, "smithers.chat-model-host/v1")
    const boot = async () => {
      backend = Bun.spawn([binary], { cwd: root, stdin: "ignore", stdout: "pipe", stderr: "inherit", env: {
        ...environment, SMITHERS_POSTGRES_TEST_BIN: postgresBin,
        SMITHERS_CHAT_FIXTURE_STATE: stateDir, SMITHERS_CHAT_FIXTURE_OWNER_TOKEN: token,
        SMITHERS_CHAT_FIXTURE_ADDRESS: address, SMITHERS_CHAT_FIXTURE_MODEL_ORIGIN: modelOrigin, SMITHERS_CHAT_HOST_TOKEN: hostToken
      } })
      return ready(backend, "smithers.chat-fixture/v1")
    }
    const origin = await boot()
    const close = async () => {
      const outcomes = await Promise.allSettled([stop(backend), stop(model)])
      if (options.stateDir === undefined) await rm(stateDir, { recursive: true, force: true })
      const failures = outcomes.flatMap(outcome => outcome.status === "rejected" ? [outcome.reason] : [])
      if (failures.length) throw new AggregateError(failures, "Fixture cleanup failed")
    }
    return { origin, token, stateDir, modelOrigin,
      databaseUrl: () => readFile(join(stateDir, "database-url"), "utf8"),
      storedPrivateOutput: async (kind: "prompt" | "output" = "output") => {
        const connection = await readFile(join(stateDir, "database-url"), "utf8")
        const database = new URL(connection)
        const query = kind === "output"
          ? "SELECT EXISTS (SELECT 1 FROM chat_turn_batches WHERE frames::text LIKE '%private-native%')"
          : "SELECT EXISTS (SELECT 1 FROM chat_turns WHERE request_payload::text LIKE '%private-native%')"
        const psql = join(postgresBin, "psql")
        const child = Bun.spawn([psql, "-At", "-c", query], { stdin: "ignore", stdout: "pipe", stderr: "ignore", env: { ...environment, PGHOST: database.hostname, PGPORT: database.port, PGDATABASE: database.pathname.slice(1), PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password) } })
        const output = await new Response(child.stdout).text()
        if (await child.exited !== 0) throw new Error("Canonical journal storage readback failed")
        if (!["t", "f"].includes(output.trim())) throw new Error("Invalid canonical storage readback")
        return output.trim() === "t"
      },
      calls: async () => (await (await fetch(`${modelOrigin}/fixture/stats`)).json() as { calls: number }).calls,
      grants: async () => (await (await fetch(`${modelOrigin}/fixture/stats`)).json() as { grants: number }).grants,
      release: async () => {
        const response = await fetch(`${modelOrigin}/fixture/release`, { method: "POST" })
        if (response.status !== 204) throw new Error("Scoped fixture producer release failed")
      },
      crashBackend: async () => {
        const crashed = backend
        if (crashed === undefined || crashed.exitCode !== null) throw new Error("No live canonical backend to crash")
        crashed.kill("SIGKILL")
        await crashed.exited
        if (crashed.signalCode !== "SIGKILL") throw new Error("Canonical backend crash was not SIGKILL")
        backend = undefined
      },
      restart: async () => { await stop(backend); return boot() },
      stop: close
    }
  } catch (error) {
    const outcomes = await Promise.allSettled([stop(backend), stop(model)])
    if (options.stateDir === undefined) await rm(stateDir, { recursive: true, force: true })
    const failures = outcomes.flatMap(outcome => outcome.status === "rejected" ? [outcome.reason] : [])
    if (failures.length) throw new AggregateError([error, ...failures], "Fixture startup and cleanup failed")
    throw error
  }
}
