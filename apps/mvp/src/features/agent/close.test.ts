// `chat/Close` on the Node host (src/test/agent.ts), through ChatApi's real answer routes on the compose Postgres
// (`pnpm db:up`): an answer whose run can no longer finish settles failed, `unfinished`, once; one that settled already
// stays as it is.
import { Effect, Exit, Stream } from "effect"
import { afterEach, expect, test } from "vitest"
import { stop, testFile, usage } from "../../../worker/test/harness.ts"
import { answerRow as row, cell, type Engine, openAgent } from "../../test/agent"
import { Close } from "./close"

const runtime = testFile("close")

const engines: Array<Engine> = []
afterEach(async () => {
  for (const engine of engines.splice(0)) await engine.kill()
})

const answering = (text: string) => () =>
  Stream.make({ type: "text-delta" as const, id: "t", text: cell(`ctx.done(${JSON.stringify(text)})`) }, usage, stop)

const close = (engine: Engine, answerId: string, executionId: string) =>
  Effect.runPromise(Effect.exit(engine.flows.execute(Close, { executionId, payload: { answerId } })))

test("closes a streaming answer failed, unfinished; closing it again changes nothing", async () => {
  const agent = await openAgent(runtime, answering("never asked"))
  const engine = await agent.engine()
  engines.push(engine)
  const answerId = await agent.ask("A question whose run was refused")

  expect(await close(engine, answerId, `${answerId}/close`)).toEqual(Exit.succeed({ closed: true }))
  expect(await row(runtime, answerId)).toMatchObject({ status: "failed", failure: "unfinished" })
  // Another close, as a later page's resend starts: the routes take the same settle as landed.
  expect(await close(engine, answerId, `${answerId}/close-again`)).toEqual(Exit.succeed({ closed: true }))
})

test("leaves an answer that settled another way as it is", async () => {
  const agent = await openAgent(runtime, answering("Done before."))
  const engine = await agent.engine()
  engines.push(engine)
  const answerId = await agent.ask("A question answered already")
  expect(await agent.answer(engine, answerId)).toEqual(Exit.succeed({ status: "done" }))

  expect(await close(engine, answerId, `${answerId}/close`)).toEqual(Exit.succeed({ closed: false }))
  expect(await row(runtime, answerId)).toMatchObject({ status: "done", text: "Done before." })
})
