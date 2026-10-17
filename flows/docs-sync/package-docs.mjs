// @ts-check
/**
 * The retired library docs sites and where their links go now (T-DOC-04, #3510).
 *
 * Until 2026-10 every row below was an Astro site on `<slug>.smithers.sh`. The
 * sites are gone; each package's colocated `docs/` folder on GitHub replaces
 * its site, and one Worker (`apps/server/src/docsRedirect.ts`) answers the old
 * hostnames with a 301 to the page's file in that folder, or to the folder
 * when the path names no page.
 *
 * The slugs are frozen. They are the hostnames that served a docs site, and the
 * only hostnames the redirect Worker may claim: a slug derived from today's
 * package list would also name hosts that were never docs sites
 * (`build.smithers.sh` is the build cache). Package directories are not frozen:
 * each slug's npm name is looked up in the workspace package list, so a moved
 * package moves its redirect target with it.
 *
 * The `docs-sync` flow (`flow.ts`) runs this module; `pnpm docs:sync` and
 * `pnpm docs:check` start it.
 *
 *   smthrs flow start docs-sync --data '{"mode":"print"}' --wait   print the slug -> URL map
 *   smthrs flow start docs-sync --data '{"mode":"write"}' --wait   regenerate apps/server/src/docsRedirectMap.ts
 *   smthrs flow start docs-sync --data '{"mode":"check"}' --wait   fail if that module drifted
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { isMain, repoRoot, workspacePackages } from "../../packages/repo-targets/scripts/workspace-packages.mjs"

/** The repository every redirect lands in. Targets are built from this and the map only. */
export const REPOSITORY_URL = "https://github.com/smithersai/smithers"

/** Where an unknown slug lands. */
export const README_URL = `${REPOSITORY_URL}/blob/main/README.md`

/** The zone every slug is a subdomain of. */
export const ZONE = "smithers.sh"

/**
 * [slug, npm name] for every retired docs site, from apps/docs/shared/manifest.mjs
 * as it stood when the sites were retired. `plan-store` was in the roster but
 * never deployed (no DNS record on 2026-10-06); its redirect works once a record exists.
 *
 * @type {ReadonlyArray<readonly [string, string]>}
 */
export const legacySites = [
  ["agent", "@smthrs/agent"],
  ["artifacts", "@smthrs/artifacts"],
  ["canonical", "@smthrs/canonical"],
  ["capability", "@smthrs/capability"],
  ["chain", "@smthrs/chain"],
  ["cli", "@smthrs/cli"],
  ["control", "@smthrs/control"],
  ["core", "@smthrs/core"],
  ["crypto", "@smthrs/crypto"],
  ["database", "@smthrs/database"],
  ["engine", "@smthrs/engine"],
  ["engine-store", "@smthrs/engine-store"],
  ["errors", "@smthrs/errors"],
  ["evals", "@smthrs/evals"],
  ["flow", "@smthrs/flow"],
  ["flows", "@smthrs/flows"],
  ["fs", "@smthrs/fs"],
  ["gateway", "@smthrs/gateway"],
  ["harness", "@smthrs/harness"],
  ["integrations", "@smthrs/integrations"],
  ["jj", "@smthrs/jj"],
  ["journal", "@smthrs/journal"],
  ["kernel", "@smthrs/kernel"],
  ["keys", "@smthrs/keys"],
  ["mcp", "@smthrs/mcp"],
  ["memory", "@smthrs/memory"],
  ["migrate", "@smthrs/migrate"],
  ["model", "@smthrs/model"],
  ["notifications", "@smthrs/notifications"],
  ["observability", "@smthrs/observability"],
  ["plan", "@smthrs/plan"],
  ["plan-store", "@smthrs/plan-store"],
  ["platform-browser", "@smthrs/platform-browser"],
  ["platform-bun", "@smthrs/platform-bun"],
  ["platform-node", "@smthrs/platform-node"],
  ["plugin", "@smthrs/plugin"],
  ["registry", "@smthrs/registry"],
  ["run-store", "@smthrs/run-store"],
  ["sandbox", "@smthrs/sandbox"],
  ["scorers", "@smthrs/scorers"],
  ["smithers-patterns", "@smthrs/patterns"],
  ["smithers-sync", "@smthrs/sync"],
  ["smthrs", "smthrs"],
  ["std", "@smthrs/std"],
  ["step-cache", "@smthrs/step-cache"],
  ["testing", "@smthrs/testing"],
  ["time-travel", "@smthrs/time-travel"],
  ["triggers", "@smthrs/triggers"]
]

/**
 * [slug, package dir] for every legacy site, resolved against the workspace
 * package list. Throws when a slug's package is gone or has no docs/ folder,
 * so a broken target never ships.
 *
 * @param {string} root
 * @returns {ReadonlyArray<readonly [string, string]>}
 */
const legacyDirs = (root) => {
  const byName = new Map(workspacePackages(root).map((entry) => [entry.name, entry.dir]))
  return legacySites.map(([slug, name]) => {
    const dir = byName.get(name)
    if (dir === undefined) throw new Error(`${slug}.${ZONE}: no workspace package is named ${name}`)
    if (!existsSync(join(root, dir, "docs"))) throw new Error(`${slug}.${ZONE}: ${dir} has no docs/ folder`)
    return /** @type {const} */ ([slug, dir])
  })
}

/**
 * slug -> `https://github.com/smithersai/smithers/tree/main/<package-dir>/docs`:
 * where a path that names no page lands.
 *
 * @param {string} [root]
 * @returns {Readonly<Record<string, string>>}
 */
export const buildRedirectMap = (root = repoRoot) =>
  Object.fromEntries(legacyDirs(root).map(([slug, dir]) => [slug, `${REPOSITORY_URL}/tree/main/${dir}/docs`]))

/**
 * The path the retired site served one docs file at. The sites routed files
 * the way apps/docs/shared/sync-content.mjs (deleted in 0e0626222d) synced
 * them into Starlight:
 *
 *   README.md          -> /
 *   api.md             -> /reference/api/
 *   guides/x.md        -> /guides/x/
 *   reference/cli/README.md -> /reference/cli/
 *
 * An `index.md` routed like a README. No page set its own `slug` frontmatter.
 *
 * @param {string} file docs-relative posix path of a Markdown file
 */
export const sitePathOf = (file) => {
  const output = file === "api.md" ? "reference/api.md" : file.replace(/(^|\/)README\.md$/, "$1index.md")
  const page = output.slice(0, -".md".length)
  if (page === "index") return "/"
  return page.endsWith("/index") ? `/${page.slice(0, -"index".length)}` : `/${page}/`
}

/** The shape every page path has: lowercase segments, as the sites' routes did. */
const PAGE_PATH = /^\/(?:[a-z0-9_.-]+\/)*$/

/**
 * Every Markdown file under `<root>/<dir>/docs`, docs-relative, posix, sorted.
 * A symlink fails: its GitHub page is the link, not the file it names.
 *
 * @param {string} root
 * @param {string} dir
 */
const docsFiles = (root, dir) => {
  /** @type {Array<string>} */
  const found = []
  /** @param {string} rel */
  const walk = (rel) => {
    for (const entry of readdirSync(join(root, dir, "docs", rel), { withFileTypes: true })) {
      const path = rel === "" ? entry.name : `${rel}/${entry.name}`
      if (entry.isSymbolicLink()) throw new Error(`${dir}/docs/${path}: a symlink cannot be a redirect target`)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && entry.name.endsWith(".md")) found.push(path)
    }
  }
  walk("")
  return found.sort()
}

/**
 * The retired sites whose package is a barrel over the packages nested one
 * directory under it. `flows.smithers.sh` re-exports the engine packages under
 * `packages/smithers/flows/`, so it also answers for each one's pages at
 * `/<directory name>/<page path>`: `/time-travel/quickstart/` is
 * `packages/smithers/flows/time-travel/docs/quickstart.md`.
 *
 * @type {ReadonlyArray<string>}
 */
export const aggregateSites = ["flows"]

/**
 * The workspace packages exactly one directory under `dir` that have a docs/
 * folder, sorted.
 *
 * @param {string} root
 * @param {string} dir
 * @returns {ReadonlyArray<string>}
 */
export const nestedDocsDirs = (root, dir) =>
  workspacePackages(root)
    .map((entry) => entry.dir)
    .filter((sub) => sub.startsWith(`${dir}/`) && !sub.slice(dir.length + 1).includes("/") && existsSync(join(root, sub, "docs")))
    .sort()

/**
 * One package's old page paths -> each page's file on GitHub, from the files
 * its docs/ folder holds now, plus each `nested` package's pages under
 * `/<its directory name>/`. A README lands on its folder, which GitHub shows
 * with the README rendered below the listing; every other page lands on its
 * file. Throws when a file has no plain lowercase path or two files claim one.
 *
 * @param {string} root
 * @param {string} dir
 * @param {ReadonlyArray<string>} nested package dirs whose pages the site also serves
 * @returns {Readonly<Record<string, string>>}
 */
export const aggregatePagesOf = (root, dir, nested) => {
  /** @type {Map<string, string>} */
  const claimed = new Map()
  /** @type {Array<[string, string]>} */
  const pages = []
  for (const [prefix, pkg] of [["", dir], ...nested.map((sub) => [`/${sub.slice(sub.lastIndexOf("/") + 1)}`, sub])]) {
    for (const file of docsFiles(root, pkg)) {
      const path = `${prefix}${sitePathOf(file)}`
      if (!PAGE_PATH.test(path)) throw new Error(`${pkg}/docs/${file}: page path ${path} is not lowercase [a-z0-9_.-] segments`)
      const other = claimed.get(path)
      if (other !== undefined) throw new Error(`${pkg}/docs/${file} and ${other} both claim ${path}`)
      claimed.set(path, `${pkg}/docs/${file}`)
      const folder = file.replace(/(^|\/)(?:README|index)\.md$/, "")
      pages.push([path, folder !== file
        ? `${REPOSITORY_URL}/tree/main/${pkg}/docs${folder === "" ? "" : `/${folder}`}`
        : `${REPOSITORY_URL}/blob/main/${pkg}/docs/${file}`])
    }
  }
  return Object.fromEntries(pages.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/**
 * One package's old page paths -> each page's file on GitHub.
 *
 * @param {string} root
 * @param {string} dir
 * @returns {Readonly<Record<string, string>>}
 */
export const pagesOf = (root, dir) => aggregatePagesOf(root, dir, [])

/**
 * slug -> old page path -> that page's file on GitHub: every page each legacy
 * package's docs/ folder holds, and for an aggregate site every page of the
 * packages nested under it.
 *
 * @param {string} [root]
 * @returns {Readonly<Record<string, Readonly<Record<string, string>>>>}
 */
export const buildPageMap = (root = repoRoot) =>
  Object.fromEntries(legacyDirs(root).map(([slug, dir]) =>
    [slug, aggregatePagesOf(root, dir, aggregateSites.includes(slug) ? nestedDocsDirs(root, dir) : [])]))

/**
 * The retired sites as the apps/site scripts read them (llms index, API docs
 * sync, reference ingest): one row per legacy slug whose package still exists,
 * in `legacySites` order.
 *
 * @type {ReadonlyArray<{ dir: string, name: string, slug: string, title: string, description: string, domain: string }>}
 */
export const sites = (() => {
  const byName = new Map(workspacePackages(repoRoot).map((entry) => [entry.name, entry]))
  return legacySites.flatMap(([slug, name]) => {
    const entry = byName.get(name)
    return entry === undefined ? [] : [{
      dir: entry.dir, name, slug, title: name,
      description: typeof entry.manifest.description === "string" ? entry.manifest.description : "",
      domain: `${slug}.${ZONE}`
    }]
  })
})()

/** @type {Readonly<Record<string, string>> | undefined} */
let checkoutMap
/**
 * The folder map over this checkout, built on first use so that importing
 * this module (for `sites`, say) never requires every package's docs/ folder.
 */
export const redirectMapOf = () => (checkoutMap ??= buildRedirectMap())

/** @type {Readonly<Record<string, Readonly<Record<string, string>>>> | undefined} */
let checkoutPages
/** The page map over this checkout, built on first use. */
export const pageMapOf = () => (checkoutPages ??= buildPageMap())

/**
 * The Location the deployed Worker answers on `slug` for a request that names
 * old page `path`: that page's file, or with a null `path` the docs folder.
 * A null `slug` is a host outside the roster, which lands on the README.
 * Throws for a page this checkout does not map, so a caller never expects a
 * page that would land on the folder.
 *
 * @param {string | null} slug
 * @param {string | null} path
 */
export const expectedLocation = (slug, path) => {
  if (slug === null) return README_URL
  if (!Object.hasOwn(redirectMapOf(), slug)) throw new Error(`${slug}.${ZONE} is not a retired docs site`)
  if (path === null) return redirectMapOf()[slug]
  const pages = pageMapOf()[slug]
  if (!Object.hasOwn(pages, path)) throw new Error(`${slug}.${ZONE}${path} names no page in this checkout`)
  return pages[path]
}

export const GENERATED_MODULE = join(repoRoot, "apps/server/src/docsRedirectMap.ts")

/**
 * The Worker's copy of both maps, as TypeScript source.
 *
 * @param {Readonly<Record<string, string>>} map
 * @param {Readonly<Record<string, Readonly<Record<string, string>>>>} pages
 */
export const renderModule = (map, pages) => [
  "// Generated by flows/docs-sync/package-docs.mjs. Do not edit; run: pnpm docs:sync",
  "",
  "/** Retired docs-site slug -> its package's docs/ folder on GitHub (T-DOC-04, #3510). */",
  "export const DOCS_REDIRECTS: ReadonlyMap<string, string> = new Map([",
  ...Object.entries(map).map(([slug, url]) => `  [${JSON.stringify(slug)}, ${JSON.stringify(url)}],`),
  "])",
  "",
  "/** Retired docs-site slug -> each page path that site served -> the page's docs file on GitHub. */",
  "export const DOCS_PAGES: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map([",
  ...Object.entries(pages).flatMap(([slug, paths]) => [
    `  [${JSON.stringify(slug)}, new Map([`,
    ...Object.entries(paths).map(([path, url]) => `    [${JSON.stringify(path)}, ${JSON.stringify(url)}],`),
    "  ])],"
  ]),
  "])",
  "",
  `export const README_URL = ${JSON.stringify(README_URL)}`,
  ""
].join("\n")

if (isMain(import.meta)) {
  const flag = process.argv[2]
  if (flag === "--write") {
    writeFileSync(GENERATED_MODULE, renderModule(redirectMapOf(), pageMapOf()))
  } else if (flag === "--check") {
    if (readFileSync(GENERATED_MODULE, "utf8") !== renderModule(redirectMapOf(), pageMapOf())) {
      console.error("apps/server/src/docsRedirectMap.ts is stale: pnpm docs:sync")
      process.exitCode = 1
    }
  } else {
    console.log(JSON.stringify({ folders: redirectMapOf(), pages: pageMapOf() }, null, 2))
  }
}
