import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import { Cause, Effect, Layer, Option } from "effect"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import * as Command from "../src/Command.ts"
import * as FileRouter from "../src/FileRouter.ts"
import * as FlowInvoker from "../src/FlowInvoker.ts"
import * as Incur from "../src/Incur.ts"
import * as Route from "../src/Route.ts"

const root = fileURLToPath(new URL("./fixtures/hidden-runtime/flows", import.meta.url))

const platformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer)
const scan = () => Effect.runPromise(FileRouter.scan({ root }).pipe(Effect.provide(platformLayer)))

const invoked: Array<string> = []
const invoker = Layer.succeed(
  FlowInvoker.FlowInvoker,
  FlowInvoker.make({
    invoke: (invocation) =>
      Effect.sync(() => {
        invoked.push(invocation.name)
        return invocation.input
      })
  })
)

const errorOf = async (effect: Effect.Effect<unknown, unknown, FlowInvoker.FlowInvoker>): Promise<any> => {
  const exit = await Effect.runPromise(Effect.exit(Effect.provide(effect, invoker)))
  expect(exit._tag).toBe("Failure")
  if (exit._tag !== "Failure") throw new Error("expected failure")
  return Option.getOrThrow(Cause.findErrorOption(exit.cause))
}

describe("runtime model visibility", () => {
  it("refuses a flow hidden after its route metadata was captured", async () => {
    const [scanned] = (await scan()).routes
    expect(scanned?.modelInvocable).toBe(false)
    // Route metadata is caller-owned and can be stale: the author hid the flow
    // after a scan recorded it as visible.
    const stale = { ...scanned!, modelInvocable: true }

    const surface = await Effect.runPromise(Command.make([stale]))
    expect((await errorOf(surface.execute("hidden --number 1"))).code).toBe("load_failed")
    expect((await errorOf(surface.call("hidden", { number: 1 }))).code).toBe("load_failed")
    expect((await errorOf(surface.parse("hidden --number 1"))).code).toBe("load_failed")
    expect(invoked).toEqual([])
  })

  it("refuses the stale route over Incur HTTP dispatch", async () => {
    const [scanned] = (await scan()).routes
    const stale = { ...scanned!, modelInvocable: true }
    const cli = await Effect.runPromise(Effect.provide(Incur.createCli("app", [stale]), invoker))
    try {
      const response = await cli.fetch(new Request("http://localhost/hidden?number=1"))
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "load_failed" } })
      expect(invoked).toEqual([])
    } finally {
      await cli.close()
    }
  })

  it("still loads the hidden flow for a route that is not model-invocable", async () => {
    const [scanned] = (await scan()).routes
    const loaded = await Effect.runPromise(Route.load(scanned!))
    expect(loaded.name).toBe("hidden")
  })
})
