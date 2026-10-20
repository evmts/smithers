import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { Bridge, type Interactions } from "../src/index.ts"

const declared: Interactions.Declared = { cell: { kind: "state" }, ask: { kind: "message", label: "Play" } }

const interaction = (params: Record<string, unknown>) => ({ jsonrpc: "2.0", method: "smithers/interaction", params })

const receive = (message: unknown, window: Bridge.RateWindow = [], now = 10_000) =>
  Bridge.receive({ message, declared, window, now })

describe("Bridge.receive", () => {
  it("admits a declared state event with its argument", () => {
    expect(receive(interaction({ event: "cell", arg: "4" }))).toEqual({
      verdict: { _tag: "State", event: { name: "cell", arg: "4" } },
      window: [10_000]
    })
  })

  it("turns a declared message event into a question with its label and values", () => {
    const values = { url: "https://github.com/maya/tinyhttp", depth: 1, private: false }
    expect(receive(interaction({ event: "ask", values })).verdict).toEqual({
      _tag: "Message",
      event: { name: "ask" },
      label: "Play",
      values
    })
    expect(receive(interaction({ event: "ask" })).verdict).toMatchObject({ _tag: "Message", values: {} })
  })

  it("reports a size change without counting it as an interaction", () => {
    const resize = { jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 212.5 } }
    expect(receive(resize, [1, 2])).toEqual({ verdict: { _tag: "Resize", height: 212.5 }, window: [1, 2] })
  })

  it("refuses a message that is not one of the bridge's", () => {
    const malformed = [
      null,
      "smithers/interaction",
      { method: "smithers/interaction", params: { event: "cell" } },
      { jsonrpc: "2.0", method: "ui/initialize", params: { nonce: "x".repeat(32) } },
      interaction({ event: "Cell" }),
      interaction({ event: "cell", arg: 4 }),
      interaction({ event: "ask", values: { url: { nested: true } } }),
      interaction({ event: "ask", values: { n: Number.NaN } }),
      interaction({ event: "ask", values: { [`k${"x".repeat(128)}`]: "v" } }),
      interaction({ event: "ask", values: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`f${i}`, i])) }),
      { jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: -1 } },
      { jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: Number.POSITIVE_INFINITY } },
      { jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: Bridge.maxReportedHeight + 1 } }
    ]
    for (const message of malformed) {
      expect(receive(message, [5])).toEqual({ verdict: { _tag: "Refused", reason: "malformed" }, window: [5] })
    }
  })

  it("refuses form values over the size bound", () => {
    const values = { body: "x".repeat(Bridge.maxValuesBytes) }
    expect(receive(interaction({ event: "ask", values })).verdict).toEqual({ _tag: "Refused", reason: "too_large" })
    const fits = { body: "x".repeat(Bridge.maxValuesBytes - 20) }
    expect(receive(interaction({ event: "ask", values: fits })).verdict._tag).toBe("Message")
  })

  it("refuses an event the view did not declare, inherited names included", () => {
    for (const event of ["move", "constructor", "toString"]) {
      expect(receive(interaction({ event })).verdict).toEqual({ _tag: "Refused", reason: "undeclared" })
    }
  })

  it("admits at most ten interactions in any second", () => {
    let window: Bridge.RateWindow = []
    for (let at = 0; at < 10; at++) {
      const result = receive(interaction({ event: "cell" }), window, 1_000 + at)
      expect(result.verdict._tag).toBe("State")
      window = result.window
    }
    const eleventh = receive(interaction({ event: "cell" }), window, 1_500)
    expect(eleventh.verdict).toEqual({ _tag: "Refused", reason: "rate_limited" })
    expect(eleventh.window).toHaveLength(10)
    // The window slides: one second after the first, one more fits.
    const later = receive(interaction({ event: "cell" }), eleventh.window, 2_000)
    expect(later.verdict._tag).toBe("State")
    expect(later.window).toEqual([1_001, 1_002, 1_003, 1_004, 1_005, 1_006, 1_007, 1_008, 1_009, 2_000])
  })

  it("does not count a refused interaction against the rate", () => {
    const refused = receive(interaction({ event: "move" }), [1, 2, 3], 4)
    expect(refused.window).toEqual([1, 2, 3])
  })

  it("forgets times from a clock that moved backwards", () => {
    expect(receive(interaction({ event: "cell" }), [9_000, 12_000], 9_500).window).toEqual([9_000, 9_500])
  })
})

describe("Bridge.acceptInitialize", () => {
  const nonce = "abcDEF0123456789_-abcdef"
  const initialize = { jsonrpc: "2.0", id: 1, method: "ui/initialize", params: { nonce } }

  it("accepts the request that carries this mount's nonce", () => {
    expect(Bridge.acceptInitialize(initialize, nonce)).toEqual(Option.some(initialize))
  })

  it("refuses another nonce, a malformed one, or another method", () => {
    expect(Bridge.acceptInitialize(initialize, `${nonce}x`)).toEqual(Option.none())
    expect(Bridge.acceptInitialize({ ...initialize, params: { nonce: "short" } }, "short")).toEqual(Option.none())
    expect(Bridge.acceptInitialize({ ...initialize, method: "ui/open" }, nonce)).toEqual(Option.none())
    expect(Bridge.acceptInitialize({ ...initialize, id: { x: 1 } }, nonce)).toEqual(Option.none())
  })

  it("answers with the same id and the host context", () => {
    const accepted = Option.getOrThrow(Bridge.acceptInitialize({ ...initialize, id: "init-1" }, nonce))
    expect(Bridge.initializeResult(accepted, { html: "<p>hi</p>", theme: "dark", size: "inline" })).toEqual({
      jsonrpc: "2.0",
      id: "init-1",
      result: { html: "<p>hi</p>", theme: "dark", size: "inline" }
    })
  })
})

describe("Bridge notifications and sizing", () => {
  it("writes a host-context change", () => {
    expect(Bridge.hostContextChanged({ html: "<p>2</p>" })).toEqual({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: { html: "<p>2</p>" }
    })
  })

  it("clamps an inline frame between 80 and 480 pixels", () => {
    expect(Bridge.inlineFrameHeight(0)).toBe(80)
    expect(Bridge.inlineFrameHeight(212.2)).toBe(213)
    expect(Bridge.inlineFrameHeight(10_000)).toBe(480)
  })
})
