/** The npm CLI's platform contract is separate from the planned Mac host. */
import { readFileSync } from "node:fs"
import { test } from "node:test"
import assert from "node:assert/strict"
const root = new URL("../../../", import.meta.url)
test("installation states the npm engine and keeps Mac requirements under the planned host", () => {
  const cli = JSON.parse(readFileSync(new URL("packages/smithers/package.json", root), "utf8"))
  const doc = readFileSync(new URL("apps/site/docs/installation.mdx", root), "utf8")
  const section = doc.split("## Install the CLI\n")[1]?.split("\n## ")[0]
  assert.ok(section, "The npm CLI has its own install section")
  assert.ok(section.includes(`Node.js ${cli.engines.node.slice(2)} or later`))
  assert.match(section, /npm i -g smthrs@next/)
  assert.equal(cli.os, undefined)
  assert.match(section, /no operating-system restriction/)
  assert.doesNotMatch(section, /macOS 15|Apple Silicon/)
  assert.match(doc, /Mac requirements below apply to the planned self-hosted app/)
})
