import { describe, expect, test } from "vitest"
import { TerminalProtocol } from "../src/index.ts"

const {
  CloseCode,
  decodeClientControl,
  decodeServerControl,
  encodeResize,
  encodeServerControl,
  isFinal,
  maxCols,
  maxFrameBytes,
  maxRows,
  reconnectDelay
} = TerminalProtocol

describe("close codes", () => {
  test("an ended session, no access, a malformed frame and an oversized frame are final", () => {
    expect([CloseCode.ended, CloseCode.noAccess, CloseCode.unsupported, CloseCode.tooBig].map(isFinal)).toEqual([
      true,
      true,
      true,
      true
    ])
  })

  test("a host failure, a dropped connection and a going-away close reconnect", () => {
    expect([CloseCode.failed, 1006, 1001].map(isFinal)).toEqual([false, false, false])
  })

  test("reconnects back off from 1 s, doubling to 30 s, for 10 attempts", () => {
    expect(Array.from({ length: 12 }, (_, index) => reconnectDelay(index))).toEqual([
      undefined,
      1_000,
      2_000,
      4_000,
      8_000,
      16_000,
      30_000,
      30_000,
      30_000,
      30_000,
      30_000,
      undefined
    ])
  })
})

describe("client control", () => {
  test("a resize round-trips", () => {
    expect(decodeClientControl(encodeResize(120, 40))).toEqual({ type: "resize", cols: 120, rows: 40 })
  })

  test("the bounds are inclusive", () => {
    expect(decodeClientControl(encodeResize(1, 1))).toEqual({ type: "resize", cols: 1, rows: 1 })
    expect(decodeClientControl(encodeResize(maxCols, maxRows))).toEqual({
      type: "resize",
      cols: maxCols,
      rows: maxRows
    })
  })

  test.each([
    ["zero columns", encodeResize(0, 24)],
    ["too many columns", encodeResize(maxCols + 1, 24)],
    ["too many rows", encodeResize(80, maxRows + 1)],
    ["fractional rows", JSON.stringify({ type: "resize", cols: 80, rows: 2.5 })],
    ["string columns", JSON.stringify({ type: "resize", cols: "80", rows: 24 })],
    ["another type", JSON.stringify({ type: "ready", access: "write" })],
    ["an array", "[1,2]"],
    ["null", "null"],
    ["not JSON", "{"],
    ["an oversized frame", JSON.stringify({ type: "resize", cols: 80, rows: 24, pad: "x".repeat(maxFrameBytes) })]
  ])("refuses %s", (_, text) => {
    expect(decodeClientControl(text)).toBeUndefined()
  })
})

describe("server control", () => {
  test("ready and ended round-trip", () => {
    for (
      const control of [
        { type: "ready", access: "write" },
        { type: "ready", access: "read" },
        { type: "ended", reason: "closed" },
        { type: "ended", reason: "slept" },
        { type: "ended", reason: "lost" },
        { type: "ended", reason: "revoked" }
      ] as const
    ) {
      expect(decodeServerControl(encodeServerControl(control))).toEqual(control)
    }
  })

  test.each([
    ["an unknown access", JSON.stringify({ type: "ready", access: "admin" })],
    ["an unknown reason", JSON.stringify({ type: "ended", reason: "bored" })],
    ["a resize", encodeResize(80, 24)],
    ["a string", "\"ready\""],
    ["not JSON", "ready"]
  ])("refuses %s", (_, text) => {
    expect(decodeServerControl(text)).toBeUndefined()
  })
})
