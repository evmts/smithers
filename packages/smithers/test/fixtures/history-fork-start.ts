import * as ScriptedJudge from "@smthrs/agent/ScriptedJudge"
import { Control } from "@smthrs/control"
import { Effect } from "effect"
import { existsSync } from "node:fs"
import { join } from "node:path"
import * as NodeControl from "../../src/NodeControl.ts"
const root = process.argv[2]!
const runId = await Effect.runPromise(Effect.scoped(
  Effect.gen(function*() {
    const control = yield* Control.Control
    const card = yield* control.plan({ flowId: "steps", input: { name: "retained" } })
    yield* control.approve(card.approval)
    const launched = yield* control.run({
      _tag: "Plan",
      planId: card.planId,
      digest: card.digest,
      envelope: card.envelope,
      idempotencyKey: "initial"
    })
    if (launched._tag !== "Accepted" || launched.runId === undefined) return yield* Effect.die("not accepted")
    for (let n = 0; n < 1000; n++) {
      const listed = yield* control.list({ _tag: "runs", filters: { runId: launched.runId } })
      if (listed._tag !== "runs") return yield* Effect.die("wrong run listing")
      const current = listed.items[0]!
      if (current.status === "parked" && existsSync(join(root, "executed.jsonl"))) return launched.runId
      yield* Effect.sleep("10 millis")
    }
    return yield* Effect.die("actual module never parked")
  }).pipe(
    Effect.provide(NodeControl.layerControl({ root, evaluator: ScriptedJudge.layer })),
    Effect.timeout("60 seconds")
  )
))
console.log(JSON.stringify({ marker: "fork-started", runId }))
