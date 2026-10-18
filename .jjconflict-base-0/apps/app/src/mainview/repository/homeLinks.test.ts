import { RepositoryHomeSchema } from "@smthrs/rpc/RepositoryHome"
import { describe, expect, test } from "bun:test"
import { opensInPlace } from "./homeLinks"

/*
 * Platform's r2.4 home.json keeps absolute links to smithers.sh (Install
 * Smithers -> https://smithers.sh/, Report a bug -> https://smithers.sh/bug):
 * on smithers.sh those are the app's own pages and open in place; another
 * site opens in a new tab.
 */
describe("opensInPlace", () => {
  const here = "https://smithers.sh/smithersai/smithers"
  test("an absolute link on this page's origin opens in place", () => {
    expect(opensInPlace("https://smithers.sh/", here)).toBe(true)
    expect(opensInPlace("https://smithers.sh/bug", here)).toBe(true)
    expect(opensInPlace("HTTPS://SMITHERS.SH/docs/", here)).toBe(true)
  })
  test("another origin opens in a new tab, a different scheme or port included", () => {
    expect(opensInPlace("https://example.com/docs", here)).toBe(false)
    expect(opensInPlace("https://docs.smithers.sh/", here)).toBe(false)
    expect(opensInPlace("http://smithers.sh/bug", here)).toBe(false)
    expect(opensInPlace("https://smithers.sh:8443/bug", here)).toBe(false)
  })
  test("an origin-relative path opens in place", () => {
    expect(opensInPlace("/bug", here)).toBe(true)
    expect(opensInPlace("/", here)).toBe(true)
  })
  test("anything but an origin-relative path or an http(s) URL never opens in place", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,<p>x</p>", "//evil.example", "/\\evil.example", "mailto:a@b.c"]) expect(opensInPlace(url, here)).toBe(false)
  })
  test("without a page to compare against, an absolute link opens in a new tab", () => {
    expect(opensInPlace("https://smithers.sh/bug", undefined)).toBe(false)
  })
  test("a scheme-relative //host never reaches a renderer: the schema refuses it", () => {
    const home = (url: string) => RepositoryHomeSchema.safeParse({ kind: "blocks", blocks: [{ type: "links", links: [{ label: "Elsewhere", url }] }] }).success
    expect(home("//evil.example")).toBe(false)
    expect(home("/bug")).toBe(true)
    expect(home("https://smithers.sh/bug")).toBe(true)
  })
})
