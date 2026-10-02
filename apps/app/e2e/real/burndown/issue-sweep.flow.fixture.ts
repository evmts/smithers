// Synthetic finite browser subject: real engine journal, no issue automation.
// The DTOs below are fixture data for the existing reader, not a pattern implementation.
import { Action, Flow } from "@smthrs/flow"
import * as Node from "@smthrs/plan/Node"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

const Input = Schema.Struct({
  repo: Schema.String,
  maxAgents: Schema.optional(Schema.Number),
  placement: Schema.optional(Schema.Literal("local"))
})
const Round = Schema.Struct({ input: Input, round: Schema.Number })
const Item = Schema.Struct({ id: Schema.String, number: Schema.Number, title: Schema.String })
const Row = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["landed", "held", "failed", "skipped"]),
  detail: Schema.String
})
const RoundResult = Schema.Struct({ rows: Schema.Array(Row), launched: Schema.Number, deferred: Schema.Number })
const Result = Schema.Struct({ rows: Schema.Array(Row), rounds: Schema.Number, stopped: Schema.Literal("drained") })
const Accounts = Action.make("issue-sweep/accounts", {
  payload: Round,
  success: Schema.Struct({ _tag: Schema.Literal("Available"), slots: Schema.Number }),
  nondeterministic: true
})
const List = Action.make("issue-sweep/list-issues", {
  payload: Round, success: Schema.Array(Item), nondeterministic: true
})
const Dispatch = Action.make("issue-sweep/dispatch", {
  payload: Schema.Struct({
    input: Input, round: Schema.Number, items: Schema.Array(Item), slots: Schema.Number,
    settled: Schema.Array(Schema.String), rows: Schema.Array(Row)
  }),
  success: RoundResult,
  nondeterministic: true
})

export default Flow.make("issue-sweep", {
  description: "Synthetic browser journal subject; performs no issue automation.",
  capabilities: [],
  effects: { reads: [], writes: [], mode: "expected", onConflict: "serialize", tier: "compensable" },
  modelInvocable: false,
  payload: Input, success: Result,
  body: (input) => Accounts.call({ input, round: 0 }).pipe(
    Node.bindPlanned((capacity) => List.call({ input, round: 0 }).pipe(
      Node.bindPlanned((items) => Dispatch.call({
        input, round: 0, items, slots: capacity.slots, settled: [], rows: []
      }))
    )),
    Node.map(Node.capture({ version: "synthetic-burndown-reader/v1" }, (result: typeof RoundResult.Type) => ({
      rows: result.rows, rounds: 1, stopped: "drained" as const
    })))
  )
})

export const layer = Layer.mergeAll(
  Accounts.toLayer(() => Effect.succeed({ _tag: "Available" as const, slots: 2 })),
  List.toLayer(() => Effect.succeed([
    { id: "101", number: 101, title: "Synthetic landed item" },
    { id: "102", number: 102, title: "Synthetic held item" },
    { id: "103", number: 103, title: "Synthetic failed item" },
    { id: "104", number: 104, title: "Synthetic skipped item" }
  ])),
  Dispatch.toLayer(() => Effect.succeed({
    rows: [
      { id: "101", status: "landed" as const, detail: "Synthetic success" },
      { id: "102", status: "held" as const, detail: "Synthetic other owner" },
      { id: "103", status: "failed" as const, detail: "Synthetic diagnostic <em data-fixture-marker>private</em>\nsecond line" },
      { id: "104", status: "skipped" as const, detail: "Synthetic excluded item" }
    ],
    launched: 0, deferred: 0
  }))
)
