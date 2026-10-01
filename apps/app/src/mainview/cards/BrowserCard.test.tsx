import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { Card } from "../state/AppState"
import { BrowserCardBody } from "./ConversationCards"

GlobalRegistrator.register({ url: "http://127.0.0.1:4920/owner/repo" })
afterAll(async () => { await GlobalRegistrator.unregister() })

const browserCard = (url: string, finalUrl: string | null = null): Extract<Card, { kind: "browser" }> => ({
  id: `browser-${url}`, kind: "browser", title: "page", status: "active", createdAt: 0, ordinal: 0,
  payload: { url, finalUrl, status: 200, frameable: true, blockReason: null }
})

test("a browser card embeds a foreign http(s) page", () => {
  const html = renderToStaticMarkup(<BrowserCardBody card={browserCard("https://example.com/page")} />)
  expect(html).toContain('<iframe class="browser-card-frame" src="https://example.com/page"')
})

test("an upstream browser card cannot frame the app's own origin with scripts and same-origin", () => {
  for (const card of [
    browserCard("http://127.0.0.1:4920/api/local-session"),
    browserCard("https://example.com/", "http://127.0.0.1:4920/"),
    browserCard("/api/local-session")
  ]) {
    const html = renderToStaticMarkup(<BrowserCardBody card={card} />)
    expect(html).not.toContain("<iframe")
    expect(html).not.toContain('href="http://127.0.0.1:4920')
    expect(html).toContain("This site can&#x27;t be embedded here.")
  }
})

const failureCard = (refusal?: Extract<Card, { kind: "browser" }>["payload"]["refusal"]) => ({
  ...browserCard("https://127.0.0.1/"),
  payload: { ...browserCard("https://127.0.0.1/").payload, error: "Safe fallback.", ...(refusal ? { refusal } : {}) }
})

test("a persisted typed input refusal renders user blame without diagnostics or invented actions", () => {
  const card = failureCard({ code: "request_invalid", status: 400, fault: "user", origin: "local", message: "RAW_REMOTE_MARKER" })
  const html = renderToStaticMarkup(<BrowserCardBody card={card} />)
  expect(html).toContain('data-fault="user"')
  expect(html).toContain("Smithers can&#x27;t do that as asked.")
  expect(html).not.toContain("RAW_REMOTE_MARKER")
  expect(html).not.toContain("Details")
  expect(html).not.toContain("<button")
  expect(html).not.toContain("<iframe")
})

test.each([
  { status: 503, code: "request_invalid", fault: "user", origin: "local" },
  { status: 400, code: "future_code", fault: "user", origin: "local" },
  { status: 400, code: "request_invalid", fault: "infra", origin: "local" },
  { status: 400, code: "request_invalid", fault: "user", origin: "client" },
  { status: 400, code: "request_invalid", fault: "user", origin: "plue" },
] as const)("untrusted browser refusal metadata stays opaque: %j", metadata => {
  const html = renderToStaticMarkup(<BrowserCardBody card={failureCard({ ...metadata, message: "RAW_REMOTE_MARKER" })} />)
  expect(html).toContain('data-fault="infra"')
  expect(html).toContain("That page couldn&#x27;t be read. Not your fault.")
  expect(html).not.toContain("RAW_REMOTE_MARKER")
})

test("legacy browser failure cards preserve their existing collapsed diagnostic", () => {
  const html = renderToStaticMarkup(<BrowserCardBody card={failureCard()} />)
  expect(html).toContain('data-fault="infra"')
  expect(html).toContain("<summary>Details</summary>")
  expect(html).toContain("Safe fallback.")
})
