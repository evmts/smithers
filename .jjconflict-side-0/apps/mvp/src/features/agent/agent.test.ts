// `chat/Answer` on the Node host (src/test/agent.ts): the browser's agent flow, its model calls through ChatApi's real
// model endpoint and its writes through the real answer routes, on the compose Postgres (`pnpm db:up`). The model is
// the only scripted seam. The same registration runs in the browser's engine worker (src/flows/engine.worker.ts), so
// passing here is the `sdk.host-agnostic-flows` proof for the agent.
import { SeatResolver } from "@smthrs/agent"
import { ModelError, ModelRequest } from "@smthrs/model"
import { Cause, Deferred, Effect, Exit, Stream } from "effect"
import { FetchHttpClient } from "effect/http"
import { afterEach, describe, expect, test } from "vitest"
import { eventually, stop, testFile, usage } from "../../../worker/test/harness.ts"
import { answerRow as row, cell, type Engine, openAgent } from "../../test/agent"
import { AnswerSettled } from "./answers"
import { MAX_FRAMES } from "./contract"
import { AGENT_SEAT, seats } from "./host"

const runtime = testFile("agent")

const probe = ModelRequest.ModelRequest.make({
  modelId: "agent",
  system: [],
  messages: [ModelRequest.Message.user("hi")],
  tools: [],
  params: ModelRequest.GenerationParams.make({}),
})

const engines: Array<Engine> = []
afterEach(async () => {
  for (const engine of engines.splice(0)) await engine.kill()
})

/** A model that answers every call with the next of `cells`, the last one repeating. */
const answering = (...cells: ReadonlyArray<string>) => {
  const calls: Array<number> = []
  const script = () => {
    const source = cells[Math.min(calls.length, cells.length - 1)]!
    calls.push(calls.length)
    return Stream.make({ type: "text-delta" as const, id: "t", text: cell(source) }, usage, stop)
  }
  return { script, calls }
}

describe("chat/Answer", () => {
  test("answers a question through the model endpoint and settles the answer with its text", async () => {
    const model = answering(`ctx.done("Hello from Smithers.")`)
    const agent = await openAgent(runtime, model.script)
    const engine = await agent.engine()
    engines.push(engine)
    const answerId = await agent.ask("Say hello")

    const exit = await agent.answer(engine, answerId)

    expect(exit).toEqual(Exit.succeed({ status: "done" }))
    const answer = await row(runtime, answerId)
    expect(answer).toMatchObject({ status: "done", text: "Hello from Smithers.", inputTokens: 12, outputTokens: 34 })
    expect(model.calls).toHaveLength(1)
  })

  test("calls app/theme/set as a journaled step, and answers from its receipt", async () => {
    const model = answering(
      `const set = await ctx.call("app/theme/set", { mode: "dark" })\nconsole.log(JSON.stringify(set))`,
      `ctx.done("Dark mode is on.")`,
    )
    const agent = await openAgent(runtime, model.script)
    const engine = await agent.engine()
    engines.push(engine)
    const answerId = await agent.ask("Switch to dark mode")

    const exit = await agent.answer(engine, answerId)

    expect(exit).toEqual(Exit.succeed({ status: "done" }))
    expect(agent.painted).toEqual(["dark"])
    expect(await Effect.runPromise(engine.theme.current)).toBe("dark")
    const answer = await row(runtime, answerId)
    expect(answer).toMatchObject({ status: "done", text: "Dark mode is on." })
    expect(answer.parts).toEqual([{ id: "0.0", kind: "step", flow: "app/theme/set", status: "done" }])
    expect(model.calls).toHaveLength(2)
  })

  test("streams the answer's text and steps to its row while the model writes, then settles the whole text", async () => {
    const release = Effect.runSync(Deferred.make<void>())
    let calls = 0
    const agent = await openAgent(runtime, () => {
      calls++
      if (calls === 1) {
        return Stream.make(
          { type: "text-delta" as const, id: "t", text: cell(`await ctx.call("app/theme/set", { mode: "light" })`) },
          usage,
          stop,
        )
      }
      return Stream.concat(
        Stream.make({ type: "text-delta" as const, id: "t", text: "```cell\nctx.done(\"Light mode is" }),
        Stream.fromEffect(Deferred.await(release)).pipe(
          Stream.flatMap(() =>
            Stream.make({ type: "text-delta" as const, id: "t", text: " on.\")\n```" }, usage, stop)
          ),
        ),
      )
    })
    const engine = await agent.engine()
    engines.push(engine)
    const answerId = await agent.ask("Light mode, please")

    const running = agent.start(engine, answerId)
    // The engine's run, with its model calls through ChatApi, can take seconds on a loaded machine.
    await eventually(async () => (await row(runtime, answerId)).text === "Light mode is", 20_000)
    const streaming = await row(runtime, answerId)
    Effect.runSync(Deferred.succeed(release, undefined))
    const exit = await running.done

    expect(streaming).toMatchObject({
      status: "streaming",
      parts: [{ id: "0.0", kind: "step", flow: "app/theme/set", status: "done" }],
    })
    expect(exit).toEqual(Exit.succeed({ status: "done" }))
    expect(await row(runtime, answerId)).toMatchObject({ status: "done", text: "Light mode is on." })
  })

  test("resumes after the tab is killed mid-answer, without calling the model or the theme again for sealed steps", async () => {
    const reached = Effect.runSync(Deferred.make<void>())
    let calls = 0
    const agent = await openAgent(runtime, () => {
      calls++
      if (calls === 1) {
        return Stream.make(
          { type: "text-delta" as const, id: "t", text: cell(`await ctx.call("app/theme/set", { mode: "dark" })`) },
          usage,
          stop,
        )
      }
      // The second model call never ends in the first tab: the tab dies while the model writes.
      if (calls === 2) {
        return Stream.fromEffect(Deferred.succeed(reached, undefined)).pipe(Stream.flatMap(() => Stream.never))
      }
      return Stream.make(
        { type: "text-delta" as const, id: "t", text: cell(`ctx.done("Dark mode is on.")`) },
        usage,
        stop,
      )
    })
    const first = await agent.engine()
    const answerId = await agent.ask("Dark mode")
    const running = agent.start(first, answerId)
    await Effect.runPromise(Deferred.await(reached))

    // The tab dies: its engine records nothing more. The next tab's engine takes the run over at once, as the browser's
    // leader does (`BrowserRuntime.isAlive`), and drives it. The dead engine is closed only after the run has finished.
    await first.crash()
    const second = await agent.engine(first.schema)
    engines.push(second)
    const exit = await agent.resume(second, answerId)
    await running.stop()
    await first.kill()

    expect(exit).toEqual(Exit.succeed({ status: "done" }))
    // One call sealed before the kill, one cut off by it, and one after: the sealed call isn't paid for again.
    expect(calls).toBe(3)
    expect(agent.painted).toEqual(["dark"])
    expect(await row(runtime, answerId)).toMatchObject({
      status: "done",
      text: "Dark mode is on.",
      parts: [{ id: "0.0", kind: "step", flow: "app/theme/set", status: "done" }],
    })
  })

  test("answers a settled answer's run again from its record, without calling the model", async () => {
    const model = answering(`ctx.done("Once.")`)
    const agent = await openAgent(runtime, model.script)
    const engine = await agent.engine()
    engines.push(engine)
    const answerId = await agent.ask("Once?")

    await agent.answer(engine, answerId)
    const again = await agent.answer(engine, answerId)

    expect(again).toEqual(Exit.succeed({ status: "done" }))
    expect(model.calls).toHaveLength(1)
  })

  test("answers in turn: a later answer waits until the earlier one settles, then reads it in its history", async () => {
    const prompts: Array<string> = []
    const agent = await openAgent(runtime, (request) => {
      prompts.push(
        [
          ...request.system.map((part) => part.text),
          ...request.messages.flatMap((message) => message.content.map((part) => ("text" in part ? part.text : ""))),
        ].join("\n"),
      )
      return Stream.make(
        { type: "text-delta" as const, id: "t", text: cell(`ctx.done("Answer ${prompts.length}.")`) },
        usage,
        stop,
      )
    })
    const engine = await agent.engine()
    engines.push(engine)
    const first = await agent.ask("First question")
    const second = await agent.ask("Second question")

    const later = agent.start(engine, second)
    const earlier = await agent.answer(engine, first)
    const exit = await later.done

    expect(earlier).toEqual(Exit.succeed({ status: "done" }))
    expect(exit).toEqual(Exit.succeed({ status: "done" }))
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain("Person: First question")
    expect(prompts[1]).toContain("Smithers: Answer 1.")
    expect(await row(runtime, second)).toMatchObject({ status: "done", text: "Answer 2." })
  })

  test("a model that refuses settles the answer failed, model_error", async () => {
    const agent = await openAgent(
      runtime,
      () => Stream.fail(new ModelError.ModelError({ code: "content_policy", message: "refused" })),
    )
    const engine = await agent.engine()
    engines.push(engine)
    const answerId = await agent.ask("Something it refuses")

    const exit = await agent.answer(engine, answerId)

    expect(exit).toEqual(Exit.succeed({ status: "failed" }))
    expect(await row(runtime, answerId)).toMatchObject({ status: "failed", failure: "model_error", text: "" })
  })

  test("an agent that never answers settles the answer failed, unfinished, after its last frame", async () => {
    const model = answering(`console.log("thinking")`)
    const agent = await openAgent(runtime, model.script)
    const engine = await agent.engine()
    engines.push(engine)
    const answerId = await agent.ask("Think forever")

    const exit = await agent.answer(engine, answerId)

    expect(exit).toEqual(Exit.succeed({ status: "failed" }))
    expect(model.calls.length).toBeGreaterThanOrEqual(MAX_FRAMES)
    expect(await row(runtime, answerId)).toMatchObject({ status: "failed", failure: "unfinished" })
  })

  test("an empty answer settles failed, empty", async () => {
    const agent = await openAgent(runtime, answering(`ctx.done("")`).script)
    const engine = await agent.engine()
    engines.push(engine)
    const answerId = await agent.ask("Say nothing")

    expect(await agent.answer(engine, answerId)).toEqual(Exit.succeed({ status: "failed" }))
    expect(await row(runtime, answerId)).toMatchObject({ status: "failed", failure: "empty" })
  })

  test("a turn that never comes settles failed, unfinished, at the turn deadline, with no model call", async () => {
    const model = answering(`ctx.done("Never.")`)
    const agent = await openAgent(runtime, model.script)
    const engine = await agent.engine(undefined, { turnWait: "1 seconds" })
    engines.push(engine)
    // The first answer's device never runs it, and it stays live past the turn wait, so the second never gets its turn.
    const first = await agent.ask("Asked on a device that went away")
    const second = await agent.ask("Asked here")

    const exit = await agent.answer(engine, second)

    expect(exit).toEqual(Exit.succeed({ status: "failed" }))
    expect(model.calls).toHaveLength(0)
    expect(await row(runtime, second)).toMatchObject({ status: "failed", failure: "unfinished", text: "" })
    expect(await row(runtime, first)).toMatchObject({ status: "streaming" })
  })

  test("a run killed while it waits settles on resume by the turn deadline its first start set", async () => {
    const model = answering(`ctx.done("Never.")`)
    const agent = await openAgent(runtime, model.script)
    const first = await agent.engine(undefined, { turnWait: "2 seconds" })
    await agent.ask("Asked on a device that went away")
    const answerId = await agent.ask("Asked here")
    const running = agent.start(first, answerId)
    // The run is waiting: the routes have answered it `not_your_turn`.
    await eventually(
      () => agent.h.line("chat.answer.turn").some((line) => line.annotations.answerId === answerId),
      20_000,
    )

    // The tab dies. The next tab's engine would give a new run ten minutes; this run keeps the deadline it began with.
    await first.crash()
    const second = await agent.engine(first.schema)
    engines.push(second)
    const exit = await agent.resume(second, answerId)
    await running.stop()
    await first.kill()

    expect(exit).toEqual(Exit.succeed({ status: "failed" }))
    expect(model.calls).toHaveLength(0)
    expect(await row(runtime, answerId)).toMatchObject({ status: "failed", failure: "unfinished" })
  })

  test("a model's fractional token counts settle done, rounded, rather than kill the settle", async () => {
    const agent = await openAgent(runtime, () =>
      Stream.make(
        { type: "text-delta" as const, id: "t", text: cell(`ctx.done("Counted.")`) },
        { type: "usage" as const, inputTokens: 12.5, outputTokens: 3.2 },
        stop,
      ))
    const engine = await agent.engine()
    engines.push(engine)
    const answerId = await agent.ask("Count")

    expect(await agent.answer(engine, answerId)).toEqual(Exit.succeed({ status: "done" }))
    expect(await row(runtime, answerId)).toMatchObject({
      status: "done",
      text: "Counted.",
      inputTokens: 13,
      outputTokens: 3,
    })
  })

  test("an answer that settled some other way fails the run with AnswerSettled, and calls no model", async () => {
    const model = answering(`ctx.done("Late.")`)
    const agent = await openAgent(runtime, model.script)
    const engine = await agent.engine()
    engines.push(engine)
    const answerId = await agent.ask("Already answered")
    await agent.fetch(`http://chat.test/api/answers/${answerId}`, {
      method: "POST",
      body: JSON.stringify({ status: "failed", failure: "model_error" }),
    })

    const exit = await agent.answer(engine, answerId)

    expect(Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit).toEqual(new AnswerSettled())
    expect(model.calls).toHaveLength(0)
  })
})

describe("the agent's seat", () => {
  test("is the model endpoint's agent role, and resolves no other seat", async () => {
    const resolved = await Effect.runPromise(
      Effect.gen(function* () {
        const resolver = yield* SeatResolver.SeatResolver
        return [yield* resolver.resolve(AGENT_SEAT), yield* Effect.flip(resolver.resolve("anthropic:other"))] as const
      }).pipe(Effect.provide(seats("http://chat.test")), Effect.provide(FetchHttpClient.layer)),
    )

    expect(resolved[0]).toMatchObject({ id: "agent", modelId: "agent" })
    expect(await Effect.runPromise(resolved[0].route.prepare(probe))).toMatchObject({
      url: "http://chat.test/api/model/agent",
    })
    expect(resolved[1]).toMatchObject({ seat: "anthropic:other" })
  })
})
