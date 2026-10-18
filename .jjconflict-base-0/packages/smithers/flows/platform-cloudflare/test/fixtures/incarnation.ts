/**
 * One incarnation of a Durable Object, in a process of its own:
 * `node incarnation.ts <mode> <database URL> <schema> <hostId> <intent JSON>`.
 *
 * It stores the intent as `start` would, then runs one alarm, marking each
 * step it runs with a `step:<label>` line. In `block` mode the second step
 * never returns, so the parent can kill this process inside a step while it
 * holds the run with a fresh lease. In `finish` mode every step completes and
 * the alarm's outcome is printed as an `outcome:<json>` line.
 *
 * Both incarnations run as plain Node processes, as every incarnation of a
 * real object runs the same bundle: a flow's stable callback identity is its
 * source text, which differs between Node's type stripping and the test
 * runner's transform.
 */
import * as Effect from "effect/Effect"
import { ExecutionObject } from "../../src/index.ts"
import { Answer, runtime } from "./AnswerFlow.ts"
import * as MemoryStorage from "./MemoryStorage.ts"
import * as Objects from "./Objects.ts"
import * as Postgres from "./Postgres.ts"

const [mode, url, schema, hostId, encoded] = process.argv.slice(2)
if (
  (mode !== "block" && mode !== "finish") || url === undefined || schema === undefined || hostId === undefined ||
  encoded === undefined
) {
  throw new Error("usage: incarnation.ts <block|finish> <database URL> <schema> <hostId> <intent JSON>")
}
const intent = JSON.parse(encoded) as ExecutionObject.Intent
const memory = MemoryStorage.make()
const mark = (line: string) => Effect.sync(() => process.stdout.write(`${line}\n`))

const outcome = await Effect.runPromise(
  Effect.gen(function*() {
    yield* ExecutionObject.start(memory.storage, intent, Effect.void)
    return yield* ExecutionObject.alarm(memory.storage, {
      flows: [Answer],
      runtime: runtime({
        hostId,
        database: Postgres.database(schema, url),
        record: (label) =>
          mark(`step:${label}`).pipe(
            Effect.andThen(mode === "block" && label === "answer" ? Effect.never : Effect.succeed(label))
          )
      }),
      router: Objects.unrouted
    })
  })
)
await Effect.runPromise(mark(`outcome:${JSON.stringify(outcome)}`))
