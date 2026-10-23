// The service worker may activate between an editor's local change and its SQLite receipt. Track the receipt itself,
// so a slow flow/read or flow/write dispatch does not hold an otherwise safe PWA update.
import { Effect, Exit } from "effect"

const pending = new Set<Promise<void>>()
let failed = false

/** Keeps a page alive through one SQLite receipt, and remembers a receipt that rejected. */
export const trackEditorPersistence = <A, E, R>(write: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    let release!: () => void
    const receipt = new Promise<void>((resolve) => { release = resolve })
    pending.add(receipt)
    return yield* write.pipe(Effect.onExit((exit) => Effect.sync(() => {
      if (Exit.isFailure(exit) && !Exit.hasInterrupts(exit)) failed = true
      pending.delete(receipt)
      release()
    })))
  })

/** A PWA update's reload barrier; it cannot run between a keystroke and that keystroke's durable receipt. */
export const awaitEditorWrites = async (): Promise<void> => {
  while (pending.size > 0) await Promise.allSettled([...pending])
}

export const hasPendingEditorWrites = (): boolean => pending.size > 0

/** A rejected persistence receipt cannot authorize an automatic reload of text still visible on this page. */
export const hasFailedEditorWrite = (): boolean => failed
