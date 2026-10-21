import { FlowRuntime } from "@smthrs/flow"
import { EngineStore } from "@smthrs/flows"
import { type Cell, FlowBinding } from "@smthrs/harness"
import { Effect, Option, Schema } from "effect"
import { PROMPT_CALLABLE } from "../features/flows-ui/callable"
import { AUTHOR_TOOLS } from "../features/flows-ui/contract"
import { FlowPromptReference, FlowNewReference } from "../features/flows-ui/reference"
import { Ask } from "../features/status/flows"
import { declarationOf, modelInvocable } from "./declarations"
import { entryOf, FlowRegistry, type FlowName, names } from "./registry"

// The agent's catalog (decision 0003 §1, docs/features/flows.md#the-agents-catalog): the registry's model-invocable
// flows, which all run on this device, bound so a cell's `ctx.call("app/theme/set", { mode })` runs the very declaration a
// person's button dispatches, as a child execution on the same engine. The cell call is a journaled step of the
// agent's run, and the child's result is its receipt: the agent never reports a change before it.
//
// The catalog is scoped to the run whose agent asks for it (decision 0014 §2): `flow/new`'s drafting agent sees only
// reads, and an agent running a person's flow (`flow/run/prompt`) sees only the flows that revision lists, read from its
// own payload, which pinned them; a call to any other is refused as unknown. Every other agent sees the whole catalog.

/** The name the agent's catalog source carries. */
export const SOURCE = "app"

/**
 * The child execution a cell call runs: one per call, named by the call's replay-stable identity. Its session starts
 * with the answer's execution id, so `requesterOf` (src/flows/requests.ts) finds the tab that asked.
 */
export const childExecutionId = (identity: Cell.CallIdentity): string =>
  `${identity.session}/call/${identity.frame}.${identity.ordinal}`

/**
 * The person didn't approve a call that needs their approval (the registry's `confirm`): they denied it, or didn't
 * answer in time. The cell reads `NotApproved`; the flow never ran.
 */
export class NotApproved extends Schema.TaggedError<NotApproved>()("@smthrs/mvp/flows/NotApproved", {}) {}

/** The child execution that asks the person to approve a call before it runs: the call's own, then `/confirm`. */
export const confirmExecutionId = (identity: Cell.CallIdentity): string => `${childExecutionId(identity)}/confirm`

/** What a cell reads of a flow's failure: its kind, the last segment of its tag, never its message. */
export const publicError = (error: unknown): string =>
  typeof error === "object" && error !== null && "_tag" in error ? String(error._tag).split("/").at(-1)! : "failed"

/** The flows the agent may call: the model-invocable ones. */
export const agentFlows: ReadonlyArray<FlowName> = names.filter(modelInvocable)

/**
 * A flow as the agent's catalog describes it: its own description, then its side effect when it changes something
 * (the registry's `changes`), which the agent runs only when the person asked for that effect. A read says nothing
 * more. The slash menu and the drafting agent read the declaration's own description.
 */
export const catalogDescription = (name: FlowName, registered: Pick<FlowRegistry["Service"], "entryOf"> = { entryOf }): string => {
  // Every registered flow describes itself (src/flows/registry.test.ts), though `Flow.make` leaves it optional.
  const description = declarationOf(name).description as string
  const { changes } = registered.entryOf(name)
  return changes === undefined ? description : `${description} Side effect: ${changes}; only when the person asks for that.`
}

/** What a run's agent may call: every flow of the catalog, or only these. */
export type Scope = "all" | ReadonlyArray<string>

const PinnedList = Schema.Struct({ allowed: Schema.Array(Schema.String) })
const decodePinned = Schema.decodeUnknownOption(PinnedList)

/**
 * The scope of an agent in a run of `flow`: reads only while drafting, a person's flow's own list (`allowed`, from its
 * pinned payload) intersected with what a person's flow may call, and the whole catalog otherwise.
 */
export const scopeOf = (flow: string, allowed: ReadonlyArray<string> | undefined): Scope => {
  if (flow === FlowNewReference._tag) return AUTHOR_TOOLS
  if (flow === FlowPromptReference._tag) return (allowed ?? []).filter((name) => PROMPT_CALLABLE.includes(name as never))
  return "all"
}

/**
 * The scope of an agent in `flow`'s execution `executionId`, a person's flow's pinned list read with `pinned`: its
 * payload as the engine stored it. A list that can't be read is empty, so the agent then calls nothing.
 */
export const scopeFor = (
  flow: string,
  executionId: string,
  pinned: (executionId: string) => Effect.Effect<unknown, unknown>,
): Effect.Effect<Scope> =>
  flow === FlowPromptReference._tag
    ? pinned(executionId).pipe(
      Effect.map((payload) =>
        scopeOf(flow, Option.match(decodePinned(payload), { onNone: () => [], onSome: ({ allowed }) => allowed }))
      ),
      Effect.orElseSucceed(() => scopeOf(flow, [])),
    )
    : Effect.succeed(scopeOf(flow, undefined))

/**
 * The agent's catalog over this engine's `FlowRuntime`, scoped to the asking run (`scopeOf`). A flow's declared
 * failure reaches the cell as a failed call naming the failure's kind, never its message.
 */
export const source = Effect.gen(function* () {
  const registry = yield* FlowRegistry
  const runtime = yield* FlowRuntime.FlowRuntime
  const inspection = yield* EngineStore.RunInspection.RunInspection
  const pinned = (executionId: string) => Effect.map(inspection.payload(executionId), ({ payload }) => payload)
  const bindings = registry.names.filter(modelInvocable).map((name) => {
    const flow = declarationOf(name)
    return FlowBinding.make({
      flow: {
        name,
        description: catalogDescription(name, registry),
        input: flow.payloadSchema as unknown as Schema.Codec<unknown>,
        output: flow.successSchema as unknown as Schema.Codec<unknown>,
        capabilities: [],
        effects: undefined,
        modelInvocable: true,
      },
      handler: (input, call) => {
        const run = runtime.execute(flow as never, {
          executionId: childExecutionId(call.identity),
          payload: input as never,
        }) as Effect.Effect<unknown, unknown>
        // A flow the person must approve (the registry's `confirm`) runs only once they Approve; the question is a
        // child of the answer's run, as `app/agent/ask` is when the agent asks it.
        const { confirm } = registry.entryOf(name)
        return confirm === undefined ? run : Effect.flatMap(
          runtime.execute(Ask, {
            executionId: confirmExecutionId(call.identity),
            payload: { kind: "approval", prompt: confirm },
          }),
          (outcome): Effect.Effect<unknown, unknown> => (outcome.approved === true ? run : Effect.fail(new NotApproved())),
        )
      },
      publicError,
    })
  })
  return {
    name: SOURCE,
    // Outside a run, no agent asks: the whole catalog. Inside one, the asking run's scope.
    bindings: () =>
      Effect.flatMap(Effect.serviceOption(FlowRuntime.FlowInstance), (instance) =>
        Option.isNone(instance)
          ? Effect.succeed(bindings)
          : Effect.map(scopeFor(instance.value.flow._tag, instance.value.executionId, pinned), (scope) =>
            scope === "all" ? bindings : bindings.filter((binding) => scope.includes(binding.descriptor.name)))),
  } satisfies FlowBinding.Source
})
