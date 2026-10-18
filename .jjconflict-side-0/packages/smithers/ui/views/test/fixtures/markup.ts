/**
 * Reads React's static markup for what a frame would load, run or follow.
 *
 * React escapes `&`, `<`, `>`, `"` and `'` in text and in attribute values,
 * so in its output every `<` opens a tag and every attribute value is a
 * double-quoted run without `"` or `>`. That makes a tag scanner exact here,
 * where it would not be for arbitrary HTML.
 */
import { refusedElements } from "../../src/internal/vocabulary.ts"

const tags = /<([A-Za-z][^\s/>]*)([^>]*)>/g
const attributes = /\s([^\s=/>]+)(?:="([^"]*)")?/g

/** The first unsafe thing in the markup, described, or `undefined`. */
export const unsafeMarkup = (html: string): string | undefined => {
  for (const [, tag, rest] of html.matchAll(tags)) {
    const element = tag!.toLowerCase()
    if (refusedElements.has(element)) return `element <${element}>`
    for (const [, name, value = ""] of rest!.matchAll(attributes)) {
      const attribute = name!.toLowerCase()
      if (attribute.startsWith("on")) return `handler ${attribute}`
      if (
        ["href", "xlink:href", "action", "formaction", "srcset", "srcdoc", "poster", "background"].includes(attribute)
      ) {
        return `attribute ${attribute}`
      }
      if (attribute === "src" && !(element === "img" && /^data:image\//i.test(value))) return `source ${value}`
    }
  }
  return undefined
}
