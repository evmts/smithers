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
  it("records a GitHub request span with its failure class, never the token", async () => {
    fixture = await startFixture((_request, response) =>
      json(response, 429, { message: "boom" }, { "retry-after": "7" })
    )
    const client = gitHubClient({ token: "secret-token", apiBaseUrl: fixture.origin }, {})
    const spans = await traced(client.request("GET", "/repos/o/r"))
    const span = spans.find((candidate) => candidate.name === "GitHubClient.request")
    expect(span?.attributes.get("http.request.method")).toBe("GET")
    expect(span?.attributes.get("url.path")).toBe("/repos/o/r")
    expect(span?.attributes.get("http.response.status_code")).toBe(429)
    expect(span?.attributes.get("integration.retryable")).toBe(true)
    expect(span?.attributes.get("integration.rate_limited")).toBe(true)
    expect(span?.attributes.get("integration.retry_after_ms")).toBe(7_000)
    // One request, so one HTTP client span; it does not record the token.
    expect(spans.filter((candidate) => candidate.name === "GET")).toHaveLength(1)
    for (const candidate of spans) {
      expect(JSON.stringify([...candidate.attributes.entries()])).not.toContain("secret-token")
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
