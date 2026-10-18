import { Schema } from "effect"

// This tab's own repository rows, in memory: what it has loaded and where the view is. Synced rows (`Repository`) and
// RepoApi's answers are in schema.ts.

/** A repository's file list at a commit, keyed `<id>@<sha>`, as the view takes it: loading, ready or failed. */
export const TreeRow = Schema.Struct({
  key: Schema.String,
  state: Schema.Literals(["loading", "ready", "failed"]),
  paths: Schema.Array(Schema.String),
  truncated: Schema.Boolean,
  message: Schema.NullOr(Schema.String),
})
export type TreeRow = typeof TreeRow.Type

/**
 * One file at a commit, keyed `<id>@<sha>:<path>`, as the view takes it: loading, its text, binary or too large (with
 * its size in bytes), or failed.
 */
export const BlobRow = Schema.Struct({
  key: Schema.String,
  state: Schema.Literals(["loading", "text", "binary", "too-large", "failed"]),
  contents: Schema.NullOr(Schema.String),
  size: Schema.NullOr(Schema.Number),
  message: Schema.NullOr(Schema.String),
})
export type BlobRow = typeof BlobRow.Type

/**
 * A clone this tab asked for that Postgres doesn't show yet, keyed by the repository's id: `requesting` until Electric
 * delivers the row; or why RepoApi didn't take it: `sign_in` (401), `limit` (429) or `failed` (anything else).
 */
export const CloneRow = Schema.Struct({
  id: Schema.String,
  owner: Schema.String,
  name: Schema.String,
  status: Schema.Literals(["requesting", "sign_in", "limit", "failed"]),
})
export type CloneRow = typeof CloneRow.Type

/** The one view row's key. */
export const VIEW = "view"

/**
 * Where the routed view is, one row. What the URL said (`owner`, `name`, `kind`, `ref`, `splat`, `line`, `lineEnd`),
 * then what it resolved to once the repository is ready: the `revision` links use (the default branch or a SHA), the
 * commit `sha`, the `path`, and the keys of the tree, the file and the directory's README. `missing` when the URL names
 * no repository or a ref the repository doesn't have. `signedIn` is sign-in's answer, `null` until it gives one.
 */
export const ViewRow = Schema.Struct({
  id: Schema.Literal(VIEW),
  owner: Schema.String,
  name: Schema.String,
  repoId: Schema.NullOr(Schema.String),
  kind: Schema.Literals(["tree", "blob"]),
  ref: Schema.NullOr(Schema.String),
  splat: Schema.String,
  line: Schema.NullOr(Schema.Number),
  lineEnd: Schema.NullOr(Schema.Number),
  missing: Schema.Boolean,
  revision: Schema.NullOr(Schema.String),
  sha: Schema.NullOr(Schema.String),
  path: Schema.String,
  treeKey: Schema.NullOr(Schema.String),
  fileKey: Schema.NullOr(Schema.String),
  readmeKey: Schema.NullOr(Schema.String),
  readmePath: Schema.NullOr(Schema.String),
  signedIn: Schema.NullOr(Schema.Boolean),
})
export type ViewRow = typeof ViewRow.Type

/** The view row before any route opened it. */
export const emptyView: ViewRow = {
  id: VIEW,
  owner: "",
  name: "",
  repoId: null,
  kind: "tree",
  ref: null,
  splat: "",
  line: null,
  lineEnd: null,
  missing: true,
  revision: null,
  sha: null,
  path: "",
  treeKey: null,
  fileKey: null,
  readmeKey: null,
  readmePath: null,
  signedIn: null,
}
