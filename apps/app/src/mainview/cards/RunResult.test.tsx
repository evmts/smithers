import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { htmlRunResult, RunResult, RUN_RESULT_CSP } from "./RunResult.tsx"

describe("authored run results", () => {
 test.each(["review", "unrelated-custom-flow"])("renders %s through the same result contract", (name) => {
  const result = JSON.stringify({ flow: name, ui: { kind: "html", title: name, html: "<h1>Findings</h1><script>parent.document.body.remove()</script>" } })
  const markup = renderToStaticMarkup(<RunResult result={result} />)
  expect(markup).toContain("<iframe")
  expect(markup).toContain(`title="${name}"`)
  expect(markup).toContain('sandbox="allow-scripts"')
  expect(markup).toContain("Content-Security-Policy")
  expect(markup).toContain("connect-src &#x27;none&#x27;")
  expect(markup).not.toContain("allow-same-origin")
  expect(markup).not.toContain("allow-top-navigation")
  expect(markup).not.toContain('src="file:')
 })
 test.each(["plain output", "null", "{}", '{"ui":null}', '{"ui":{"kind":"html","title":"title","html":4}}', '{"ui":{"kind":"markdown","title":"title","html":"hi"}}'])("rejects malformed custom output %s", (value) => {
  expect(htmlRunResult(value)).toBeNull()
 })
 test("keeps ordinary output visible", () => {
  const markup = renderToStaticMarkup(<RunResult result="done" technical />)
  expect(markup).toContain("<details")
  expect(markup).toContain("done")
  expect(markup).not.toContain("<iframe")
 })
 test("the isolation policy forbids all external resources and submissions", () => {
  expect(RUN_RESULT_CSP).toContain("default-src 'none'")
  expect(RUN_RESULT_CSP).toContain("form-action 'none'")
  expect(RUN_RESULT_CSP).toContain("base-uri 'none'")
 })
})


describe("trusted lanes accounts integration", () => {
 test("mounts the fixed service route and ignores authored URLs", () => {
  const result = JSON.stringify({ ui: { kind: "lanes-accounts", url: "https://evil.example", html: "<script>bad()</script>" } })
  const markup = renderToStaticMarkup(<RunResult result={result} accountsOrigin="https://accounts.example.com" />)
  expect(markup).toContain('src="https://accounts.example.com/accounts/tool"')
  expect(markup).toContain('href="https://accounts.example.com/auth/login"')
  expect(markup).not.toContain("evil.example")
  expect(markup).not.toContain("bad()")
  expect(markup).toContain('sandbox="allow-scripts allow-same-origin allow-forms"')
  expect(markup).not.toContain("allow-top-navigation")
 })
 test.each([undefined, "http://accounts.example.com", "https://user:pass@accounts.example.com", "https://accounts.example.com/path", "https://accounts.example.com?x=1"])("fails closed for invalid operator origin %s", origin => {
  const markup = renderToStaticMarkup(<RunResult result={'{"ui":{"kind":"lanes-accounts"}}'} accountsOrigin={origin} />)
  expect(markup).not.toContain("<iframe")
 })
})
