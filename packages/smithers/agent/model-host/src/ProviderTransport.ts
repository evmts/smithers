/**
 * The HTTP transport for calls that carry a model credential.
 *
 * Fetch follows redirects by default and strips only `Authorization` on a
 * cross-origin hop, so a custom key header such as `x-api-key` would ride a
 * provider's redirect to another origin. This transport never follows one: a
 * provider 3xx fails the call.
 *
 * @since 1.0.0
 */

import { Layer } from "effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import type * as HttpClient from "effect/http/HttpClient"

/**
 * Wraps a fetch so it never follows a redirect: a 3xx answer is refused, and
 * the call fails. `onRefused` is told the status of each refused 3xx, so a
 * caller can report it; a browser's opaque redirect has no status to tell.
 *
 * @category transport
 * @since 1.0.0
 */
export const refusingRedirects = (
  base: typeof globalThis.fetch,
  onRefused?: (status: number) => void
): typeof globalThis.fetch => {
  const guarded = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await base(input, { ...init, redirect: "manual" })
    // Browsers and Node answer a manual redirect as `opaqueredirect`; Workers
    // answer the 3xx itself and type `type` without that member, so it is read
    // as the plain string every runtime returns.
    const type: string = response.type
    const redirect = response.status >= 300 && response.status < 400
    if (type === "opaqueredirect" || redirect) {
      await response.body?.cancel()
      if (redirect) onRefused?.(response.status)
      throw new Error("model provider redirect refused")
    }
    return response
  }) as typeof globalThis.fetch
  return guarded
}

/**
 * An `HttpClient` for credentialed provider calls, over a fetch that refuses
 * redirects ({@link refusingRedirects}). `base` defaults to the runtime's
 * global fetch.
 *
 * @category transport
 * @since 1.0.0
 */
export const providerTransport = (
  base: typeof globalThis.fetch = globalThis.fetch,
  onRefused?: (status: number) => void
): Layer.Layer<HttpClient.HttpClient> =>
  FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, refusingRedirects(base, onRefused))))
