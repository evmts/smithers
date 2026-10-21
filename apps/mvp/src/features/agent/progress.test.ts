// What an answer shows while the agent works (src/features/agent/progress.ts): the fold over the agent's events, and
// the writer that streams each answer's text and parts, over an `AnswerApi` that records or refuses its writes.
import type { AgentEvent } from "@smthrs/harness"
import { EventSink } from "@smthrs/agent"
import { Context, Effect, Exit, Layer, Scope } from "effect"
import { describe, expect, test, vi } from "vitest"
import { AnswerApi, AnswersUnavailable } from "./answers"
import { settlement, sink } from "./host"
import { AnswerProgress, empty, failureOf, fold, type Progress } from "./progress"
import { prompt } from "./flows"
import type { AnswerWrite } from "./schema"

const event = (value: Record<string, unknown>) => value as unknown as AgentEvent.AgentEvent
const started = (frame: number, ordinal: number, flowName = "app/theme/set") =>
  event({ _tag: "cell-call-started", call: { flowName, identity: { frame, ordinal } } })
const settled = (frame: number, ordinal: number, outcome: "success" | "failure", flowName = "app/theme/set") =>
  event({ _tag: "cell-call-settled", flowName, identity: { frame, ordinal }, result: { outcome } })
const delta = (text: string) => event({ _tag: "model-delta", delta: { type: "text-delta", id: "t", text } })

const replay = (...events: ReadonlyArray<AgentEvent.AgentEvent>) => events.reduce(fold, empty)

describe("fold", () => {
  test("a call is a running step, then done or failed; a replayed settlement adds its step", () => {
    const progress = replay(
      started(0, 0),
      started(0, 0),
      started(0, 1),
      settled(0, 0, "success"),
      settled(1, 0, "failure", "app/other"),
    )

    expect(progress.parts).toEqual([
      { id: "0.0", kind: "step", flow: "app/theme/set", status: "done" },
      { id: "0.1", kind: "step", flow: "app/theme/set", status: "running" },
      { id: "1.0", kind: "step", flow: "app/other", status: "failed" },
    ])
    expect(replay(started(0, 0)).parts).toEqual([{ id: "0.0", kind: "step", flow: "app/theme/set", status: "running" }])
  })

  test("the text is the reply's ctx.done literal as far as it has arrived; a new call or a retry starts it over", () => {
    const first = replay(delta("```cell\nconst a = 1\n"), delta("ctx.done(\"Hel"), delta("lo"))
    const cut = fold(first, event({ _tag: "model-retried" }))
    const again = replay(
      delta("```cell\nctx.done(\"Hi\")\n```"),
      event({ _tag: "model-requested" }),
      delta("```cell\n"),
    )

    expect(first.text).toBe("Hello")
    expect([cut.reply, cut.text]).toEqual(["", "Hello"])
    expect(again.text).toBe("Hi")
    expect(fold(first, event({ _tag: "model-delta", delta: { type: "usage" } }))).toBe(first)
  })

  test("sums each call's tokens, and remembers how a model call failed", () => {
    const spent = replay(
      event({ _tag: "model-settled", usage: { inputTokens: 10, outputTokens: 2 } }),
      event({ _tag: "model-settled", usage: {} }),
      event({ _tag: "model-settled", usage: { inputTokens: 5, outputTokens: 1 } }),
    )

    expect([spent.inputTokens, spent.outputTokens]).toEqual([15, 3])
    expect(fold(empty, event({ _tag: "model-failed", code: "rate_limited" })).modelFailure).toBe("rate_limited")
    expect(fold(empty, event({ _tag: "model-failed", code: "quota_exceeded" })).modelFailure).toBe("rate_limited")
    expect(fold(empty, event({ _tag: "model-failed", code: "provider_internal", httpStatus: 429 })).modelFailure).toBe(
      "rate_limited",
    )
    expect(fold(empty, event({ _tag: "model-failed", code: "content_policy" })).modelFailure).toBe("model_error")
    expect(fold(empty, event({ _tag: "cell-produced" }))).toBe(empty)
  })

  test("an answer the agent didn't finish failed in its model, or ran out of frames", () => {
    expect(failureOf(undefined)).toBe("model_error")
    expect(failureOf(empty)).toBe("unfinished")
    expect(failureOf({ ...empty, modelFailure: "rate_limited" })).toBe("rate_limited")
  })
})

describe("settlement", () => {
  const shown: Progress = {
    ...empty,
    parts: [{ id: "0.0", kind: "step", flow: "app/theme/set", status: "done" }],
    inputTokens: 3,
    outputTokens: 4,
  }

  const answered = (text: string | null) => ({ text, timedOut: false })

  test("a reply settles done with the parts and tokens this engine saw, or with neither after a resume", () => {
    expect(settlement(answered("Done."), shown)).toEqual({
      status: "done",
      text: "Done.",
      parts: shown.parts,
      inputTokens: 3,
      outputTokens: 4,
    })
    expect(settlement(answered("Done."), undefined)).toEqual({ status: "done", text: "Done." })
  })

  test("a provider's fractional token counts settle rounded, as the routes take them", () => {
    expect(settlement(answered("Done."), { ...shown, inputTokens: 12.5, outputTokens: 3.2 })).toMatchObject({
      status: "done",
      inputTokens: 13,
      outputTokens: 3,
    })
  })

  test("no reply fails as the progress says; an empty one fails empty", () => {
    expect(settlement(answered(null), shown)).toEqual({ status: "failed", failure: "unfinished", parts: shown.parts })
    expect(settlement(answered(null), undefined)).toEqual({ status: "failed", failure: "model_error" })
    expect(settlement(answered("  "), shown)).toEqual({ status: "failed", failure: "empty", parts: shown.parts })
  })

  test("a run out of time fails unfinished, whatever the agent had, keeping the parts it showed", () => {
    expect(settlement({ text: "Late.", timedOut: true }, shown)).toEqual({
      status: "failed",
      failure: "unfinished",
      parts: shown.parts,
    })
    expect(settlement({ text: null, timedOut: true }, undefined)).toEqual({ status: "failed", failure: "unfinished" })
  })
})

describe("prompt", () => {
  test("a first question is itself; a later one carries the conversation before it", () => {
    expect(prompt({ question: "Hi", history: [] })).toBe("Hi")
    expect(prompt({ question: "And now?", history: [{ question: "Q1", answer: "A1" }] })).toBe(
      "The conversation so far:\nPerson: Q1\nSmithers: A1\n\nThe person now asks: And now?",
    )
  })
})

describe("AnswerProgress", () => {
  const open = async (write: (answerId: string, write: AnswerWrite) => Effect.Effect<void, AnswersUnavailable>) => {
    const scope = Effect.runSync(Scope.make())
    const progress = await Effect.runPromise(
      Scope.provide(scope)(
        Effect.map(
          Layer.build(
            AnswerProgress.layer("10 millis").pipe(
              Layer.provide(Layer.succeed(AnswerApi, AnswerApi.of({ heartbeat: () => Effect.void, turn: () => Effect.die("unused"), write }))),
            ),
          ),
          (context) => Context.get(context, AnswerProgress),
        ),
      ),
    )
    return { progress, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) }
  }

  test("writes each answer's latest text and parts as they change, and nothing for events that show nothing", async () => {
    const writes: Array<[string, AnswerWrite]> = []
    const { progress, close } = await open((id, write) => Effect.sync(() => void writes.push([id, write])))

    await Effect.runPromise(progress.record("a", started(0, 0)))
    await Effect.runPromise(progress.record("a", event({ _tag: "turn-opened" })))
    await vi.waitFor(() => expect(writes).toHaveLength(1))
    await Effect.runPromise(progress.record("a", delta("```cell\nctx.done(\"Hi")))
    await vi.waitFor(() => expect(writes).toHaveLength(2))
    await close()

    expect(writes).toEqual([
      ["a", { status: "streaming", parts: [{ id: "0.0", kind: "step", flow: "app/theme/set", status: "running" }] }],
      [
        "a",
        {
          status: "streaming",
          parts: [{ id: "0.0", kind: "step", flow: "app/theme/set", status: "running" }],
          text: "Hi",
        },
      ],
    ])
  })

  test("drops a write the routes refuse, and writes nothing for an answer it has forgotten", async () => {
    const tried: Array<string> = []
    const { progress, close } = await open((id) =>
      Effect.sync(() => tried.push(id)).pipe(Effect.andThen(Effect.fail(new AnswersUnavailable({ status: 409 }))))
    )

    await Effect.runPromise(progress.record("refused", started(0, 0)))
    await vi.waitFor(() => expect(tried).toEqual(["refused"]))
    await Effect.runPromise(progress.record("gone", started(0, 0)))
    await Effect.runPromise(progress.forget("gone"))
    await Effect.runPromise(progress.record("refused", settled(0, 0, "success")))
    await vi.waitFor(() => expect(tried).toEqual(["refused", "refused"]))
    await close()

    expect(await Effect.runPromise(progress.get("gone"))).toBeUndefined()
    expect((await Effect.runPromise(progress.get("refused")))?.parts).toHaveLength(1)
  })
})

describe("the agent's sink", () => {
  test("records each event against the run's execution id, the answer's, and drops one with no run", async () => {
    const recorded: Array<[string, string]> = []
    const emit = await Effect.runPromise(
      Effect.map(EventSink.EventSink, (service) => service.emit).pipe(
        Effect.provide(sink),
        Effect.provide(
          Layer.succeed(
            AnswerProgress,
            AnswerProgress.of({
              record: (answerId, recordedEvent) =>
                Effect.sync(() => void recorded.push([answerId, recordedEvent._tag])),
              get: () => Effect.succeed(undefined),
              forget: () => Effect.void,
            }),
          ),
        ),
      ),
    )

    await Effect.runPromise(emit(started(0, 0), { executionId: "answer-1" } as never))
    await Effect.runPromise(emit(started(0, 1)))

    expect(recorded).toEqual([["answer-1", "cell-call-started"]])
  })
})
