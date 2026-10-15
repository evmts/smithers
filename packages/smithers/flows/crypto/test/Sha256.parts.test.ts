import * as FastCheck from "fast-check"
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { makeDigestPartsSync } from "../src/Sha256.ts"

describe("SHA-256 parts", () => {
  it("cached prefixes preserve SHA-256 across padding, Unicode, edits and truncation", () => {
    const hash = makeDigestPartsSync()
    for (let length = 0; length < 140; length++) {
      for (
        const parts of [
          ["a".repeat(length), "🙂", "tail"],
          ["a".repeat(length), "🙂", "changed"],
          ["a".repeat(length)],
          [],
          ["different", "prefix"]
        ]
      ) {
        expect(hash(parts)).toBe(createHash("sha256").update(parts.join("")).digest("hex"))
      }
    }
  })
})

it("cached fragments use indexed values even when an array overrides iteration", () => {
  const hash = makeDigestPartsSync()
  const parts = ["a"]
  parts[Symbol.iterator] = () => ["b"].values()
  expect(hash(parts)).toBe(createHash("sha256").update("a").digest("hex"))
  expect(hash(["b"])).toBe(createHash("sha256").update("b").digest("hex"))
})

it("reads each fragment once before caching its prefix", () => {
  const hash = makeDigestPartsSync()
  let reads = 0
  const parts = ["a"]
  Object.defineProperty(parts, "0", { get: () => ++reads === 1 ? "a" : "b" })
  expect(hash(parts)).toBe(createHash("sha256").update("a").digest("hex"))
  expect(reads).toBe(1)
  expect(hash(["b"])).toBe(createHash("sha256").update("b").digest("hex"))
})

it("keeps reusable prefixes intact after a fragment fails validation", () => {
  const hash = makeDigestPartsSync()
  const expected = (text: string) => createHash("sha256").update(text).digest("hex")
  expect(hash(["prefix", "tail"])).toBe(expected("prefixtail"))
  expect(() => hash(["prefix", "changed", "\ud800"])).toThrow()
  expect(hash(["prefix", "tail"])).toBe(expected("prefixtail"))
  expect(hash(["prefix", "changed"])).toBe(expected("prefixchanged"))
})

it("rejects mutable bytes at the text-fragment boundary without poisoning the cache", () => {
  const hash = makeDigestPartsSync()
  const bytes = new Uint8Array([0x61])
  expect(() => hash([bytes as unknown as string])).toThrow(expect.objectContaining({ code: "invalid_input" }))
  bytes[0] = 0x62
  expect(() => hash([bytes as unknown as string])).toThrow(expect.objectContaining({ code: "invalid_input" }))
  expect(hash(["b"])).toBe(createHash("sha256").update("b").digest("hex"))
})

it.each([null, undefined, "abc", { length: -1 }, { 0: "a", length: 1 }, new Uint8Array()])(
  "rejects non-array fragments: %j",
  (input) => {
    const hash = makeDigestPartsSync()
    expect(() => hash(input as unknown as ReadonlyArray<string>)).toThrow(
      expect.objectContaining({ code: "invalid_input" })
    )
  }
)

it.each([-1, 0.5, NaN, Infinity, 0x100000000, "1", undefined])(
  "rejects an invalid array length before reading fragments: %s",
  (length) => {
    const hash = makeDigestPartsSync()
    const expected = createHash("sha256").update("prefixtail").digest("hex")
    expect(hash(["prefix", "tail"])).toBe(expected)
    let reads = 0
    const input = new Proxy(["a"], {
      get(target, key, receiver) {
        if (key === "length") return length
        reads++
        // Bound the regression even if the implementation trusts Infinity.
        if (reads > 2) throw new Error("unbounded fragment reads")
        return Reflect.get(target, key, receiver)
      }
    })
    expect(() => hash(input)).toThrow(expect.objectContaining({ code: "invalid_input" }))
    expect(reads).toBe(0)
    expect(hash(["prefix", "tail"])).toBe(expected)
  }
)

it("normalizes revoked arrays and unreadable array lengths without retaining input in the message", () => {
  const revoked = Proxy.revocable(["private text"], {})
  revoked.revoke()
  const unreadable = new Proxy(["private text"], {
    get() {
      throw new Error("private text")
    }
  })
  for (const input of [revoked.proxy, unreadable]) {
    const hash = makeDigestPartsSync()
    expect(() => hash(input)).toThrow(expect.objectContaining({
      code: "invalid_input",
      message: "SHA-256 text fragments must be an inspectable array"
    }))
    expect(hash(["a"])).toBe(createHash("sha256").update("a").digest("hex"))
  }
})

it("normalizes indexed fragment access failures and preserves the last successful prefixes", () => {
  const hash = makeDigestPartsSync()
  const expected = createHash("sha256").update("prefixtail").digest("hex")
  expect(hash(["prefix", "tail"])).toBe(expected)
  const cause = new Error("private fragment text")
  const input = ["prefix", "changed", "unused"]
  Object.defineProperty(input, "2", {
    get() {
      throw cause
    }
  })
  expect(() => hash(input)).toThrow(expect.objectContaining({
    code: "invalid_input",
    message: "SHA-256 text fragment could not be read",
    cause
  }))
  expect(hash(["prefix", "tail"])).toBe(expected)
  expect(hash(["prefix", "changed"])).toBe(createHash("sha256").update("prefixchanged").digest("hex"))
})

it("matches Node SHA-256 throughout randomized edits and failed-call recovery", () => {
  const fragment = FastCheck.array(
    FastCheck.constantFrom("a", "🙂", "é", "\0", "\u0301", "x".repeat(64)),
    { maxLength: 5 }
  ).map((units) => units.join(""))
  const edit = FastCheck.record({
    keep: FastCheck.nat(5),
    append: FastCheck.array(fragment, { maxLength: 5 }),
    reject: FastCheck.boolean()
  })
  const expected = (parts: ReadonlyArray<string>) => createHash("sha256").update(parts.join("")).digest("hex")
  FastCheck.assert(
    FastCheck.property(FastCheck.array(edit, { minLength: 1, maxLength: 15 }), (edits) => {
      const hash = makeDigestPartsSync()
      let previous: Array<string> = []
      for (const { keep, append, reject } of edits) {
        const next = [...previous.slice(0, keep), ...append]
        if (reject) {
          expect(() => hash([...next, "\ud800"])).toThrow(expect.objectContaining({ code: "invalid_text" }))
          expect(hash(previous)).toBe(expected(previous))
        }
        expect(hash(next)).toBe(expected(next))
        previous = next
      }
    }),
    {
      numRuns: Number(process.env.FC_NUM_RUNS ?? 100),
      ...(process.env.FC_SEED === undefined ? {} : { seed: Number(process.env.FC_SEED) }),
      interruptAfterTimeLimit: 20_000,
      markInterruptAsFailure: true
    }
  )
})
