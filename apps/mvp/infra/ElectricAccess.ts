// What the Electric gateway (infra/ElectricGateway.ts) lets through to Electric's container: `GET /v1/shape` carrying
// Electric's secret as a bearer token, compared in constant time.
//
// ChatApi sends the secret that way (`ELECTRIC_SECRET_AS=bearer`, which `bind` in infra/Electric.ts sets), never in
// the URL: Workers Logs' invocation logs and Workers Traces' `url.full` and `url.query` record a URL, and neither
// records an `authorization` header. The admitted request goes on without the header, so the Durable Object and the
// container never see the secret, and Electric runs without one of its own: its container has no way in but this
// gateway (docs/infrastructure.md).
import { Core } from "@smthrs/integrations"
import { Redacted } from "effect"
import { Headers, HttpServerRequest } from "effect/http"

/** The gateway's answer to one request: refused with a status before the container starts, or let through. */
export type Admission =
  | { readonly _tag: "Refused"; readonly status: 401 | 404 }
  | { readonly _tag: "Admitted"; readonly request: HttpServerRequest.HttpServerRequest }

const encoder = new TextEncoder()

/**
 * Admits `request` when it is `GET /v1/shape` with `authorization: Bearer <secret>`. Anything else is 404; a shape
 * request with a wrong or missing token is 401, the secret as a `secret` parameter included. The admitted request is
 * a new `GET` to the same URL with every header but `authorization`.
 */
export const admit = (request: HttpServerRequest.HttpServerRequest, secret: Redacted.Redacted<string>): Admission => {
  const url = new URL(request.originalUrl, "http://electric")
  if (request.method !== "GET" || url.pathname !== "/v1/shape") return { _tag: "Refused", status: 404 }
  const presented = encoder.encode(request.headers.authorization ?? "")
  const expected = encoder.encode(`Bearer ${Redacted.value(secret)}`)
  if (!Core.Signature.constantTimeEqual(presented, expected)) return { _tag: "Refused", status: 401 }
  const headers = Object.entries(Headers.remove(request.headers, "authorization"))
  return { _tag: "Admitted", request: HttpServerRequest.fromWeb(new Request(url, { method: "GET", headers })) }
}
