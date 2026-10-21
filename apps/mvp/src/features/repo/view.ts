import { CAPACITY_COPY, FAILURE_COPY, githubRawUrl, rawRoute, SIGN_IN_TO_CLONE } from "./contract"
import type { BlobRow, CloneRow, RefsRow, TreeRow } from "./rows"
import type { Ref, Repository } from "./schema"

// What the view shows, from the rows the queries read (decision 0006 §2): pure functions, so a component only renders
// their result and a TUI can show the same.

/** A file list as `RepoView` takes it. */
export type TreeProps =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly paths: ReadonlyArray<string>; readonly truncated: boolean }
  | { readonly state: "failed"; readonly message: string }

/** A file as `RepoView` takes it. */
export type FileProps =
  | { readonly state: "loading" }
  | { readonly state: "text"; readonly contents: string; readonly size: number }
  | { readonly state: "binary" | "too-large"; readonly size: number }
  | { readonly state: "failed"; readonly message: string }

/** Branches and tags as the picker takes them. */
export type RefsProps =
  | { readonly state: "loading" }
  | {
    readonly state: "ready"
    readonly branches: ReadonlyArray<Ref>
    readonly tags: ReadonlyArray<Ref>
    readonly truncated: boolean
  }
  | { readonly state: "failed"; readonly message: string }

/** A branches and tags row as the picker shows it; no row yet is loading. */
export const refsProps = (row: RefsRow | undefined): RefsProps => {
  if (row === undefined || row.state === "loading") return { state: "loading" }
  if (row.state === "failed") return { state: "failed", message: row.message ?? "" }
  return { state: "ready", branches: row.branches, tags: row.tags, truncated: row.truncated }
}

/** What the picker's button says for `revision`: a branch or tag name, or a commit's short SHA. */
export const revisionLabel = (revision: string): string =>
  /^[0-9a-f]{40}$/.test(revision) ? revision.slice(0, 7) : revision

/**
 * A file's toolbar links: `raw`, the bytes RepoApi serves as a page shows them, or GitHub's for a file over its limit;
 * `download`, the same bytes saved under the file's name; and whether its text can be copied. None until it loads.
 */
export interface FileLinks {
  readonly raw?: string
  readonly download?: { readonly href: string; readonly name: string }
  readonly copyContents: boolean
}

/** The toolbar links of the file at `view`, as loaded in `file`. */
export const fileLinksOf = (
  view: { readonly owner: string; readonly name: string; readonly sha: string | null; readonly path: string },
  file: BlobRow | undefined,
): FileLinks => {
  if (view.sha === null || file === undefined || file.state === "loading" || file.state === "failed") {
    return { copyContents: false }
  }
  if (file.state === "too-large") return { raw: githubRawUrl(view.owner, view.name, view.sha, view.path), copyContents: false }
  const raw = rawRoute(view.owner, view.name, view.sha, view.path)
  return { raw, download: { href: raw, name: view.path.split("/").at(-1)! }, copyContents: file.state === "text" }
}

/** A file list row as the view shows it; no row yet is loading. */
export const treeProps = (row: TreeRow | undefined): TreeProps => {
  if (row === undefined || row.state === "loading") return { state: "loading" }
  if (row.state === "failed") return { state: "failed", message: row.message ?? "" }
  return { state: "ready", paths: row.paths, truncated: row.truncated }
}

/** A file row as the view shows it; no row yet is loading. */
export const fileProps = (row: BlobRow | undefined): FileProps => {
  if (row === undefined || row.state === "loading") return { state: "loading" }
  if (row.state === "failed") return { state: "failed", message: row.message ?? "" }
  if (row.state === "text") return { state: "text", contents: row.contents ?? "", size: row.size ?? 0 }
  return { state: row.state, size: row.size ?? 0 }
}

/**
 * What the repository's header shows besides its name:
 * - `clone`: the Clone button; `sign_in`: the sign-in link in its place;
 * - `cloning`: one spinner, from Clone pressed until the clone settles;
 * - `refused`: why the clone failed or was refused, and Try again;
 * - `ready`: nothing.
 */
export type Header =
  | { readonly kind: "unknown" | "clone" | "cloning" | "ready" }
  | { readonly kind: "sign_in"; readonly text: string }
  | { readonly kind: "refused"; readonly text: string }

/** Bytes in the largest whole unit, one decimal past KB: `512 B`, `1.2 MB`. */
export const formatBytes = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${units[unit]}`
}

/** A timestamp as Postgres prints it (`2026-10-20 15:40:00+00`), or ISO, in epoch milliseconds. */
export const parseTimestamp = (value: string): number =>
  Date.parse(value.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"))

/** A refused clone's reason, with its size or the time GitHub gives the size again. */
export const capacityText = (repository: Repository): string => {
  const reason = repository.capacity ?? "paused"
  if (reason === "too_large" && repository.storedBytes !== null) {
    return `${CAPACITY_COPY.too_large} · ${formatBytes(repository.storedBytes)}`
  }
  if (reason === "size_unknown" && repository.retryAt !== null) {
    const at = new Date(parseTimestamp(repository.retryAt))
    return `${CAPACITY_COPY.size_unknown} ${at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  }
  return CAPACITY_COPY[reason]
}

/**
 * The header for `repository` as Postgres has it, this tab's own clone request, and whether someone is signed in
 * (`null` when sign-in hasn't said). This tab's request wins until Electric delivers what it did. A repository the
 * device doesn't have is `unknown`, offering nothing, until the repositories' shape has `answered` once: until then
 * the device can't tell a repository nobody cloned from one whose row is still on its way.
 */
export const headerOf = (
  repository: Repository | undefined,
  clone: CloneRow | undefined,
  signedIn: boolean | null,
  answered = true,
): Header => {
  if (clone !== undefined) {
    switch (clone.status) {
      case "requesting":
        return { kind: "cloning" }
      case "sign_in":
        return { kind: "sign_in", text: SIGN_IN_TO_CLONE }
      case "limit":
        return { kind: "refused", text: CAPACITY_COPY.paused }
      case "failed":
        return { kind: "refused", text: FAILURE_COPY.unavailable }
    }
  }
  if (repository === undefined && !answered) return { kind: "unknown" }
  if (repository === undefined) return signedIn === false ? { kind: "sign_in", text: SIGN_IN_TO_CLONE } : { kind: "clone" }
  switch (repository.status) {
    case "cloning":
      return { kind: "cloning" }
    case "ready":
      return { kind: "ready" }
    case "failed":
      return { kind: "refused", text: FAILURE_COPY[repository.failure ?? "unavailable"] }
    case "capacity":
      return { kind: "refused", text: capacityText(repository) }
  }
}

/** The head commit's row: its message's first line, its author, its short SHA and when it was made. */
export interface Commit {
  readonly message: string
  readonly author: string
  readonly shortSha: string
  readonly at: number
}

/**
 * The head commit of a ready repository, when the view is at it (`sha`, absent for any); `undefined` before Settle
 * wrote it, or at another commit, whose details the view doesn't have.
 */
export const commitOf = (repository: Repository | undefined, sha?: string | null): Commit | undefined => {
  if (repository?.headSha == null || repository.headAt === null) return undefined
  if (sha !== undefined && sha !== repository.headSha) return undefined
  return {
    message: (repository.headMessage ?? "").split("\n", 1)[0]!,
    author: repository.headAuthor ?? "",
    shortSha: repository.headSha.slice(0, 7),
    at: parseTimestamp(repository.headAt),
  }
}
