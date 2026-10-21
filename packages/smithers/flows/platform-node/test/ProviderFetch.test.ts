/**
 * `EgressHttpClient.providerFetch`: the `fetch` a Node model host passes to
 * `HostModel`. It speaks HTTP/1.1 to an origin that offers HTTP/2, where
 * Undici's default pool negotiates HTTP/2: a provider's edge that tears an
 * HTTP/2 session down left every later call failing `ERR_HTTP2_INVALID_SESSION`
 * until the process restarted (api.cerebras.ai, Node 26.10, 2026-10-20).
 *
 * The origin is a loopback TLS server offering `h2` and `http/1.1` through
 * ALPN, with a certificate `openssl` makes for the run; without `openssl` the
 * cases skip and say so. Nothing leaves the loopback interface.
 */
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createSecureServer, type Http2SecureServer } from "node:http2"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as EgressHttpClient from "../src/EgressHttpClient.ts"

/** A self-signed certificate for `localhost` and `127.0.0.1`, or the reason there is none. */
const certificate = (() => {
  const dir = mkdtempSync(join(tmpdir(), "provider-fetch-"))
  try {
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1",
      "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")
    ], { stdio: "ignore" })
    return { key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) }
  } catch {
    return undefined
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})()

/** A TLS origin offering HTTP/2 and HTTP/1.1, answering each request with the protocol it arrived on. */
const listen = async (cert: { readonly key: Buffer; readonly cert: Buffer }) => {
  const server: Http2SecureServer = createSecureServer({ ...cert, allowHTTP1: true }, (request, response) => {
    response.writeHead(200, { "content-type": "text/plain" })
    response.end(request.httpVersion)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  return {
    url: `https://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

const direct = { HTTPS_PROXY: "", HTTP_PROXY: "", NO_PROXY: "" }

describe.skipIf(certificate === undefined)("EgressHttpClient.providerFetch (needs openssl)", () => {
  it.effect("speaks HTTP/1.1 to an origin that offers HTTP/2, and answers its body", () =>
    Effect.scoped(Effect.gen(function*() {
      const origin = yield* Effect.acquireRelease(Effect.promise(() => listen(certificate!)), (o) => Effect.promise(o.close))
      const fetch = yield* EgressHttpClient.providerFetch(direct, { connect: { ca: certificate!.cert } })
      const answers = yield* Effect.promise(() =>
        Promise.all([1, 2, 3].map(async () => {
          const response = await fetch(origin.url, { method: "POST", body: JSON.stringify({ n: 1 }) })
          return [response.status, await response.text()]
        }))
      )
      expect(answers).toEqual([[200, "1.1"], [200, "1.1"], [200, "1.1"]])
    })))

  it.effect("where the egress pool's default negotiates HTTP/2 with the same origin", () =>
    Effect.scoped(Effect.gen(function*() {
      const origin = yield* Effect.acquireRelease(Effect.promise(() => listen(certificate!)), (o) => Effect.promise(o.close))
      const pool = yield* EgressHttpClient.dispatcher(direct, { connect: { ca: certificate!.cert } })
      const undici = yield* Effect.promise(async () => (await import("undici")).default ?? (await import("undici")))
      const text = yield* Effect.promise(async () =>
        (await undici.fetch(origin.url, { dispatcher: pool as never })).text()
      )
      expect(text).toBe("2.0")
    })))
})
