/**
 * Effect's fetch client, told never to follow a redirect on its own.
 *
 * `BrowserHost` and the engine host in `BrowserRuntime` both provide it, so
 * the capability kernel's guarded `HttpClient` decides every hop.
 *
 * @since 1.0.0
 */

import * as FetchHttpClient from "effect/http/FetchHttpClient"
import type { HttpClient } from "effect/http/HttpClient"
import * as Layer from "effect/Layer"

/**
 * Effect's fetch client with `redirect: "manual"`.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer: Layer.Layer<HttpClient> = Layer.provide(
  FetchHttpClient.layer,
  Layer.succeed(FetchHttpClient.RequestInit)({ redirect: "manual" })
)
