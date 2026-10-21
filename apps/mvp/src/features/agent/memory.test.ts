import { DurableWriter } from "@smthrs/database"
import { Flow, Interpreter } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Flows, MemoryError, MemoryStore, Opening, RecallKeyword } from "@smthrs/memory"
import { NodeHost } from "@smthrs/platform-node"
import { Cause, ConfigProvider, Effect, Exit, Layer, Stream } from "effect"
import { FetchHttpClient } from "effect/http"
import { SqlClient } from "effect/sql"
import { expect, test } from "vitest"
import * as TestDatabase from "../../../db/TestDatabase.ts"
import { harness, testFile } from "../../../worker/test/harness.ts"
import { member, openAgent, ORIGIN } from "../../test/agent"
import { JudgeSeat } from "../jev/steps"
import { runFlow } from "../../../worker/test/flowHost.ts"
import { OpeningFailed, OpeningRefused, Prepare, PreparedTurn } from "./flows"
import { layer, prepare, recall } from "./memory"

const runtime = testFile("memory_sources")
// The memory banks' own schema on the compose Postgres, dropped when each test's scope closes.
const database = Layer.provideMerge(DurableWriter.layer(), TestDatabase.layer("memory_banks"))
const turn = { question: "What is its launch mascot?", history: [{ question: "Remember the launch", answer: "Okay" }] }
const http = (fetch: typeof globalThis.fetch) => FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)))

test("production sources read the real saved-flow catalog and durable memory database", async () => {
  const agent = await openAgent(runtime, () => Stream.die("no model expected"))
  await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) => sql`
    INSERT INTO flows(id, owner_id, name, revision, description, placement)
    VALUES (${crypto.randomUUID()}, ${member.subject.id}, 'launch-guide', 1, 'Read the launch mascot', 'client')`))
  const result = await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    yield* Flows.runRemember({ bank: "agent-chat", key: "launch", text: "launch mascot is cobalt" })
    return yield* (yield* Opening.Sources).recall("launch")
  }).pipe(
    Effect.provide(layer(ORIGIN).pipe(Layer.provideMerge(MemoryStore.layer))), Effect.provide(database), Effect.provide(NodeHost.NodeCrypto.layer),
    Effect.provide(http(agent.fetch)),
  )))
  expect(result.some((row) => row.kind === "memory" && row.text.includes("cobalt"))).toBe(true)
  expect(result).toContainEqual({ kind: "skill", bank: "skills", key: "launch-guide", text: "Saved flow launch-guide, revision 1: Read the launch mascot" })
})

test("recall preserves history and maps faulty source codes without exposing their content", async () => {
  for (const [code, tag] of [["store", OpeningFailed], ["invalid_namespace", OpeningRefused]] as const) {
    const fault = Layer.succeed(Opening.Sources, { recall: () => Effect.fail(new MemoryError.MemoryError({ code, message: "private content" })) })
    const exit = await Effect.runPromiseExit(recall(turn).pipe(Effect.provide(fault)))
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBeInstanceOf(tag)
    expect(JSON.stringify(exit)).not.toContain("private content")
  }
  const sources = Opening.layerSources(["agent-chat"]).pipe(
    Layer.provide(RecallKeyword.layer),
    Layer.provide(MemoryStore.layer),
    Layer.provide(database), Layer.provide(NodeHost.NodeCrypto.layer),
  )
  expect(await Effect.runPromise(Effect.scoped(recall(turn).pipe(Effect.provide(sources))))).toEqual({ ...turn, candidates: [] })
})

test("empty opening records zero counts and preserves the turn without calling the judge", async () => {
  const flow = Flow.make("memory/TestEmpty", {
    payload: {}, success: PreparedTurn, error: OpeningFailed,
    body: Node.capture({ prepare: Prepare.name, turn }, () => Prepare.call({ ...turn, candidates: [] })),
  })
  const result = await runFlow(flow, {}, Interpreter.layerWithImplementations(flow, Prepare.toLayer(prepare)).pipe(
    Layer.provide(JudgeSeat.layer(ORIGIN)), Layer.provide(FetchHttpClient.layer),
  ))
  expect(result.exit).toEqual(Exit.succeed({ ...turn, opening: [], memoryDebug: { recalled: 0, inserted: 0, filtered: 0, skillsInserted: 0 } }))
  const invalid = await runFlow(flow, {}, Interpreter.layerWithImplementations(flow, Prepare.toLayer(prepare)).pipe(
    Layer.provide(JudgeSeat.layer(ORIGIN)), Layer.provide(FetchHttpClient.layer),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ AGENT_OPENING_TOKENS: "invalid" }))),
  ))
  expect(Exit.isFailure(invalid.exit)).toBe(true)

})


test("production sources preserve a real signed-out refusal and an injected network failure", async () => {
  const denied = await harness(runtime, () => Stream.die("no model expected"))
  const deniedFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    return denied.fetch(`${url.pathname}${url.search}`, input instanceof Request ? input : init)
  }) as typeof globalThis.fetch
  const brokenFetch = (() => Promise.reject(new Error("injected network failure"))) as typeof globalThis.fetch
  for (const [fetch, code] of [[deniedFetch, "invalid_namespace"], [brokenFetch, "store"]] as const) {
    const exit = await Effect.runPromiseExit(Effect.scoped(Effect.flatMap(Opening.Sources, (sources) => sources.recall("launch")).pipe(
      Effect.provide(layer(ORIGIN)), Effect.provide(database), Effect.provide(NodeHost.NodeCrypto.layer),
      Effect.provide(http(fetch)),
    )))
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({ code, message: "Skill catalog unavailable" })
  }
})
