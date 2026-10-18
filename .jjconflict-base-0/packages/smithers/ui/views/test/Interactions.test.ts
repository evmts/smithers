import { Option, Schema } from "effect"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"
import { Interactions } from "../src/index.ts"

const decodeDeclared = Schema.decodeUnknownOption(Interactions.Declared)

describe("Interactions.parse", () => {
  it("reads a bare name and a name with an argument", () => {
    expect(Interactions.parse("cell")).toEqual(Option.some({ name: "cell" }))
    expect(Interactions.parse("cell:4")).toEqual(Option.some({ name: "cell", arg: "4" }))
  })

  it("keeps everything after the first colon as the argument", () => {
    expect(Interactions.parse("move:a:b")).toEqual(Option.some({ name: "move", arg: "a:b" }))
    expect(Interactions.parse("pick:")).toEqual(Option.some({ name: "pick", arg: "" }))
  })

  it("refuses malformed names and overlong arguments", () => {
    for (const attribute of ["", ":4", "Cell", "4cell", "cell name", "constructor()", "a".repeat(33)]) {
      expect(Interactions.parse(attribute)).toEqual(Option.none())
    }
    expect(Interactions.parse(`cell:${"x".repeat(Interactions.maxArgLength + 1)}`)).toEqual(Option.none())
    expect(Interactions.parse(`cell:${"x".repeat(Interactions.maxArgLength)}`)._tag).toBe("Some")
  })

  it("is the inverse of format for every event", () => {
    const name = fc.stringMatching(/^[a-z][A-Za-z0-9_-]{0,31}$/)
    const arg = fc.string({ maxLength: Interactions.maxArgLength })
    fc.assert(fc.property(name, fc.option(arg, { nil: undefined }), (eventName, eventArg) => {
      const event: Interactions.Event = eventArg === undefined
        ? { name: eventName }
        : { name: eventName, arg: eventArg }
      expect(Interactions.parse(Interactions.format(event))).toEqual(Option.some(event))
    }))
  })
})

describe("Interactions.Declared", () => {
  it("accepts state and message interactions", () => {
    expect(decodeDeclared({ cell: { kind: "state" }, ask: { kind: "message", label: "Play" } })._tag).toBe("Some")
  })

  it("refuses unknown kinds, empty or overlong labels, bad names and too many entries", () => {
    expect(decodeDeclared({ cell: { kind: "network" } })).toEqual(Option.none())
    expect(decodeDeclared({ ask: { kind: "message", label: "" } })).toEqual(Option.none())
    expect(decodeDeclared({ ask: { kind: "message", label: "x".repeat(81) } })).toEqual(Option.none())
    expect(decodeDeclared({ ask: { kind: "message" } })).toEqual(Option.none())
    expect(decodeDeclared({ "Bad name": { kind: "state" } })).toEqual(Option.none())
    const many = Object.fromEntries(
      Array.from({ length: Interactions.maxDeclared + 1 }, (_, i) => [`e${i}`, { kind: "state" }])
    )
    expect(decodeDeclared(many)).toEqual(Option.none())
    many.e0 = undefined as never
    delete many.e0
    expect(decodeDeclared(many)._tag).toBe("Some")
  })
})

describe("Interactions.lookup", () => {
  const declared: Interactions.Declared = { cell: { kind: "state" }, ask: { kind: "message", label: "Play" } }

  it("finds a declared interaction", () => {
    expect(Interactions.lookup(declared, "ask")).toEqual(Option.some({ kind: "message", label: "Play" }))
  })

  it("never matches an inherited name", () => {
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty", "missing"]) {
      expect(Interactions.lookup(declared, name)).toEqual(Option.none())
    }
  })
})
