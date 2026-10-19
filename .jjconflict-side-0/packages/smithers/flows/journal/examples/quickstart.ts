/**
 * The docs quickstart as a runnable program: compose a SQLite journal, write
 * on both channels, flush the lossy one, and read the run back.
 *
 * Run it with `node examples/quickstart.ts`; `test/examples.test.ts` runs it
 * against a temporary file so the docs and this program stay in step.
 *
 * @since 1.0.0
 */

import * as DurableWriter from "@smthrs/database/DurableWriter"
import * as NodeDatabase from "@smthrs/database/node/NodeDatabase"
import { Journal, type JournalEvent, Migrations, SqlJournal } from "@smthrs/journal"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

/**
 * Writes one durable and one lossy entry for a run in the SQLite file at
 * `filename`, and returns the lines the docs quickstart prints.
 *
 * @param filename - The SQLite database file to create or open.
 * @returns The printed lines: the durable receipt, one line per entry, and `hasMore`.
 * @throws When the database cannot be opened or the journal refuses a write.
 * @since 1.0.0
 * @category examples
 */
export const quickstart = (filename: string): Promise<ReadonlyArray<string>> => {
  const database = Layer.provideMerge(DurableWriter.layer(), NodeDatabase.layer({ filename }))
  const journalLayer = SqlJournal.layer({ capacity: 1024, overflow: "reject" }).pipe(
    Layer.provide(Layer.provideMerge(Migrations.layer, database))
  )

  const runId = "run-1" as JournalEvent.RunId
  const sourceId = "engine" as JournalEvent.SourceId

  const program = Effect.gen(function*() {
    const journal = yield* Journal.Journal
    const lines: Array<string> = []

    // Durable, unfenced: this program owns no run, so there is no fence to hold.
    const created = yield* journal.emitDurableUnfenced({
      runId,
      sourceId,
      eventType: "run.created",
      payload: { flow: "build", token: "ghp_0123456789abcdefghijklmnopqrstuvwxyz" }
    })
    lines.push(`durable: ${created._tag} seq ${created.seq}`)

    // Lossy: readable only after `flush` drains the admission queue.
    yield* journal.emitLossy({
      runId,
      sourceId,
      eventType: "step.progress",
      payload: { step: "compile", percent: 40 }
    })
    yield* journal.flush

    const page = yield* journal.entries({ runId, limit: 100 })
    for (const entry of page.entries) {
      lines.push(`${entry.seq} ${entry.eventType} ${JSON.stringify(entry.payload)}`)
    }
    lines.push(`hasMore: ${page.hasMore}`)
    return lines
  })

  return Effect.runPromise(program.pipe(Effect.provide(journalLayer), Effect.orDie))
}

if (import.meta.main) {
  for (const line of await quickstart("quickstart.db")) process.stdout.write(`${line}\n`)
}
