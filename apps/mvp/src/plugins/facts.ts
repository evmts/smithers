import { type Load, Manifest } from "@smthrs/plugin"
import { WAITS_ROW } from "../features/status/contract"
import { type Entry, registry } from "../flows/registry"
import { POINTS } from "./contract"

// What the loader checks a manifest against (decision 0017, "Checks beyond the schema"): the app's one flow catalog,
// the core's queries and each tier's cap. Every flow in the registry is the core's, so no plugin owns or replaces one:
// a system flow can't be overridden. A plugin borrows one through `uses`, and a person-only one (a `userOnlyReason`)
// runs only from the host's action strip, never from plugin code.

/** The fields of a flow's payload, when its schema is a struct: the keys a manifest's `args` may fill. */
const payloadOf = (entry: Entry) => {
  const fields = (entry.flow.payloadSchema as { readonly fields?: Readonly<Record<string, unknown>> }).fields
  return fields === undefined
    ? undefined
    : { type: "object", properties: Object.fromEntries(Object.keys(fields).map((key) => [key, {}])) }
}

/**
 * One registry entry as the loader sees it. A reference (the tab's view of a flow whose body only an engine imports)
 * declares no capabilities here; a built-in's use of one is trusted application code (decision 0017, "Compiled code is
 * trusted application code").
 */
export const factsOf = (entry: Entry): Load.FlowFacts => ({
  capabilities: (entry.flow as { readonly capabilities?: ReadonlyArray<string> }).capabilities ?? [],
  minimum: entry.slash?.minimum ?? "anyone",
  personOnly: entry.userOnlyReason !== undefined,
  system: true,
  ...withPayload(payloadOf(entry)),
})

const withPayload = (payload: ReturnType<typeof payloadOf>) => (payload === undefined ? {} : { payload: payload as never })

/** The host facts for `catalog`: the app's registry by default. */
export const hostFacts = (catalog: Readonly<Record<string, Entry>> = registry): Load.HostFacts => ({
  api: Manifest.PLUGIN_API,
  points: POINTS,
  catalog: new Map(Object.entries(catalog).map(([name, entry]) => [name, factsOf(entry)])),
  queries: new Map([["core/waits", WAITS_ROW as never]]),
  tierCap: { "built-in": () => true, repository: () => true, personal: () => true },
})
