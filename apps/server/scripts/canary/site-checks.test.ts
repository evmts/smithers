import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  APP_CHUNK_EXPECTATION,
  APP_DOCUMENT_CHECK_PATH,
  appChunkPath,
  FRAME_PATH_SAMPLE,
  originFromHostname,
  REDIRECT_HOP_LIMIT,
  renderTable,
  runSiteChecks,
  observeSiteResponse,
  servedBuildSha,
  servedDocumentKind,
  servingEvidence,
  tally
} from "./site-checks.ts"
import type { Fetcher, Observed } from "./site-checks.ts"

import { COMING_SOON_REPOS } from "../../src/publicRepoCatalog"

const ORIGIN = "https://canary.test"

const html = (status: number, headers: Record<string, string> = {}, body?: string): Observed => ({
  status,
  headers: { "content-type": "text/html; charset=utf-8", ...headers },
  ...(body === undefined ? {} : { body })
})
const ISOLATION = { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" }
/** The prerendered app page: the island's module script is the chunk the probe grades. */
const APP_CHUNK = "/_astro/AppIsland.B1c2d3e4.js"
/* The two real build shas of #4129: the candidate that was activated, and the prior public one. */
const CANDIDATE_SHA = "6aff046800491ebdaf444d4519b14038304a23d4"
const PRIOR_SHA = "2fca5dd1f943edda07722b9d4e23845101878365"
/*
 * A faithful app document: AppShell stamps the build sha
 * (apps/site/src/layouts/AppShell.astro) and [owner]/[repo].astro mounts the
 * island at #root, so a served document names its version and its kind.
 */
const appDocumentBody = (sha: string = CANDIDATE_SHA): string =>
  `<html><head><meta name="smithers-build-sha" content="${sha}"><link rel="stylesheet" href="/_astro/app.C0ffee.css"></head>` +
  `<body><div id="root"></div><script type="module" src="${APP_CHUNK}"></script></body></html>`
const APP_DOCUMENT_BODY = appDocumentBody()
/** The marketing document a curated root answered before lane 95: no island, no stamp. */
const MARKETING_BODY = "<html><head><title>clack</title></head><body><main>Coming soon</main></body></html>"
const isolated = html(200, ISOLATION, APP_DOCUMENT_BODY)
/** A hashed chunk as apps/site/public/_headers serves it. */
const chunk = (headers: Record<string, string> = {}): Observed => ({
  status: 200,
  headers: {
    "content-type": "text/javascript; charset=utf-8",
    "cache-control": "public, max-age=31536000, immutable",
    "cross-origin-embedder-policy": "require-corp",
    "cross-origin-resource-policy": "same-origin",
    ...headers
  }
})
const json = (): Observed => ({ status: 200, headers: { "content-type": "application/json" } })
const redirect = (status: number, location: string): Observed => ({ status, headers: { location } })

/** A deployment that answers exactly what the Worker over the site build should. */
const healthy: Record<string, Observed> = {
  ...Object.fromEntries(COMING_SOON_REPOS.map((repo) => [`/${repo.name.toLowerCase()}/`, isolated])),
  "/favicon.ico": { status: 200, headers: { "content-type": "image/png" } },
  "/apple-touch-icon.png": { status: 200, headers: { "content-type": "image/png" } },
  "/": html(200),
  "/docs/": redirect(301, "/docs/installation/"),
  "/docs/installation/": html(200),
  "/nope": html(404),
  "/docs/nope/": html(404),
  "/nope/nope/": isolated,
  "/robots.txt": { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nAllow: /\nSitemap: https://smithers.sh/sitemap-index.xml\n" },
  [APP_DOCUMENT_CHECK_PATH]: isolated,
  [APP_CHUNK]: chunk(),
  [FRAME_PATH_SAMPLE]: isolated,
  "/api/bootstrap": json(),
  "/api/public/repos": json(),
  "/__build.json": json(),
  "/llms.txt": { status: 200, headers: { "content-type": "text/plain" } },
  "/sitemap-index.xml": { status: 200, headers: { "content-type": "application/xml" } },
  "/agents/codex": redirect(301, "/docs/guides/model-seats/"),
  "/docs/guides/model-seats/": html(200),
  "/reference/journal": redirect(301, "/docs/reference/journal/"),
  "/docs/reference/journal/": html(200)
}

const fakeFetch = (table: Record<string, Observed>): { readonly fetch: Fetcher; readonly requested: Array<string> } => {
  const requested: Array<string> = []
  return {
    requested,
    fetch: async (url) => {
      const { pathname } = new URL(url)
      requested.push(pathname)
      return table[pathname] ?? html(404)
    }
  }
}

const failures = (checks: Awaited<ReturnType<typeof runSiteChecks>>) =>
  checks.filter((entry) => entry.status === "fail").map((entry) => `${entry.path}: ${entry.got}`)

describe("the site probe grades a deployment of the Worker over the site build", () => {
  test("a healthy deployment passes every check, and the aliases were followed to a 200", async () => {
    const { fetch, requested } = fakeFetch(healthy)
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: ["/agents/codex", "/reference/journal"] })
    expect(failures(checks)).toEqual([])
    expect(tally(checks)).toEqual({ passed: 18 + COMING_SOON_REPOS.length, failed: 0 })
    expect(requested).toContain(APP_CHUNK)
    expect(requested).toContain("/docs/guides/model-seats/")
    expect(requested).toContain("/docs/reference/journal/")
  })

  test("the app document without its isolation headers fails, naming the missing header", async () => {
    const { fetch } = fakeFetch({ ...healthy, [APP_DOCUMENT_CHECK_PATH]: html(200, {}, APP_DOCUMENT_BODY) })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(failures(checks)).toEqual([
      `${APP_DOCUMENT_CHECK_PATH}: 200 + COOP absent + COEP absent + served ${CANDIDATE_SHA} + document app + cache absent age absent colo absent`
    ])
  })

  /*
   * The live regression after the site and the app became one build: the app
   * page was isolated, but its /_astro chunks carried only Cache-Control, so
   * the browser refused the OPFS module worker script
   * (net::ERR_BLOCKED_BY_RESPONSE) and the app fell back to localStorage.
   */
  test("a chunk that only caches fails: the OPFS worker script needs the document's embedder policy", async () => {
    const { fetch } = fakeFetch({
      ...healthy,
      [APP_CHUNK]: {
        status: 200,
        headers: { "content-type": "text/javascript", "cache-control": "public, max-age=31536000, immutable" }
      }
    })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(failures(checks)).toEqual([`${APP_CHUNK}: 200 + COEP absent + CORP absent`])
    const graded = checks.find((entry) => entry.path === APP_CHUNK)
    expect(graded?.expected).toBe(APP_CHUNK_EXPECTATION)
  })

  test("a chunk with a cross-origin resource policy fails: the worker script is same-origin only", async () => {
    const { fetch } = fakeFetch({ ...healthy, [APP_CHUNK]: chunk({ "cross-origin-resource-policy": "cross-origin" }) })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(failures(checks)).toEqual([`${APP_CHUNK}: 200 + COEP require-corp + CORP cross-origin`])
  })

  test("an app document that loads no /_astro script fails the chunk check, and a fetcher that read no body says so", async () => {
    const { fetch } = fakeFetch({ ...healthy, [APP_DOCUMENT_CHECK_PATH]: html(200, ISOLATION, "<html><body>no island</body></html>") })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(failures(checks)).toEqual([`${APP_DOCUMENT_CHECK_PATH} -> /_astro chunk: no /_astro script in the app document`])
    const bodiless = fakeFetch({ ...healthy, [APP_DOCUMENT_CHECK_PATH]: html(200, ISOLATION) })
    const withoutBody = await runSiteChecks(bodiless.fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(failures(withoutBody)).toEqual([`${APP_DOCUMENT_CHECK_PATH} -> /_astro chunk: the fetcher read no document body`])
  })

  test("the chunk is the document's first /_astro module script, never a stylesheet or an external script", () => {
    expect(appChunkPath(APP_DOCUMENT_BODY)).toBe(APP_CHUNK)
    expect(appChunkPath("<script src=\"https://cdn.test/x.js\"></script><script type=\"module\" src=\"/_astro/a.js\"></script>")).toBe("/_astro/a.js")
    expect(appChunkPath("<link rel=\"stylesheet\" href=\"/_astro/a.css\">")).toBeUndefined()
  })

  test("an assets-layer redirect on the app document fails: the Worker did not answer first", async () => {
    const { fetch } = fakeFetch({ ...healthy, [APP_DOCUMENT_CHECK_PATH]: redirect(307, `${APP_DOCUMENT_CHECK_PATH}/`) })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(failures(checks)).toEqual([
      `${APP_DOCUMENT_CHECK_PATH}: 307 -> ${APP_DOCUMENT_CHECK_PATH}/ + COOP absent + COEP absent + served unread + document unread + cache absent age absent colo absent`,
      `${APP_DOCUMENT_CHECK_PATH} -> /_astro chunk: the fetcher read no document body`
    ])
  })

  test("a 404 page for the frame path fails: /w/* is not run_worker_first", async () => {
    const { fetch } = fakeFetch({ ...healthy, [FRAME_PATH_SAMPLE]: html(404) })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(failures(checks)).toEqual([`${FRAME_PATH_SAMPLE}: 404`])
  })

  test("a SPA shell answering an unknown path fails: the build's 404 page is what /nope must serve", async () => {
    const { fetch } = fakeFetch({ ...healthy, "/nope": html(200) })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(failures(checks)).toEqual(["/nope: 200"])
  })

  test("an HTML answer on an API path fails: the assets layer answered before the Worker", async () => {
    const { fetch } = fakeFetch({ ...healthy, "/api/bootstrap": html(200) })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(failures(checks)).toEqual(["/api/bootstrap: 200 text/html; charset=utf-8"])
  })

  test("an alias whose redirect lands on a 404 fails and shows the chain", async () => {
    const { fetch } = fakeFetch({ ...healthy, "/reference/journal": redirect(301, "/docs/reference/gone/") })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: ["/reference/journal"] })
    expect(failures(checks)).toEqual(["/reference/journal: 301 -> /docs/reference/gone/, 404"])
  })

  test("an alias may take the assets layer's trailing-slash hop after the 301", async () => {
    const { fetch } = fakeFetch({
      ...healthy,
      "/cli/overview": redirect(301, "/docs/reference/cli"),
      "/docs/reference/cli": redirect(308, "/docs/reference/cli/"),
      "/docs/reference/cli/": html(200)
    })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: ["/cli/overview"] })
    expect(failures(checks)).toEqual([])
  })

  test("a redirect cycle fails at the hop limit instead of looping", async () => {
    const { fetch, requested } = fakeFetch({ ...healthy, "/loop": redirect(301, "/loop") })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: ["/loop"] })
    expect(failures(checks)).toEqual([
      `/loop: ${Array.from({ length: REDIRECT_HOP_LIMIT + 1 }, () => "301 -> /loop").join(", ")} (more than ${REDIRECT_HOP_LIMIT} hops)`
    ])
    expect(requested.filter((path) => path === "/loop")).toHaveLength(REDIRECT_HOP_LIMIT + 1)
  })

  test("a redirect that leaves the site fails", async () => {
    const { fetch } = fakeFetch({ ...healthy, "/away": redirect(301, "https://elsewhere.test/") })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: ["/away"] })
    expect(failures(checks)).toEqual(["/away: 301 -> https://elsewhere.test/ (leaves the site)"])
  })

  test("every path in the captured Mintlify sitemap is a same-site path the probe can ask for", () => {
    const legacy = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../../site/src/data/mintlify-paths.json", import.meta.url)), "utf8")
    ) as { readonly paths: ReadonlyArray<string> }
    expect(legacy.paths.length).toBeGreaterThan(100)
    for (const path of legacy.paths) expect(path).toMatch(/^\/[^\s]*$/)
  })
})

describe("the probe's shell helpers", () => {
  test("a bare hostname, an origin, and a local dev URL each name one origin", () => {
    expect(originFromHostname("canary.smithers.sh")).toBe("https://canary.smithers.sh")
    expect(originFromHostname("https://canary.smithers.sh/")).toBe("https://canary.smithers.sh")
    expect(originFromHostname("http://localhost:8787")).toBe("http://localhost:8787")
  })

  test("the table has one row per check under a header, columns aligned", () => {
    const table = renderTable([
      { path: "/", expected: "200", got: "200", status: "pass" },
      { path: "/nope", expected: "404", got: "200", status: "fail" }
    ])
    expect(table.split("\n")).toEqual([
      "verdict  path   expected  got",
      "ok       /      200       200",
      "FAIL     /nope  404       200"
    ])
  })
})


/*
 * Lane 95: a curated catalog row is not a routing fence. Every curated
 * repository root must serve the APP document — the maintainer whose GitHub
 * App installation just landed reaches the app's import path (mvp.md M-46)
 * only if the app is what the root answers. A prerendered "Coming soon" page
 * with no isolation headers in its place is the defect, so the probe fails on
 * it instead of requiring it.
 */
test("the site probe requires the app document at every curated repository root", async () => {
  for (const repo of COMING_SOON_REPOS) {
    const path = `/${repo.name.toLowerCase()}/`
    for (const broken of [html(404), html(200, {}, "Coming soon"), html(200, { "cross-origin-opener-policy": "same-origin" }, APP_DOCUMENT_BODY)]) {
      const { fetch, requested } = fakeFetch({ ...healthy, [path]: broken })
      const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
      expect(requested).toContain(path)
      expect(checks.find((check) => check.path === path)?.status).toBe("fail")
    }
  }
})

test("the site probe rejects HTML at both icon URLs, even a 200 page", async () => {
  for (const path of ["/favicon.ico", "/apple-touch-icon.png"]) {
    const { fetch, requested } = fakeFetch({ ...healthy, [path]: html(200) })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(requested).toContain(path)
    expect(checks.find((check) => check.path === path)?.status).toBe("fail")
  }
})

for (const [path, broken] of [["/docs/nope/", html(200)], ["/nope/nope/", html(404)], ["/robots.txt", { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nAllow: /" }]] as const) {
  test(`the site probe rejects the routing regression at ${path}`, async () => {
    const { fetch, requested } = fakeFetch({ ...healthy, [path]: broken })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(requested).toContain(path)
    expect(checks.find((check) => check.path === path)?.status).toBe("fail")
    expect(failures(checks)).toHaveLength(1)
  })
}

test("the live probe reads robots text as well as app HTML, and cancels binary bodies", async () => {
  for (const type of ["text/plain; charset=utf-8", "text/html"]) {
    const observed = await observeSiteResponse(new Response("Sitemap: https://smithers.sh/sitemap-index.xml", { headers: { "content-type": type } }))
    expect(observed.body).toContain("Sitemap:")
  }
  const binary = new Response("image", { headers: { "content-type": "image/png" } })
  expect((await observeSiteResponse(binary)).body).toBeUndefined()
  expect(binary.bodyUsed).toBe(true)
})

/*
 * #4129. The real deploy of 38980376534 recorded exactly this and nothing more
 * for two of the ten curated roots:
 *
 *   FAIL  /bombshell-dev/clack/   200 + COOP absent + COEP absent
 *   FAIL  /withastro/starlight/   200 + COOP absent + COEP absent
 *
 * while the other eight passed on the same Worker version. The candidate's
 * router cannot answer a routed path without the isolation headers
 * (edge.ts -> withIsolationHeaders), and all ten roots are one ROUTED_REPOS row
 * and one prerendered template, so the output left three different situations
 * indistinguishable: a document served under the previous version, a document
 * that is not the app at all, and a real defect in the activated candidate.
 *
 * The probe now names which, per failed route, from the response it already
 * graded. These two tests are the discrimination: same symptom, different
 * evidence. The verdicts are untouched — both are still FAIL.
 */
describe("a failed curated root names what was actually served (#4129)", () => {
  const stale = (path: string): Record<string, Observed> => ({
    ...healthy,
    [path]: html(200, { "cf-cache-status": "HIT", age: "41", "cf-ray": "9a1b2c3d4e5f6071-IAD" }, MARKETING_BODY)
  })

  test("a previous-version, non-app answer is named as one: the stale/mixed-version negative", async () => {
    for (const repo of COMING_SOON_REPOS) {
      const path = `/${repo.name.toLowerCase()}/`
      const { fetch } = fakeFetch(stale(path))
      const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
      expect(failures(checks)).toEqual([
        `${path}: 200 + COOP absent + COEP absent + served absent + document not-app + cache HIT age 41 colo IAD`
      ])
    }
  })

  test("the prior public build's own app document is named by its sha, not by its cache status", async () => {
    const path = "/bombshell-dev/clack/"
    const { fetch } = fakeFetch({
      ...healthy,
      [path]: html(200, { "cf-cache-status": "HIT", age: "7", "cf-ray": "abc-SJC" }, appDocumentBody(PRIOR_SHA))
    })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(failures(checks)).toEqual([
      `${path}: 200 + COOP absent + COEP absent + served ${PRIOR_SHA} + document app + cache HIT age 7 colo SJC`
    ])
  })

  test("the candidate's own document missing the headers is named as the candidate's: a routing defect, not a stale answer", async () => {
    const path = "/withastro/starlight/"
    const { fetch } = fakeFetch({
      ...healthy,
      [path]: html(200, { "cf-cache-status": "MISS", "cf-ray": "feed-FRA" }, appDocumentBody(CANDIDATE_SHA))
    })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(failures(checks)).toEqual([
      `${path}: 200 + COOP absent + COEP absent + served ${CANDIDATE_SHA} + document app + cache MISS age absent colo FRA`
    ])
  })

  test("eight passing roots and two failing ones: only the failures carry evidence, and the eight are unchanged", async () => {
    const failing = ["/bombshell-dev/clack/", "/withastro/starlight/"]
    const { fetch } = fakeFetch({
      ...healthy,
      ...Object.fromEntries(failing.map((path) => [
        path,
        html(200, { "cf-cache-status": "HIT", age: "45", "cf-ray": "1-IAD" }, appDocumentBody(PRIOR_SHA))
      ]))
    })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(tally(checks)).toEqual({ passed: 16 + COMING_SOON_REPOS.length - 2, failed: 2 })
    for (const repo of COMING_SOON_REPOS) {
      const path = `/${repo.name.toLowerCase()}/`
      const graded = checks.find((entry) => entry.path === path)
      expect(graded?.expected).toBe("200 + COOP same-origin + COEP require-corp")
      if (failing.includes(path)) expect(graded?.got).toContain(`served ${PRIOR_SHA}`)
      else expect(graded?.got).toBe("200 + COOP same-origin + COEP require-corp")
    }
  })

  test("a served stamp that is not a sha is refused, so no response puts its own text in a verdict", async () => {
    const path = "/tanstack/db/"
    const { fetch } = fakeFetch({
      ...healthy,
      [path]: html(200, {}, appDocumentBody("'); DROP TABLE releases; --"))
    })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    expect(failures(checks)).toEqual([
      `${path}: 200 + COOP absent + COEP absent + served unvalidated + document app + cache absent age absent colo absent`
    ])
  })

  /*
   * The evidence is an allowlist, never a header dump: a failed release gate
   * runs in CI logs that many people read.
   */
  test("no body text, cookie, authorization, caller identity or ray id reaches the output", async () => {
    const path = "/jj-vcs/jj/"
    const { fetch } = fakeFetch({
      ...healthy,
      [path]: html(
        200,
        {
          "set-cookie": "session=s3cr3t; Path=/",
          authorization: "Bearer t0ken",
          "x-customer-id": "cus_4129",
          "cf-ray": "9a1b2c3d4e5f6071-IAD",
          "cf-connecting-ip": "203.0.113.7"
        },
        `${appDocumentBody(PRIOR_SHA)}<!-- reader@example.com -->`
      )
    })
    const checks = await runSiteChecks(fetch, { origin: ORIGIN, legacyPaths: [] })
    const table = renderTable(checks)
    for (const secret of ["s3cr3t", "session=", "Bearer", "t0ken", "cus_4129", "203.0.113.7", "9a1b2c3d4e5f6071", "reader@example.com", "Coming soon"]) {
      expect(table).not.toContain(secret)
    }
    expect(table).toContain(`served ${PRIOR_SHA}`)
    expect(table).toContain("colo IAD")
  })

  test("ordinary documentation and static routes are graded exactly as before, with no evidence and no extra request", async () => {
    const before = fakeFetch(healthy)
    const baseline = await runSiteChecks(before.fetch, { origin: ORIGIN, legacyPaths: ["/agents/codex"] })
    expect(failures(baseline)).toEqual([])
    for (const path of ["/", "/docs/", "/nope", "/docs/nope/", "/llms.txt", "/sitemap-index.xml", "/robots.txt", "/__build.json", APP_CHUNK, "/agents/codex"]) {
      expect(baseline.find((entry) => entry.path === path)?.got ?? "").not.toContain("served ")
    }
    const after = fakeFetch(healthy)
    await runSiteChecks(after.fetch, { origin: ORIGIN, legacyPaths: ["/agents/codex"] })
    expect(after.requested).toEqual(before.requested)
  })
})

describe("the serving evidence is a total function of one graded response", () => {
  test("a served sha is the document's own stamp, lowercased, or why there is none", () => {
    expect(servedBuildSha(appDocumentBody(CANDIDATE_SHA.toUpperCase()))).toBe(CANDIDATE_SHA)
    expect(servedBuildSha("<html><head></head></html>")).toBe("absent")
    expect(servedBuildSha(undefined)).toBe("unread")
    expect(servedBuildSha(appDocumentBody("unknown"))).toBe("unknown")
    expect(servedBuildSha(appDocumentBody("not-a-sha"))).toBe("unvalidated")
  })

  test("the document kind is the island mount only the app page carries", () => {
    expect(servedDocumentKind(APP_DOCUMENT_BODY)).toBe("app")
    expect(servedDocumentKind("<div id='root'></div>")).toBe("app")
    expect(servedDocumentKind(MARKETING_BODY)).toBe("not-app")
    expect(servedDocumentKind(undefined)).toBe("unread")
  })

  test("a colo is three letters from CF-Ray's last token, and anything else is absent", () => {
    const withRay = (ray: string) => servingEvidence({ status: 200, headers: { "cf-ray": ray } })
    expect(withRay("9a1b2c3d4e5f6071-IAD")).toContain("colo IAD")
    expect(withRay("9a1b2c3d4e5f6071")).toContain("colo absent")
    expect(withRay("x-iad")).toContain("colo absent")
    expect(servingEvidence({ status: 200, headers: {} })).toBe("served unread + document unread + cache absent age absent colo absent")
  })
})

/*
 * Root review of this lane, 2026-10-17T00:44Z: the evidence may not echo a
 * response header. Each value names itself from a finite vocabulary or a
 * bounded canonical number, or it is reported as `unvalidated` and never
 * printed — a failed release gate is read in CI logs, and a header is
 * caller-reachable input.
 */
describe("a response header reaches the evidence only through a finite vocabulary", () => {
  const evidence = (headers: Record<string, string>) => servingEvidence({ status: 200, headers })

  test("a cache status is one of Cloudflare's documented values, and anything else is unvalidated", () => {
    for (const status of ["HIT", "MISS", "EXPIRED", "STALE", "BYPASS", "REVALIDATED", "UPDATING", "DYNAMIC", "NONE/UNKNOWN", "IGNORED", "DEFERRED"]) {
      expect(evidence({ "cf-cache-status": status })).toContain(`cache ${status} `)
    }
    for (const hostile of ["hit", "HIT, MISS", "HIT\nset-cookie: a=b", "sk-live-4129abcdef", "HIT ".repeat(400), ""]) {
      const got = evidence({ "cf-cache-status": hostile })
      expect(got).toContain("cache unvalidated ")
      if (hostile !== "") expect(got).not.toContain(hostile.slice(0, 8))
      expect(got.length).toBeLessThan(200)
    }
  })

  test("an age is seconds and nothing else", () => {
    expect(evidence({ age: "0" })).toContain("age 0 ")
    expect(evidence({ age: "1234567" })).toContain("age 1234567 ")
    for (const hostile of ["12345678", "-1", "1.5", "41 ", "41; x=y", "0041\nx", "many"]) {
      const got = evidence({ age: hostile })
      expect(got).toContain("age unvalidated ")
      expect(got).not.toContain(hostile)
    }
  })

  test("a colo is three letters, and a ray id is never printed", () => {
    expect(evidence({ "cf-ray": "9a1b2c3d4e5f6071-IAD" })).toContain("colo IAD")
    for (const hostile of ["9a1b2c3d4e5f6071-iad", "9a1b2c3d4e5f6071-IADX", "-IAD IAD", "x"]) {
      expect(evidence({ "cf-ray": hostile })).toContain("colo absent")
    }
    expect(evidence({ "cf-ray": "9a1b2c3d4e5f6071-IAD" })).not.toContain("9a1b2c3d")
  })

  test("the whole evidence line stays one short line whatever the response carries", () => {
    const got = servingEvidence({
      status: 200,
      headers: { "cf-cache-status": "x".repeat(5000), age: "9".repeat(5000), "cf-ray": "y".repeat(5000) },
      body: `<meta name="smithers-build-sha" content="${"z".repeat(5000)}">`
    })
    expect(got).toBe("served unvalidated + document not-app + cache unvalidated age unvalidated colo absent")
    expect(got.split("\n")).toHaveLength(1)
  })
})
