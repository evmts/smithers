import assert from "node:assert/strict"
import { test } from "node:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { repoRoot } from "../../packages/repo-targets/scripts/workspace-packages.mjs"
import {
  aggregatePagesOf, aggregateSites, expectedLocation, GENERATED_MODULE, nestedDocsDirs, pageMapOf, pagesOf, README_URL,
  redirectMapOf, renderModule, sitePathOf
} from "./package-docs.mjs"

const REPO = "https://github.com/smithersai/smithers"

test("legacy hosts map to package docs folders; unknown slugs map to README", () => {
  for (const [slug, dir] of [
    ["flow", "packages/smithers/flows/flow"],
    ["engine", "packages/smithers/flows/engine"],
    ["smithers-patterns", "packages/smithers/flows/patterns"],
    ["smithers-sync", "packages/smithers/flows/sync"]
  ]) assert.equal(expectedLocation(slug, null), `${REPO}/tree/main/${dir}/docs`)
  assert.equal(expectedLocation(null, null), README_URL)
  assert.equal(README_URL, `${REPO}/blob/main/README.md`)
  assert.throws(() => expectedLocation("constructor", null), /not a retired docs site/)
  assert.ok(Object.keys(redirectMapOf()).length >= 48)
})

test("old page paths follow the sites' Starlight routes", () => {
  for (const [file, path] of [
    ["README.md", "/"],
    ["index.md", "/"],
    ["api.md", "/reference/api/"],
    ["quickstart.md", "/quickstart/"],
    ["guides/stand-up-a-node-runtime.md", "/guides/stand-up-a-node-runtime/"],
    ["concepts/retries.md", "/concepts/retries/"],
    ["reference/cli/README.md", "/reference/cli/"],
    ["reference/cli/seats.md", "/reference/cli/seats/"],
    ["guides/api.md", "/guides/api/"]
  ]) assert.equal(sitePathOf(file), path, file)
})

test("the links @smthrs/flows 1.0.0-rc.6 printed land on their own pages", () => {
  const flows = `${REPO}/blob/main/packages/smithers/flows/docs`
  for (const [path, file] of [
    ["/quickstart/", "quickstart.md"],
    ["/installation/", "installation.md"],
    ["/troubleshooting/", "troubleshooting.md"],
    ["/reference/api/", "api.md"],
    ["/concepts/aggregate-surface/", "concepts/aggregate-surface.md"],
    ["/guides/run-a-child-flow-in-a-sandbox/", "guides/run-a-child-flow-in-a-sandbox.md"],
    ["/guides/stand-up-a-node-runtime/", "guides/stand-up-a-node-runtime.md"]
  ]) {
    assert.equal(expectedLocation("flows", path), `${flows}/${file}`)
    assert.ok(existsSync(join(repoRoot, "packages/smithers/flows/docs", file)), file)
  }
  assert.equal(expectedLocation("flows", "/"), `${REPO}/tree/main/packages/smithers/flows/docs`)
  assert.throws(() => expectedLocation("flows", "/no-such-page/"), /names no page/)
})

test("flows answers for each nested package's docs under /<directory name>/", () => {
  const flows = `${REPO}/blob/main/packages/smithers/flows`
  for (const [path, file] of [
    ["/time-travel/quickstart/", "time-travel/docs/quickstart.md"],
    ["/time-travel/guides/rewind-a-run/", "time-travel/docs/guides/rewind-a-run.md"],
    ["/flow/guides/inspect-the-plan/", "flow/docs/guides/inspect-the-plan.md"],
    ["/time-travel/reference/api/", "time-travel/docs/api.md"],
    ["/platform-bun/quickstart/", "platform-bun/docs/quickstart.md"]
  ]) {
    assert.equal(expectedLocation("flows", path), `${flows}/${file}`)
    assert.ok(existsSync(join(repoRoot, "packages/smithers/flows", file)), file)
  }
  assert.equal(expectedLocation("flows", "/time-travel/"), `${REPO}/tree/main/packages/smithers/flows/time-travel/docs`)
  // The barrel's own pages keep their targets.
  assert.equal(expectedLocation("flows", "/quickstart/"), `${flows}/docs/quickstart.md`)
  // A package outside packages/smithers/flows is no page of the flows site.
  assert.throws(() => expectedLocation("flows", "/model/quickstart/"), /names no page/)
  // Only an aggregate site answers for nested packages.
  assert.deepEqual(aggregateSites, ["flows"])
  assert.throws(() => expectedLocation("agent", "/model/quickstart/"), /names no page/)
})

test("every package one level under flows with a docs/ folder is nested, and nothing else", () => {
  const nested = nestedDocsDirs(repoRoot, "packages/smithers/flows")
  for (const sub of ["time-travel", "flow", "plan", "platform-bun", "jj", "sandbox"]) {
    assert.ok(nested.includes(`packages/smithers/flows/${sub}`), sub)
  }
  for (const dir of nested) {
    assert.match(dir, /^packages\/smithers\/flows\/[a-z0-9-]+$/)
    assert.ok(existsSync(join(repoRoot, dir, "docs")), dir)
  }
})

test("every mapped page is a file in this checkout, or the folder its README introduces", () => {
  let count = 0
  for (const [slug, pages] of Object.entries(pageMapOf())) {
    const folder = redirectMapOf()[slug]
    const docs = folder.slice(`${REPO}/tree/main/`.length)
    // An aggregate site's pages may also land in a nested package's docs/ folder.
    const roots = [docs, ...(aggregateSites.includes(slug) ? nestedDocsDirs(repoRoot, docs.slice(0, -"/docs".length)).map((dir) => `${dir}/docs`) : [])]
    for (const location of Object.values(pages)) {
      const blob = location.match(/^https:\/\/github\.com\/smithersai\/smithers\/blob\/main\/(.+\.md)$/)
      const tree = location.match(/^https:\/\/github\.com\/smithersai\/smithers\/tree\/main\/(.+)$/)
      const path = blob?.[1] ?? tree?.[1]
      assert.ok(path !== undefined && roots.some((root) => path === root || path.startsWith(root + "/")), location)
      assert.ok(existsSync(join(repoRoot, path)), location)
      if (tree) assert.ok(existsSync(join(repoRoot, path, "README.md")) || existsSync(join(repoRoot, path, "index.md")), location)
      count++
    }
  }
  assert.ok(count >= 715, `${count} pages`)
})

test("apps/server/src/docsRedirectMap.ts is what this checkout generates", () => {
  assert.equal(readFileSync(GENERATED_MODULE, "utf8"), renderModule(redirectMapOf(), pageMapOf()),
    "apps/server/src/docsRedirectMap.ts is stale: pnpm docs:sync")
})

/** A throwaway package with `files` under docs/, removed after `body`. */
const withDocs = (files, body) => {
  const root = mkdtempSync(join(tmpdir(), "package-docs-"))
  try {
    for (const [file, content] of Object.entries(files)) {
      const path = join(root, "pkg", "docs", file)
      mkdirSync(dirname(path), { recursive: true })
      if (typeof content === "string") writeFileSync(path, content)
      else symlinkSync(content.link, path)
    }
    return body(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test("generation maps every Markdown page and nothing else", () => {
  withDocs({ "README.md": "", "api.md": "", "guides/a.md": "", "guides/b.txt": "", "media/x.png": "", "ref/README.md": "" }, (root) => {
    assert.deepEqual(pagesOf(root, "pkg"), {
      "/": `${REPO}/tree/main/pkg/docs`,
      "/guides/a/": `${REPO}/blob/main/pkg/docs/guides/a.md`,
      "/ref/": `${REPO}/tree/main/pkg/docs/ref`,
      "/reference/api/": `${REPO}/blob/main/pkg/docs/api.md`
    })
  })
})

/** A throwaway tree with `files` at root-relative paths, removed after `body`. */
const withTree = (files, body) => {
  const root = mkdtempSync(join(tmpdir(), "package-docs-"))
  try {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true })
      writeFileSync(join(root, file), content)
    }
    return body(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test("an aggregate maps each nested package's pages under its directory name", () => {
  withTree({
    "pkg/docs/README.md": "", "pkg/docs/quickstart.md": "",
    "pkg/sub/docs/README.md": "", "pkg/sub/docs/api.md": "", "pkg/sub/docs/guides/a.md": ""
  }, (root) => {
    assert.deepEqual(aggregatePagesOf(root, "pkg", ["pkg/sub"]), {
      "/": `${REPO}/tree/main/pkg/docs`,
      "/quickstart/": `${REPO}/blob/main/pkg/docs/quickstart.md`,
      "/sub/": `${REPO}/tree/main/pkg/sub/docs`,
      "/sub/guides/a/": `${REPO}/blob/main/pkg/sub/docs/guides/a.md`,
      "/sub/reference/api/": `${REPO}/blob/main/pkg/sub/docs/api.md`
    })
    assert.deepEqual(aggregatePagesOf(root, "pkg", []), pagesOf(root, "pkg"))
  })
})

test("an aggregate fails when a nested page claims a path the package's own docs serve", () => {
  withTree({ "pkg/docs/sub/a.md": "", "pkg/sub/docs/a.md": "" }, (root) => {
    assert.throws(() => aggregatePagesOf(root, "pkg", ["pkg/sub"]), /pkg\/sub\/docs\/a\.md and pkg\/docs\/sub\/a\.md both claim \/sub\/a\//)
  })
  withTree({ "pkg/docs/sub.md": "", "pkg/sub/docs/README.md": "" }, (root) => {
    assert.throws(() => aggregatePagesOf(root, "pkg", ["pkg/sub"]), /both claim \/sub\//)
  })
  withTree({ "pkg/docs/README.md": "", "pkg/Sub/docs/a.md": "" }, (root) => {
    assert.throws(() => aggregatePagesOf(root, "pkg", ["pkg/Sub"]), /is not lowercase/)
  })
})

test("generation fails on a symlink, two files claiming one path, or a page path that is not lowercase", () => {
  withDocs({ "README.md": "", "linked.md": { link: "/etc/hosts" } }, (root) => {
    assert.throws(() => pagesOf(root, "pkg"), /pkg\/docs\/linked\.md: a symlink cannot be a redirect target/)
  })
  withDocs({ "api.md": "", "reference/api.md": "" }, (root) => {
    assert.throws(() => pagesOf(root, "pkg"), /both claim \/reference\/api\//)
  })
  withDocs({ "guides.md": "", "guides/README.md": "" }, (root) => {
    assert.throws(() => pagesOf(root, "pkg"), /both claim \/guides\//)
  })
  withDocs({ "FAQ.md": "" }, (root) => {
    assert.throws(() => pagesOf(root, "pkg"), /pkg\/docs\/FAQ\.md: page path \/FAQ\/ is not lowercase/)
  })
  withDocs({ "a b.md": "" }, (root) => {
    assert.throws(() => pagesOf(root, "pkg"), /is not lowercase/)
  })
})

test("the generated library site workspace is deleted", () => {
  assert.equal(existsSync(join(repoRoot, "apps", "docs")), false)
})
