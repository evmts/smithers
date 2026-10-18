/*
 * The `change` flows. One module per namespace: a lane that adds or edits a
 * flow here touches no other flow module, and Flows.ts registers each block in
 * the aggregator order.
 */
import { Schema } from "effect"
import { flow } from "./Declare"
import type { FlowEntry, Namespace } from "../registry"
import type { CommandActions } from "./Declare"

/** The `change` namespace row: the slash tree lists it in registry.ts NAMESPACES order. */
export const namespace: Namespace = { id: "change", label: "Changes", summary: "Changes and diffs — the change is the unit (ADR 0003)" }

/** The `change` flows registered as one aggregator block. */
export const changeFlows = (actions: CommandActions): ReadonlyArray<FlowEntry> => [
  flow({ name: "change.ask", slash: "/change", aliases: ["change"], cli: null, journey: [], group: "Ask", visibility: "core", actors: ["person", "app_agent"], minimumRole: "member", http: null,
    unavailable: () => actions.hostedChangeGate(),
    preflight: input => actions.hostedChangeGate(input.repo),
    summary: "Start an agent on a change", args: "<request>", agent: "confirm",
    input: Schema.Struct({ repo: Schema.optional(Schema.NonEmptyString), request: Schema.NonEmptyString }),
    grammar: args => { if (args?.trim().startsWith("{")) { try { return { payload: JSON.parse(args) } } catch { return { error: "Invalid change request" } } } return { payload: args?.trim() ? { request: args.trim() } : {} } },
    form: { submitLabel: "Start agent", fields: { repo: { hidden: true }, request: { label: "Change request", kind: "textarea" } }, args: payload => JSON.stringify(payload) },
    confirm: payload => `start an agent on ${payload.repo ?? "this repository"}`,
    confirmArgs: payload => JSON.stringify(payload),
    handler: input => actions.askHostedChange(input) }),
  flow({ name: "change.open-pull", slash: null, cli: null, journey: [], group: "Ask", visibility: "in-card", actors: ["person", "app_agent"], minimumRole: "member", http: null,
    summary: "Open pull request", agent: "confirm", args: "<repo> <session>",
    input: Schema.Struct({ repo: Schema.NonEmptyString, session: Schema.NonEmptyString }),
    grammar: args => { try { return { payload: JSON.parse(args ?? "{}") } } catch { return { payload: {} } } },
    confirm: "open this pull request", confirmArgs: payload => JSON.stringify(payload),
    handler: input => actions.openHostedPull(input) }),
  flow({
    name: "change.resolve",
    summary: "Dispatch an agent to resolve a change's conflict",
    runtime: ["cloud"],
    confirm: "dispatch an agent to resolve the conflict",
    args: "<changeId> <path>",
    requires: ["signed-in"],
    input: Schema.Struct({ changeId: Schema.String, path: Schema.String }),
    handler: ({ changeId, path }) => actions.resolveChangeConflict(changeId, path)
  }),
  flow({
    /* The card's body tab: showing a facet is how the agent answers "show me the diff / the checks" (.specs/engineering/spec.md §6.1). */
    name: "change.facet",
    summary: "Switch a change card's facet",
    runtime: ["cloud"],
    args: "<changeId> <facet>",
    requires: ["signed-in"],
    input: Schema.Struct({
      changeId: Schema.String,
      facet: Schema.Literals(["walkthrough", "diff", "findings", "checks", "review", "history", "owners"])
    }),
    handler: ({ changeId, facet }) => actions.setChangeFacet(changeId, facet)
  }),
]
