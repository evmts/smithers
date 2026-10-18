/** Validate the committed home after the same markdown resolution the API performs. */
import { readFileSync } from "node:fs"
import { test } from "node:test"
import assert from "node:assert/strict"
import { RepositoryHomeBlockSchema } from "../../../packages/rpc/src/RepositoryHome.ts"

const root = new URL("../../../", import.meta.url)
const home = JSON.parse(readFileSync(new URL(".smithers/home.json", root), "utf8"))
test("Smithers home projects the visitor blocks before member apps", () => {
  assert.deepEqual(home.blocks.slice(0, 3).map(block => block.type), ["prompt", "links", "markdown"])
  assert.equal(home.blocks[0].placeholder, "Ask Smithers")
  assert.deepEqual(home.blocks[1].links, [
    { label: "Docs", url: "https://smithers.sh/docs/installation/" },
    { label: "Report a bug", url: "https://github.com/smithersai/smithers/issues/new/choose" },
    { label: "Source on GitHub", url: "https://github.com/smithersai/smithers" }
  ])
  for (const block of home.blocks) {
    RepositoryHomeBlockSchema.parse(block.type === "markdown"
      ? { ...block, markdown: readFileSync(new URL(block.path, root), "utf8") }
      : block)
  }
})
