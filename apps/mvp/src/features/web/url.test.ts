// Which outside pages `app/web/open` opens (src/features/web/url.ts, docs/features/web-pages.md#which-pages): the one
// check the flow's step, a person's `/web` and ChatApi share.
import { describe, expect, test } from "vitest"
import { KNOWN_DOCS, MAX_URL_LENGTH } from "./contract"
import { OpenWebPage } from "./flows"
import { checkUrl, siteOf } from "./url"

const production = { localHttp: false, appOrigin: "https://app.smithers.sh" }
const development = { localHttp: true, appOrigin: "http://localhost:1337" }

const reason = (url: string, mode: "embed" | "tab", policy = production) => {
  const checked = checkUrl(url, mode, policy)
  return checked.ok ? "ok" : checked.reason
}

describe("which pages open", () => {
  test("an https page of another site opens either way, normalized, with the origin a person sees", () => {
    for (const mode of ["embed", "tab"] as const) {
      expect(checkUrl("  https://Example.com/docs?q=1#intro ", mode, production)).toEqual({
        ok: true,
        page: { href: "https://example.com/docs?q=1#intro", origin: "https://example.com" },
      })
    }
    expect(checkUrl("https://effect.website", "embed", development)).toEqual({
      ok: true,
      page: { href: "https://effect.website/", origin: "https://effect.website" },
    })
  })

  test("every other scheme is refused, however it is written", () => {
    for (
      const url of [
        "javascript:alert(document.cookie)",
        "JavaScript:alert(1)",
        "java\tscript:alert(1)",
        " javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "file:///etc/passwd",
        "blob:https://example.com/4b1d",
        "about:blank",
        "ftp://example.com/",
        "mailto:a@example.com",
      ]
    ) {
      for (const mode of ["embed", "tab"] as const) expect([url, mode, reason(url, mode)]).toEqual([url, mode, "scheme"])
    }
  })

  test("what isn't an absolute URL, or is too long, is invalid", () => {
    for (const url of ["", "example.com", "/app", "//example.com/x", "http://", "https://[::1"]) {
      expect([url, reason(url, "embed")]).toEqual([url, "invalid"])
    }
    const path = (length: number) => `https://example.com/${"x".repeat(length - "https://example.com/".length)}`
    expect(reason(path(MAX_URL_LENGTH), "embed")).toBe("ok")
    expect(reason(path(MAX_URL_LENGTH + 1), "embed")).toBe("invalid")
  })

  test("http: is only a new tab on this machine in development", () => {
    for (const host of ["localhost:4000", "127.0.0.1:4000", "[::1]:4000"]) {
      expect(reason(`http://${host}/page`, "tab", development)).toBe("ok")
      // Never in a frame: cookies aren't kept apart by port, so a page on another port shares the app's.
      expect(reason(`http://${host}/page`, "embed", development)).toBe("insecure")
      expect(reason(`http://${host}/page`, "tab", production)).toBe("insecure")
    }
    expect(reason("http://example.com/", "tab", development)).toBe("insecure")
    expect(reason("http://example.com/", "embed", production)).toBe("insecure")
  })

  test("a URL with a name or password is refused", () => {
    expect(reason("https://user@example.com/", "tab")).toBe("credentials")
    expect(reason("https://user:secret@example.com/", "embed")).toBe("credentials")
  })

  test("the app's own host, whatever the scheme, is refused: app/navigate opens it", () => {
    expect(reason("https://app.smithers.sh/app", "tab")).toBe("same_origin")
    expect(reason("https://app.smithers.sh/app", "embed")).toBe("same_origin")
    expect(reason("https://localhost:1337/app", "embed", development)).toBe("same_origin")
    expect(reason("http://localhost:1337/app", "tab", development)).toBe("same_origin")
    // In a frame, a page on :1337 is refused before anything else: it isn't https.
    expect(reason("http://localhost:1337/app", "embed", development)).toBe("insecure")
  })

  test("a frame never shows the app's site or its subdomains, which share its cookies; a tab may", () => {
    for (const url of ["https://smithers.sh/", "https://docs.smithers.sh/", "https://a.b.smithers.sh/x"]) {
      expect([url, reason(url, "embed")]).toEqual([url, "same_site"])
      expect([url, reason(url, "tab")]).toEqual([url, "ok"])
    }
    expect(reason("https://localhost:4000/", "embed", development)).toBe("same_site")
    // Only the site's own names: a look-alike is another site.
    expect(reason("https://notsmithers.sh/", "embed")).toBe("ok")
    expect(reason("https://smithers.sh.example.com/", "embed")).toBe("ok")
  })

  test("an unusable application origin cannot disable host and site refusals", () => {
    for (const appOrigin of [
      "", "not an origin", "https://", "null", "data:text/plain,app", "file:///app", "ftp://app.smithers.sh",
    ]) {
      const policy = { localHttp: true, appOrigin }
      for (const mode of ["embed", "tab"] as const) {
        for (const url of [
          "https://app.smithers.sh/", "https://docs.smithers.sh/", "https://example.com/", "http://localhost:1337/",
        ]) {
          expect([appOrigin, mode, url, reason(url, mode, policy)]).toEqual([
            appOrigin,
            mode,
            url,
            url.startsWith("http:") && mode === "embed" ? "insecure" : "invalid",
          ])
        }
      }
    }
  })
})

describe("a host's site", () => {
  test("is the last two labels of a name, and an IP address or a single label itself", () => {
    expect(siteOf("app.smithers.sh")).toBe("smithers.sh")
    expect(siteOf("smithers.sh")).toBe("smithers.sh")
    expect(siteOf("localhost")).toBe("localhost")
    expect(siteOf("127.0.0.1")).toBe("127.0.0.1")
    expect(siteOf("[::1]")).toBe("[::1]")
    // Wider than the real site under a two-label public suffix: a frame refuses more, never less.
    expect(siteOf("app.example.co.uk")).toBe("co.uk")
  })
})

// The agent evals caught "show me the Effect docs" opening a guessed site in three runs of eight (2026-10-20): the
// flow's description now names the page for each well-known docs site, and each is one the app opens in the chat.
describe("well-known docs", () => {
  test("the flow's description names each one's page, which opens in the chat", () => {
    for (const [name, url] of Object.entries(KNOWN_DOCS)) {
      expect(OpenWebPage.description).toContain(`${name} ${url}`)
      expect([name, reason(url, "embed")]).toEqual([name, "ok"])
    }
    expect(KNOWN_DOCS.Effect).toBe("https://effect.website/docs")
  })
})
