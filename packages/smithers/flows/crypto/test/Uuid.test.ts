import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { Uuid, WebCrypto } from "../src/index.ts"

const v5 = (namespace: string, name: string) =>
  Effect.runPromise(Uuid.v5(namespace, name).pipe(Effect.provide(WebCrypto.layer)))

// RFC 9562 Appendix A.4 and the namespaces of its §6.6.
const DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
const URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8"

describe("Uuid.v5", () => {
  it("matches RFC 9562's example for www.example.com in the DNS namespace", async () => {
    expect(await v5(DNS, "www.example.com")).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2")
  })

  it("is the same for the same namespace and name, and differs by either", async () => {
    const a = await v5(URL, "https://example.com/")
    expect(await v5(URL, "https://example.com/")).toBe(a)
    expect(await v5(DNS, "https://example.com/")).not.toBe(a)
    expect(await v5(URL, "https://example.com")).not.toBe(a)
  })

  it("sets version 5 and the RFC variant, in lowercase, whatever the namespace's case", async () => {
    const id = await v5(DNS.toUpperCase(), "日本語")
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(id).toBe(await v5(DNS, "日本語"))
  })

  it("dies on a namespace that isn't a UUID", async () => {
    await expect(v5("not-a-uuid", "x")).rejects.toThrow("namespace is not a UUID")
  })
})

describe("Uuid.isUuid", () => {
  it.each([
    [DNS, true],
    [DNS.toUpperCase(), true],
    ["6ba7b8109dad11d180b400c04fd430c8", false],
    ["6ba7b810-9dad-11d1-80b4-00c04fd430c", false],
    ["", false]
  ])("%s is %s", (value, expected) => {
    expect(Uuid.isUuid(value)).toBe(expected)
  })
})
