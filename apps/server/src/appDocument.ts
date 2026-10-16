import { splitRepositoryPath } from "@smthrs/rpc/RepositorySubjectPath"
import { AVAILABLE_REPOS, COMING_SOON_REPOS } from "./publicRepoCatalog"

/*
 * The app document. The smithers.sh Astro build (apps/site) prerenders the
 * product app once per catalog repository at /<owner>/<name>/index.html and
 * mounts it as a React island, and this Worker serves that build's dist as
 * its assets. The document is fetched from the assets layer by its canonical
 * path with a trailing slash: the assets layer answers `/owner/name` with a
 * 307 to `/owner/name/` when only `index.html` exists under it, and a
 * redirect is not the document.
 *
 * The build stamp (`<meta name="smithers-build-sha">`) lives on this document
 * and not on the site's landing page, so scripts/canary/build-probe.ts reads
 * the HTML from here too.
 */

/** The prerendered app page for one catalog repository name, as the assets layer stores it. */
export const appDocumentPath = (repoName: string): string => `/${repoName.toLowerCase()}/`

/**
 * The document a frame path reloads into. Every prerendered app page is the
 * same shell (only the title differs), so the first catalog repository's page
 * stands in for a path that names no repository.
 */
export const DEFAULT_APP_DOCUMENT_PATH = appDocumentPath(AVAILABLE_REPOS[0].name)

/**
 * The app's frame history writes `/w/<workspace>/b/<branch>/f/<frame>`
 * (apps/app/src/mainview/runtime/FrameHistory.ts). A reload or a deep link at
 * such a path is the app, and the assets layer has no file for it.
 */
export const isFramePath = (pathname: string): boolean =>
  /^\/w\/[^/]+\/b\/[^/]+\/f\/[^/]+\/?$/.test(pathname)

/** The roster entry a path names, by GitHub's case-insensitive rule; `/owner/name/` is the same page. */
const rosterEntry = <Repo extends { readonly name: string }>(roster: ReadonlyArray<Repo>, pathname: string): Repo | undefined => {
  const name = pathname.toLowerCase().replace(/\/$/, "")
  return roster.find((entry) => `/${entry.name.toLowerCase()}` === name)
}

/**
 * The repository names the site prerenders a page for: the available ones and
 * the curated coming-soon ones, which the same template now builds as the same
 * app shell (apps/site/src/pages/[owner]/[repo].astro).
 *
 * A curated row is a CATALOG fact, and the catalog is not an admission fence.
 * Until this list was one list, `/effect-ts/effect` served a prerendered
 * marketing page and every subject below it was excluded from
 * {@link repositorySubjectRoot}, so a maintainer who HAD installed the
 * Smithers GitHub App on one of these ten repositories could never reach the
 * app's import path (mvp.md M-46): the compiled page won before anything read
 * the repository's binding, access, installation or import state. Serving the
 * app grants nothing — availability is still `/api/public/repos` and the
 * account's own inventory, and the Cloud mirror lookup still consults
 * AVAILABLE_REPOS alone.
 */
const ROUTED_REPOS: ReadonlyArray<{ readonly name: string }> = [...AVAILABLE_REPOS, ...COMING_SOON_REPOS]

/**
 * The canonical app page for a routed path, or undefined when the path names
 * no prerendered repository. The router redirects a mixed-case name to its
 * lowercase page and serves it with or without its trailing slash.
 */
export const catalogDocumentPath = (pathname: string): string | undefined => {
  const repo = rosterEntry(ROUTED_REPOS, pathname)
  return repo === undefined ? undefined : appDocumentPath(repo.name)
}

/**
 * Site-owned first segments, inventoried from apps/site/src/pages and its
 * Starlight content tree, plus the site's infrastructure and reserved routes.
 * appDocument.test.ts walks both source trees so a new route cannot silently
 * become a GitHub owner. Keep this the one routing reservation list.
 */
export const RESERVED_SITE_SEGMENTS: ReadonlyArray<string> = [
  "404", "_astro", "api", "blog", "changelogs", "demo", "docs", "download", "migration", "pricing", "privacy", "refunds", "terms", "w"
]

/** GitHub owner and repository slugs, with exactly two segments outside the site's routes. */
export const isRepositoryPath = (pathname: string): boolean => {
  const match = /^\/([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})\/([a-z\d_.-]{1,100})\/?$/i.exec(pathname)
  return match !== null && !RESERVED_SITE_SEGMENTS.includes(match[1]!.toLowerCase()) && match[2] !== "." && match[2] !== ".."
}

/**
 * The `/owner/repo` root a GitHub-shaped subject path hangs below — a pull
 * request and its tabs, the pull request list, the issue list, one issue
 * (@smthrs/rpc RepositorySubjectPath) — or undefined for a bare repository
 * path, a frame path and every other path, including a subject shape whose
 * repository segments are the site's own or not GitHub slugs.
 *
 * The app serves these from the SAME document as the repository root, because
 * the document is one shell either way, and the app reads the path it was
 * entered at. Without this the Worker had no file for `/owner/repo/pull/2` and
 * no reason to answer it with the app, so the assets layer's marketing "Page
 * not found" was the whole answer — production, 2026-10-16, on the owned QA
 * repository's own pull request ([#4039](https://github.com/smithersai/smithers/issues/4039)).
 */
export const repositorySubjectRoot = (pathname: string): string | undefined => {
  const target = splitRepositoryPath(pathname)
  if (target?.subject === undefined) return undefined
  const root = `/${target.owner}/${target.name}`
  return isRepositoryPath(root) ? root : undefined
}
