import { FlowRuntime } from "@smthrs/flow"
import { type Cell, FlowBinding } from "@smthrs/harness"
import { Effect, type Schema } from "effect"
import { declarationOf, modelInvocable } from "./declarations"
import { type FlowName, names, whereOf } from "./registry"

// The agent's catalog (decision 0003 §1, docs/features/flows.md#the-agents-catalog): the registry's model-invocable
// flows that run on this device, bound so a cell's `ctx.call("app/theme/set", { mode })` runs the very declaration a
// person's button dispatches, as a child execution on the same engine. The cell call is a journaled step of the
// agent's run, and the child's result is its receipt: the agent never reports a change before it.

/** The name the agent's catalog source carries. */
export const SOURCE = "app"

/** The child execution a cell call runs: one per call, named by the call's replay-stable identity. */
export const childExecutionId = (identity: Cell.CallIdentity): string =>
  `${identity.session}/call/${identity.frame}.${identity.ordinal}`

/** What a cell reads of a flow's failure: its kind, the last segment of its tag, never its message. */
export const publicError = (error: unknown): string =>
  typeof error === "object" && error !== null && "_tag" in error ? String(error._tag).split("/").at(-1)! : "failed"

/** The flows the agent may call: model-invocable, and run on this device. */
export const agentFlows: ReadonlyArray<FlowName> = names.filter((name) =>
  modelInvocable(name) && whereOf(name) === "client"
)

/**
 * The agent's catalog over this engine's `FlowRuntime`. A flow's declared failure reaches the cell as a failed call
 * naming the failure's kind, never its message.
 */
export const source = Effect.gen(function* () {
  const runtime = yield* FlowRuntime.FlowRuntime
  return FlowBinding.source(
    SOURCE,
    agentFlows.map((name) => {
      const flow = declarationOf(name)
      return FlowBinding.make({
        flow: {
          name,
          description: flow.description,
          input: flow.payloadSchema as unknown as Schema.Codec<unknown>,
          output: flow.successSchema as unknown as Schema.Codec<unknown>,
          capabilities: [],
          effects: undefined,
          modelInvocable: true,
        },
        handler: (input, call) =>
          runtime.execute(flow as never, {
            executionId: childExecutionId(call.identity),
            payload: input as never,
          }) as Effect.Effect<unknown, unknown>,
        publicError,
      })
    }),
  )
})
