import { expect, test } from "vitest"
import { decodeStored, encodeStored } from "../src/internal/stored.ts"

test("encoding preserves own __proto__ fields without changing prototypes", () => {
  const value = JSON.parse("{\"__proto__\":{\"polluted\":true},\"nested\":{\"__proto__\":null}}")
  expect(JSON.parse(encodeStored(value))).toEqual(value)
})

test("decoding preserves own __proto__ fields without changing prototypes", () => {
  const text = "{\"__proto__\":{\"polluted\":true},\"nested\":{\"__proto__\":null}}"
  const value = decodeStored(text) as Record<string, unknown>
  expect(Object.hasOwn(value, "__proto__")).toBe(true)
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
  expect(value).toEqual(JSON.parse(text))
  expect(Object.getPrototypeOf(value.nested)).toBe(Object.prototype)
})
