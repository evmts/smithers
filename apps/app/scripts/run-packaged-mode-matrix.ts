#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseMatrixConfig, selectMatrixModes } from "../e2e/real/coverage/matrix"
import type { MatrixConfig } from "../e2e/real/coverage/matrix"
import { startLocalOwn } from "./mode-matrix/local-own"
import type { LocalOwnSession } from "./mode-matrix/local-own"
import { startLocalPlue, startWebPlue } from "./mode-matrix/plue-target"
import type { PlueSession } from "./mode-matrix/plue-target"
import { sourceRevision } from "./mode-matrix/source-revision"

const appDir = fileURLToPath(new URL("../", import.meta.url))
const rootDir = resolve(appDir, "../..")
const args = process.argv.slice(2)
const matrixCommand = args[0] ?? "run"
if (matrixCommand !== "audit" && matrixCommand !== "run") {
  throw new Error("usage: run-packaged-mode-matrix.ts audit|run [--output-dir path] [--external-config path] [--auth-environment NAME] [--modes comma-separated]")
}

const option = (name: string): string | undefined => {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`)
  return value
}

/*
 * The stage this run reached, on stderr before the stage runs. A child the
 * deadline kills — a timed-out CI gate, a cancelled job — reports nothing of
 * its own, so these lines are all a reader has. The names are a closed set
 * and carry no arguments, environment, paths, targets or credentials.
 */
const stage = (name: "arguments" | "external-config" | "conflict-check" | "revision" | "output-dir" | "launch" | "runner" | "teardown"): void => {
  process.stderr.write(`mode matrix stage: ${name}\n`)
}

stage("arguments")
const outputDir = resolve(option("--output-dir") ?? process.env.SMITHERS_MODE_MATRIX_OUTPUT_DIR ?? resolve(appDir, "test-results/mode-matrix"))
const modeSelection = option("--modes")
const selectedModes = selectMatrixModes(modeSelection).modes
const wants = (mode: string): boolean => selectedModes.some((selected) => selected === mode)
const configPath = resolve(outputDir, "config.json")
const reportPath = resolve(outputDir, "report.json")

/*
 * Every refusal readable from the arguments alone comes first, because the
 * stages below are effects: `sourceRevision` snapshots the whole working copy
 * through `jj` and `git` — unbounded on a CI checkout carrying build output —
 * and the output directory is a write. A configuration this run will refuse
 * must not pay for either, nor leave a directory behind.
 */
stage("external-config")
const externalPath = option("--external-config") ?? process.env.SMITHERS_MODE_MATRIX_EXTERNAL_CONFIG
let external: MatrixConfig | undefined
if (externalPath !== undefined) {
  if (!existsSync(externalPath)) throw new Error(`external mode configuration does not exist: ${externalPath}`)
  external = parseMatrixConfig(JSON.parse(readFileSync(resolve(externalPath), "utf8")) as unknown)
  if (external.modes.some(({ mode }) => mode === "local-own")) {
    throw new Error("external mode configuration must not replace an in-repo owned launch")
  }
}
const externalModes = external?.modes ?? []

stage("conflict-check")
const plueTarget = process.env.SMITHERS_MODE_MATRIX_PLUE_URL?.trim()
const plueWebTarget = process.env.SMITHERS_MODE_MATRIX_PLUE_WEB_URL?.trim()
const plueTokenEnvironment = "SMITHERS_MODE_MATRIX_PLUE_TOKEN"
if (plueTarget && process.env[plueTokenEnvironment]?.trim() && (wants("web-plue") || wants("local-plue")) &&
  externalModes.some(({ mode }) => mode === "web-plue" || mode === "local-plue")) {
  throw new Error("external configuration must not duplicate the configured Plue web or local target")
}

stage("revision")
const revision = await sourceRevision(rootDir)
if (external !== undefined && external.revision !== revision) {
  throw new Error(`external mode revision ${external.revision} does not match checkout ${revision}`)
}

stage("output-dir")
mkdirSync(outputDir, { recursive: true })

let localSession: LocalOwnSession | undefined
let plueSessions: PlueSession[] = []
let launchFailure: unknown
let matrixCode = 1
let teardownFailure: unknown
const stop = async (): Promise<void> => {
  const local = localSession
  const remote = plueSessions
  localSession = undefined
  plueSessions = []
  const failures: unknown[] = []
  for (const close of [local?.close, ...remote.map((target) => target.close)]) {
    if (close === undefined) continue
    try { await close() } catch (error) { failures.push(error) }
  }
  if (failures.length > 0) throw new AggregateError(failures, "mode launcher teardown failed")
}
const interrupt = (signal: NodeJS.Signals): void => {
  void stop().finally(() => {
    process.kill(process.pid, signal)
  })
}
process.once("SIGINT", interrupt)
process.once("SIGTERM", interrupt)
stage("launch")
try {
  if (plueTarget && process.env[plueTokenEnvironment]?.trim() && (wants("web-plue") || wants("local-plue"))) {
    if (wants("web-plue")) try {
      if (!plueWebTarget) throw new Error("web-plue requires SMITHERS_MODE_MATRIX_PLUE_WEB_URL and SMITHERS_MODE_MATRIX_PLUE_URL")
      plueSessions.push(await startWebPlue(outputDir, plueWebTarget, plueTokenEnvironment, plueTarget))
    }
    catch (error) {
      launchFailure = error
      console.error(`web-plue launch failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (wants("local-plue")) try { plueSessions.push(await startLocalPlue(appDir, revision, outputDir, plueTarget, plueTokenEnvironment)) }
    catch (error) {
      launchFailure = error
      console.error(`local-plue launch failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (wants("local-own")) try {
    localSession = await startLocalOwn(rootDir, revision, outputDir)
  } catch (error) {
    launchFailure = error
    console.error(`local-own launch failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  const config: MatrixConfig = {
    revision,
    modes: [...(localSession === undefined ? [] : [localSession.modeConfig]),
      ...plueSessions.map(({ modeConfig }) => modeConfig), ...externalModes]
  }
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })

  stage("runner")
  const matrix = Bun.spawn([
    "bun", "scripts/run-mode-matrix.ts", matrixCommand,
    "--config", configPath,
    "--report", reportPath,
    ...(modeSelection === undefined ? [] : ["--modes", modeSelection])
  ], {
    cwd: appDir,
    env: { ...process.env, ...localSession?.runtimeEnvironment },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit"
  })
  matrixCode = await matrix.exited
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  process.off("SIGINT", interrupt)
  process.off("SIGTERM", interrupt)
  stage("teardown")
  try { await stop() } catch (error) {
    teardownFailure = error
    console.error(`mode launcher teardown failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (launchFailure !== undefined || teardownFailure !== undefined || matrixCode !== 0) process.exitCode = 1
