import { Effect } from "effect"
import { expect, test } from "vitest"
import { BROWSER_TELEMETRY, EXPORTED_SPANS, WITHHELD } from "./telemetry"
import { relay } from "./test/relay"

test("the real relay removes sensitive values from HTTP URL fields", async () => {
  const secret = "private-session-credential"
  const attributes = Object.entries({
    "url.full": `https://person:${secret}@example.com/api/${secret}?token=${secret}#${secret}`,
    "url.query": `token=${secret}`,
  }).map(([key, stringValue]) => ({ key, value: { stringValue } }))
  const lines = await Effect.runPromise(relay([{
    path: "/v1/traces",
    body: JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans: [{
      name: "GET", traceId: "a".repeat(32), spanId: "b".repeat(16),
      startTimeUnixNano: "1000000", endTimeUnixNano: "2000000", attributes,
    }] }] }] }),
  }], BROWSER_TELEMETRY))
  expect(lines).toHaveLength(1)
  expect(JSON.stringify(lines)).not.toContain(secret)
  expect(lines[0]!.name).toBe("GET")
})

test("exported spans are exactly the permitted records minus the withheld intersection", () => {
  const withheld = new Set<string>(WITHHELD.spans)
  expect(EXPORTED_SPANS).toEqual(BROWSER_TELEMETRY.records.filter((name) => !withheld.has(name)))
  expect(EXPORTED_SPANS.length).toBe(BROWSER_TELEMETRY.records.length - BROWSER_TELEMETRY.records.filter((name) => withheld.has(name)).length)
})
