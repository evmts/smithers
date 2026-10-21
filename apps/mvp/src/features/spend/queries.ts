import { type Collection, LiveQuery, Query } from "@smthrs/effect-tanstack-db"
import type { Effect } from "effect"
import type { AlertChannel, AlertDelivery, ChannelSave, Seen, SpendAlert } from "./schema"

// What frontends read about spend alerts (docs/features/spend-alerts.md): a live query over the synced alerts and this
// device's mark of what it has seen.

/** The alerts this device hasn't hidden: later than its mark, newest first. */
export const openQuery = (alerts: Collection.Collection<SpendAlert>, seen: Collection.Collection<Seen, string>) =>
  LiveQuery.make((q) =>
    q
      .from({ alert: alerts.tanstack })
      .leftJoin({ mark: seen.tanstack }, ({ alert, mark }) => Query.eq(alert.kind, mark.kind))
      .where(({ alert, mark }) => Query.or(Query.isUndefined(mark?.through), Query.gt(alert.createdAt, mark?.through)))
      .select(({ alert }) => alert)
      .orderBy(({ alert }) => alert.createdAt, "desc"),
  )

/** The alerts that show. */
export type Open = Effect.Success<ReturnType<typeof openQuery>>

/** The channels an Admin turned on. */
export const channelsQuery = (channels: Collection.Collection<AlertChannel>) =>
  LiveQuery.make((q) => q.from({ channel: channels.tanstack }).select(({ channel }) => channel))

/** How many receipts the settings show: the latest. */
export const RECEIPTS_SHOWN = 10

/** The latest receipts, newest first. */
export const deliveriesQuery = (deliveries: Collection.Collection<AlertDelivery>) =>
  LiveQuery.make((q) =>
    q
      .from({ delivery: deliveries.tanstack })
      .orderBy(({ delivery }) => delivery.updatedAt, "desc")
      .limit(RECEIPTS_SHOWN)
      .select(({ delivery }) => delivery)
  )

/** This tab's saves that haven't landed. */
export const savesQuery = (saves: Collection.Collection<ChannelSave, string>) =>
  LiveQuery.make((q) => q.from({ save: saves.tanstack }).select(({ save }) => save))
