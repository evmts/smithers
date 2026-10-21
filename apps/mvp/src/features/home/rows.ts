import { Home } from "@smthrs/views"
import { Schema } from "effect"

// This tab's home rows: what each home it read at a commit declares, the files its Markdown blocks read, and which
// repository's home the routed page shows.

/**
 * A repository's home at one commit, keyed `<repoId>@<sha>`, which never changes once read: `declared` with its blocks
 * and how many of an unknown kind were skipped; `absent` when the repository has no `.smithers/home.json`; `invalid`
 * when the file isn't a home (with `Home.read`'s reason, or `binary` or `too_large`); `unreadable` when RepoApi couldn't
 * answer, read again on the next open.
 */
export const HomeRow = Schema.Struct({
  key: Schema.String,
  state: Schema.Literals(["declared", "absent", "invalid", "unreadable"]),
  blocks: Schema.Array(Home.Block),
  skipped: Schema.Number,
  reason: Schema.NullOr(Schema.String),
})
export type HomeRow = typeof HomeRow.Type

/** One Markdown block's file, keyed `<homeKey>:<path>`: loading, its text, or failed (missing, binary, too large). */
export const FileRow = Schema.Struct({
  key: Schema.String,
  home: Schema.String,
  path: Schema.String,
  state: Schema.Literals(["loading", "text", "failed"]),
  text: Schema.NullOr(Schema.String),
})
export type FileRow = typeof FileRow.Type

/** The one row that says whose home the page shows. */
export const CURRENT = "current"

/**
 * Whose home the routed page shows: the repository, and once it is ready on this device its home's key (`null`
 * before) and its default branch.
 */
export const CurrentRow = Schema.Struct({
  id: Schema.Literal(CURRENT),
  owner: Schema.String,
  name: Schema.String,
  key: Schema.NullOr(Schema.String),
  defaultBranch: Schema.NullOr(Schema.String),
})
export type CurrentRow = typeof CurrentRow.Type

/** The current row before any route opened a repository. */
export const emptyCurrent: CurrentRow = { id: CURRENT, owner: "", name: "", key: null, defaultBranch: null }

/** A home's key: the repository's id at the commit its home was read at. */
export const homeKey = (repoId: string, sha: string): string => `${repoId}@${sha}`

/** A Markdown block's file's key. */
export const fileKey = (home: string, path: string): string => `${home}:${path}`
