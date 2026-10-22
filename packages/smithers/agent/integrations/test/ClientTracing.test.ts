import { Effect, Tracer } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { type Fixture, json, startFixture } from "./Fixture.ts"
import { gitHubClient } from "./Http.ts"

let fixture: Fixture | undefined

afterEach(async () => {
  await fixture?.close()
  fixture = undefined
})

const traced = async <A, E>(effect: Effect.Effect<A, E>) => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  await Effect.runPromise(Effect.exit(effect.pipe(Effect.provideService(Tracer.Tracer, tracer))))
  return spans
}

describe("client tracing", () => {
  it("records both retry permission and the unknown write outcome", async () => {
    fixture = await startFixture((_request, response) => json(response, 502, {}))
    const client = gitHubClient({ token: "secret-token", apiBaseUrl: fixture.origin }, {})
    const spans = await traced(client.request("POST", "/x", {}, { retryUnsafeWrites: true }))
    const span = spans.find((candidate) => candidate.name === "GitHubClient.request")
    expect(span?.attributes.get("integration.retryable")).toBe(true)
    expect(span?.attributes.get("integration.outcome_unknown")).toBe(true)
    expect(fixture.requests).toHaveLength(1)
    expect(JSON.stringify(spans.map((candidate) => [...candidate.attributes.entries()]))).not.toContain("secret-token")
  })

  it("records a GitHub request span with its failure class, never the token", async () => {
    fixture = await startFixture((_request, response) =>
      json(response, 429, { message: "boom" }, { "retry-after": "7" })
    )
    const client = gitHubClient({ token: "secret-token", apiBaseUrl: fixture.origin }, {})
    const spans = await traced(client.request("GET", "/repos/o/r"))
    const span = spans.find((candidate) => candidate.name === "GitHubClient.request")
    expect(span?.attributes.get("http.request.method")).toBe("GET")
    expect(span?.attributes.has("url.path")).toBe(false)
    expect(span?.attributes.get("http.response.status_code")).toBe(429)
    expect(span?.attributes.get("integration.retryable")).toBe(true)
    expect(span?.attributes.get("integration.rate_limited")).toBe(true)
    expect(span?.attributes.get("integration.retry_after_ms")).toBe(7_000)
    // The GitHub span replaces the transport span, which exposes raw URLs.
    expect(spans.filter((candidate) => candidate.name === "GET")).toHaveLength(0)
    for (const candidate of spans) {
      expect(JSON.stringify([...candidate.attributes.entries()])).not.toContain("secret-token")
    }
  })

  it.each(["request", "paginate", "count"] as const)("keeps caller URL content out of %s spans", async (operation) => {
    fixture = await startFixture((_request, response) => json(response, 200, []))
    const client = gitHubClient({ token: "secret-token", apiBaseUrl: fixture.origin }, {})
    const path = "/repos/private-owner/private-repo/contents/private-document/secret-token?q=private-query"
    const spans = await traced(operation === "request" ? client.request("GET", path) : client[operation](path))
    expect(fixture.requests).toHaveLength(1)
    expect(spans.some((span) => span.name === `GitHubClient.${operation}`)).toBe(true)
    const attributes = JSON.stringify(spans.map((span) => [...span.attributes.entries()]))
    for (const content of ["private-owner", "private-repo", "private-document", "secret-token", "private-query"]) {
      expect(attributes).not.toContain(content)
    }
  })

  // Trace headers would hand our trace ids to GitHub, and a browser preflight
  // to api.github.com fails on them.
  it("sends no trace propagation headers", async () => {
    fixture = await startFixture((_request, response) => json(response, 200, {}))
    await traced(gitHubClient({ token: "t", apiBaseUrl: fixture.origin }, {}).request("GET", "/x"))
    expect(fixture.requests).toHaveLength(1)
    expect(fixture.requests[0]?.headers["traceparent"]).toBeUndefined()
    expect(fixture.requests[0]?.headers["b3"]).toBeUndefined()
  })
})
