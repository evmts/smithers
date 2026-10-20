import { describe, expect, it } from "vitest"
import { Bytes } from "../src/index.ts"

describe("frame payload byte bounds", () => {
  it("matches UTF-8 encoding for ASCII, BMP, pairs and lone surrogates", () => {
    for (const text of ["", "ASCII", "é", "漢", "🙂", "\ud800", "\udc00", "\ud800x", "\ud800\ud800", "x🙂é漢"]) {
      expect(Bytes.utf8Length(text)).toBe(new TextEncoder().encode(text).length)
    }
  })
  it("bounds encoded JSON and refuses values JSON cannot represent", () => {
    for (const value of [null, true, 42, "🙂漢", { text: "é", values: [1, false] }]) {
      expect(Bytes.jsonLength(value)).toBe(new TextEncoder().encode(JSON.stringify(value)).length)
    }
    const cycle: { self?: unknown } = {}
    cycle.self = cycle
    for (const value of [undefined, () => 1, Symbol("hidden"), 1n, cycle]) {
      expect(Bytes.jsonLength(value)).toBeUndefined()
    }
  })
})
