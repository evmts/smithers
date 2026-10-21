import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ShapeSource, SyncPolicy } from "@smthrs/effect-electric"
import { Otlp } from "@smthrs/observability"
import { Effect, Exit, Stream } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import { stop, testFile, usage } from "../worker/test/harness.ts"
import { Answer } from "./features/agent/flows"
import { TELEMETRY_ROUTE } from "./features/chat/contract"
import { Chat } from "./features/chat/chat"
import { ChatStore } from "./features/chat/store"
import { engineTelemetry } from "./flows/engine"
import { BROWSER_TELEMETRY, ENGINE_SERVICE, EXPORTED_SPANS, RELAY_FIELDS, WEB_SERVICE, WITHHELD } from "./telemetry"
import { cell, openAgent } from "./test/agent"
import { openFaultyApp, TestChatApi } from "./test/chatApi"
import { openDevice } from "./test/device"
import { QuestionFaults } from "./test/faults"
import { captured, type Dropped, type Export, ORIGIN, relayed } from "./test/relay"

// One telemetry contract for the browser and ChatApi (src/telemetry.ts): the browser's code paths run with the exporters
// the tab and the engine worker install, their exports go through the real relay with `BROWSER_TELEMETRY`, and a test
// fails when the relay dropped a record or a field the browser exported that `WITHHELD` doesn't name. A second check
// reads the source: every record the contract names is emitted somewhere in the app or the SDK packages it names.

const runtime = testFile("telemetry")

const closing: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of closing.splice(0).reverse()) await close()
})

const until = (assertion: () => void) => vi.waitFor(assertion, { timeout: 10_000, interval: 20 })

/** What the relay dropped that the contract doesn't withhold: the drift, empty when the two agree. */
const drift = (dropped: Dropped) => ({
  records: [...dropped.records].filter((name) => !(WITHHELD.spans as ReadonlyArray<string>).includes(name)).sort(),
  fields: [...dropped.fields]
    .flatMap(([name, keys]) =>
      [...keys].filter((key) => !(WITHHELD.fields as ReadonlyArray<string>).includes(key)).map((key) => `${name}: ${key}`)
    )
    .sort(),
})

const relay = (exports: ReadonlyArray<Export>) => Effect.runPromise(relayed(exports, BROWSER_TELEMETRY))

const bytes = (exports: ReadonlyArray<Export>) => exports.map(({ body }) => new TextEncoder().encode(body).byteLength)

/** ChatApi's limit on one export (worker/Chat.ts): a larger one is answered 413 and relays nothing. */
const RELAY_MAX_BODY_BYTES = 128 * 1024

describe("the relay keeps everything the browser exports", () => {
  test("the engine worker: an answer whose agent calls a flow, with every model call and step", async () => {
    let calls = 0
    const agent = await openAgent(runtime, () => {
      calls++
      const source = calls === 1 ? `await ctx.call("app/theme/set", { mode: "dark" })` : `ctx.done("Dark mode is on.")`
      return Stream.make({ type: "text-delta" as const, id: "t", text: cell(source) }, usage, stop)
    })
    // The tab's exporter as src/boot.ts installs it, and the engine worker's as src/flows/engine.worker.ts does.
    const tab = captured(Otlp.layerFetch({ baseUrl: `${ORIGIN}${TELEMETRY_ROUTE}`, serviceName: WEB_SERVICE }))
    const engine = captured(engineTelemetry(ORIGIN))
    const device = await openDevice(agent.fetch, { tab: tab.layer, engine: engine.layer })
    closing.push(device.close)

    await device.theme.actions.toggle()
    const answerId = await agent.ask("Switch to dark mode")
    await device.run(device.engine.start(Answer, { executionId: answerId, payload: { answerId } }))
    expect(await device.run(device.engine.result(Answer, answerId))).toEqual(Exit.succeed({ status: "done" }))
    await closing.pop()!()

    const fromTab = await relay(tab.exports)
    const fromEngine = await relay(engine.exports)
    expect(drift(fromTab.dropped)).toEqual({ records: [], fields: [] })
    expect(drift(fromEngine.dropped)).toEqual({ records: [], fields: [] })

    // Each worker's records name it, and what the end-to-end tests read arrives with its fields.
    const kept = (lines: typeof fromEngine.kept, name: string) => lines.filter((line) => line.name === name)
    expect(new Set(fromEngine.kept.map((line) => line.fields["service.name"]))).toEqual(new Set([ENGINE_SERVICE]))
    expect(kept(fromEngine.kept, "agent_model_step_calls")).toContainEqual(
      expect.objectContaining({
        fields: expect.objectContaining({ step: "harness/sealStep", outcome: "sealed", "otlp.value": expect.any(Number) }),
      }),
    )
    for (const name of ["invoke_agent", "chat agent", "ModelStep", "model.proxy.stream", "execute_tool app/theme/set"]) {
      expect(kept(fromEngine.kept, name), name).not.toEqual([])
    }
    expect(kept(fromTab.kept, "flow.dispatch")).toContainEqual(
      expect.objectContaining({
        fields: expect.objectContaining({
          flow: "app/theme/set",
          door: "button",
          executionId: expect.any(String),
          outcome: "done",
        }),
      }),
    )

    // The engine sends only the spans the relay keeps, so no export comes near ChatApi's limit.
    expect(Math.max(...bytes(engine.exports))).toBeLessThan(RELAY_MAX_BODY_BYTES)
    expect(Math.max(...bytes(tab.exports))).toBeLessThan(RELAY_MAX_BODY_BYTES)
  })

  test("the tab: asking, answered by its agent; a refused ask discarded; sync failing and retried", async () => {
    const app = openFaultyApp({
      answers: true,
      pageSize: 2,
      unreachableAfter: "300 millis",
      retry: SyncPolicy.backoff({ initial: "20 millis", max: "50 millis" }),
    })
    closing.push(() => app.dispose())
    const chat = await app.runPromise(Effect.service(Chat))
    const store = await app.runPromise(Effect.service(ChatStore))
    const api = await app.runPromise(Effect.service(TestChatApi))
    const questions = await app.runPromise(Effect.service(QuestionFaults))
    const shapes = await app.runPromise(Effect.service(ShapeSource.Faults))
    for (const query of [store.shown, store.queued, store.connectionState, store.historyState]) {
      query.tanstack.startSyncImmediate()
    }
    const shown = () => chat.queries.conversation.toArray.map(({ role, status }) => `${role} ${status}`)

    chat.actions.openComposer("button")
    if (!chat.actions.ask("What is the theme?").asked) throw new Error("not asked")
    const reply = await app.runPromise(api.answerTo("What is the theme?"))
    reply.say("Light.")
    reply.done()
    await until(() => expect(shown()).toEqual(["user done", "assistant done"]))
    app.runSync(questions.failNext("bad_request"))
    const refused = chat.actions.ask("And again?")
    if (!refused.asked) throw new Error("not asked")
    await until(() => expect(shown().at(-1)).toBe("user unsent"))
    chat.actions.discardUnsent(refused.questionId)
    await app.runPromise(api.askElsewhere("Earlier"))
    await until(() => expect(chat.queries.history.toArray[0]?.earlier).toBe(true))
    chat.actions.loadEarlier()
    // Down from the next request on; a change ends the live request Electric holds, so the next one goes.
    app.runSync(shapes.down())
    await app.runPromise(api.askElsewhere("During"))
    await until(() => expect(chat.queries.connection.toArray[0]).toMatchObject({ status: "offline", retry: true }))
    app.runSync(shapes.heal)
    chat.actions.retry()
    await until(() => expect(chat.queries.connection.toArray[0]?.status).toBe("up"))
    await closing.pop()!()

    const fromTab = await relay(api.telemetry)
    expect(drift(fromTab.dropped)).toEqual({ records: [], fields: [] })
    expect(fromTab.kept.map((line) => line.name)).toEqual(
      expect.arrayContaining(["question asked", "question stored", "question not sent", "outbox.send", "flow.dispatch"]),
    )
  })
})

describe("the contract", () => {
  const forbidden = ["question", "text", "prompt", "message", "answer", "content", "login", "token", "cookie"]

  test("keeps no field that can carry what someone wrote, and withholds what it says it does", () => {
    for (const field of BROWSER_TELEMETRY.fields) expect(forbidden, field).not.toContain(field)
    for (const field of WITHHELD.fields) expect(BROWSER_TELEMETRY.fields).not.toContain(field)
    expect(EXPORTED_SPANS).not.toContain("browser.runtime.request")
    expect(EXPORTED_SPANS).not.toContain("browser.engine.request")
    expect(EXPORTED_SPANS.length).toBe(BROWSER_TELEMETRY.records.length - 1)
    expect(BROWSER_TELEMETRY.fields).toEqual(expect.arrayContaining([...RELAY_FIELDS]))
    // Local-first's records (docs/observability.md#browser) and the fields its end-to-end tests read.
    expect(BROWSER_TELEMETRY.fields).toEqual(expect.arrayContaining(["queued", "action", "granted", "attempt", "leader"]))
    expect(new Set(BROWSER_TELEMETRY.records).size).toBe(BROWSER_TELEMETRY.records.length)
    expect(new Set(BROWSER_TELEMETRY.fields).size).toBe(BROWSER_TELEMETRY.fields.length)
  })

  // A runtime check can't reach every record: some are failures no test path provokes in this suite (a worker error, a
  // lost lock). So this reads the source instead: every name the contract lists appears as a string literal in the
  // app's browser code or the SDK packages it names, or is one a library forms at run time.
  test("names only records the app or its SDK packages emit", () => {
    const root = join(import.meta.dirname, "..", "..", "..")
    const sources = [
      join(import.meta.dirname),
      ...[
        "packages/effect-tanstack-db/src",
        "packages/effect-electric/src",
        "packages/smithers/flows/platform-browser/src",
        "packages/smithers/flows/src",
        "packages/smithers/flows/engine-store/src",
        "packages/smithers/flows/run-store/src",
        "packages/smithers/flows/journal/src",
        "packages/smithers/flows/database/src",
        "packages/smithers/flows/step-cache/src",
        "packages/smithers/flows/flow/src",
        "packages/smithers/flows/observability/src",
        "packages/smithers/agent/src",
        "packages/smithers/agent/model/src",
        "packages/smithers/agent/harness/src",
      ].map((path) => join(root, path)),
    ]
    const text = sources
      .flatMap((dir) =>
        (readdirSync(dir, { recursive: true, encoding: "utf8" }) as Array<string>)
          .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.startsWith("test/"))
          .map((file) => readFileSync(join(dir, file), "utf8"))
      )
      .join("\n")
      // The contracts themselves don't count as emitting.
      .replace(/export const [A-Z_]+_TELEMETRY = \{[\s\S]*?\} as const/g, "")
    const formed: Record<string, string> = {
      // Effect's HttpClient names a client span by its method.
      GET: "request.method",
      POST: "request.method",
      // `Model.withGenAiSpan` names a model call `chat <model id>`; the agent's seat is `agent`.
      "chat agent": "`chat ${request.modelId}`",
      // The agent names a tool call `execute_tool <flow name>`.
      "execute_tool app/theme/set": "`execute_tool ${call.flowName}`",
      "execute_tool app/navigate": "`execute_tool ${call.flowName}`",
      "execute_tool app/web/open": "`execute_tool ${call.flowName}`",
      "execute_tool app/jev/classify": "`execute_tool ${call.flowName}`",
      "execute_tool app/jev/evaluate": "`execute_tool ${call.flowName}`",
      "execute_tool repo/tree": "`execute_tool ${call.flowName}`",
      "execute_tool repo/read": "`execute_tool ${call.flowName}`",
      "execute_tool repo/refs": "`execute_tool ${call.flowName}`",
      "execute_tool repo/copy": "`execute_tool ${call.flowName}`",
      "execute_tool repo/clone": "`execute_tool ${call.flowName}`",
      "execute_tool issue/create": "`execute_tool ${call.flowName}`",
      "execute_tool issue/comment": "`execute_tool ${call.flowName}`",
      "execute_tool todo/draft": "`execute_tool ${call.flowName}`",
      "execute_tool chat/copy": "`execute_tool ${call.flowName}`",
      // Code intelligence names a span after its act, and the browser language server after its method.
      "code.hover": "`code.${act}`",
      "code.definition": "`code.${act}`",
      "code.references": "`code.${act}`",
      "code.problems": "`code.${act}`",
      "code.outline": "`code.${act}`",
      "browser.language_server.hover": "`browser.language_server.${method}`",
      "browser.language_server.definition": "`browser.language_server.${method}`",
      "browser.language_server.references": "`browser.language_server.${method}`",
      "browser.language_server.documentSymbols": "`browser.language_server.${method}`",
      "browser.language_server.diagnostics": "`browser.language_server.${method}`",
      // `@smthrs/observability`'s metrics are named after a prefix.
      flows_run_throughput: "`${prefix}run_throughput`",
      flows_seat_active: "`${prefix}seat_active`",
      flows_quota_park: "`${prefix}quota_park`",
      flows_agent_structured_output_rejections: "`${prefix}agent_structured_output_rejections`",
      flows_agent_structured_output_exhausted: "`${prefix}agent_structured_output_exhausted`",
    }
    const missing = BROWSER_TELEMETRY.records.filter((name) =>
      formed[name] === undefined
        ? !text.includes(`"${name}"`) && !text.includes(`\`${name}\``)
        : !text.includes(formed[name]!)
    )
    expect(missing).toEqual([])
  })
})
