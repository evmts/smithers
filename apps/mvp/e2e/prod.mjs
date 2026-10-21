#!/usr/bin/env node
// The e2e suite against production (docs/infrastructure.md#against-a-deployment):
//
//   E2E_PROD_URL=<the production deployment's URL> pnpm e2e:prod [spec…] [playwright options…]
//
// It runs Playwright with E2E_TARGET=deployment (e2e/target.ts): the setup signs the test account in or reuses its
// session, every spec runs or skips by its declared needs, and the summary (e2e/summary.ts) prints each spec's results
// and fails the run on a failure, an undeclared skip or a blocked need. Then it makes the run's videos and GIFs, apart
// from a local run's, and exits with Playwright's status, or the recordings' when only they failed.
//
// One run at a time uses the test account on a deployment: the run holds a lock directory, `E2E_PROD_LOCK` or
// `run.lock` beside the stored session, with an `owner` file saying who holds it, and waits while another run does.
// A lock whose owner process has ended is reported, never taken over.
import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const url = process.env.E2E_PROD_URL ?? ""
if (!/^https:\/\//.test(url)) {
  console.error("Set E2E_PROD_URL to the production deployment's https URL; its deployment details live outside this repository.")
  process.exit(2)
}

const lock = process.env.E2E_PROD_LOCK ?? join(process.env.E2E_SESSION_DIR ?? join(homedir(), ".smithers-e2e"), new URL(url).host, "run.lock")
const ownerOf = () => {
  try {
    return readFileSync(join(lock, "owner"), "utf8").trim()
  } catch {
    return "an unnamed run"
  }
}
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === "EPERM"
  }
}
const take = () => {
  try {
    mkdirSync(lock)
  } catch (error) {
    if (error.code === "EEXIST") return false
    throw error
  }
  writeFileSync(join(lock, "owner"), `pnpm e2e:prod, pid ${process.pid}, in ${process.cwd()}, since ${new Date().toISOString()}\n`)
  return true
}
mkdirSync(dirname(lock), { recursive: true })
for (let waiting = false; !take(); waiting = true) {
  const owner = ownerOf()
  const pid = Number(/\bpid (\d+)/.exec(owner)?.[1])
  if (Number.isInteger(pid) && !alive(pid)) {
    console.error(`The production e2e lock ${lock} is held by a run that ended (${owner}). Remove it once nothing uses the test account.`)
    process.exit(2)
  }
  if (!waiting) console.error(`Waiting for the production e2e lock ${lock}, held by: ${owner}`)
  // A blocking wait between looks; the lock is a directory another process removes.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20_000)
}
const release = () => rmSync(lock, { recursive: true, force: true })
process.on("exit", release)
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(130))

const env = { ...process.env, E2E_TARGET: "deployment", BASE_URL: url }
const tests = spawnSync("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], { stdio: "inherit", env })
const media = join(homedir(), "Desktop/smithers-mvp/prod")
const recordings = spawnSync("node", ["e2e/gifs.mjs", "test-results-deployment", join(media, "gifs"), join(media, "videos")], { stdio: "inherit", env })
process.exit(tests.status !== 0 ? (tests.status ?? 1) : (recordings.status ?? 1))
