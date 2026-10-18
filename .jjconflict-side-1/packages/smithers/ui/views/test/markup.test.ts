import { describe, expect, it } from "vitest"
import { unsafeMarkup } from "./fixtures/markup.ts"

// The fuzz oracle has to be right before its silence means anything.
describe("the fuzz oracle", () => {
  it("finds every unsafe shape in React's markup", () => {
    expect(unsafeMarkup("<div><script></script></div>")).toBe("element <script>")
    expect(unsafeMarkup("<p onclick=\"x\">a</p>")).toBe("handler onclick")
    expect(unsafeMarkup("<a href=\"/x\">a</a>")).toBe("element <a>")
    expect(unsafeMarkup("<form action=\"/x\"></form>")).toBe("attribute action")
    expect(unsafeMarkup("<img src=\"https://e/p.png\"/>")).toBe("source https://e/p.png")
    expect(unsafeMarkup("<div src=\"data:image/png;base64,AA\"></div>")).toBe("source data:image/png;base64,AA")
  })

  it("passes escaped text and safe attributes", () => {
    expect(unsafeMarkup("<div class=\"&lt;img src=x onerror=alert(1)&gt;\">&#x27; onmouseover=&#x27;x</div>"))
      .toBeUndefined()
    expect(unsafeMarkup("<img alt=\"x\" src=\"data:image/png;base64,AA\"/><input disabled=\"\"/>")).toBeUndefined()
  })
})
