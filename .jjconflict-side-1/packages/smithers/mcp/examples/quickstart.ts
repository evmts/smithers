/**
 * The quickstart from `docs/quickstart.md`: connect to a real MCP server over
 * stdio, call two of its tools, and read the flows projected from its catalog.
 *
 * Run it with `npx tsx examples/quickstart.ts` from the package directory.
 * `test/examples.test.ts` runs the same program and checks the output the
 * quickstart prints.
 *
 * @since 1.0.0-rc.7
 */
import { NodeServices } from "@effect/platform-node"
import * as McpClient from "@smthrs/mcp/McpClient"
import * as McpFlows from "@smthrs/mcp/McpFlows"
import { Effect } from "effect"
import { fileURLToPath } from "node:url"

/** The server this example spawns: `quickstart-server.mjs` beside this file. */
const serverPath = fileURLToPath(new URL("quickstart-server.mjs", import.meta.url))

/**
 * Connects, calls `word_count` and `explode`, and projects the catalog.
 * `Effect.scoped` owns the server process and ends it when the program ends.
 *
 * @since 1.0.0-rc.7
 */
export const program = Effect.scoped(Effect.gen(function*() {
  const client = yield* McpClient.connect({
    server: "quickstart",
    command: process.execPath,
    args: [serverPath]
  })

  const counted = yield* client.callTool("word_count", { text: "durable flows release notes" })
  const refused = yield* client.callTool("explode", {})

  const source = McpFlows.mcp(client)
  const bindings = yield* source.bindings()

  return {
    tools: client.tools.map((tool) => tool.name),
    counted,
    refused,
    sourceName: source.name,
    flowNames: bindings.map((binding) => binding.descriptor.name)
  }
})).pipe(Effect.provide(NodeServices.layer))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // eslint-disable-next-line no-console -- an example prints its result
  console.log(await Effect.runPromise(program))
}
