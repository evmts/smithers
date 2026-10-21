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
    type: fc.oneof(fc.constantFrom(...Home.kinds), fc.constantFrom("chart", "board", ""), fc.integer()),
    title: field,
    text: field,
    path: field,
    flow: field,
    picture: fc.oneof(fc.constantFrom("issue", "review", "wiki", "schedule"), text),
    placeholder: field,
    links: fc.oneof(
      fc.array(fc.record({ label: field, url: field }, { requiredKeys: [] }), { maxLength: 3 }),
      field
    ),
    code: field,
    key: fc.oneof(fc.constantFrom("b", "B", ""), text),
    language: fc.oneof(fc.constantFrom("ts", "sh", "TS"), text),
    cards: fc.oneof(fc.array(fc.record({ title: field, text: field, url: field }, { requiredKeys: [] }), { maxLength: 3 }), field),
    stats: fc.oneof(fc.array(fc.record({ value: field, label: field }, { requiredKeys: [] }), { maxLength: 3 }), field),
    releases: fc.oneof(
      fc.array(
        fc.record({ name: field, url: field, date: fc.oneof(fc.constantFrom("2026-10-15", "2026-02-30"), text) }, {
          requiredKeys: []
        }),
        { maxLength: 3 }
      ),
      field
    )
  },
  { requiredKeys: ["type"] }
)

const blocks = fc.array(fc.oneof(block, field), { maxLength: 40 })

const section = fc.record(
  { title: field, audience: fc.oneof(fc.constantFrom(...Home.audiences), text), blocks: fc.oneof(blocks, field) },
  { requiredKeys: ["blocks"] }
)

const document = fc.oneof(
  fc.record({ blocks }),
  fc.record({ sections: fc.array(section, { maxLength: 10 }), contributors: fc.oneof(fc.constantFrom(...["role", "anyone"]), field) }, {
    requiredKeys: ["sections"]
  }),
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
        const all = read.sections.flatMap((each) => each.blocks)
        expect(all.length + read.skipped).toBeLessThanOrEqual(Home.maximumBlocks)
        expect(read.sections.length).toBeLessThanOrEqual(Home.maximumSections)
        for (const each of read.sections) expect(Home.audiences).toContain(each.audience)
        for (const each of all) {
          expect(Home.kinds).toContain(each.type)
          // A code block's source is drawn as text, so it may hold `<`; every other string may not.
          const { code: _code, ...rest } = each as { readonly code?: string }
          for (const value of strings(rest)) expect(Home.htmlPattern.test(value)).toBe(false)
        }
        expect(Home.read(JSON.stringify({ sections: read.sections, contributors: read.contributors }))).toEqual({
          ...read,
          skipped: 0
        })
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
