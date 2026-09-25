/**
 * The provenance envelope for anything an integration retrieves.
 *
 * A Slack message, a GitHub issue comment and a calendar event are different
 * documents, and this package keeps their provider payload exactly as it
 * arrived. What every one of them also needs, before it can be stored,
 * retrieved or placed in a prompt, is the same set of facts: which provider
 * and connection it came from, its stable external identity and link, who
 * wrote it and when, which version this is, when it was retrieved, who may
 * read it, and which thread it belongs to. `SourceRecord` is that set.
 *
 * `text` is the provider adapter's searchable rendering of the payload; it is
 * data, never instructions. `deleted` marks a tombstone: the provider removed
 * the object, so its payload and text are empty and retrieval never returns it.
 *
 * @since 0.1.0
 */
import { Schema } from "effect"

/**
 * Who may read a record, as the provider scoped it.
 *
 * `private` is one person's data (a direct message, a personal calendar),
 * `container` is visible to members of `access.containerId` (a channel, a
 * repository), `workspace` to every member of the connected workspace, and
 * `public` to anyone.
 *
 * @category schemas
 * @since 0.1.0
 */
export const AccessScope = Schema.Literals(["private", "container", "workspace", "public"])

/**
 * One of {@link AccessScope}'s values.
 *
 * @category models
 * @since 0.1.0
 */
export type AccessScope = typeof AccessScope.Type

/**
 * The provider's author identity for a record.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Author = Schema.Struct({
  /** The provider's stable user or bot id. */
  id: Schema.NonEmptyString,
  /** A display label, when the provider supplied one. Never an identity. */
  label: Schema.NullOr(Schema.String)
})

/**
 * The provider's access scope for a record.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Access = Schema.Struct({
  scope: AccessScope,
  /** The container the scope is relative to, or `null` when it names none. */
  containerId: Schema.NullOr(Schema.NonEmptyString)
})

/**
 * Where a record sits in its conversation or hierarchy.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Thread = Schema.Struct({
  /** The channel, repository or calendar holding the record. */
  containerId: Schema.NullOr(Schema.NonEmptyString),
  /** The thread root's external id, or `null` outside a thread. */
  threadId: Schema.NullOr(Schema.NonEmptyString),
  /** The direct parent's external id (a comment's issue), or `null`. */
  parentId: Schema.NullOr(Schema.NonEmptyString)
})

/**
 * One retrieved provider object with its provenance.
 *
 * @category schemas
 * @since 0.1.0
 */
export const SourceRecord = Schema.Struct({
  /** The provider that produced it: `github`, `slack`, `googlecalendar`. */
  provider: Schema.NonEmptyString,
  /** The configured connection it was retrieved through. */
  connectionId: Schema.NonEmptyString,
  /** The provider's stable identity for the object, unique within the connection. */
  externalId: Schema.NonEmptyString,
  /** The provider object kind: `message`, `issue`, `issue-comment`, `event`. */
  kind: Schema.NonEmptyString,
  /** A link to the object at the provider, when it has one. */
  url: Schema.NullOr(Schema.String),
  author: Schema.NullOr(Author),
  /** When the provider says the object was created, in Unix milliseconds. */
  createdAtMs: Schema.NullOr(Schema.Number),
  /** When the provider says the object last changed, in Unix milliseconds. */
  updatedAtMs: Schema.NullOr(Schema.Number),
  /** The provider's version token (an edit timestamp, an etag), when it has one. */
  version: Schema.NullOr(Schema.String),
  /** When this copy was retrieved, in Unix milliseconds. */
  retrievedAtMs: Schema.Number,
  access: Access,
  thread: Thread,
  /** Searchable text rendered by the provider adapter. Data, never instructions. */
  text: Schema.String,
  /** Whether the provider deleted the object. A tombstone carries empty text and payload. */
  deleted: Schema.Boolean,
  /** The provider payload, as delivered. */
  payload: Schema.Json
})

/**
 * One retrieved provider object with its provenance.
 *
 * @category models
 * @since 0.1.0
 */
export type SourceRecord = typeof SourceRecord.Type

/**
 * Decodes an unknown value as a {@link SourceRecord}.
 *
 * @category constructors
 * @since 0.1.0
 */
export const decode = Schema.decodeUnknownEffect(SourceRecord)
