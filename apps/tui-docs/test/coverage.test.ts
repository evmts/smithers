import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { commands } from "../../tui/src/editor.ts"
import { registry } from "../../tui/src/keys.ts"
import { scenarioNames } from "../scripts/scenarios.mjs"
import { collectScripts } from "../scripts/scripts.mjs"
const scripts = fileURLToPath(new URL("../../tui/docs/", import.meta.url))
const learn = fileURLToPath(new URL("../../site/scripts/journeys/journeys.mjs", import.meta.url))
const ids = collectScripts(scripts)
for (const script of ids.values()) {
  const setup = script.steps.find((step: { kind: string }) => step.kind === "Use")
  if (setup) assert(scenarioNames.includes(setup.value), `Unknown fixture ${setup.value}`)
}
test("every recording is a valid script and every TUI GIF on smithers.sh has one", () => {
  assert(ids.size >= 35, `Only ${ids.size} recordings`)
  const used = [...readFileSync(learn, "utf8").matchAll(/\{ id: "([a-z0-9-]+)", detail: "Production TUI/g)].map((m) => m[1]!)
  assert(used.length > 0)
  for (const id of used) assert(ids.has(id), `smithers.sh uses recording ${id}, which has no script`)
})

test("command and keyboard references cover their complete runtime registries", () => {
  const reference = readFileSync(new URL("../../tui/README.md", import.meta.url), "utf8")
  for (const command of [...commands, { name: "exit" }]) {
    assert(reference.includes(`\`/${command.name}`), `Undocumented command ${command.name}`)
  }
  const documented = reference.toLowerCase()
  for (const binding of registry) {
    for (const key of binding.keys) {
      assert(documented.includes(key), `Undocumented key ${key} (${binding.id})`)
    }
  }
})
