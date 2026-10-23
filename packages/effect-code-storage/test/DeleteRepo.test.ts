import { Effect, Layer, Redacted } from "effect"
import * as Base64Url from "effect/encoding/Base64Url"
import { FetchHttpClient } from "effect/http"
import * as Result from "effect/Result"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { beforeAll, describe, expect, test } from "vitest"
import { CodeStorage } from "../src/index.ts"
import { BASE, brokenBody, decodeClaims, httpClient, keyPair, longBody, ORG, telemetry } from "./fixtures.ts"

let pem: string
let publicKey: CryptoKey

beforeAll(async () => {
  ;({ pem, publicKey } = await keyPair())
})

describe("deleteRepo", () => {
  test("deletes through real HTTP, encoding one repository segment with only repo:write", async () => {
    const repo = "scratch/o/space #?%雪"
    const repos = new Set([repo, "keep"])
    const recorded = telemetry()
    let calls = 0
    let requestError: unknown
    // A local contract server exercises the real FetchHttpClient and verifies the ES256 signature.
    // It implements the documented 200 acceptance response; no production organization is contacted.
    const server = createServer(async (request, response) => {
      calls++
      try {
        expect(request.method).toBe("DELETE")
        expect(request.url).toBe(`/api/repos/${encodeURIComponent(repo)}`)
        const token = request.headers.authorization!.slice("Bearer ".length)
        const [header, payload, signature] = token.split(".")
        expect(
          await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            publicKey,
            new Uint8Array(Result.getOrThrow(Base64Url.decode(signature!))),
            new TextEncoder().encode(`${header}.${payload}`)
          )
        ).toBe(true)
        const claims = decodeClaims(token)
        expect(claims).toEqual({
          iss: ORG,
          sub: "@smthrs/effect-code-storage",
          repo,
          scopes: ["repo:write"],
          iat: expect.any(Number),
          exp: expect.any(Number)
        })
        expect(claims.exp - claims.iat).toBe(300)
        expect(recorded.recorded()).not.toContain(token)
        let body = ""
        for await (const chunk of request) body += chunk
        expect(body).toBe("")
        expect(repos.delete(decodeURIComponent(request.url!.slice("/api/repos/".length)))).toBe(true)
        response.writeHead(200, { "content-type": "application/json" })
        response.end(JSON.stringify({ repo_name: repo, message: "Deletion initiated; cleanup is asynchronous." }))
      } catch (error) {
        response.writeHead(500)
        response.end()
        requestError = error
      }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const { port } = server.address() as AddressInfo
    const layer = CodeStorage.CodeStorage.layer({
      org: ORG,
      key: Redacted.make(pem),
      apiUrl: `http://127.0.0.1:${port}`
    }).pipe(Layer.provide(FetchHttpClient.layer))
    try {
      expect(
        await Effect.runPromise(recorded.provide(
          CodeStorage.CodeStorage.use((client) => client.deleteRepo(repo)).pipe(Effect.provide(layer))
        ))
      ).toBeUndefined()
      expect([...repos]).toEqual(["keep"])
      expect(requestError).toBeUndefined()
      expect(calls).toBe(1)
      expect(recorded.spans.filter((span) => span.name === "CodeStorage.deleteRepo")).toHaveLength(1)
      expect(recorded.count(CodeStorage.requests, { operation: "deleteRepo", outcome: "ok" })).toBe(1)
      expect(recorded.recorded()).not.toContain(pem)
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })

  const faulty = (answer: Response | "transport") => {
    const recorded = telemetry()
    let calls = 0
    const layer = CodeStorage.CodeStorage.layer({ org: ORG, key: Redacted.make(pem) }).pipe(
      Layer.provide(httpClient(async (input, init) => {
        calls++
        const request = input instanceof Request ? input : new Request(input, init)
        expect(request.method).toBe("DELETE")
        expect(request.url).toBe(`${BASE}/api/repos/scratch%2Fo%2Fn`)
        expect(decodeClaims(request.headers.get("authorization")!.slice(7))).toMatchObject({
          repo: "scratch/o/n",
          scopes: ["repo:write"]
        })
        if (answer === "transport") throw new TypeError("connection lost; deletion may have been accepted")
        return answer
      }))
    )
    const fail = () =>
      Effect.runPromise(recorded.provide(
        CodeStorage.CodeStorage.use((client) => Effect.flip(client.deleteRepo("scratch/o/n"))).pipe(
          Effect.provide(layer)
        )
      ))
    return { ...recorded, fail, calls: () => calls }
  }

  test.each([
    [404, "not_found", false],
    [404, "repository_not_found", false],
    [404, "route_not_found", false],
    [409, "repository_deleted", false],
    [401, "unauthorized", false],
    [403, "insufficient_scope", false],
    [409, "sync_in_progress", true],
    [429, "rate_limited", true],
    [503, "service_unavailable", true]
  ])("preserves HTTP %i %s as a typed error, without retrying", async (status, code, transient) => {
    const detail = "private provider detail"
    const body = JSON.stringify({ code, detail })
    const h = faulty(new Response(body, { status, headers: { "retry-after": "7" } }))
    const error = await h.fail()
    expect(error).toBeInstanceOf(CodeStorage.CodeStorageError)
    expect(error).toMatchObject({ operation: "deleteRepo", code, status, retryAfterMillis: 7000 })
    expect(CodeStorage.isTransient(error)).toBe(transient)
    expect(h.calls()).toBe(1)
    expect(h.count(CodeStorage.requests, { operation: "deleteRepo", outcome: code })).toBe(1)
    expect(h.count(CodeStorage.requests, { operation: "deleteRepo", outcome: "ok" })).toBe(0)
    expect(h.count(CodeStorage.bytesRead, { operation: "deleteRepo" })).toBe(new TextEncoder().encode(body).length)
    expect(h.recorded()).not.toContain(detail)
    expect(error.message).not.toContain(detail)
  })

  test("a lost response is transport, with one failed count and no automatic retry", async () => {
    const h = faulty("transport")
    const error = await h.fail()
    expect(error).toMatchObject({ operation: "deleteRepo", code: "transport" })
    expect(error.status).toBeUndefined()
    expect(h.calls()).toBe(1)
    expect(h.count(CodeStorage.requests, { operation: "deleteRepo", outcome: "transport" })).toBe(1)
  })

  test("bounds an oversized error body to 16 KiB and falls back to the status code", async () => {
    const h = faulty(new Response(longBody(32 * 1024, 1024), { status: 403 }))
    expect(await h.fail()).toMatchObject({ operation: "deleteRepo", code: "forbidden", status: 403 })
    expect(h.count(CodeStorage.bytesRead, { operation: "deleteRepo" })).toBeLessThanOrEqual(17 * 1024)
  })

  test("a broken error body preserves its HTTP status", async () => {
    const h = faulty(new Response(brokenBody("{\"code\":"), { status: 500 }))
    expect(await h.fail()).toMatchObject({ operation: "deleteRepo", code: "internal_error", status: 500 })
  })
})
