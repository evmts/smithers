import assert from "node:assert/strict"
import { test } from "node:test"
import { opensLauncher } from "./appHistory"

test("the default root opens the launcher without a press, and other pages stay pages", () => {
  for (const pathname of ["/", "/index.html"]) assert.equal(opensLauncher(pathname), true)
  for (const pathname of ["/docs/", "/smithersai/smithers/", "/demo", "//"]) assert.equal(opensLauncher(pathname), false)
})
