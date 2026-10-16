/**
 * The collector and the resolver behind the published-links gate.
 *
 * The regression is the first resolver case: `/migration/1.0` redirected to the
 * install page from 2026-10-06 until issue 3845, and the gates that existed
 * passed it because the install page is a real page.
 *
 * Run it with `node --test scripts/published-links.test.mjs`.
 */
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"

import {
  collect,
  composed,
  failure,
  isScanned,
  keepsPath,
  liveFailure,
  offenders,
  readRedirects,
  redirectOf,
  shippedTextFiles,
  urlsIn
} from "./published-links.mjs"

const fixture = (t, files) => {
  const root = mkdtempSync(join(tmpdir(), "smithers-published-links-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), contents)
  }
  return root
}

const guide = "<h1>Upgrade</h1><h2 id=\"run-data\">Run data</h2>"
const install = "<h1>Install</h1><h2 id=\"install\">Install</h2>"

describe("where a published URL lands on the built site", () => {
  it("refuses the redirect that sent the migration guide to the install page", (t) => {
    const dist = fixture(t, { "docs/installation/index.html": install })
    const rules = readRedirects("/migration/1.0  /docs/installation/  301\n/migration/1.0/  /docs/installation/  301\n")
    for (const url of ["https://smithers.sh/migration/1.0", "https://smithers.sh/migration/1.0/", "https://smithers.sh/migration/1.0#run-data"]) {
      assert.equal(failure(url, dist, rules), "redirects to an unrelated page, /docs/installation/", url)
    }
  })

  it("accepts a page at the URL's own path, with or without the trailing slash", (t) => {
    const dist = fixture(t, { "migration/1.0/index.html": guide, "about.html": "<h1>About</h1>", "llms-full.txt": "docs" })
    for (const url of ["/migration/1.0", "/migration/1.0/", "/migration/1.0#run-data", "/about", "/llms-full.txt"]) {
      assert.equal(failure(`https://smithers.sh${url}`, dist, []), undefined, url)
    }
  })

  it("names a missing page and a missing fragment", (t) => {
    const dist = fixture(t, { "migration/1.0/index.html": guide })
    assert.equal(failure("https://smithers.sh/migration/2.0", dist, []), "has no page at /migration/2.0")
    assert.equal(
      failure("https://smithers.sh/migration/1.0#databases", dist, []),
      "has no element with id \"databases\" on /migration/1.0"
    )
  })

  it("accepts a redirect that keeps the path and carries the fragment to the destination", (t) => {
    const dist = fixture(t, { "docs/migration/1.0/index.html": guide, "changelogs/100-rc0/index.html": "<h2 id=\"fixed\">Fixed</h2>" })
    const rules = readRedirects("/migration/1.0 /docs/migration/1.0/ 301\n/changelogs/1.0.0-rc.0 /changelogs/100-rc0/ 301\n")
    assert.equal(failure("https://smithers.sh/migration/1.0#run-data", dist, rules), undefined)
    assert.equal(failure("https://smithers.sh/changelogs/1.0.0-rc.0#fixed", dist, rules), undefined)
    assert.equal(
      failure("https://smithers.sh/migration/1.0#rewind", dist, rules),
      "has no element with id \"rewind\" on /docs/migration/1.0/"
    )
  })

  it("reads a redirect before the page it shadows, as the host does", (t) => {
    const dist = fixture(t, { "migration/1.0/index.html": guide, "docs/installation/index.html": install })
    const rules = readRedirects("/migration/1.0 /docs/installation/ 301\n")
    assert.equal(failure("https://smithers.sh/migration/1.0", dist, rules), "redirects to an unrelated page, /docs/installation/")
  })

  it("refuses a chain and a destination that was never built", (t) => {
    const dist = fixture(t, { "docs/reference/api/flow/index.html": "<h1>flow</h1>" })
    const rules = readRedirects(
      "/reference/api/flow /docs/reference/api/flow/ 301\n/api/flow /reference/api/flow 301\n/reference/api/* /docs/reference/api/:splat/ 301\n"
    )
    assert.equal(failure("https://smithers.sh/reference/api/flow", dist, rules), undefined)
    assert.equal(failure("https://smithers.sh/api/flow", dist, rules), "redirects through a chain at /reference/api/flow")
    assert.equal(failure("https://smithers.sh/reference/api/plan/", dist, rules), "has no page at /docs/reference/api/plan/")
  })

  it("refuses another origin", (t) => {
    assert.equal(failure("https://smithers.sh:8443/", fixture(t, { "index.html": "" }), []), "is not a https://smithers.sh URL")
  })
})

describe("whether a destination is about the path that was asked for", () => {
  it("lets a redirect add a prefix or respell a version, and never drop a segment", () => {
    assert.equal(keepsPath("/migration/1.0", "/docs/migration/1.0/"), true)
    assert.equal(keepsPath("/migration/1.0", "/migration/1.0/"), true)
    assert.equal(keepsPath("/changelogs/1.0.0-rc.0", "/changelogs/100-rc0/"), true)
    assert.equal(keepsPath("/Reference/API/Flow", "/docs/reference/api/flow/"), true)
    assert.equal(keepsPath("/migration/1.0", "/docs/installation/"), false)
    assert.equal(keepsPath("/migration/1.0", "/docs/migration/"), false)
    assert.equal(keepsPath("/migration/1.0", "/1.0/migration/"), false)
    assert.equal(keepsPath("/docs/concepts/retries", "/docs/installation/"), false)
  })

  it("answers a literal rule with either slash form and a splat rule with its tail", () => {
    const rules = readRedirects("# comment\n\n/old  /new/  301\n/api/*  /docs/api/:splat/  301\n")
    assert.deepEqual(rules, [
      { source: "/old", destination: "/new/", splat: false },
      { source: "/api/", destination: "/docs/api/:splat/", splat: true }
    ])
    assert.equal(redirectOf(rules, "/old/")?.pathname, "/new/")
    assert.equal(redirectOf(rules, "/api/flow/")?.pathname, "/docs/api/flow/")
    assert.equal(redirectOf(rules, "/older"), undefined)
  })
})

describe("which URLs a package ships", () => {
  it("reads string literals, comments and prose, and drops the punctuation around a URL", () => {
    assert.deepEqual(
      urlsIn([
        "const notice = \"Migration guide: https://smithers.sh/migration/1.0\"",
        " * See https://smithers.sh/migration/1.0#run-data.",
        "[guide](https://smithers.sh/docs/installation/), then `https://smithers.sh/<owner>/<repo>`",
        "write(\"https://smithers.sh\\n\"); see https://smithers.sh.",
        "https://migrate.smithers.sh https://smithers.sh.example.com https://smithers.shop"
      ].join("\n")),
      [
        { line: 1, url: "https://smithers.sh/migration/1.0" },
        { line: 2, url: "https://smithers.sh/migration/1.0#run-data" },
        { line: 3, url: "https://smithers.sh/docs/installation/" },
        { line: 3, url: "https://smithers.sh/" },
        { line: 4, url: "https://smithers.sh" },
        { line: 4, url: "https://smithers.sh" }
      ]
    )
  })

  it("scans what the manifest ships, and neither build output nor release history", (t) => {
    const directory = fixture(t, {
      "README.md": "https://smithers.sh/readme",
      "CHANGELOG.md": "https://smithers.sh/changelog",
      "package.json": "{\"homepage\":\"https://smithers.sh/home\"}",
      "docs/guides/upgrade.md": "https://smithers.sh/docs",
      "src/index.ts": "export const url = \"https://smithers.sh/src\"",
      "src/logo.png": "https://smithers.sh/binary",
      "dist/esm/index.js": "https://smithers.sh/dist",
      "test/index.test.ts": "https://smithers.sh/test",
      "bin/cli.mjs": "https://smithers.sh/bin",
      "notes.md": "https://smithers.sh/unshipped"
    })
    const manifest = { files: ["src/**/*.ts", "src/**/*.png", "dist/**/*.js", "bin/**/*.mjs", "CHANGELOG.md", "docs/"] }
    assert.deepEqual(shippedTextFiles(directory, manifest), [
      "README.md",
      "bin/cli.mjs",
      "docs/guides/upgrade.md",
      "package.json",
      "src/index.ts"
    ])
    assert.equal(isScanned("dist/esm/index.js"), false)
    assert.equal(isScanned("CHANGELOG.md"), false)
    assert.equal(isScanned("docs/CHANGELOG.md"), true)
  })

  it("finds the notice, the CLI's refusal and the removed-command anchors in this repository", () => {
    const shipped = collect()
    const has = (file, url) => shipped.some((reference) => reference.file === file && reference.url === url)
    assert.ok(has("packages/smthrs-deprecation/src/index.ts", "https://smithers.sh/migration/1.0"))
    assert.ok(has("packages/smthrs-deprecation/README.md", "https://smithers.sh/migration/1.0"))
    assert.ok(has("packages/smithers/src/Legacy.ts", "https://smithers.sh/migration/1.0#run-data"))
    assert.ok(has("packages/smithers/src/Project.ts", "https://smithers.sh/migration/1.0#run-data"))
    assert.ok(shipped.every((reference) => !reference.file.endsWith("/CHANGELOG.md") && !reference.file.includes("/dist/")))
    const anchors = composed().map((reference) => reference.url)
    assert.ok(anchors.includes("https://smithers.sh/migration/1.0#replay"))
    assert.ok(anchors.includes("https://smithers.sh/migration/1.0#databases"))
    assert.ok(anchors.includes("https://smithers.sh/migration/1.0#run-data"))
    assert.ok(anchors.length > 50, `expected the removed-command table, found ${anchors.length} anchors`)
  })
})

describe("where production sends a published URL", () => {
  const response = (status, { location, body = "" } = {}) => ({
    status,
    headers: { get: (name) => name === "location" ? location ?? null : null },
    body: { cancel: async () => {} },
    text: async () => body
  })
  const host = (routes, seen = []) => async (url, init) => {
    assert.deepEqual(init, { redirect: "manual" })
    seen.push(new URL(url).pathname)
    return routes[new URL(url).pathname] ?? response(404)
  }

  it("refuses the 301 to the install page that production answered before the fix", async () => {
    const request = host({
      "/migration/1.0": response(301, { location: "/docs/installation/" }),
      "/docs/installation/": response(200, { body: install })
    })
    assert.equal(await liveFailure("https://smithers.sh/migration/1.0#run-data", request), "redirects to an unrelated page, /docs/installation/")
  })

  it("accepts the host's trailing-slash redirect and reads the fragment from the page", async () => {
    const seen = []
    const request = host({
      "/migration/1.0": response(307, { location: "/migration/1.0/" }),
      "/migration/1.0/": response(200, { body: guide })
    }, seen)
    const landings = new Map()
    assert.equal(await liveFailure("https://smithers.sh/migration/1.0#run-data", request, landings), undefined)
    assert.equal(await liveFailure("https://smithers.sh/migration/1.0", request, landings), undefined)
    assert.equal(
      await liveFailure("https://smithers.sh/migration/1.0#rewind", request, landings),
      "has no element with id \"rewind\" on /migration/1.0/"
    )
    assert.deepEqual(seen, ["/migration/1.0", "/migration/1.0/"], "one path costs one walk, however many fragments name it")
  })

  it("accepts one redirect that keeps the path, then the host's slash, and refuses a second move", async () => {
    const request = host({
      "/reference/api/flow": response(301, { location: "/docs/reference/api/flow" }),
      "/docs/reference/api/flow": response(307, { location: "/docs/reference/api/flow/" }),
      "/docs/reference/api/flow/": response(200),
      "/a/flow": response(301, { location: "/b/a/flow/" }),
      "/b/a/flow/": response(301, { location: "/c/b/a/flow/" })
    })
    assert.equal(await liveFailure("https://smithers.sh/reference/api/flow", request), undefined)
    assert.equal(await liveFailure("https://smithers.sh/a/flow", request), "redirects through a chain at /c/b/a/flow/")
  })

  it("names an error status, a redirect off the site and a loop", async () => {
    const request = host({
      "/gone": response(404),
      "/away": response(302, { location: "https://example.com/away" }),
      "/loop": response(307, { location: "/loop/" }),
      "/loop/": response(307, { location: "/loop" })
    })
    assert.equal(await liveFailure("https://smithers.sh/gone", request), "answers HTTP 404 at /gone")
    assert.equal(await liveFailure("https://smithers.sh/away", request), "redirects off the site, to https://example.com")
    assert.equal(await liveFailure("https://smithers.sh/loop", request), "does not settle within 4 requests")
  })
})

describe("the report", () => {
  it("lists every place a failing URL ships and judges each URL once", async () => {
    let judged = 0
    const lines = await offenders(
      [
        { file: "packages/a/README.md", line: 3, url: "https://smithers.sh/gone" },
        { file: "packages/a/src/index.ts", line: 9, url: "https://smithers.sh/gone" },
        { file: "packages/a/src/index.ts", line: 12, url: "https://smithers.sh/" }
      ],
      (url) => {
        judged++
        return url.endsWith("/gone") ? "has no page at /gone" : undefined
      }
    )
    assert.deepEqual(lines, [
      "packages/a/README.md:3 https://smithers.sh/gone has no page at /gone",
      "packages/a/src/index.ts:9 https://smithers.sh/gone has no page at /gone"
    ])
    assert.equal(judged, 2)
  })
})
