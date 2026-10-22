import { Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Home, Interactions, WebPage } from "../src/index.ts"

describe("declared input boundaries", () => {
  it("bounds flow names in schemas and home documents", () => {
    const accepts = Schema.is(Home.FlowName)
    expect(accepts("a".repeat(Home.maximumTitleLength))).toBe(true)
    expect(accepts("a".repeat(Home.maximumTitleLength + 1))).toBe(false)
    expect(Home.read(JSON.stringify({ blocks: [{ type: "view", flow: "a".repeat(10000) }] }))).toEqual({
      _tag: "Invalid", reason: "block"
    })
  })

  it("accepts every early year and validates leap days without the 1900 offset", () => {
    const accepts = Schema.is(Home.IsoDate)
    for (let year = 0; year < 100; year++) {
      const prefix = String(year).padStart(4, "0")
      expect(accepts(`${prefix}-01-01`)).toBe(true)
      expect(accepts(`${prefix}-02-29`)).toBe(year % 4 === 0)
      expect(accepts(`${prefix}-02-30`)).toBe(false)
    }
    expect(accepts("1900-02-29")).toBe(false)
    expect(accepts("2000-02-29")).toBe(true)
  })

  it("bounds links in one block even when the block count is valid", () => {
    const read = (length: number) => Home.read(JSON.stringify({ blocks: [{
      type: "links", links: Array.from({ length }, () => ({ label: "Docs", url: "https://example.com" }))
    }] }))
    expect(read(Home.maximumEntries)._tag).toBe("Declared")
    expect(read(Home.maximumEntries + 1)).toEqual({ _tag: "Invalid", reason: "block" })
  })

  it("never matches an explicitly declared own constructor interaction", () => {
    const declared = Schema.decodeUnknownSync(Interactions.Declared)({ constructor: { kind: "state" } })
    expect(Object.hasOwn(declared, "constructor")).toBe(true)
    expect(Interactions.lookup(declared, "constructor")).toEqual(Option.none())
  })

  it("returns unknown for invalid page or ancestor URLs without throwing", () => {
    for (const frame of [
      { page: "not a URL", ancestors: ["https://example.com"] },
      { page: "https://example.com", ancestors: ["not a URL"] }
    ]) {
      expect(WebPage.framing({}, frame)).toEqual({ framing: "unknown", reason: "invalid_url" })
    }
  })
})
