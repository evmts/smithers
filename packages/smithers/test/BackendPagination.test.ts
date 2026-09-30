import { describe, expect, it, vi } from "vitest"
import { Client, paginationCursor } from "../src/internal/backend/Client.ts"

const url = new URL("https://api.example.test/api/repos/owner/repo/issues?limit=1&state=open")

describe("pagination metadata", () => {
  it.each([
    [{}, ""],
    [{ "x-next-cursor": "legacy" }, "legacy"],
    [{ link: '</api/repos/owner/repo/issues?limit=1>; rel="first"' }, ""],
    [{ link: '</api/repos/owner/repo/issues?cursor=Mg>; rel="next"' }, "Mg"],
    [{ link: '<https://api.example.test/api/repos/owner/repo/issues?cursor=next>; rel=next' }, "next"],
    [{ link: '<?cursor=a%2Bb%3D>; title="a,b"; rel="prev next"' }, "a+b="],
    [{ link: '<?cursor=next>; title="a\\\"b,c"; rel="next"', "x-next-cursor": "next" }, "next"]
  ] as const)("extracts cursors from %j", (headers, expected) => {
    expect(paginationCursor(new Headers(headers), url)).toBe(expected)
  })
  it.each([
    '<?cursor=>; rel="next"',
    '<?limit=1>; rel="next"',
    '<?cursor=a&cursor=b>; rel="next"',
    '<https://other.test/api/repos/owner/repo/issues?cursor=x>; rel="next"',
    '<https://user@api.example.test/api/repos/owner/repo/issues?cursor=x>; rel="next"',
    '<?cursor=x#fragment>; rel="next"',
    '</api/user?cursor=x>; rel="next"',
    '<?cursor=one>; rel="next", <?cursor=two>; rel="next"',
    '<?cursor=one>; rel="next',
    '<?cursor=one; rel="next"',
    'malformed',
    '<?cursor=%0A>; rel="next"',
    '<?cursor=has%20space>; rel="next"'
  ])("refuses invalid Link pagination %s", (link) => {
    expect(() => paginationCursor(new Headers({ link }), url)).toThrow("invalid pagination")
  })
  it("rejects conflicting cursor sources and overlong legacy cursors", () => {
    expect(() => paginationCursor(new Headers({ link: '<?cursor=one>; rel="next"', "x-next-cursor": "two" }), url))
      .toThrow("invalid pagination")
    expect(() => paginationCursor(new Headers({ "x-next-cursor": "x".repeat(4097) }), url)).toThrow("invalid pagination")
  })
})

describe("pagination collection", () => {
  const client = () => new Client({ environment: { SMITHERS_API_ORIGIN: url.origin } })
  it("refuses repeated Link cursors before repeating the request", async () => {
    const c = client()
    const response = vi.spyOn(c, "response").mockImplementation(async () =>
      new Response("[1]", { headers: { link: '<?cursor=same>; rel="next"' } })
    )
    await expect(c.pages((cursor) => url.pathname + `?cursor=${cursor}`, "", true)).rejects.toThrow("repeated")
    expect(response).toHaveBeenCalledTimes(2)
  })
  it("refuses a cursor that repeats the requested single page", async () => {
    const c = client()
    vi.spyOn(c, "response").mockResolvedValue(new Response("[]", { headers: { "x-next-cursor": "same" } }))
    await expect(c.pages(() => url.pathname, "same")).rejects.toThrow("repeated")
  })
  it("rejects malformed page collections instead of silently dropping them", async () => {
    const c = client()
    vi.spyOn(c, "response").mockResolvedValue(new Response('{"message":"unexpected"}'))
    await expect(c.pages(() => url.pathname, "", true)).rejects.toThrow("invalid page")
  })
})
