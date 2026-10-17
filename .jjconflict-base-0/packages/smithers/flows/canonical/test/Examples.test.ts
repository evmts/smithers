import { describe, expect, it } from "vitest"
import { serializeBoundedInput } from "../examples/admit-and-serialize.ts"

describe("bounded serialization example", () => {
  it("emits identical canonical text for records with different insertion order", () => {
    const expected = { ok: true, text: "{\"a\":[\"release\"],\"z\":1}" }
    expect(serializeBoundedInput({ z: 1, a: ["release"] })).toEqual(expected)
    expect(serializeBoundedInput({ a: ["release"], z: 1 })).toEqual(expected)
  })

  it("returns a located refusal before invoking a caller-owned getter", () => {
    let reads = 0
    const input = Object.defineProperty({}, "secret", {
      enumerable: true,
      get: () => {
        reads++
        throw new Error("must not run")
      }
    })
    expect(serializeBoundedInput(input)).toEqual({
      ok: false,
      path: "$.secret",
      complaint: "must be an enumerable data property"
    })
    expect(reads).toBe(0)
  })

  it("accepts the inclusive encoded-string boundary and refuses the next byte", () => {
    expect(serializeBoundedInput("a".repeat(126))).toEqual({
      ok: true,
      text: `"${"a".repeat(126)}"`
    })
    expect(serializeBoundedInput("a".repeat(127))).toEqual({
      ok: false,
      path: "$",
      complaint: "exceeds the 128-byte string limit"
    })
  })
})
