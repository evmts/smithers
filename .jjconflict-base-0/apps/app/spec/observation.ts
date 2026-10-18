import { createHash } from "node:crypto"

/** Browser capture after volatile screenshot regions have been masked. */
export interface CapturedPage {
  readonly blocks: ReadonlyArray<{ readonly view: string; readonly text: string }>
  readonly accessibility: string
  readonly screenshot: Uint8Array
}
export interface Observation {
  readonly blocks: CapturedPage["blocks"]
  readonly accessibility: string
  readonly screenshotDigest: string
}
export const digest = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex")

/** Literal journey-provided values only; no implicit masking of meaningful counts. */
export const observe = (page: CapturedPage, volatile: ReadonlyArray<string> = []): Observation => {
  if (volatile.some((value) => value.length === 0)) throw new Error("Empty volatile value")
  const values = [...new Set(volatile)].sort((a, b) => b.length - a.length || a.localeCompare(b))
  const mask = (text: string) => {
    // One pass prevents replacement markers from being rewritten by another mask.
    const pattern = values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
    return pattern === "" ? text : text.replace(new RegExp(pattern, "g"), "<volatile>")
  }
  return {
    blocks: page.blocks.map(({ view, text }) => ({ view, text: mask(text) })),
    accessibility: mask(page.accessibility),
    screenshotDigest: digest(page.screenshot)
  }
}
