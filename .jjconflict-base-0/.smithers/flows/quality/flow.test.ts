import { Graph } from "@smthrs/flow"
import assert from "node:assert/strict"
import { test } from "node:test"
import Quality from "./flow.ts"

test("quality plans the versioned read-only import action with stable callback identity", () => {
  const graph = Graph.build(Quality, {}, { callbackIdentity: "stable" })
  const encoded = JSON.stringify(graph)
  assert.match(encoded, /quality\/run/)
  assert.match(encoded, /quality\/v1/)
  assert.doesNotMatch(encoded, /GITHUB_TOKEN|Bearer/)
})
