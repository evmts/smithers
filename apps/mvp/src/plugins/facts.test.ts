// What the plugin host tells the loader (src/plugins/facts.ts): the app's registry as the one flow catalog, its core
// queries and its points.
import { Load } from "@smthrs/plugin"
import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import queue from "../../plugins/queue/plugin.json" with { type: "json" }
import { registry } from "../flows/registry"
import { POINTS } from "./contract"
import { factsOf, hostFacts } from "./facts"

const facts = hostFacts()

const load = (candidate: Load.Candidate, host: Load.HostFacts = facts) => Effect.runSync(Load.load(host, [candidate]))

describe("the host's facts", () => {
  test("every registry flow is the core's, with its minimum and whether only a person runs it", () => {
    expect(facts.catalog.size).toBe(Object.keys(registry).length)
    expect(facts.catalog.get("run/answer")).toMatchObject({ personOnly: true, system: true, capabilities: [] })
    expect(facts.catalog.get("app/navigate")).toMatchObject({ minimum: "anyone", personOnly: false })
    expect(facts.catalog.get("app/web/open")?.minimum).toBe("member")
    expect(Object.keys((facts.catalog.get("app/navigate")!.payload as { properties: object }).properties)).toEqual(["to"])
    expect(facts.points).toEqual(POINTS)
    for (const tier of ["built-in", "repository", "personal"] as const) expect(facts.tierCap[tier]("net:get")).toBe(true)
    expect([...facts.queries.keys()]).toEqual(["core/waits"])
  })

  test("a flow whose payload isn't a struct has no payload facts", () => {
    expect(factsOf({ flow: { ...registry["app/navigate"].flow, payloadSchema: {} } as never }).payload).toBeUndefined()
  })

  test("a declaration's own capabilities are its facts", () => {
    expect(factsOf({ flow: { ...registry["app/navigate"].flow, capabilities: ["net:get"] } as never }).capabilities).toEqual(["net:get"])
  })

  test("a host built over another catalog reads that one", () => {
    expect([...hostFacts({ "app/navigate": registry["app/navigate"] }).catalog.keys()]).toEqual(["app/navigate"])
  })

  test("the queue loads with nothing refused", () => {
    expect(load({ tier: "built-in", manifest: queue }).refused).toEqual([])
  })
})
