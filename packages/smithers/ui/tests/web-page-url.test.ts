// webPageTarget and framedPageTarget: the fail-closed guards in front of
// WebLinkCard and WebPageView.
import { describe, expect, test } from "bun:test";
import { framedPageTarget, webPageTarget } from "../src/web-page";

describe("webPageTarget accepts", () => {
  test("an absolute https URL, as its normalized href, origin and host", () => {
    expect(webPageTarget("https://example.com/docs/a b?q=1#part")).toEqual({
      href: "https://example.com/docs/a%20b?q=1#part",
      origin: "https://example.com",
      host: "example.com",
    });
  });

  test("an http URL, keeping a non-default port in the origin and host", () => {
    expect(webPageTarget("http://localhost:5173/preview")).toEqual({
      href: "http://localhost:5173/preview",
      origin: "http://localhost:5173",
      host: "localhost:5173",
    });
  });

  test("case, surrounding space, default ports and browser-stripped tab, CR and LF", () => {
    expect(webPageTarget("  HTTPS://Exa\tmple.COM:443/\r\npath \n")).toEqual({
      href: "https://example.com/path",
      origin: "https://example.com",
      host: "example.com",
    });
  });

  test("an internationalized host, shown as punycode so a look-alike cannot pass as another site", () => {
    expect(webPageTarget("https://ex\u0430mple.com/")?.host).toBe("xn--exmple-4nf.com");
  });

  test("a scheme without slashes, rendered as the normalized URL it parses to", () => {
    expect(webPageTarget("https:example.com/a")?.href).toBe("https://example.com/a");
  });
});

describe("webPageTarget refuses", () => {
  const refused: ReadonlyArray<readonly [string, string]> = [
    ["javascript:", "javascript:alert(1)"],
    ["javascript: in mixed case", "JaVaScRiPt:alert(1)"],
    ["javascript: split by a tab", "java\tscript:alert(1)"],
    ["javascript: split by a newline", "java\nscript:alert(1)"],
    ["javascript: after leading space", "  javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["file:", "file:///etc/passwd"],
    ["blob:", "blob:https://example.com/0b1c2d3e"],
    ["about:blank", "about:blank"],
    ["ftp:", "ftp://example.com/file"],
    ["ws:", "wss://example.com/socket"],
    ["mailto:", "mailto:maya@example.com"],
    ["a root-relative path", "/settings"],
    ["a relative path", "docs/page"],
    ["a protocol-relative URL", "//evil.example/x"],
    ["a backslash network path", "/\\evil.example"],
    ["a tab-hidden protocol-relative URL", "/\t/evil.example"],
    ["an empty string", ""],
    ["whitespace", " \t\n "],
    ["a scheme with no host", "https://"],
    ["a username and password", "https://maya:secret@example.com/"],
    ["a username alone", "https://maya@example.com/"],
    ["a password alone", "https://:secret@example.com/"],
  ];
  for (const [name, url] of refused) {
    test(name, () => {
      expect(webPageTarget(url)).toBeNull();
    });
  }

  test("a value that is not a string", () => {
    expect(webPageTarget(undefined as unknown as string)).toBeNull();
    expect(webPageTarget({ toString: () => "https://example.com" } as unknown as string)).toBeNull();
  });
});

describe("webPageTarget and the host's origin", () => {
  test("refuses a page on the host's own origin, however it is written", () => {
    expect(webPageTarget("https://app.smithers.sh/settings", "https://app.smithers.sh")).toBeNull();
    expect(webPageTarget("HTTPS://APP.smithers.sh:443/", "https://app.smithers.sh")).toBeNull();
    expect(webPageTarget("https://app.smithers.sh/", "https://App.Smithers.sh:443/chat")).toBeNull();
  });

  test("allows another scheme, port or host, and a host origin that is not a URL", () => {
    const host = "https://app.smithers.sh";
    expect(webPageTarget("http://app.smithers.sh/", host)?.origin).toBe("http://app.smithers.sh");
    expect(webPageTarget("https://app.smithers.sh:8443/", host)?.origin).toBe("https://app.smithers.sh:8443");
    expect(webPageTarget("https://docs.smithers.sh/", host)?.origin).toBe("https://docs.smithers.sh");
    // A page at about:blank has the opaque origin "null", which no http(s) page shares.
    expect(webPageTarget("https://example.com/", "null")?.origin).toBe("https://example.com");
  });
});

describe("framedPageTarget", () => {
  const host = "https://app.smithers.sh";

  test("accepts an https page on another site, as its normalized target", () => {
    expect(framedPageTarget("https://Example.com/docs?q=1", host)).toEqual({
      href: "https://example.com/docs?q=1",
      origin: "https://example.com",
      host: "example.com",
    });
    expect(framedPageTarget("https://notsmithers.sh/", host)?.origin).toBe("https://notsmithers.sh");
  });

  test("refuses http, even on localhost, because cookies are not isolated by port", () => {
    expect(framedPageTarget("http://localhost:4000/", "http://localhost:1337")).toBeNull();
    expect(framedPageTarget("http://example.com/", host)).toBeNull();
    expect(framedPageTarget("http://example.com/")).toBeNull();
  });

  test("refuses everything webPageTarget refuses", () => {
    for (const url of ["javascript:alert(1)", "java\tscript:alert(1)", "data:text/html,hi", "/settings", "//evil.example/", "https://maya@example.com/"]) {
      expect(framedPageTarget(url, host)).toBeNull();
    }
  });

  test("refuses the host's own host under any scheme or port", () => {
    expect(framedPageTarget("https://localhost:1337/", "http://localhost:1337")).toBeNull();
    expect(framedPageTarget("https://localhost:4000/", "http://localhost:1337")).toBeNull();
    expect(framedPageTarget("https://app.smithers.sh/settings", host)).toBeNull();
    expect(framedPageTarget("https://APP.smithers.sh.:8443/", host)).toBeNull();
  });

  test("refuses every page on the host's site", () => {
    expect(framedPageTarget("https://smithers.sh/", host)).toBeNull();
    expect(framedPageTarget("https://docs.smithers.sh/", host)).toBeNull();
    expect(framedPageTarget("https://a.b.smithers.sh/", `${host}.`)).toBeNull();
    expect(framedPageTarget("https://app.localhost/", "http://localhost:1337")).toBeNull();
  });

  test("an IP address is its own site", () => {
    expect(framedPageTarget("https://127.0.0.1:4000/", "http://127.0.0.1:1337")).toBeNull();
    expect(framedPageTarget("https://[::1]/", "http://[::1]:1337")).toBeNull();
    expect(framedPageTarget("https://127.0.0.2/", "http://127.0.0.1:1337")?.host).toBe("127.0.0.2");
  });

  test("over-refuses under a two-label public suffix, failing closed", () => {
    expect(framedPageTarget("https://someone-else.pages.dev/", "https://mine.pages.dev")).toBeNull();
    expect(framedPageTarget("https://shop.example.co.uk/", "https://app.mine.co.uk")).toBeNull();
  });

  test("refuses an unknown host origin; accepts an explicitly opaque one", () => {
    expect(framedPageTarget("https://smithers.sh/")).toBeNull();
    expect(framedPageTarget("https://smithers.sh/", "null")?.host).toBe("smithers.sh");
    expect(framedPageTarget("https://example.com/", "not a url")).toBeNull();
  });
});
