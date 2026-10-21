import { Effect, Metric, Option } from "effect"
import { hidden, SpendStore } from "./store"

// What an Admin does about a spend alert (docs/features/spend-alerts.md): Hide, which marks it and every earlier alert
// seen on this device. It finishes at once; once the device stored the mark, it is a log line and a count.

/** Hides alert `id` and every earlier one on this device; a later alert still shows. */
export const hide = (id: string) =>
  Effect.gen(function* () {
    const { alerts, seen, scope } = yield* SpendStore
    const alert = yield* alerts.get(id)
    if (Option.isNone(alert)) return
    const { kind, createdAt } = alert.value
    const mark = yield* seen.get(kind)
    if (Option.isSome(mark) && mark.value.through >= createdAt) return
    const written = Option.isNone(mark)
      ? yield* seen.insert({ kind, through: createdAt })
      : yield* seen.update(kind, (draft) => Object.assign(draft, { through: createdAt }))
    // A mark the device couldn't store rolls back, and the collection logs it (`persisted write failed`).
    yield* written.persisted.pipe(
      Effect.andThen(Metric.update(hidden, 1)),
      Effect.andThen(Effect.logInfo("spend.alert.hidden").pipe(Effect.annotateLogs({ alertId: id }))),
      Effect.ignore,
      Effect.forkIn(scope),
    )
  }).pipe(
    // A device collection refuses only a row its own schema rejects, which these never are: a bug, not a state.
    Effect.orDie,
  )
