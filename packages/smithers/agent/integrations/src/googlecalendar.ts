/**
 * The Google Calendar integration surface.
 *
 * An API client with token refresh and rate-limit handling, deterministic
 * event ids, durable actions that create, change, cancel and read events
 * safely under retry, and a `syncToken` change feed of a calendar's events as
 * provenance records.
 *
 * @since 0.1.0
 */

/**
 * @category actions
 * @since 0.1.0
 */
export * as Actions from "./googlecalendar/Actions.ts"

/**
 * @category services
 * @since 0.1.0
 */
export * as CalendarClient from "./googlecalendar/CalendarClient.ts"

/**
 * @category constructors
 * @since 0.1.0
 */
export * as Config from "./googlecalendar/Config.ts"

/**
 * @category schemas
 * @since 0.1.0
 */
export * as Event from "./googlecalendar/Event.ts"

/**
 * @category constructors
 * @since 0.1.0
 */
export * as EventId from "./googlecalendar/EventId.ts"

/**
 * @category constructors
 * @since 0.1.0
 */
export * as Sync from "./googlecalendar/Sync.ts"
