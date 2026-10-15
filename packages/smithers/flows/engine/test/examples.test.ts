import { expect, it } from "vitest"
import { runQuickstart } from "../examples/quickstart.ts"

it("joins a resubmitted execution id and refuses it for a different payload", async () => {
  expect(await runQuickstart()).toEqual({
    first: "app.js",
    second: "app.js",
    compiles: 1,
    conflictField: "payload"
  })
})
