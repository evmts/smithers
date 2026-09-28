import * as Filegroup from "@smthrs/targets/Filegroup"
import * as Target from "@smthrs/targets/Target"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { runtimeInputs } from "../scripts/inputs.mjs"
import { providerFixture } from "../scripts/provider-fixture.mjs"
import { parseScripts } from "../scripts/scripts.mjs"
import { sourceFiles } from "../scripts/targets.ts"

test("the local monitor provider separates coordinator, evidence judge, and Luna requests", async (t) => {
  const cell = "console.log(await ctx.call(\"monitor.list\", {})); ctx.done(\"Monitor request settled.\");"
  const fixture = await providerFixture({ judge: true, coordinatorCell: cell })
  t.after(() => fixture.close())
  const invoke = async (body: unknown) => {
    const response = await fetch(fixture.env.SMITHERS_ACCOUNT_POOL_URL + "/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
    assert.equal(response.status, 200)
    const events = (await response.text()).split("\n").filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)))
    assert.equal(events.at(-1).type, "response.completed")
    return events[0].delta as string
  }
  assert.equal(await invoke({ instructions: "Act on the person's request", input: [] }), `\`\`\`cell\n${cell}\n\`\`\``)
  assert.equal(
    await invoke({ instructions: "Write one line telling the user the notable update", input: [] }),
    "Addition checks passed."
  )
  const judge = async (before: string, after: string) =>
    JSON.parse(
      await invoke({
        instructions: "Judge the supplied evidence against every question.",
        input: [{
          role: "user",
          content: [{
            text: JSON.stringify({
              state: { watching: "Check output changes", before, after },
              questions: { notable: { type: "boolean" } }
            })
          }]
        }]
      })
    )
  assert.equal((await judge("2 checks passed\n(exit 0)", "3 checks passed\n(exit 0)")).answers.notable.probability, .99)
  assert.equal((await judge("3 checks passed\n(exit 0)", "3 checks passed\n(exit 0)")).answers.notable.probability, .01)
  assert.deepEqual(fixture.requests.map((request: { kind: string }) => request.kind), [
    "coordinator",
    "luna",
    "monitor-judge",
    "monitor-judge"
  ])
})

test("recording and graph inputs include the shipped native runtime and every manifest artifact", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url))
  const prefix = "packages/smithers/vendor/opentui-native/"
  const manifest = JSON.parse(readFileSync(root + prefix + "manifest.json", "utf8")) as {
    targets: Record<string, { file: string }>
  }
  const expected = [
    "manifest.json",
    "runtime.bun.mjs",
    "runtime.node.mjs",
    "runtime.d.ts",
    "target.mjs",
    ...Object.entries(manifest.targets).flatMap(([target, artifact]) => [
      `${target}/index.bun.mjs`,
      `${target}/${artifact.file}`
    ])
  ].map((file) => prefix + file)
  const inputs = runtimeInputs()
  const graph = Filegroup.sources(Target.metadata(sourceFiles).attrs as Filegroup.Attrs)
  for (const file of expected) {
    assert(inputs.includes(file), `Recording digest omits native input ${file}`)
    assert(graph.some((source) => source._tag === "File" && source.path === file), `Target graph omits ${file}`)
    assert(readFileSync(root + file).length > 0, `Shipped native input is empty: ${file}`)
  }
  assert.equal(new Set(inputs).size, inputs.length, "Native inputs must remain deduplicated")
})
test("Markdown grammar rejects unsupported instructions and escaping recording IDs", () => {
  const source = "```tui-script addition\nType \"fix\"\nPress Enter\nWait for \"Fixed\"\nCapture \"done\"\n```"
  assert.equal(parseScripts(source)[0].steps.length, 4)
  assert.throws(() => parseScripts(source.replace("Press Enter", "Run rm -rf /")), /Invalid recording instruction/)
  assert.throws(() => parseScripts(source.replace("addition", "../elsewhere")), /Invalid recording id/)
  assert.throws(() => parseScripts(source.replace("Capture \"done\"\n", "")), /needs Capture/)
})

test("scripts distinguish durable answers from text and bound timing and setup", () => {
  const script = parseScripts(
    "```tui-script receipt\nUse \"basic\"\nWait for answer \"Ready.\"\nWait for worker \"review\" status \"done\"\nRestart\nCapture \"Recovered\"\n```"
  )[0]
  assert.equal(script.steps[1].kind, "Wait for answer")
  assert.equal(script.steps[2].subject, "worker")
  assert.throws(() => parseScripts("```tui-script wrong\nCapture \"x\"\nUse \"basic\"\n```"), /Use must be first/)
  assert.throws(
    () => parseScripts("```tui-script wrong\nWait 10001 ms\nCapture \"x\"\n```"),
    /Invalid recording instruction/
  )
  assert.throws(() => parseScripts("```tui-script wrong\nClick \"Run\"\nCapture \"x\"\n```"), /unsupported/)
  assert.throws(() => parseScripts("```browser-script wrong\nRestart\nCapture \"x\"\n```"), /unsupported/)
  assert.throws(
    () => parseScripts("```tui-script wrong\nExpect file \"../key\" contains \"x\"\nCapture \"x\"\n```"),
    /Invalid fixture path/
  )
})
