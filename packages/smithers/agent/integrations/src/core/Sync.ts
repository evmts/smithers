/**
 * The provider half of source synchronization.
 *
 * A provider adapter answers one question: what changed after this cursor.
 * The first call passes `null` and receives the initial pages; later calls
 * pass the cursor the previous batch returned. A provider that invalidates a
 * cursor (Google's `410 Gone` on a stale sync token) answers `reset: true`,
 * which tells the driver that the batch is a fresh full listing and anything
 * it does not contain is gone.
 *
 * The driver owns durability: it applies a batch and advances the stored
 * cursor in one transaction, so a crash between them re-reads the batch
 * rather than skipping it, and applying the same batch twice is a no-op.
 *
 * @since 0.1.0
 */
import type { Effect } from "effect"
import type { IntegrationError } from "./IntegrationError.ts"
import type { SourceRecord } from "./SourceRecord.ts"

/**
 * One page of changes.
 *
 * @category models
 * @since 0.1.0
 */
export interface Changes {
  /** Created, edited and deleted records (tombstones), in any order. */
  readonly records: ReadonlyArray<SourceRecord>
  /** The cursor that acknowledges this page, or `null` when the provider issued none. */
  readonly cursor: string | null
  /** Whether this page starts a fresh full listing that replaces earlier state. */
  readonly reset: boolean
  /** Whether no more pages are available right now. */
  readonly done: boolean
}

/**
 * A provider's change feed for one stream of one connection.
 *
 * @category models
 * @since 0.1.0
 */
export interface SyncAdapter {
  /** The provider the records come from. */
  readonly provider: string
  /** The connection the adapter reads through. */
  readonly connectionId: string
  /** The stream within the connection, such as one channel or one repository. */
  readonly stream: string
  /** The changes after `cursor`; `null` asks for the initial listing. */
  readonly changes: (cursor: string | null) => Effect.Effect<Changes, IntegrationError>
}
