import { ElectricCollection } from "@smthrs/effect-electric"
import { Collection } from "@smthrs/effect-tanstack-db"
import { Context, Effect, Layer, Metric, type Scope, Stream } from "effect"
import { ALERT_CHANNELS_SHAPE_ROUTE, ALERT_DELIVERIES_SHAPE_ROUTE, SPEND_ALERTS_SHAPE_ROUTE } from "./contract"
import { channelsQuery, deliveriesQuery, openQuery, savesQuery } from "./queries"
import { AlertChannel, AlertDelivery, ChannelSave, Seen, SpendAlert } from "./schema"

// Spend alerts on this tab (docs/features/spend-alerts.md): the deployment's model spend alerts, which only an Admin's
// devices sync, kept on the device; this device's mark of what it has seen; and the live query the toasts read. While
// the store lives, each alert the tab shows is a log line and a count, once.

/** Alerts a tab showed, one count per alert per tab. */
export const shown = Metric.counter("smithers_web_spend_alerts_shown", {
  description: "Model spend alerts an Admin's tab showed",
  incremental: true,
})

/** Alerts an Admin hid on a device, counted once the device stored the mark. */
export const hidden = Metric.counter("smithers_web_spend_alerts_hidden", {
  description: "Model spend alerts an Admin hid, once the device stored it",
  incremental: true,
})

/** Where the alerts sync from: ChatApi's origin, the site's own. */
export interface SpendConfig {
  readonly origin: string
}

type Success<F extends (...args: never) => unknown> = Effect.Success<ReturnType<F>>

export class SpendStore extends Context.Service<
  SpendStore,
  {
    readonly alerts: ElectricCollection.ElectricCollection<SpendAlert>
    readonly seen: Collection.Collection<Seen, string>
    readonly open: Success<typeof openQuery>
    /** The channels an Admin turned on, and the latest receipts, which only an Admin's devices sync. */
    readonly channels: ElectricCollection.ElectricCollection<AlertChannel>
    readonly deliveries: ElectricCollection.ElectricCollection<AlertDelivery>
    /** This tab's saves of a channel that haven't landed. */
    readonly saves: Collection.Collection<ChannelSave, string>
    readonly channelList: Success<typeof channelsQuery>
    readonly receipts: Success<typeof deliveriesQuery>
    readonly pending: Success<typeof savesQuery>
    /** Where the work an action starts runs. */
    readonly scope: Scope.Scope
  }
>()("@smthrs/mvp/spend/SpendStore") {
  /** The store, its record of shown alerts running until the scope closes. */
  static readonly layer = (config: SpendConfig) =>
    Layer.effect(
      SpendStore,
      Effect.gen(function* () {
        const scope = yield* Effect.scope
        const alerts = yield* ElectricCollection.make<SpendAlert>({
          id: "spend-alerts",
          schema: SpendAlert,
          getKey: (row) => row.id,
          syncMode: "eager",
          persist: { schemaVersion: 1 },
          shape: {
            url: `${config.origin}${SPEND_ALERTS_SHAPE_ROUTE}`,
            columnMapper: ElectricCollection.snakeCamelMapper(),
            parser: { int8: (value: string) => Number(value) },
          },
        })
        const seen = yield* Collection.persisted<Seen, string>({
          id: "spend-seen",
          schema: Seen,
          getKey: (row) => row.kind,
          schemaVersion: 1,
        })
        const open = yield* openQuery(alerts, seen)
        const shape = {
          columnMapper: ElectricCollection.snakeCamelMapper(),
          parser: { timestamptz: (value: string) => new Date(value).toISOString() },
        }
        const channels = yield* ElectricCollection.make<AlertChannel>({
          id: "alert-channels",
          schema: AlertChannel,
          getKey: (row) => row.channel,
          syncMode: "eager",
          persist: { schemaVersion: 1 },
          shape: { url: `${config.origin}${ALERT_CHANNELS_SHAPE_ROUTE}`, ...shape },
        })
        const deliveries = yield* ElectricCollection.make<AlertDelivery>({
          id: "alert-deliveries",
          schema: AlertDelivery,
          getKey: (row) => `${row.alertId}:${row.channel}`,
          syncMode: "eager",
          persist: { schemaVersion: 1 },
          shape: { url: `${config.origin}${ALERT_DELIVERIES_SHAPE_ROUTE}`, ...shape },
        })
        const saves = yield* Collection.local<ChannelSave, string>({
          id: "alert-channel-saves",
          schema: ChannelSave,
          getKey: (row) => row.channel,
        })
        const channelList = yield* channelsQuery(channels)
        const receipts = yield* deliveriesQuery(deliveries)
        const pending = yield* savesQuery(saves)

        // A record of each alert the tab shows, once.
        const recorded = new Set<string>()
        yield* open.rows.pipe(
          Stream.runForEach((rows) =>
            Effect.forEach(rows, (alert) => {
              if (recorded.has(alert.id)) return Effect.void
              recorded.add(alert.id)
              return Effect.andThen(
                Metric.update(shown, 1),
                Effect.logInfo("spend.alert.shown").pipe(
                  Effect.annotateLogs({ alertId: alert.id, calls: alert.calls, tokens: alert.tokens }),
                ),
              )
            }, { discard: true })
          ),
          Effect.forkIn(scope, { startImmediately: true }),
        )

        return SpendStore.of({ alerts, seen, open, channels, deliveries, saves, channelList, receipts, pending, scope })
      }),
    )
}
