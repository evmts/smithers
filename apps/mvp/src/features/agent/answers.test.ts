// How the agent reads the answer routes' refusals (src/features/agent/answers.ts). The real routes are proven in
// worker/Answers.test.ts and the agent's run against them in agent.test.ts; here `AnswerApi` reads each answer a
// transport can give, injected as the `fetch` its `HttpClient` uses.
import { Cause, Effect, Exit, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { describe, expect, test } from "vitest"
import { AnswerApi, AnswerSettled, AnswersUnavailable, NotYourTurn } from "./answers"

const over = <A, E>(fetch: typeof globalThis.fetch, use: (api: AnswerApi["Service"]) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.exit(Effect.flatMap(AnswerApi, use)).pipe(
      Effect.provide(AnswerApi.layerHttp("http://chat.test")),
      Effect.provide(FetchHttpClient.layer),
      Effect.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
    ),
  )

const answering = (status: number, body: string) => () =>
  Promise.resolve(new Response(body, { status, headers: { "content-type": "application/json" } }))

const failure = (exit: Exit.Exit<unknown, unknown>) => (Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit)

describe("turn", () => {
  test("reads the question and history from GET /api/answers/<id>", async () => {
    const seen: Array<string> = []
    const exit = await over(
      (input) => {
        seen.push(String(input instanceof Request ? input.url : input))
        return answering(200, JSON.stringify({ question: "Q", history: [] }))()
      },
      (api) => api.turn("a-1"),
    )

    expect(exit).toEqual(Exit.succeed({ question: "Q", history: [] }))
    expect(seen).toEqual(["http://chat.test/api/answers/a-1"])
  })

  test("tells its turn hasn't come from a settled answer, and everything else from both", async () => {
    const turn = (fetch: typeof globalThis.fetch) => over(fetch, (api) => api.turn("a"))

    // Vitest compares errors by name and message, so the waited time is read on its own.
    const notYourTurn = failure(await turn(answering(409, JSON.stringify({ code: "not_your_turn", waitedMs: 1_500 }))))
    expect(notYourTurn).toBeInstanceOf(NotYourTurn)
    expect((notYourTurn as NotYourTurn).waitedMs).toBe(1_500)
    // A refusal that doesn't say how long the turn has waited, or says something that isn't a duration, counts as none.
    for (const waitedMs of [undefined, -1, "5", Number.NaN]) {
      const unsaid = failure(await turn(answering(409, JSON.stringify({ code: "not_your_turn", waitedMs }))))
      expect(unsaid).toBeInstanceOf(NotYourTurn)
      expect((unsaid as NotYourTurn).waitedMs).toBe(0)
    }
    expect(failure(await turn(answering(409, JSON.stringify({ code: "settled" }))))).toEqual(new AnswerSettled())
    expect(failure(await turn(answering(409, JSON.stringify({ code: "other" }))))).toEqual(
      new AnswersUnavailable({ status: 409 }),
    )
    expect(failure(await turn(answering(409, "not json")))).toEqual(new AnswersUnavailable({ status: 409 }))
    expect(failure(await turn(answering(409, "null")))).toEqual(new AnswersUnavailable({ status: 409 }))
    expect(failure(await turn(answering(503, "{}")))).toEqual(new AnswersUnavailable({ status: 503 }))
    expect(failure(await turn(answering(200, JSON.stringify({ question: 1 }))))).toEqual(
      new AnswersUnavailable({ status: 200 }),
    )
    expect(failure(await turn(() => Promise.reject(new TypeError("offline"))))).toEqual(new AnswersUnavailable({}))
  })
})

describe("write", () => {
  test("posts the write, encoded, to POST /api/answers/<id>", async () => {
    const posted: Array<{ readonly method: string; readonly body: string }> = []
    const exit = await over(
      async (input, init) => {
        const request = new Request(input, init)
        posted.push({ method: request.method, body: await request.text() })
        return answering(200, JSON.stringify({ txid: 1 }))()
      },
      (api) => api.write("a", { status: "done", text: "Yes." }),
    )

    expect(exit).toEqual(Exit.void)
    expect(posted).toEqual([{ method: "POST", body: JSON.stringify({ status: "done", text: "Yes." }) }])
  })

  test("a settled answer is AnswerSettled; a turn refusal or any other answer is unavailable", async () => {
    const write = (fetch: typeof globalThis.fetch) =>
      over(fetch, (api) => api.write("a", { status: "streaming", parts: [] }))

    expect(failure(await write(answering(409, JSON.stringify({ code: "settled" }))))).toEqual(new AnswerSettled())
    expect(failure(await write(answering(409, JSON.stringify({ code: "not_your_turn" }))))).toEqual(
      new AnswersUnavailable({ status: 409 }),
    )
    expect(failure(await write(answering(401, "{}")))).toEqual(new AnswersUnavailable({ status: 401 }))
  })
})
