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
