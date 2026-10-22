import { Effect, Option } from "effect"
import { FetchHttpClient } from "effect/http"
import { expect, test } from "vitest"
import { renewed, renewalOf } from "./bearer"

const payload = Buffer.from(JSON.stringify({ run: "run", chain: ["parent", "issue/create"] })).toString("base64url")

test.each([payload + "x", payload + ".", ".signature", "!invalid.signature"])("malformed credential preserves shared forbidden status: %s", async (token) => {
  expect(renewalOf(token)).toEqual(Option.none())
  expect(await Effect.runPromise(Effect.result(renewed("http://127.0.0.1:1", token)).pipe(Effect.provide(FetchHttpClient.layer)))).toMatchObject({ _tag: "Failure", failure: { status: 403 } })
})

test("renewal routes by the last flow in a separated token", () => {
  expect(renewalOf(payload + ".signature")).toEqual(Option.some({ run: "run", flow: "issue/create" }))
})
