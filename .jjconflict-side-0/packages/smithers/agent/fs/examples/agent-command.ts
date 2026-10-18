/**
 * Scan a flows tree, list its commands, and run one agent command string and
 * one HTTP request against the same routes.
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import { Effect, Layer } from "effect"
import { fileURLToPath } from "node:url"
import { Command, FileRouter, FlowInvoker, Incur } from "../src/index.ts"

/** The flows tree that ships beside this example. */
export const flowsRoot = fileURLToPath(new URL("./flows", import.meta.url))

const platform = Layer.merge(NodeFileSystem.layer, NodePath.layer)

// A host normally runs the flow durably. This boundary answers directly so the
// example shows only routing, decoding, and encoding.
const invoker = Layer.succeed(
  FlowInvoker.FlowInvoker,
  FlowInvoker.make({
    invoke: ({ input }) => Effect.succeed({ accepted: true, number: (input as { readonly number: number }).number })
  })
)

/** Lists the agent commands under `root` and executes `commandString`. */
export const runAgentCommand = (root: string, commandString: string) =>
  Effect.gen(function*() {
    const { routes } = yield* FileRouter.scan({ root })
    const commands = yield* Command.make(routes)
    const output = yield* commands.execute(commandString)
    return { listed: commands.list(), output }
  }).pipe(Effect.provide(invoker), Effect.provide(platform))

/** Serves the routes under `root` over HTTP for one request, then closes. */
export const fetchCommand = async (root: string, request: Request): Promise<unknown> => {
  const cli = await Effect.runPromise(
    Effect.gen(function*() {
      const { routes } = yield* FileRouter.scan({ root })
      return yield* Incur.createCli("flows", routes)
    }).pipe(Effect.provide(invoker), Effect.provide(platform))
  )
  try {
    return await (await cli.fetch(request)).json()
  } finally {
    await cli.close()
  }
}
