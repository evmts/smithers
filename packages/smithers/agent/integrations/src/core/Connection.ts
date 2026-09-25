/**
 * A configured provider connection, as journal-safe data.
 *
 * A connection names a provider account the host holds a credential for, the
 * scopes the provider actually granted, and the containers (channels,
 * repositories, calendars) it may be used with. It never carries the secret:
 * `credential` is a control-plane `CredentialRef`, resolved through the
 * credential broker only at dispatch, so the value can appear in a flow
 * payload, a plan, or a journal entry.
 *
 * `personal` marks a connection to a person's own account. Which principals
 * may resolve its credential is a host authorization decision made in the
 * broker's `authorize` hook; this schema only records the fact the policy
 * needs.
 *
 * @since 0.1.0
 */
import { Schema } from "effect"

/**
 * The shape a connection id must have: lowercase, digits, and single hyphens.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ConnectionId = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/))

/**
 * A journal-safe reference to a stored credential.
 *
 * @category schemas
 * @since 0.1.0
 */
export const CredentialReference = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString
})

/**
 * One configured provider connection.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Connection = Schema.Struct({
  id: ConnectionId,
  /** The provider: `github`, `slack`, `googlecalendar`. */
  provider: Schema.NonEmptyString,
  /** A human label for operators. */
  label: Schema.String,
  credential: CredentialReference,
  /** The provider scopes the credential actually holds. */
  scopes: Schema.Array(Schema.NonEmptyString),
  /** Whether this is a person's own account rather than an organization identity. */
  personal: Schema.Boolean,
  /** The containers the connection may be used with. Empty means none: allowlists fail closed. */
  containers: Schema.Array(Schema.NonEmptyString),
  /** A provider API origin override, for enterprise hosts and fixture servers. */
  apiBaseUrl: Schema.optionalKey(Schema.String)
})

/**
 * One configured provider connection.
 *
 * @category models
 * @since 0.1.0
 */
export type Connection = typeof Connection.Type

/**
 * Decodes an unknown value as a {@link Connection}.
 *
 * @category constructors
 * @since 0.1.0
 */
export const decode = Schema.decodeUnknownEffect(Connection)
