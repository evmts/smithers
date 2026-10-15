/**
 * Live acceptance probe for the retired docs-site redirect (T-DOC-04, #3510):
 * sampled `<slug>.smithers.sh` URLs (site roots, both legacy aliases, deep
 * pages the published @smthrs/flows README links, the API page, a path that
 * names no page and an unknown slug) must answer 301 with the Location that
 * scripts/package-docs.mjs computes, and that Location must answer 200 on
 * GitHub. Network only; it changes nothing.
 *
 *   node scripts/package-docs-redirect-probe.mjs
 */
import assert from "node:assert/strict"
import { expectedLocation } from "./package-docs.mjs"

/** [URL, slug (null: not a retired site), page path it names (null: none, so the docs folder)] */
const cases = [
  ["https://flow.smithers.sh/", "flow", "/"],
  ["https://flows.smithers.sh/", "flows", "/"],
  ["https://flows.smithers.sh/quickstart/", "flows", "/quickstart/"],
  ["https://flows.smithers.sh/installation/", "flows", "/installation/"],
  ["https://flows.smithers.sh/reference/api/", "flows", "/reference/api/"],
  ["https://flows.smithers.sh/guides/stand-up-a-node-runtime/", "flows", "/guides/stand-up-a-node-runtime/"],
  ["https://flows.smithers.sh/time-travel/quickstart/", "flows", "/time-travel/quickstart/"],
  ["https://flows.smithers.sh/no-such-page/", "flows", null],
  ["https://engine.smithers.sh/concepts/retries/", "engine", "/concepts/retries/"],
  ["https://smithers-patterns.smithers.sh/", "smithers-patterns", "/"],
  ["https://smithers-sync.smithers.sh/", "smithers-sync", "/"],
  ["https://unknown-docs-slug.smithers.sh/deep", null, null]
]
let failures = 0
for (const [url, slug, path] of cases) {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) })
    assert.equal(response.status, 301, `status ${response.status}`)
    const location = expectedLocation(slug, path)
    assert.equal(response.headers.get("location"), location, "location")
    const target = await fetch(location, { redirect: "manual", signal: AbortSignal.timeout(15000) })
    assert.equal(target.status, 200, `${location} answered ${target.status}`)
    console.log(`PASS ${url} -> ${location}`)
  } catch (error) {
    failures++
    console.error(`FAIL ${url}: ${error.cause?.code ?? error.message}`)
  }
}
console.log(`${cases.length - failures} pass; ${failures} fail`)
process.exitCode = failures ? 1 : 0
