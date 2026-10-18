import { SHA_PATTERN } from "./contract"

// Where things are in a repository and in the app's URLs (decision 0006 §2, Routing). Pure functions: the actions,
// the queries and the views share them.

/** The key of a repository's file list at `sha`. */
export const treeKey = (id: string, sha: string): string => `${id}@${sha}`

/** The key of a file at `sha`. */
export const blobKey = (id: string, sha: string, path: string): string => `${id}@${sha}:${path}`

/** The README of directory `dir` (`""` is the root): its direct entry named `README.md`, in any case. */
export const readmeOf = (paths: ReadonlyArray<string>, dir: string): string | undefined => {
  const prefix = dir === "" ? "" : `${dir}/`
  return paths.find((path) => path.startsWith(prefix) && path.slice(prefix.length).toLowerCase() === "readme.md")
}

/** What a URL's ref and path name in a repository: the revision links keep, the commit, and the path. */
export interface Resolved {
  readonly revision: string
  readonly sha: string
  readonly path: string
}

/**
 * Resolves a URL's `ref` (absent at `/$owner/$repo`) and the path after it against a ready repository: the default
 * branch reads at its head commit, a 40-hex SHA at itself. A default branch with a `/` arrives split across the ref and
 * the path, so the two are matched together. Anything else names nothing the view can read: `undefined`.
 */
export const resolveRef = (
  repository: { readonly defaultBranch: string | null; readonly headSha: string | null },
  ref: string | null,
  splat: string,
): Resolved | undefined => {
  const { defaultBranch, headSha } = repository
  if (ref !== null && SHA_PATTERN.test(ref)) return { revision: ref, sha: ref, path: splat }
  if (defaultBranch === null || headSha === null) return undefined
  if (ref === null || ref === defaultBranch) return { revision: defaultBranch, sha: headSha, path: splat }
  const joined = splat === "" ? ref : `${ref}/${splat}`
  if (joined === defaultBranch) return { revision: defaultBranch, sha: headSha, path: "" }
  return joined.startsWith(`${defaultBranch}/`)
    ? { revision: defaultBranch, sha: headSha, path: joined.slice(defaultBranch.length + 1) }
    : undefined
}

/** A line anchor: `?L=<n>` or `?L=<a>-<b>`. The router may hand over `3` as a number. Anything else anchors nothing. */
export const parseLines = (value: unknown): { readonly line: number | null; readonly lineEnd: number | null } => {
  const match = /^([1-9]\d{0,8})(?:-([1-9]\d{0,8}))?$/.exec(String(value ?? ""))
  if (match === null) return { line: null, lineEnd: null }
  const line = Number(match[1])
  const end = match[2] === undefined ? line : Number(match[2])
  return end > line ? { line, lineEnd: end } : { line, lineEnd: null }
}

/** A path as a URL writes it: each segment encoded, the slashes kept. */
export const encodePath = (path: string): string => path.split("/").map(encodeURIComponent).join("/")

/** A view location, as `RepoView` names it. */
export interface Location {
  readonly kind: "tree" | "blob"
  readonly path: string
  readonly line?: number | undefined
  readonly lineEnd?: number | undefined
}

/**
 * The app's URL of `location` in `owner/name` at `revision`, as GitHub writes it: `/$owner/$repo` for the root at the
 * default branch, else `/$owner/$repo/{tree,blob}/<revision>/<path>`, a file's line anchor in `?L=`.
 */
export const hrefFor = (
  repository: { readonly owner: string; readonly name: string; readonly defaultBranch: string | null },
  revision: string,
  location: Location,
): string => {
  const base = `/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`
  if (location.kind === "tree" && location.path === "" && revision === repository.defaultBranch) return base
  const at = `${base}/${location.kind}/${encodeURIComponent(revision)}${
    location.path === "" ? "" : `/${encodePath(location.path)}`
  }`
  if (location.kind !== "blob" || location.line === undefined) return at
  const end = location.lineEnd !== undefined && location.lineEnd > location.line ? `-${location.lineEnd}` : ""
  return `${at}?L=${location.line}${end}`
}

/** What a route opens: the repository, a directory or a file, the URL's ref and path, and the file's line anchor. */
export interface Target {
  readonly owner: string
  readonly name: string
  readonly kind: "tree" | "blob"
  readonly ref: string | null
  readonly path: string
  readonly line: number | null
  readonly lineEnd: number | null
}

/** A route's params and search as the router hands them over. */
export interface RouteParams {
  readonly owner?: string | undefined
  readonly repo?: string | undefined
  readonly ref?: string | undefined
  readonly _splat?: string | undefined
}

/**
 * A repository route's search as the router keeps it (src/router.tsx `validateSearch`): only `?L=`, as the router
 * parsed it, which `parseLines` reads; every other parameter is dropped.
 */
export const lineSearch = (search: Record<string, unknown>): { readonly L?: unknown } =>
  search.L === undefined ? {} : { L: search.L }

/** What the route at `/$owner/$repo[/{tree,blob}/$ref/$]` opens. A trailing slash in the path is dropped. */
export const targetOf = (
  kind: "tree" | "blob",
  params: RouteParams,
  search: { readonly L?: unknown },
): Target => ({
  owner: params.owner ?? "",
  name: params.repo ?? "",
  kind,
  ref: params.ref ?? null,
  path: (params._splat ?? "").replace(/\/+$/, ""),
  ...(kind === "blob" ? parseLines(search.L) : { line: null, lineEnd: null }),
})
