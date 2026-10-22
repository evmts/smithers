import { describe, expect, test } from "vitest"
import { cutText } from "./text"

describe("cutText", () => {
  test("keeps text that fits, and cuts what doesn't before the first character that doesn't fit, never inside one", () => {
    expect(cutText("abc", 3)).toEqual({ text: "abc", truncated: false })
    expect(cutText("abcd", 3)).toEqual({ text: "abc", truncated: true })
    // "é" is two bytes: three bytes hold one and the first byte of the next, which is left out.
    expect(cutText("ééé", 3)).toEqual({ text: "é", truncated: true })
    // "😀" is four bytes: none fits in three.
    expect(cutText("😀", 3)).toEqual({ text: "", truncated: true })
  })
})
