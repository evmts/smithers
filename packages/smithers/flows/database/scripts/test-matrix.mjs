/** Run an owning package's existing suite on SQLite and a real PostgreSQL server. */
import { spawn, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir, userInfo } from "node:os"
import { join } from "node:path"

const children = new Set()
let interrupted
const interrupt = (signal) => {
  interrupted = signal
  console.error(`Storage matrix interrupted by ${signal}`)
  process.exitCode = signal === "SIGINT" ? 130 : 143
  for (const child of children) {
    try {
      if (process.platform === "win32") child.kill(signal)
      else process.kill(-child.pid, signal)
    } catch (error) { if (error.code !== "ESRCH") throw error }
  }
}
const onInterrupt = () => interrupt("SIGINT")
const onTerminate = () => interrupt("SIGTERM")
process.on("SIGINT", onInterrupt)
process.on("SIGTERM", onTerminate)
const run = (command, args, env = process.env) => new Promise((resolve, reject) => {
  if (interrupted) { reject(new Error(`Storage matrix interrupted by ${interrupted}`)); return }
  const child = spawn(command, args, { env, stdio: "inherit", detached: process.platform !== "win32" })
  children.add(child)
  child.on("error", (error) => { children.delete(child); reject(error) })
  child.on("exit", (code, signal) => {
    children.delete(child)
    code === 0 && !interrupted ? resolve() : reject(new Error(`${command} exited ${code ?? signal ?? interrupted}`))
  })
})
const port = () => new Promise((resolve, reject) => {
  const server = createServer()
  server.on("error", reject)
  server.listen(0, "127.0.0.1", () => {
    const value = server.address().port
    server.close((error) => error ? reject(error) : resolve(value))
  })
})
let directory
let data
let reports
let scratch
const bin = process.env.PG_BIN ?? (process.platform === "darwin" ? "/opt/homebrew/opt/postgresql@18/bin" : "")
const pg = (name) => bin ? join(bin, name) : name
try {
  let url = process.env.SMITHERS_TEST_PG_URL
  if (!url) {
    directory = await mkdtemp(join(tmpdir(), "smithers-sql-matrix-"))
    data = join(directory, "data")
    const listeningPort = await port()
    // The TCP listener is reachable by every local user, so the superuser needs a password.
    const password = randomBytes(24).toString("hex")
    const pwfile = join(directory, "pwfile")
    await writeFile(pwfile, password, { mode: 0o600 })
    await run(pg("initdb"), ["-D", data, "-A", "scram-sha-256", `--pwfile=${pwfile}`, "--encoding=UTF8", "--locale=C"])
    await rm(pwfile)
    // This matrix connects over TCP; disable the privileged/default and path-limited Unix socket.
    const socket = process.platform === "win32" ? "" : " -k ''"
    await run(pg("pg_ctl"), ["-D", data, "-l", join(directory, "server.log"), "-o", `-h 127.0.0.1 -p ${listeningPort}${socket}`, "-w", "start"])
    url = `postgres://${encodeURIComponent(userInfo().username)}:${password}@127.0.0.1:${listeningPort}/postgres?sslmode=disable`
  }
  const { SMITHERS_TEST_PG_URL: ignored, SMITHERS_POSTGRES_URL: ignoredUrl, DATABASE_URL: ignoredDatabase, ...inheritedEnvironment } = process.env
  scratch = await mkdtemp(join(tmpdir(), "ms-"))
  const environment = { ...inheritedEnvironment, TMPDIR: scratch, TEMP: scratch, TMP: scratch, NODE_COMPILE_CACHE: join(scratch, "node-compile-cache") }
  const coverageParts = ["lines", "functions", "branches", "statements"]
  const laneOverrides = new Set(["--coverage.reportsDirectory", ...coverageParts.map((part) => `--coverage.thresholds.${part}`)])
  const coverageOptions = []
  const laneOptions = []
  let publishedReports
  const options = process.argv.slice(2)
  for (let index = 0; index < options.length; index++) {
    const option = options[index]
    const key = option.split("=")[0]
    const group = [option]
    let value = option.split("=").slice(1).join("=")
    if (option.startsWith("--coverage.") && !option.includes("=") && options[index + 1] && !options[index + 1].startsWith("--")) {
      value = options[++index]
      group.push(value)
    }
    if (!laneOverrides.has(key)) laneOptions.push(...group)
    if (option.startsWith("--coverage.") && key !== "--coverage.reportsDirectory" && key !== "--coverage.enabled") coverageOptions.push(...group)
    if (key === "--coverage.reportsDirectory") publishedReports = value
  }
  const args = [join(process.cwd(), "node_modules/vitest/vitest.mjs"), "run", ...laneOptions]
  const failures = []
  const coverage = !process.argv.includes("--coverage.enabled=false")
  if (coverage) reports = await mkdtemp(join(tmpdir(), "smithers-sql-reports-"))

  for (const backend of ["sqlite", "postgres"]) {
    console.log(`\nStorage matrix: ${backend}\n`)
    try {
      await run(process.execPath, coverage ? [...args,
        "--reporter=default", "--reporter=blob", `--outputFile.blob=${join(reports, "blobs", backend + ".json")}`,
        `--coverage.reportsDirectory=${join(reports, "coverage-" + backend)}`,
        ...coverageParts.map((part) => `--coverage.thresholds.${part}=0`)
      ] : args, {
        ...environment,
        SMITHERS_BACKEND: "sqlite",
        ...(backend === "postgres" ? { SMITHERS_TEST_PG_URL: url } : {})
      })
    } catch (error) { failures.push(error) }
  }
  if (coverage) {
    try {
      await run(process.execPath, [args[0], `--merge-reports=${join(reports, "blobs")}`, ...coverageOptions, "--coverage.enabled=true",
        `--coverage.reportsDirectory=${publishedReports ?? join(reports, "merged")}`], environment)
    } catch (error) { failures.push(error) }
  }
  if (failures.length) throw new AggregateError(failures, "Storage matrix failed")
} catch (error) {
  if (!interrupted) throw error
} finally {
  // pg_ctl can detach its server just before a signal interrupts startup.
  if (data) spawnSync(pg("pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"], { stdio: "inherit" })
  const cleanup = await Promise.allSettled([directory, reports, scratch].filter(Boolean).map((path) => rm(path, { recursive: true, force: true })))
  process.off("SIGINT", onInterrupt)
  process.off("SIGTERM", onTerminate)
  const failures = cleanup.filter((result) => result.status === "rejected").map((result) => result.reason)
  if (failures.length) throw new AggregateError(failures, "Storage matrix cleanup failed")
}
