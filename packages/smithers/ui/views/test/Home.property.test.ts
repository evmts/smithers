/**
 * Fuzzing the home reader. It is total: any text is read or refused, never
 * thrown on. What it reads is closed: every block it answers is one of its
 * kinds, carries no HTML in any string, and reads back the same. Unknown
 * kinds are counted, never answered. Counterexamples the fuzzer found are
 * kept as `examples`, so each runs on every run.
 */
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"
import { Home } from "../src/index.ts"

/** Strings a hostile or careless home might hold. */
const text = fc.oneof(
  fc.string(),
  fc.constantFrom("", "<b>x</b>", "</p>", "<!--", "javascript:alert(1)", "https://example.com", "../x", "a\nb"),
  fc.string({ unit: "grapheme" })
)

const field = fc.oneof(text, fc.integer(), fc.boolean(), fc.constant(null))

/** A block-shaped object: a known kind or another, with fields of any type. */
const block = fc.record(
  {
    type: fc.oneof(fc.constantFrom(...Home.kinds), fc.constantFrom("chart", "runs", ""), fc.integer()),
    title: field,
    text: field,
    path: field,
    flow: field,
    picture: fc.oneof(fc.constantFrom("issue", "review", "wiki", "schedule"), text),
    placeholder: field,
    links: fc.oneof(
      fc.array(fc.record({ label: field, url: field }, { requiredKeys: [] }), { maxLength: 3 }),
      field
    )
  },
  { requiredKeys: ["type"] }
)

const document = fc.oneof(
  fc.record({ blocks: fc.array(fc.oneof(block, field), { maxLength: 40 }) }),
  fc.anything()
).map((value) => JSON.stringify(value) ?? "")

/** Every string inside a value. */
const strings = (value: unknown): ReadonlyArray<string> =>
  typeof value === "string"
    ? [value]
    : typeof value === "object" && value !== null
    ? Object.values(value).flatMap(strings)
    : []

describe("Home.read, fuzzed", () => {
  it("never throws, on any text or any home-shaped document", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), document), (input) => {
        const read = Home.read(input)
        expect(["Declared", "Invalid"]).toContain(read._tag)
      }),
      { numRuns: 2000, examples: [["{"], ["[]"], ["{\"blocks\":[{\"type\":\"__proto__\"}]}"]] }
    )
  })

  it("answers only known kinds without HTML, which read back the same", () => {
    fc.assert(
      fc.property(document, (input) => {
        const read = Home.read(input)
        if (read._tag === "Invalid") return
        expect(read.blocks.length + read.skipped).toBeLessThanOrEqual(Home.maximumBlocks)
        for (const each of read.blocks) {
          expect(Home.kinds).toContain(each.type)
          for (const value of strings(each)) expect(Home.htmlPattern.test(value)).toBe(false)
        }
        expect(Home.read(JSON.stringify({ blocks: read.blocks }))).toEqual({ ...read, skipped: 0 })
      }),
      {
        numRuns: 2000,
        examples: [
          ["{\"blocks\":[{\"type\":\"links\",\"links\":[{\"label\":\"a\",\"url\":\"https://a\"}]}]}"],
          ["{\"blocks\":[{\"type\":\"constructor\"},{\"type\":\"toString\"}]}"]
        ]
      }
    )
  })
})
