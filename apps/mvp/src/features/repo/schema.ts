import { Schema } from "effect"
import { CAPACITY_REASONS, FAILURES, STATUSES } from "./contract"

// The repository feature's rows and RepoApi's answers, as the Effect Schemas they are checked with. Constants the
// browser shares with RepoApi live in contract.ts. A row kept on the device is read by the next version of the app
// too: change its shape only with its collection's `schemaVersion`.

/**
 * One row of Postgres `repositories` as Electric delivers it (docs/features/repo.md#repositories-postgres): columns in
 * camelCase, `stored_bytes` (int8) parsed to a number, timestamps as Postgres prints them.
 */
export const Repository = Schema.Struct({
  id: Schema.String,
  owner: Schema.String,
  name: Schema.String,
  status: Schema.Literals(STATUSES),
  failure: Schema.NullOr(Schema.Literals(FAILURES)),
  capacity: Schema.NullOr(Schema.Literals(CAPACITY_REASONS)),
  storedBytes: Schema.NullOr(Schema.Number),
  retryAt: Schema.NullOr(Schema.String),
  defaultBranch: Schema.NullOr(Schema.String),
  headSha: Schema.NullOr(Schema.String),
  headMessage: Schema.NullOr(Schema.String),
  headAuthor: Schema.NullOr(Schema.String),
  headAt: Schema.NullOr(Schema.String),
  attempt: Schema.Number,
  cloneId: Schema.String,
  requestedAt: Schema.String,
  settledAt: Schema.NullOr(Schema.String),
})
export type Repository = typeof Repository.Type

/** `GET /api/repos/<owner>/<name>/tree/<sha>`'s body: every file's path, and whether the listing stopped early. */
export const TreeListing = Schema.Struct({ paths: Schema.Array(Schema.String), truncated: Schema.Boolean })
export type TreeListing = typeof TreeListing.Type

/** A branch or a tag: its name and the commit it names. */
export const Ref = Schema.Struct({ name: Schema.String, sha: Schema.String })
export type Ref = typeof Ref.Type

/**
 * A repository's branches and tags as Code Storage lists them at one sync, each in name order, and whether either list
 * stopped before the end: what RepoApi keeps in the immutable cache under the default branch's head commit.
 */
export const RefsListing = Schema.Struct({
  branches: Schema.Array(Ref),
  tags: Schema.Array(Ref),
  truncated: Schema.Boolean,
})
export type RefsListing = typeof RefsListing.Type

/**
 * `GET /api/repos/<owner>/<name>/refs`'s body: the default branch and its head commit, as Postgres has them, and every
 * branch and tag as of that sync.
 */
export const Refs = Schema.Struct({
  defaultBranch: Schema.String,
  head: Schema.String,
  ...RefsListing.fields,
})
export type Refs = typeof Refs.Type

/** `POST /api/repos`'s answer: `202` with the transaction to wait for, or `200` for a clone already running or done. */
export const CloneAccepted = Schema.Union([
  Schema.Struct({ txid: Schema.Number, id: Schema.String, attempt: Schema.Number }),
  Schema.Struct({ txid: Schema.Null, id: Schema.String, status: Schema.Literals(STATUSES) }),
])
export type CloneAccepted = typeof CloneAccepted.Type

/** A refusal's body: its code, and a too-large file's size. */
export const RefusalBody = Schema.Struct({ code: Schema.String, size: Schema.optional(Schema.Number) })
export type RefusalBody = typeof RefusalBody.Type

/**
 * What `repo/copy`'s step asks the tab that started its request (src/flows/askingTab.ts): put `text` on its clipboard,
 * or, without one, only say which door it started the request through. The tab answers `Copied` (flows.ts).
 */
export const CopyCall = Schema.Struct({ text: Schema.optional(Schema.String) })
