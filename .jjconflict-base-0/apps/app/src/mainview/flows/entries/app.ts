/*
 * The `app` flows. One module per namespace: a lane that adds or edits a
 * flow here touches no other flow module, and Flows.ts registers each block in
 * the aggregator order.
 */
import { Schema } from "effect"
import type { FlowEntry,Namespace } from "../registry"
import type { CommandActions } from "./Declare"
import { flow } from "./Declare"

/** The `app` namespace row: the slash tree lists it in registry.ts NAMESPACES order. */
export const namespace: Namespace = { id: "app", label: "App", summary: "The Smithers app itself" }

/** The `app` flows registered as one aggregator block. */
export const appFlows = (actions: CommandActions): ReadonlyArray<FlowEntry> => [
  flow({ name: "app.hint.dismiss", hidden: true, summary: "Dismiss a hint", args: "<id>", input: Schema.Struct({ id: Schema.String }), handler: ({ id }) => actions.dismissHint(id) }),
  /*
   * The launcher's news read, again (M-45). A source that could not be read
   * offers exactly this and nothing else: the entries stay absent until a
   * read answers, and no entry is ever written here. The read is public and
   * carries no credential (state/seams/LauncherSeam.ts).
   */
  flow({ name: "app.updates", hidden: true, discloseToAgent: false, summary: "Read Smithers' published updates again",
    input: Schema.Struct({}), grammar: () => ({ payload: {} }),
    handler: async () => { await actions.launcher?.retry() } }),
]
