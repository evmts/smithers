/**
 * The Gmail integration surface.
 *
 * A client for the mailbox calls a personal-email connector needs, an RFC 2822
 * composer that refuses header injection, a change feed and search that map
 * messages to private source records, and durable draft and send actions that
 * report an ambiguous write as `outcomeUnknown` and reconcile by key.
 * `Capabilities` states which OAuth scopes allow which operation; which
 * principal may use a Gmail connection is host policy.
 *
 * @since 0.1.0
 */

/**
 * @category actions
 * @since 0.1.0
 */
export * as Actions from "./gmail/Actions.ts"

/**
 * @category constants
 * @since 0.1.0
 */
export * as Capabilities from "./gmail/Capabilities.ts"

/**
 * @category constructors
 * @since 0.1.0
 */
export * as Config from "./gmail/Config.ts"

/**
 * @category services
 * @since 0.1.0
 */
export * as GmailClient from "./gmail/GmailClient.ts"

/**
 * @category constructors
 * @since 0.1.0
 */
export * as Mime from "./gmail/Mime.ts"

/**
 * @category constructors
 * @since 0.1.0
 */
export * as Reconcile from "./gmail/Reconcile.ts"

/**
 * @category conversions
 * @since 0.1.0
 */
export * as Records from "./gmail/Records.ts"

/**
 * @category constructors
 * @since 0.1.0
 */
export * as Sync from "./gmail/Sync.ts"
