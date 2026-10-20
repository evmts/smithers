// The Electric gateway's access check (infra/ElectricAccess.ts) on Web requests as the gateway Worker receives them,
// with a sentinel secret that must reach no URL and no header past the gateway.
import { Redacted } from "effect"
import { HttpServerRequest } from "effect/http"
import { describe, expect, test } from "vitest"
import { admit } from "./ElectricAccess.ts"

const SENTINEL = "electric-secret-sentinel-5c1e"
const secret = Redacted.make(SENTINEL)
const GATEWAY = "https://electric-gateway.example.workers.dev"

const request = (path: string, init: RequestInit = {}) => HttpServerRequest.fromWeb(new Request(`${GATEWAY}${path}`, init))
const shape = "/v1/shape?table=messages&offset=-1&handle=h-1"

describe("admit", () => {
  test("lets a shape request with the secret as a bearer token through, without the token", () => {
    const admission = admit(
      request(shape, { headers: { authorization: `Bearer ${SENTINEL}`, accept: "application/json" } }),
      secret,
    )
    expect(admission._tag).toBe("Admitted")
    const forwarded = admission._tag === "Admitted" ? admission.request : undefined
    expect(forwarded?.originalUrl).toBe(`${GATEWAY}${shape}`)
    expect(forwarded?.method).toBe("GET")
    expect(forwarded?.headers).toEqual({ accept: "application/json" })
    expect(JSON.stringify([forwarded?.originalUrl, forwarded?.headers])).not.toContain(SENTINEL)
  })

  test("refuses a wrong, partial or missing token, and the secret in the URL, with 401", () => {
    const tokens: ReadonlyArray<Record<string, string>> = [
      { authorization: `Bearer ${SENTINEL.slice(0, -1)}x` },
      { authorization: `Bearer ${SENTINEL.slice(0, -1)}` },
      { authorization: `Bearer ${SENTINEL}x` },
      { authorization: SENTINEL },
      {},
    ]
    const refusals = tokens.map((headers) => admit(request(shape, { headers }), secret))
    refusals.push(admit(request(`${shape}&secret=${SENTINEL}`), secret))
    expect(refusals).toEqual(Array.from({ length: 6 }, () => ({ _tag: "Refused", status: 401 })))
  })

  test("refuses anything but GET /v1/shape with 404, before looking at the token", () => {
    const authorization = `Bearer ${SENTINEL}`
    expect(admit(request("/v1/health", { headers: { authorization } }), secret)).toEqual({
      _tag: "Refused",
      status: 404,
    })
    expect(admit(request(shape, { method: "DELETE", headers: { authorization } }), secret)).toEqual({
      _tag: "Refused",
      status: 404,
    })
  })
})
