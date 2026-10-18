import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { ViewCsp } from "../src/index.ts"

const expectedHash = (text: string) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`

describe("ViewCsp.hash", () => {
  it("is the CSP source expression for the script's SHA-256", () => {
    for (const script of ["", "console.log(1)", "const s = \"é漢🙂\"", "x".repeat(10_000)]) {
      expect(ViewCsp.hash(script)).toBe(expectedHash(script))
    }
  })
})

describe("ViewCsp.policy", () => {
  const policy = ViewCsp.policy("'sha256-abc'")
  const directives = new Map(
    policy.split("; ").map((directive) => {
      const [name, ...values] = directive.split(" ")
      return [name!, values.join(" ")] as const
    })
  )

  it("admits only the pinned runtime as script", () => {
    expect(directives.get("default-src")).toBe("'none'")
    expect(directives.get("script-src")).toBe("'sha256-abc'")
    expect(directives.get("script-src-attr")).toBe("'none'")
  })

  it("closes every network, plugin, frame, worker, base and form channel", () => {
    for (
      const name of [
        "connect-src",
        "media-src",
        "object-src",
        "frame-src",
        "child-src",
        "worker-src",
        "manifest-src",
        "base-uri",
        "form-action"
      ]
    ) {
      expect(directives.get(name)).toBe("'none'")
    }
    expect(directives.get("img-src")).toBe("data:")
    expect(directives.get("font-src")).toBe("data:")
    expect(directives.get("style-src")).toBe("'unsafe-inline'")
  })
})

describe("ViewCsp.frameDocument", () => {
  const document = (runtime: string, styles = ".a{}") =>
    ViewCsp.frameDocument({ runtime, styles, nonce: "n".repeat(32), theme: "dark" })

  it("pins the runtime it writes, and nothing else runs", () => {
    const runtime = "window.started = true"
    const html = document(runtime)
    expect(html).toContain(`<script>${runtime}</script>`)
    expect(html).toContain(ViewCsp.policy(ViewCsp.hash(runtime)).replace(/'/g, "'"))
    expect(html.match(/<script/g)).toHaveLength(1)
  })

  it("carries the nonce and theme on the root element and no view content", () => {
    const html = document("1")
    expect(html).toContain(`<html ${ViewCsp.nonceAttribute}="${"n".repeat(32)}" data-theme="dark">`)
    expect(html).toContain("</head><body><script>1</script></body></html>")
    expect(html.startsWith("<!doctype html>")).toBe(true)
  })

  it("keeps a runtime or style sheet from closing its element early, and hashes what it wrote", () => {
    const runtime = "const s = '</script><img src=x onerror=alert(1)>'; const t = '</SCRIPT >'"
    const html = document(runtime, "a::after{content:'</style><script>alert(1)</script>'}")
    const written = runtime.replace("</script", "<\\/script").replace("</SCRIPT", "<\\/SCRIPT")
    expect(html).toContain(`<script>${written}</script>`)
    expect(html).toContain(ViewCsp.hash(written))
    expect(html).not.toContain(ViewCsp.hash(runtime))
    // A style element ends only at `</style`, so a script tag inside it stays text.
    expect(html).toContain("<style>a::after{content:'<\\/style><script>alert(1)</script>'}</style>")
    expect(html.match(/<\/style>/gi)).toHaveLength(1)
    expect(html.match(/<\/script>/gi)).toHaveLength(2)
  })

  it("escapes the attributes it writes", () => {
    const html = ViewCsp.frameDocument({ runtime: "", styles: "", nonce: "\"><script>&", theme: "light" })
    expect(html).toContain(`${ViewCsp.nonceAttribute}="&quot;&gt;&lt;script&gt;&amp;"`)
  })

  it("is sandboxed to scripts alone", () => {
    expect(ViewCsp.sandbox).toBe("allow-scripts")
  })
})
