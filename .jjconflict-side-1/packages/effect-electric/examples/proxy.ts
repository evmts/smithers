/**
 * A shape proxy for one table, as a Web `fetch` handler: the shape a Worker
 * or any server that speaks `Request` and `Response` mounts at
 * `GET /api/shapes/items`.
 *
 * Electric's connection comes from `ELECTRIC_URL`, `ELECTRIC_SECRET` and
 * `ELECTRIC_SOURCE_ID`. Browsers read the whole of `items`: the proxy sets the
 * table and drops every parameter outside the Electric client's protocol.
 *
 * Run it with `node examples/proxy.ts`. It sends one `POST`, as a browser
 * trying to write through the shape would, and prints the proxy's answer:
 * 405, without calling Electric.
 */
import { ShapeProxy } from "@smthrs/effect-electric"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpEffect from "effect/http/HttpEffect"

/** The proxy's handler for `items`, with Electric's connection read from the environment. */
export const items = Effect.map(
  ShapeProxy.config({ url: "http://localhost:30001" }),
  (connection) =>
    HttpEffect.toWebHandler(
      ShapeProxy.make({ ...connection, shape: { table: "items" } }).pipe(Effect.provide(FetchHttpClient.layer))
    )
)

if (import.meta.main) {
  const handler = await Effect.runPromise(items)
  const response = await handler(new Request("http://localhost/api/shapes/items?offset=-1", { method: "POST" }))
  console.log(response.status, response.headers.get("allow"))
}
