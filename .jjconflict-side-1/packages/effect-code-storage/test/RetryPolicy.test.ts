import { RetryPolicy } from "@smthrs/flow"
import { Effect, Layer, Redacted } from "effect"
import { beforeAll, expect, test } from "vitest"
import { CodeStorage } from "../src/index.ts"
import { codeStorage, httpClient, keyPair, ORG } from "./fixtures.ts"

let pem: string
let publicKey: CryptoKey

beforeAll(async () => {
  ;({ pem, publicKey } = await keyPair())
})

test("a durable flow's RetryPolicy waits a rate limit's Retry-After instead of its own backoff", async () => {
  const service = codeStorage(publicKey)
  service.faults.push(Response.json({ code: "rate_limited" }, { status: 429, headers: { "retry-after": "7" } }))
  const error = await Effect.runPromise(
    Effect.flip(CodeStorage.CodeStorage.use((client) => client.listFiles("r"))).pipe(
      Effect.provide(
        CodeStorage.CodeStorage.layer({ org: ORG, key: Redacted.make(pem) }).pipe(
          Layer.provide(httpClient(service.fetch))
        )
      )
    )
  )
  const policy = RetryPolicy.make({ initialMs: 100, factor: 2, maxMs: 60_000 })
  // The engine hands an action's failure to `decide` and sleeps the delay it returns.
  expect(RetryPolicy.decide(policy, { attempt: 1, error })).toEqual({ _tag: "RetryAfter", delayMs: 7_000 })
  // Without a Retry-After, the policy's own backoff applies.
  const unhinted = new CodeStorage.CodeStorageError({ operation: "listFiles", code: "rate_limited", status: 429 })
  expect(RetryPolicy.decide(policy, { attempt: 1, error: unhinted })).toEqual({ _tag: "RetryAfter", delayMs: 100 })
})
