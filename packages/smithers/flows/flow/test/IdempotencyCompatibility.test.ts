import { expect } from "@effect/vitest"
import { Action, Flow, FlowRuntime } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Effect, Schema } from "effect"
import { effect } from "./Harness.ts"
import { makeInstance } from "./MemoryFlowRuntime.ts"

const Host = Flow.make("Compatibility/Host", {
  payload: {},
  success: Schema.Void,
  body: () => Node.succeed(undefined)
})

effect(
  "preserves persisted keys and ordinal allocation across parent and attempt scopes",
  () =>
    Effect.gen(function*() {
      // These bytes come from 0d66db742e1e. Keep one instance so changes to
      // allocation scopes are caught as well as changes to the key preimage.
      const cases = [
        { attempt: 1 },
        { attempt: 4 },
        { attempt: 4, includeAttempt: false },
        { attempt: 1, includeAttempt: true },
        { attempt: 4, includeAttempt: true },
        { attempt: 1, parentScope: "queue:parent", includeAttempt: true },
        { attempt: 4, parentScope: "queue:parent", includeAttempt: false },
        { attempt: 9, parentScope: "queue:parent" },
        { attempt: 1, parentScope: "", includeAttempt: true },
        { attempt: 4, parentScope: "", includeAttempt: true }
      ]
      const keys = yield* Effect.forEach(cases, ({ attempt, ...options }) =>
        Action.idempotencyKey("offer", options).pipe(
          Effect.provideService(Action.CurrentAttempt, attempt)
        ))
      expect(keys).toMatchInlineSnapshot(`
      [
        "key1_46459f0913948fba702b5a93294a9daf67472d56dc8be1305a17028728bf9cf6",
        "key1_06b520646e586aa1ef6d085809c25ea939eb3bf50eed4f59bf73d95b6f3b664d",
        "key1_cdfb1002889031aa8ab17f047ea0e0d085dc8915908749b97715263233c3bad3",
        "key1_98e445674e5138bf56694091d4be52fb3283f44a75e3207e85876dd164ed7a8a",
        "key1_85d49564c14c22f7ccd894a395277de3be436c6eb4f6e05a9d75cbec861e6a59",
        "key1_bdd5ee7bb8e34d8f09e67018e1feaf8a528c1dbfe76cf6f9939399ddf818f7f1",
        "key1_9c82c3b1e3c9ec1664b0108a347968fd7b4084e26de91081402f777f182eee64",
        "key1_50035e9119288c37d8bb801ce7bf1c341904173e7f9a97f82f9f59a346216536",
        "key1_23e12e16f9d381ab92635209c5eaf3723d8222cb0f83f58ce9f2f6ef85e9387e",
        "key1_d6df0a326284b4de8227a075671c0deb93fa0fae84d9d1741464c6936fb37064",
      ]
    `)
    }).pipe(Effect.provideService(FlowRuntime.FlowInstance, makeInstance(Host, "persisted-keys")))
)
