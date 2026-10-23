import { generateKeyPairSync } from "node:crypto"
import { inspect } from "node:util"
import { Effect, Redacted } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { describe, expect, it } from "vitest"
import { installationToken, pushDelivery } from "./ciAuth"

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString()
const credentials = { appId: "123", privateKey: Redacted.make(pem) }

describe("CI's installation token", () => {
  it.each(["installation absent", "mint refused", "mint malformed"])("fails safely when %s through a faulty HTTP service", async (fault) => {
    const requests: Array<{ method: string; url: string; body: unknown }> = []
    const jwts: Array<string> = []
    // A faulty Effect HTTP service, never a patched fetch or an AppAuth replacement.
    const http = HttpClient.make((request) => Effect.sync(() => {
      const body = request.body._tag === "Uint8Array" ? JSON.parse(new TextDecoder().decode(request.body.body)) : undefined
      requests.push({ method: request.method, url: request.url, body })
      const jwt = request.headers.authorization!.replace("Bearer ", "")
      jwts.push(jwt)
      const discovery = request.method === "GET"
      const status = fault === "installation absent" ? 404 : discovery ? 200 : fault === "mint refused" ? 403 : 201
      const answer = discovery && status === 200 ? { id: 42 } : fault === "mint malformed" ? { token: "ghs_test_sentinel", expires_at: "invalid" } : { message: jwt }
      return HttpClientResponse.fromWeb(request, new Response(JSON.stringify(answer), { status }))
    }))
    const error = await Effect.runPromise(installationToken("acme/ci-tests", credentials).pipe(
      Effect.flip,
      Effect.provideService(HttpClient.HttpClient, http),
    ))
    expect(error.reason).toBe(fault === "mint malformed" ? "decode-failed" : "delivery-failed")
    expect(requests[0]).toEqual({ method: "GET", url: "https://api.github.com/repos/acme/ci-tests/installation", body: undefined })
    expect(requests).toHaveLength(fault === "installation absent" ? 1 : 2)
    if (fault !== "installation absent") {
      expect(requests[1]).toEqual({
        method: "POST", url: "https://api.github.com/app/installations/42/access_tokens",
        body: { repositories: ["ci-tests"], permissions: { contents: "write", statuses: "read" } },
      })
    }
    // These are the forms Playwright can put into errors and attachments. Never assert with the secret as expected.
    const diagnostic = `${String(error)}\n${inspect(error, { depth: null })}\n${JSON.stringify(error)}`
    expect([pem, "ghs_test_sentinel", ...jwts].some((secret) => diagnostic.includes(secret))).toBe(false)
    expect(jwts.every((jwt) => jwt.split(".").length === 3)).toBe(true)
  })
})

describe("the real push delivery", () => {
  const record = (annotations: Record<string, unknown> = {}, message = "ci.dispatch") => ({
    message, annotations: { repo: "acme/ci-tests", event: "push", sha: "commit", delivery: "delivery-1", ...annotations },
  })

  it("finds only this repository's push at the pushed SHA, ignoring other tail traffic", () => {
    const unrelated = [
      record({}, "ci.start"), record({ repo: "acme/other" }), record({ event: "pull_request" }),
      record({ sha: "other-commit" }), record({ delivery: undefined }), record({ delivery: 1 }), record({ delivery: "" }), {},
    ]
    expect(pushDelivery(unrelated, "acme/ci-tests", "commit")).toBeUndefined()
    expect(pushDelivery([...unrelated, record(), record()], "acme/ci-tests", "commit")).toBe("delivery-1")
    expect(pushDelivery([], "acme/ci-tests", "commit")).toBeUndefined()
  })
})
