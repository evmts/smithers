import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { createTriggersCli } from "../../../packages/smithers/src/operator/Triggers.ts"
import { Effect, Layer } from "effect"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import * as Discovery from "../../../packages/smithers/agent/registry/src/Discovery.ts"
import * as Registry from "../../../packages/smithers/agent/registry/src/Registry.ts"
import { triggers } from "./triggers.ts"

const platform = Layer.merge(NodeFileSystem.layer, NodePath.layer)
const registry = Registry.layer({ sources: [{ source: "project", root: resolve(import.meta.dirname, "../../../.smithers/flows"), naming: "path" }] }).pipe(Layer.provide([Discovery.layer.pipe(Layer.provide(platform)), platform]))
await Effect.runPromise(Effect.gen(function* () {
  const catalog = yield* Registry.Registry
  const entries = yield* catalog.list()
  assert.equal(entries.some(entry => entry.name === "spec/cycle"), true)
  assert.deepEqual((yield* catalog.warnings()).filter(warning => warning.path.includes("/spec/cycle/")), [])
}).pipe(Effect.provide(registry)))
const root = await mkdtemp(resolve(tmpdir(), "spec-real-triggers-"))
const config = resolve(root, "config.json")
await writeFile(config, "{}")
const output = []
const cli = createTriggersCli()
try {
  const run = async (args) => {
    let code = 0, text = ""
    await cli.serve([...args, "--root", root, "--json"], { exit: value => { code = value }, stdout: value => { text += value } })
    assert.equal(code, 0, text)
    output.push(JSON.parse(text))
  }
  await triggers("register", config, root, run)
  await triggers("list", config, root, run)
  const rows = output.at(-1)
  assert.deepEqual(rows.map(({ id, cron, enabled }) => ({ id, cron, enabled })).sort((a,b) => a.id.localeCompare(b.id)), [{ id: "spec-live", cron: "*/30 * * * *", enabled: true }, { id: "spec-sync", cron: "*/10 * * * *", enabled: true }])
  await triggers("remove", config, root, run)
  await triggers("list", config, root, run)
  assert.equal(output.at(-1).every(row => !row.enabled), true)
  console.log("Real local trigger CLI: register/list/disable/list passed")
} finally { await rm(root, { recursive: true, force: true }) }
