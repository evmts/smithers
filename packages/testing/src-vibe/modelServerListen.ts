// E-5 (D38) and E-7 (EK4402): the node:http listener. `createServer`, its
// event callbacks and the address read are Node platform work driven by
// callbacks, so the listener stays in TypeScript; ModelServer.vibe hands it
// the route and the fiber-set fork.
import { Effect } from "effect"
import type * as Scope from "effect/Scope"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import type { ModelServer, Options } from "./ModelServer.vibe"

type Route = (options: Options, request: IncomingMessage, response: ServerResponse) => Effect.Effect<void>

export const serve = (
  options: Options,
  fork: (handler: Effect.Effect<void>) => void,
  route: Route
): Effect.Effect<ModelServer, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.callback<ReturnType<typeof createServer>>((resume) => {
      const server = createServer((request, response) => fork(route(options, request, response)))
      const hostname = options.hostname ?? "127.0.0.1"
      server.once("error", (error) => resume(Effect.die(error)))
      server.listen(options.port ?? 0, hostname, () => resume(Effect.succeed(server)))
    }),
    (server) =>
      Effect.callback<void>((resume) => {
        server.closeAllConnections()
        server.close(() => resume(Effect.void))
      })
  ).pipe(Effect.map((server) => {
    const port = (server.address() as AddressInfo).port
    return { url: `http://${options.hostname ?? "127.0.0.1"}:${port}` }
  }))
