import assert from "node:assert/strict"
import { test } from "node:test"
import { auditCasts, checkCast } from "./cast-audit.mjs"

test("every repository's JSON person references belong to its cast", () => assert.ok(auditCasts() > 80))
test("release publisher and nested references reject a raw GitHub login", () => {
  for (const record of [{ author: "roninjin10" }, { comments: [{ author: "outsider" }] }, { reviewers: ["maya", "outsider"] }, { trigger: { by: "outsider" } }])
    assert.throws(() => checkCast(record, new Set(["maya"]), "releases.json"), /outside this repository's cast/)
})
test("repository namespaces and source quotations retain their original bytes", () => {
  checkCast({ owner: "smithers-canary" }, new Set(["maya"]), "repo.json")
  checkCast({ author: "maya", body: "Reported by @roninjin10", content: "const author = 'roninjin10'" }, new Set(["maya"]), "commits.json")
})
