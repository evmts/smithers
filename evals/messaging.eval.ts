/** Offline mailbox durability and admission evaluation; no provider or network. */
import { Effect, Layer } from "effect"
import { strict as assert } from "node:assert"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Suite, CaseExecutor } from "../packages/smithers/agent/evals/src/index.ts"
import * as Scorer from "../packages/smithers/agent/scorers/src/Scorer.ts"
import * as Binding from "../packages/smithers/agent/scorers/src/Binding.ts"
import * as DurableWriter from "../packages/smithers/flows/database/src/DurableWriter.ts"
import * as NodeDatabase from "../packages/smithers/flows/database/src/node/NodeDatabase.ts"
import * as Journal from "../packages/smithers/flows/journal/src/Journal.ts"
import * as Migrations from "../packages/smithers/flows/journal/src/Migrations.ts"
import * as SqlJournal from "../packages/smithers/flows/journal/src/SqlJournal.ts"
import * as Mailbox from "../packages/smithers/notifications/src/Mailbox.ts"

const target = { name: "messaging" }
const scorer = Scorer.make({
  id: "messaging/behavior", version: "1", name: "behavior",
  score: ({ output }) => Effect.succeed({ score: output === true ? 1 : 0 })
})
export const suite = Suite.make({
  name: "messaging", concurrency: 1,
  cases: ["exchange", "restart", "duplicate-key", "secret-refusal"].map((name) => ({ name, input: name })),
  bindings: [Binding.make({ scorer, appliesTo: target })]
})
export const executor = CaseExecutor.make((entry) => Effect.promise(async () => {
  const directory = await mkdtemp(join(tmpdir(), "messaging-eval-"))
  const filename = join(directory, "messages.db")
  const run = <A, E>(agent: string, body: (box: Mailbox.Service) => Effect.Effect<A, E, Journal.Journal>) => {
    const layer = Mailbox.layer(agent).pipe(Layer.provideMerge(
      SqlJournal.layer({ capacity: 1024, overflow: "reject" }).pipe(Layer.provide(
        Layer.provideMerge(Migrations.layer, Layer.provideMerge(DurableWriter.layer(), NodeDatabase.layer({ filename })))
      ))
    ))
    return Effect.runPromise(Effect.gen(function*() { return yield* body(yield* Mailbox.Mailbox) }).pipe(
      Effect.provide(layer), Effect.scoped
    ))
  }
  const count = () => run("a", () => Effect.gen(function*() {
    const journal = yield* Journal.Journal
    return (yield* journal.entries({ runId: "flows.messages" as never, limit: 100 })).entries.length
  }))
  const refused = <A, E extends { code: string }, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.match({ onSuccess: () => "success", onFailure: (error) => error.code }))
  try {
    switch (entry.name) {
      case "exchange": {
        const sent = await run("a", (box) => box.send({ to: "b", text: "ping" }))
        const batch = await run("b", (box) => box.pull({}))
        assert.equal(batch.messages[0]?.from, "a")
        await run("b", (box) => box.send({ to: "a", text: "pong", re: sent.id }))
        await run("b", (box) => box.ack({ receipt: batch.receipt! }))
        const reply = await run("a", (box) => box.pull({}))
        assert.equal(reply.messages[0]?.from, "b")
        assert.equal(reply.messages[0]?.re, sent.id)
        assert.equal(reply.messages[0]?.thread, sent.id)
        break
      }
      case "restart": {
        await run("a", (box) => box.send({ to: "b", text: "restart" }))
        const batch = await run("b", (box) => box.pull({}))
        assert.deepEqual(await run("b", (box) => box.pull({})), batch)
        await run("b", (box) => box.ack({ receipt: batch.receipt! }))
        assert.deepEqual(await run("b", (box) => box.pull({})), { messages: [], receipt: null, more: false })
        break
      }
      case "duplicate-key": {
        const input = { to: "b", text: "retry", key: "same" }
        const first = await run("a", (box) => box.send(input))
        assert.deepEqual(await run("a", (box) => box.send(input)), { ...first, duplicate: true })
        assert.equal(await run("a", (box) => refused(box.send({ ...input, text: "changed" }))), "message_key_reused")
        assert.equal(await count(), 1)
        break
      }
      case "secret-refusal": {
        for (let i = 0; i < 20; i++) {
          const text = `ghp_${String.fromCharCode(65 + i).repeat(36)}`
          assert.equal(await run("a", (box) => refused(box.send({ to: "b", text }))), "message_secret_refused")
        }
        assert.equal(await count(), 0)
        break
      }
      default: throw new Error("Unknown messaging case")
    }
    return { output: true, stepKey: `messaging/${entry.name}/v1`, latencyMs: 0, target }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}))
