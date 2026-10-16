#!/usr/bin/env node
/**
 * Where every smithers.sh URL in a published package lands.
 *
 * A published package cannot take a link back: `smthrs@1.0.0-rc.4` prints
 * `https://smithers.sh/migration/1.0` for as long as someone has it installed.
 * So the site owes every such URL a page about the thing the URL names. A
 * redirect to some other page that happens to exist is the failure this file
 * exists to catch: `/migration/1.0` answered 301 to `/docs/installation/` from
 * 2026-10-06 until issue 3845, and every gate passed, because each one asked
 * only whether the destination was a real page.
 *
 * The rules, the same offline and live:
 *
 * - `_redirects` is read before the pages, as Cloudflare reads it, so a rule
 *   that shadows a real page is seen.
 * - A redirect's destination keeps every path segment of the URL, in order
 *   ({@link keepsPath}). `/reference/api/flow` may move under `/docs`; it may
 *   not become `/docs/installation/`. A package prints the page it means, never
 *   an alias retired to a catch-all.
 * - One redirect at most. A chain makes the answer depend on two rules.
 * - A fragment is an `id` on the page it lands on.
 *
 * The scan reads the text files each published manifest's `files` ships, every
 * line of them: comments, string literals, READMEs and `docs/`. `CHANGELOG.md`
 * is left out because release notes quote the links of their day.
 *
 *   node scripts/published-links.mjs           check against apps/site/dist
 *   node scripts/published-links.mjs --live    fetch every URL from smithers.sh
 *   node scripts/published-links.mjs --list    print the URLs and where they ship
 *
 * Build the site first for the offline check (`pnpm -C apps/site build`). Run
 * `--live` after a site deploy: it is the only check that sees the edge.
 */
import { existsSync, globSync, readFileSync, statSync } from "node:fs"
import { extname, join } from "node:path"

import { readWorkspaceManifests } from "./pack-release.mjs"
import { isMain, repoRoot } from "./workspace-packages.mjs"

/** The only origin this gate answers for. */
export const ORIGIN = "https://smithers.sh"

/** A smithers.sh URL in running text, up to the first character a URL in prose or code cannot hold. */
const urlPattern = /https?:\/\/smithers\.sh(?![\w-]|\.[\w-])[^\s<>"'`)\]}\\|]*/g

/** The shipped files a person or a program reads as text. */
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".md", ".mdx", ".json", ".txt"])

/**
 * Whether one shipped path is scanned: text, not build output of a file that
 * is scanned already, not vendored code, and not release history.
 *
 * @param {string} path package-relative, posix
 */
export const isScanned = (path) =>
  textExtensions.has(extname(path)) && !/^(?:dist|vendor|node_modules)\//.test(path) &&
  !path.includes("/node_modules/") && path !== "CHANGELOG.md" && path !== "THIRD_PARTY_NOTICES.md"

/**
 * The scanned files one package ships: its manifest's `files`, read the way
 * npm reads them (a directory entry ships everything under it), plus the
 * README and the manifest npm always includes.
 *
 * @param {string} directory absolute package directory
 * @param {{ files?: ReadonlyArray<string> }} manifest
 * @returns {ReadonlyArray<string>} package-relative posix paths, sorted
 */
export const shippedTextFiles = (directory, manifest) => {
  const found = new Set()
  for (const entry of [...(manifest.files ?? []), "README.md", "package.json"]) {
    const bare = entry.replace(/\/+$/, "")
    // Nothing under these is scanned, and a built checkout's `dist` is large.
    if (/^(?:dist|vendor|wasm)(?:\/|$)/.test(bare)) continue
    const isDirectory = existsSync(join(directory, bare)) && statSync(join(directory, bare)).isDirectory()
    for (const match of globSync(isDirectory ? `${bare}/**` : entry, { cwd: directory })) {
      const path = match.split(/[\\/]/).join("/")
      if (isScanned(path) && statSync(join(directory, path)).isFile()) found.add(path)
    }
  }
  return [...found].sort()
}

/**
 * Every smithers.sh URL in one text, with its 1-based line. Punctuation that
 * ends the sentence around a URL is not part of it.
 *
 * @param {string} text
 * @returns {ReadonlyArray<{ line: number, url: string }>}
 */
export const urlsIn = (text) =>
  text.split("\n").flatMap((content, index) =>
    [...content.matchAll(urlPattern)].map((match) => ({ line: index + 1, url: match[0].replace(/[.,;:!?*]+$/, "") }))
  )

/**
 * Every smithers.sh URL the published packages ship, in publication roster
 * order.
 *
 * @param {string} [root]
 * @returns {ReadonlyArray<{ file: string, line: number, url: string }>} `file` is repository-relative
 */
export const collect = (root = repoRoot) =>
  [...readWorkspaceManifests(root)].flatMap(([directory, manifest]) =>
    shippedTextFiles(join(root, directory), manifest).flatMap((path) =>
      urlsIn(readFileSync(join(root, directory, path), "utf8")).map((found) => ({ file: `${directory}/${path}`, ...found }))
    )
  )

/**
 * The URLs the CLI composes at run time, which no text scan can read: one
 * `<migrationUrl>#<anchor>` per removed command, removed flag and literal
 * anchor. The table is `apps/site/src/data/removed-commands.json`, which
 * `//apps/site:cliData` regenerates from `packages/smithers/src/Unsupported.ts`
 * and fails on drift.
 *
 * @param {string} [root]
 * @returns {ReadonlyArray<{ file: string, line: number, url: string }>}
 */
export const composed = (root = repoRoot) => {
  const file = "packages/smithers/src/Unsupported.ts"
  const table = JSON.parse(readFileSync(join(root, "apps/site/src/data/removed-commands.json"), "utf8"))
  const line = readFileSync(join(root, file), "utf8").split("\n").findIndex((text) => text.includes(`"${table.migrationUrl}"`))
  if (line < 0) throw new Error(`${file} no longer declares ${table.migrationUrl}; run pnpm docs:sync`)
  return table.anchors.map((anchor) => ({ file, line: line + 1, url: `${table.migrationUrl}#${anchor}` }))
}

/**
 * The rules of one `_redirects` file, in file order: literal paths and paths
 * ending in one splat, which is all this site writes.
 *
 * @param {string} text
 * @returns {ReadonlyArray<{ source: string, destination: string, splat: boolean }>}
 */
export const readRedirects = (text) =>
  text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("#")).map((line) => {
    const [source, destination] = line.split(/\s+/)
    const splat = source.endsWith("/*")
    return { source: splat ? source.slice(0, -1) : source, destination, splat }
  })

const trimSlash = (pathname) => pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname

/** A path's segments as a slug spells them: lower case, dots dropped (`1.0.0-rc.0` is the slug `100-rc0`). */
const segments = (pathname) =>
  pathname.split("/").filter((segment) => segment.length > 0).map((segment) => decodeURIComponent(segment).toLowerCase().replaceAll(".", ""))

/**
 * Whether a redirect's destination is still about the path it was asked for:
 * every segment of `source` appears in `destination`, in order.
 *
 * @param {string} source pathname
 * @param {string} destination pathname
 */
export const keepsPath = (source, destination) => {
  const wanted = segments(source)
  let matched = 0
  for (const segment of segments(destination)) if (matched < wanted.length && segment === wanted[matched]) matched++
  return matched === wanted.length
}

/**
 * The first rule that answers `pathname`, with its destination resolved. A
 * literal rule answers its path with or without the trailing slash.
 *
 * @param {ReadonlyArray<{ source: string, destination: string, splat: boolean }>} rules
 * @param {string} pathname
 * @returns {URL | undefined}
 */
export const redirectOf = (rules, pathname) => {
  for (const rule of rules) {
    if (rule.splat ? pathname.startsWith(rule.source) : trimSlash(rule.source) === trimSlash(pathname)) {
      return new URL(rule.destination.replaceAll(":splat", rule.splat ? trimSlash(pathname.slice(rule.source.length)) : ""), ORIGIN)
    }
  }
  return undefined
}

const idsIn = (html) => new Set([...html.matchAll(/\bid=(?:"([^"]*)"|'([^']*)')/g)].map((match) => match[1] ?? match[2]))

/**
 * The file the static host serves for `pathname`: the file itself, a
 * directory's `index.html`, or `<path>.html`.
 *
 * @param {string} dist
 * @param {string} pathname
 * @returns {string | undefined}
 */
export const servedFile = (dist, pathname) => {
  const base = join(dist, decodeURIComponent(pathname))
  for (const candidate of [base, join(base, "index.html"), `${trimSlash(base)}.html`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return undefined
}

/**
 * Why the built site does not answer `reference` with a page about its path,
 * or `undefined` when it does.
 *
 * @param {string} reference an absolute smithers.sh URL
 * @param {string} dist the built site
 * @param {ReadonlyArray<{ source: string, destination: string, splat: boolean }>} rules
 * @returns {string | undefined}
 */
export const failure = (reference, dist, rules) => {
  const url = new URL(reference)
  if (url.origin !== ORIGIN) return `is not a ${ORIGIN} URL`
  let landing = url
  const redirect = redirectOf(rules, url.pathname)
  if (redirect !== undefined) {
    if (!keepsPath(url.pathname, redirect.pathname)) return `redirects to an unrelated page, ${redirect.pathname}`
    if (redirectOf(rules, redirect.pathname) !== undefined) return `redirects through a chain at ${redirect.pathname}`
    // An HTTP redirect without a fragment of its own keeps the one it was asked for.
    if (redirect.hash === "") redirect.hash = url.hash
    landing = redirect
  }
  const file = servedFile(dist, landing.pathname)
  if (file === undefined) return `has no page at ${landing.pathname}`
  if (landing.hash !== "" && file.endsWith(".html") && !idsIn(readFileSync(file, "utf8")).has(decodeURIComponent(landing.hash.slice(1)))) {
    return `has no element with id "${decodeURIComponent(landing.hash.slice(1))}" on ${landing.pathname}`
  }
  return undefined
}

/**
 * Where production sends one path: the page it settles on and that page's
 * ids, or why it never reaches a page about the path. Follows redirects by
 * hand so each hop is judged.
 *
 * @param {URL} asked
 * @param {(url: string, init: { redirect: "manual" }) => Promise<Response>} request
 * @returns {Promise<{ reason: string } | { pathname: string, hash: string, ids: ReadonlySet<string> }>}
 */
const liveLanding = async (asked, request) => {
  let current = new URL(`${asked.origin}${asked.pathname}${asked.search}`)
  let moved = false
  for (let hop = 0; hop < 4; hop++) {
    const response = await request(`${current.origin}${current.pathname}${current.search}`, { redirect: "manual" })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      const next = new URL(response.headers.get("location") ?? "", current)
      if (next.origin !== ORIGIN) return { reason: `redirects off the site, to ${next.origin}` }
      if (!keepsPath(asked.pathname, next.pathname)) return { reason: `redirects to an unrelated page, ${next.pathname}` }
      // The host adds or drops a trailing slash on its own; that is not a second redirect.
      if (trimSlash(next.pathname) !== trimSlash(current.pathname)) {
        if (moved) return { reason: `redirects through a chain at ${next.pathname}` }
        moved = true
      }
      if (next.hash === "") next.hash = current.hash
      current = next
      continue
    }
    if (response.status !== 200) {
      await response.body?.cancel()
      return { reason: `answers HTTP ${response.status} at ${current.pathname}` }
    }
    return { pathname: current.pathname, hash: current.hash, ids: idsIn(await response.text()) }
  }
  return { reason: "does not settle within 4 requests" }
}

/**
 * Why production does not answer `reference` with a page about its path, or
 * `undefined` when it does. `landings` remembers each path, so the removed
 * commands, which share one page, cost one request.
 *
 * @param {string} reference an absolute smithers.sh URL
 * @param {(url: string, init: { redirect: "manual" }) => Promise<Response>} [request]
 * @param {Map<string, ReturnType<typeof liveLanding>>} [landings]
 * @returns {Promise<string | undefined>}
 */
export const liveFailure = async (reference, request = fetch, landings = new Map()) => {
  const asked = new URL(reference)
  if (asked.origin !== ORIGIN) return `is not a ${ORIGIN} URL`
  const key = `${asked.pathname}${asked.search}`
  if (!landings.has(key)) landings.set(key, liveLanding(asked, request))
  const landing = await landings.get(key)
  if ("reason" in landing) return landing.reason
  const fragment = decodeURIComponent((landing.hash === "" ? asked.hash : landing.hash).slice(1))
  return fragment !== "" && !landing.ids.has(fragment) ? `has no element with id "${fragment}" on ${landing.pathname}` : undefined
}

/**
 * One line per reference that fails, as `file:line url reason`.
 *
 * @param {ReadonlyArray<{ file: string, line: number, url: string }>} references
 * @param {(url: string) => string | undefined | Promise<string | undefined>} judge
 * @returns {Promise<ReadonlyArray<string>>}
 */
export const offenders = async (references, judge) => {
  const verdicts = new Map()
  const lines = []
  for (const reference of references) {
    if (!verdicts.has(reference.url)) verdicts.set(reference.url, await judge(reference.url))
    const reason = verdicts.get(reference.url)
    if (reason !== undefined) lines.push(`${reference.file}:${reference.line} ${reference.url} ${reason}`)
  }
  return lines
}

if (isMain(import.meta)) {
  const mode = process.argv[2]
  const references = [...collect(), ...composed()]
  if (mode === "--list") {
    for (const reference of references) console.log(`${reference.file}:${reference.line} ${reference.url}`)
  } else {
    const dist = join(repoRoot, "apps/site/dist")
    if (mode !== "--live" && !existsSync(dist)) throw new Error("apps/site/dist is missing; run `pnpm -C apps/site build` first")
    const rules = mode === "--live" ? [] : readRedirects(readFileSync(join(dist, "_redirects"), "utf8"))
    const landings = new Map()
    const failed = await offenders(references, mode === "--live" ? (url) => liveFailure(url, fetch, landings) : (url) => failure(url, dist, rules))
    for (const line of failed) console.error(line)
    console.log(
      `published-links: ${references.length} references, ${new Set(references.map((reference) => reference.url)).size} URLs, ` +
        `${failed.length} failures (${mode === "--live" ? ORIGIN : "apps/site/dist"})`
    )
    if (failed.length > 0) process.exitCode = 1
  }
}
