import { describe, expect, it } from "vitest"
import { pageText, paginationCursor } from "../src/HttpPagination.ts"

const url = new URL("https://api.example.test/api/repos/owner/repo/issues?limit=1&state=open")

describe("pagination metadata", () => {
  it.each(
    [
      [{}, ""],
      [{ link: "<?cursor=ignored>; title=\"not a continuation\"" }, ""],
      [{ "x-next-cursor": "legacy" }, "legacy"],
      [{ "x-next-cursor": "%20report%20%2Fa%25b+c" }, " report /a%b+c"],
      [{ link: "<?cursor=has%20space>; rel=\"next\"" }, "has space"],
      [{ link: "<?cursor=%20a%20>; rel=\"next\"", "x-next-cursor": "%20a%20" }, " a "],
      [{ link: "</api/repos/owner/repo/issues?limit=1>; rel=\"first\"" }, ""],
      [{ link: "</api/repos/owner/repo/issues?cursor=Mg>; rel=\"next\"" }, "Mg"],
      [{ link: "<https://api.example.test/api/repos/owner/repo/issues?cursor=next>; rel=next" }, "next"],
      [{ link: "<?cursor=a%2Bb%3D>; title=\"a,b\"; rel=\"prev next\"" }, "a+b="],
      [{ link: "<?cursor=next>; title=\"a\\\"b,c\"; rel=\"next\"", "x-next-cursor": "next" }, "next"]
    ] as const
  )("extracts cursors from %j", (headers, expected) => {
    expect(paginationCursor(new Headers(headers), url)).toBe(expected)
  })
  it.each([
    "<?cursor=>; rel=\"next\"",
    "<?limit=1>; rel=\"next\"",
    "<?cursor=a&cursor=b>; rel=\"next\"",
    "<https://other.test/api/repos/owner/repo/issues?cursor=x>; rel=\"next\"",
    "<https://user@api.example.test/api/repos/owner/repo/issues?cursor=x>; rel=\"next\"",
    "<?cursor=x#fragment>; rel=\"next\"",
    "</api/user?cursor=x>; rel=\"next\"",
    "<?cursor=one>; rel=\"next\", <?cursor=two>; rel=\"next\"",
    "<?cursor=one>; rel=\"next",
    "<?cursor=one; rel=\"next\"",
    "malformed",
    "<http://[>; rel=\"next\"",
    "<?cursor=%0A>; rel=\"next\"",
    "<?cursor=a%01b>; rel=\"next\"",
    "<?cursor=a%7Fb>; rel=\"next\""
  ])("refuses invalid Link pagination %s", (link) => {
    expect(() => paginationCursor(new Headers({ link }), url)).toThrow("invalid pagination")
  })
  it("rejects conflicting cursor sources and overlong legacy cursors", () => {
    expect(() => paginationCursor(new Headers({ link: "<?cursor=one>; rel=\"next\"", "x-next-cursor": "two" }), url))
      .toThrow("invalid pagination")
    expect(() => paginationCursor(new Headers({ "x-next-cursor": "x".repeat(4097) }), url)).toThrow(
      "invalid pagination"
    )
    expect(() => paginationCursor(new Headers({ "x-next-cursor": "%20".repeat(4097) }), url)).toThrow(
      "invalid pagination"
    )
    expect(paginationCursor(new Headers({ "x-next-cursor": "%20".repeat(4096) }), url)).toBe(" ".repeat(4096))
  })
  it.each(["%E0%A4%A", "%", "a%0Ab", "%7F"])("refuses a malformed or control X-Next-Cursor %s", (header) => {
    expect(() => paginationCursor(new Headers({ "x-next-cursor": header }), url)).toThrow("invalid pagination")
  })
})

describe("scoped pagination authority", () => {
  it("allows query order changes while preserving every scoped value", () => {
    const current = new URL("http://127.0.0.1/api/repos/o/r/issues?view=bugs&limit=100")
    expect(
      paginationCursor(new Headers({ link: "<?limit=100&cursor=opaque&view=bugs>; rel=\"next\"" }), current, {
        preserveQuery: true
      })
    ).toBe("opaque")
  })
  it.each([
    "view=other&limit=100",
    "view=bugs&limit=99",
    "view=bugs&limit=100&state=closed",
    "view=bugs&limit=100&view=bugs"
  ])("rejects changed scope %s with the caller's typed error", (query) => {
    const current = new URL("http://127.0.0.1/api/repos/o/r/issues?view=bugs&limit=100")
    const refusal = new Error("owned refusal")
    expect(() =>
      paginationCursor(new Headers({ link: `<?${query}&cursor=opaque>; rel="next"` }), current, {
        preserveQuery: true,
        invalid: () => refusal
      })
    ).toThrow(refusal)
  })
})

describe("bounded page bodies", () => {
  it("decodes a Unicode character split across byte chunks at the exact limit", async () => {
    const bytes = new TextEncoder().encode("a🙂é")
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
          controller.close()
        }
      })
    )
    expect(await pageText(response, bytes.length)).toEqual({ text: "a🙂é", bytes: bytes.length })
    expect(await pageText(new Response(null), 0)).toEqual({ text: "", bytes: 0 })
  })
  it("preserves a leading BOM rather than silently repairing malformed JSON", async () => {
    expect(await pageText(new Response("\uFEFF[]"), 5)).toEqual({ text: "[]", bytes: 5 })
    expect(await pageText(new Response("\uFEFF[]"), 5, undefined, { preserveBOM: true })).toEqual({
      text: "\uFEFF[]",
      bytes: 5
    })
  })

  it("cancels overflow, retains the supplied refusal, and never reads later chunks", async () => {
    let cancelled = false
    const refusal = new Error("owned overflow")
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(5))
        },
        cancel() {
          cancelled = true
        }
      })
    )
    await expect(pageText(response, 4, () => refusal)).rejects.toBe(refusal)
    expect(cancelled).toBe(true)
  })
  it.each([NaN, Infinity, -1, 0.5])("rejects invalid byte budget %s before reading", async (limit) => {
    let cancelled = false
    const response = new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true
        }
      })
    )
    await expect(pageText(response, limit)).rejects.toThrow()
    expect(cancelled).toBe(true)
  })

  it("preserves the supplied invalid-budget refusal when body cancellation rejects", async () => {
    const refusal = new Error("invalid owned budget")
    const response = new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          throw new Error("cancellation failed")
        }
      })
    )
    await expect(pageText(response, -1, () => refusal)).rejects.toBe(refusal)
  })

  it("accepts zero for a genuinely empty response", async () => {
    expect(await pageText(new Response(""), 0)).toEqual({ text: "", bytes: 0 })
  })

  it("uses the default overflow refusal and cancels the unread body", async () => {
    let cancelled = false
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.of(1))
        },
        cancel() {
          cancelled = true
        }
      })
    )
    await expect(pageText(response, 0)).rejects.toThrow("API collection exceeds the response limit")
    expect(cancelled).toBe(true)
  })

  it("propagates a failed body read and releases its reader", async () => {
    const failure = new Error("body failed")
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(failure)
      }
    })
    await expect(pageText(new Response(body), 10)).rejects.toBe(failure)
    expect(body.locked).toBe(false)
  })
})
