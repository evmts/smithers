// A check job's egress (worker/branch/JobEgress.ts): `@smthrs/secrets`' own forwarder under the job's policy, the
// upstream scripted on the `fetch` seam Effect's fetch client takes as a service, as the SDK's egress tests do.
import { Egress } from "@smthrs/secrets"
import { Effect, Layer, Metric } from "effect"
import { FetchHttpClient, HttpServerRequest, HttpServerResponse } from "effect/http"
import { describe, expect, test } from "vitest"
import * as JobEgress from "./JobEgress.ts"

/** An upstream that answers every request with `body` and records each one it got. */
const upstream = (body: string) => {
  const got: Array<{ readonly method: string; readonly url: string }> = []
  const fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    got.push({ method: request.method, url: request.url })
    return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "application/json" } }))
  }) as typeof globalThis.fetch
  return { got, layer: Layer.provide(FetchHttpClient.layer, Layer.succeed(FetchHttpClient.Fetch, fetch)) }
}

/** A box's request through the job's egress, and what the box gets back. */
const through = async (request: Request, layer: ReturnType<typeof upstream>["layer"]) => {
  const { response, context } = await Effect.runPromise(
    Effect.all({ response: JobEgress.forward(HttpServerRequest.fromWeb(request)), context: Effect.context<never>() }).pipe(
      Effect.provide(layer),
    ),
  )
  const web = HttpServerResponse.toWeb(response, { context })
  return { status: web.status, body: await web.text() }
}

const forwarded = () =>
  Effect.runSync(Metric.value(Metric.withAttributes(JobEgress.requests, { outcome: "forwarded" }))).count

describe("a check job's egress", () => {
  test("forwards a package install's requests to the registry and to dprint's plugins, counted", async () => {
    const npm = upstream(`{"name":"effect"}`)
    const before = forwarded()
    expect(await through(new Request("https://registry.npmjs.org/effect"), npm.layer)).toEqual({ status: 200, body: `{"name":"effect"}` })
    expect(await through(new Request("https://plugins.dprint.dev/typescript-0.93.4.wasm"), npm.layer)).toMatchObject({ status: 200 })
    expect(npm.got).toEqual([
      { method: "GET", url: "https://registry.npmjs.org/effect" },
      { method: "GET", url: "https://plugins.dprint.dev/typescript-0.93.4.wasm" },
    ])
    expect(forwarded() - before).toBe(2)
  })

  test("refuses every other host before anything is sent: the box reaches nothing else", async () => {
    const elsewhere = upstream("never")
    for (const url of ["https://github.com/smithersai/smithers", "https://api.github.com/user", "https://registry.npmjs.org.evil.test/x"]) {
      expect((await through(new Request(url), elsewhere.layer)).status).toBe(403)
    }
    expect(elsewhere.got).toEqual([])
  })

  test("names no secret: the policy holds only the registry's hosts, and its vault reveals nothing", async () => {
    expect(JobEgress.POLICY).toEqual({ secrets: [], allow: ["registry.npmjs.org", "plugins.dprint.dev"] })
    const refused = await Effect.runPromise(
      Effect.flip(Effect.flatMap(Effect.service(Egress.Vault), (vault) => vault.reveal("NPM_TOKEN"))).pipe(Effect.provide(JobEgress.services)),
    )
    expect(refused).toBeInstanceOf(Egress.SecretUnavailable)
  })

  test("a job's commands trust the egress's CA in Node and in dprint", () => {
    expect(JobEgress.trustOf("/ca.crt")).toEqual({ NODE_EXTRA_CA_CERTS: "/ca.crt", DPRINT_CERT: "/ca.crt" })
  })

  test("a check job's machine is one whose branch says `kind: job`; a branch's own machine isn't", () => {
    const branch = { branchId: "b", owner: "o", name: "n", branch: "main" }
    expect(JobEgress.isJob({ ...branch, kind: "job" })).toBe(true)
    expect(JobEgress.isJob(branch)).toBe(false)
    expect(JobEgress.isJob(undefined)).toBe(false)
  })
})
