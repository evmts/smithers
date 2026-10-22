import { describe, expect, it } from "@effect/vitest"
import { split as splitBytes } from "../src/internal/split.ts"

const split = (body: unknown, maxBytes: number, maxRecords: number) =>
  splitBytes(new TextEncoder().encode(JSON.stringify(body)), maxBytes, maxRecords)

const decode = (bytes: Uint8Array): any => JSON.parse(new TextDecoder().decode(bytes))

const traces = {
  resourceSpans: [
    {
      resource: { attributes: [{ key: "service.name", value: { stringValue: "a" } }] },
      scopeSpans: [
        { scope: { name: "one" }, spans: [{ name: "a1" }, { name: "a2" }] },
        { scope: { name: "two" }, spans: [{ name: "a3" }] }
      ]
    },
    { resource: { attributes: [] }, scopeSpans: [{ scope: { name: "three" }, spans: [{ name: "b1" }] }] }
  ]
}

describe("split", () => {
  it("keeps every span with its own resource and scope across requests", () => {
    const { requests, oversized } = split(traces, 1024, 2)
    expect(oversized).toBe(0)
    const bodies = requests.map(decode)
    expect(bodies.map((body) => body.resourceSpans.length)).toEqual([1, 2])
    expect(bodies[0].resourceSpans[0].scopeSpans).toEqual([traces.resourceSpans[0]!.scopeSpans[0]])
    expect(bodies[1].resourceSpans[0].scopeSpans).toEqual([traces.resourceSpans[0]!.scopeSpans[1]])
    expect(bodies[1].resourceSpans[1]).toEqual(traces.resourceSpans[1])
  })

  it("answers one request, as it was, under both limits", () => {
    expect(split(traces, 1024, 10).requests.map(decode)).toEqual([traces])
  })

  it("splits a metric's points, keeping its other fields", () => {
    const metrics = {
      resourceMetrics: [{
        resource: {},
        scopeMetrics: [{
          scope: {},
          metrics: [{ name: "h", histogram: { dataPoints: [{ n: 1 }, { n: 2 }, { n: 3 }], aggregationTemporality: 2 } }]
        }]
      }]
    }
    const bodies = split(metrics, 4096, 2).requests.map(decode)
    expect(bodies.map((body) => body.resourceMetrics[0].scopeMetrics[0].metrics)).toEqual([
      [{ name: "h", histogram: { dataPoints: [{ n: 1 }, { n: 2 }], aggregationTemporality: 2 } }],
      [{ name: "h", histogram: { dataPoints: [{ n: 3 }], aggregationTemporality: 2 } }]
    ])
  })

  it("keeps a metric with no data points as one record", () => {
    const metrics = {
      resourceMetrics: [{
        resource: {},
        scopeMetrics: [{ scope: {}, metrics: [{ name: "a" }, { name: "b" }, { name: "c" }] }]
      }]
    }
    const bodies = split(metrics, 4096, 2).requests.map(decode)
    expect(bodies.map((body) => body.resourceMetrics[0].scopeMetrics[0].metrics)).toEqual([
      [{ name: "a" }, { name: "b" }],
      [{ name: "c" }]
    ])
  })

  it("leaves out only a record too large for a request on its own", () => {
    const logs = {
      resourceLogs: [{
        resource: {},
        scopeLogs: [{ scope: {}, logRecords: [{ b: "a" }, { b: "x".repeat(500) }, { b: "c" }] }]
      }]
    }
    const { requests, oversized } = split(logs, 200, 10)
    expect(oversized).toBe(1)
    expect(requests.map(decode).flatMap((body) => body.resourceLogs[0].scopeLogs[0].logRecords)).toEqual([
      { b: "a" },
      { b: "c" }
    ])
  })

  it("keeps a record that fills a request exactly, in a request of its own", () => {
    const one = (b: string) => ({ resourceLogs: [{ resource: {}, scopeLogs: [{ scope: {}, logRecords: [{ b }] }] }] })
    const exact = new TextEncoder().encode(JSON.stringify(one("x".repeat(60)))).byteLength
    const logs = {
      resourceLogs: [{
        resource: {},
        scopeLogs: [{ scope: {}, logRecords: [{ b: "a" }, { b: "x".repeat(60) }, { b: "c" }] }]
      }]
    }
    const { requests, oversized } = split(logs, exact, 10)
    expect(oversized).toBe(0)
    expect(requests.map((request) => request.byteLength).every((bytes) => bytes <= exact)).toBe(true)
    expect(requests.map(decode).map((body) => body.resourceLogs[0].scopeLogs[0].logRecords)).toEqual([
      [{ b: "a" }],
      [{ b: "x".repeat(60) }],
      [{ b: "c" }]
    ])
    expect(split(one("x".repeat(60)), exact, 10).requests.map(decode)).toEqual([one("x".repeat(60))])
  })

  it("passes through a body that isn't an OTLP request, and sends nothing for one with no records", () => {
    expect(split({ other: 1 }, 10, 1).requests.map(decode)).toEqual([{ other: 1 }])
    expect(split(null, 10, 1).requests.map(decode)).toEqual([null])
    const garbled = new TextEncoder().encode("{not json")
    expect(splitBytes(garbled, 10, 1).requests).toEqual([garbled])
    expect(split({ resourceSpans: [] }, 10, 1).requests).toEqual([])
  })
})
