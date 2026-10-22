// The agent talks through UI (docs/features/views.md): `ui/form`, `ui/render` and `view/set-state` on the Node host
// (src/test/agent.ts), the agent's own `chat/Answer` calling them from its cells, against ChatApi's real views and
// questions routes, its real presentation realm, and the model endpoint, on the compose Postgres (`pnpm db:up`). The
// models, the agent's and the renderer's, are the only scripted seam.
import type { ModelRequest } from "@smthrs/model"
import { Effect, Exit, Stream } from "effect"
import { SqlClient } from "effect/sql"
import { afterEach, describe, expect, test } from "vitest"
import { stop, testFile, usage } from "../../../worker/test/harness.ts"
import { answerRow, cell, type Engine, openAgent } from "../../test/agent"
import { SetViewState } from "./flows"
import { RENDERER_SYSTEM, TIC_TAC_TOE, TIC_TAC_TOE_STATE } from "./renderer"

const runtime = testFile("agent-views-flow")

const engines: Array<Engine> = []
afterEach(async () => {
  for (const engine of engines.splice(0)) await engine.kill()
})

/** A test's budget: an agent run on a fresh engine, on a loaded machine. */
const WITHIN = 90_000

const textOf = (request: ModelRequest.ModelRequest) =>
  [...request.system.map((part) => part.text), ...request.messages.flatMap((message) =>
    message.content.map((part) => ("text" in part ? part.text : "")))].join("\n")

/** What the agent's cells printed, and the turn's messages: never its system prompt, whose catalog names every flow. */
const printed = (request: ModelRequest.ModelRequest) =>
  request.messages.flatMap((message) => message.content.map((part) => ("text" in part ? part.text : ""))).join("\n")

const reply = (text: string) => Stream.make({ type: "text-delta" as const, id: "t", text }, usage, stop)

/** Whether `request` is the renderer's: its system prompt is the renderer's. */
const isRenderer = (request: ModelRequest.ModelRequest) =>
  request.system.some((part) => part.text.includes(RENDERER_SYSTEM.slice(0, 60)))

/** The renderer's reply: a title and first state, and the module. */
const written = (code: string, state: unknown = TIC_TAC_TOE_STATE) =>
  "```json\n" + JSON.stringify({ title: "Tic-tac-toe", state }) + "\n```\n```tsx\n" + code + "\n```"

const CLONE_FORM = {
  title: "Which repository?",
  schema: { type: "object", properties: { url: { type: "string", title: "Repository URL" } }, required: ["url"] },
  submitLabel: "Clone",
}

const views = () =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql<{
      readonly id: string
      readonly template: string
      readonly props: Record<string, unknown>
      readonly state: unknown
      readonly html: string | null
      readonly revision: number
    }>`SELECT id::text AS id, template, props, state, html, revision FROM views ORDER BY position`))

describe("ui/form", () => {
  test("the agent asks with a form; the submission is the next question, and the next answer reads its values", async () => {
    const agent = await openAgent(runtime, (request) => {
      const sent = textOf(request).match(/Clone\nThe values the person sent with it: (\{[^\n]*\})/)
      return reply(cell(sent === null
        ? `await ctx.call("ui/form", ${JSON.stringify(CLONE_FORM)})\nctx.done("Which repository?")`
        : `ctx.done(${JSON.stringify(`Cloning ${(JSON.parse(sent[1]!) as { url: string }).url}.`)})`))
    })
    const engine = await agent.engine()
    engines.push(engine)

    const first = await agent.ask("Clone a repository for me")
    expect(await agent.answer(engine, first)).toEqual(Exit.succeed({ status: "done" }))
    const [form] = await views()
    expect(form).toMatchObject({ template: "form", props: CLONE_FORM, state: { submitted: false } })
    expect((await answerRow(runtime, first)).parts).toEqual([{ id: "0.0", kind: "step", flow: "ui/form", status: "done" }])

    // The person sends the form: their next question, with the values.
    const submission = {
      id: crypto.randomUUID(),
      answerId: crypto.randomUUID(),
      text: "Clone",
      source: { viewId: form!.id, event: "submit" },
      data: { url: "https://github.com/octocat/Spoon-Knife" },
    }
    expect((await agent.h.ask(submission)).status).toBe(202)
    expect(await agent.answer(engine, submission.answerId)).toEqual(Exit.succeed({ status: "done" }))
    expect(await answerRow(runtime, submission.answerId)).toMatchObject({
      status: "done",
      text: "Cloning https://github.com/octocat/Spoon-Knife.",
    })
    expect((await views())[0]).toMatchObject({ state: { submitted: true, values: submission.data }, revision: 1 })
  }, WITHIN)

  test("a form that asks for a secret is refused before anything is added", async () => {
    const secret = { ...CLONE_FORM, schema: { type: "object", properties: { token: { type: "string", writeOnly: true } } } }
    const agent = await openAgent(runtime, (request) =>
      reply(cell(printed(request).includes("TRIED")
        ? `ctx.done("I can't ask for that here.")`
        : `const r = await ctx.call("ui/form", ${JSON.stringify(secret)})\nconsole.log("TRIED " + JSON.stringify(r))`)))
    const engine = await agent.engine()
    engines.push(engine)
    const answerId = await agent.ask("Ask me for my token")
    expect(await agent.answer(engine, answerId)).toEqual(Exit.succeed({ status: "done" }))
    expect(await views()).toEqual([])
    expect((await answerRow(runtime, answerId)).parts).toEqual([{ id: "0.0", kind: "step", flow: "ui/form", status: "failed" }])
  }, WITHIN)
})

describe("ui/render", () => {
  test("the renderer's module goes back once with what failed, then ChatApi renders the board it fixed", async () => {
    const renderer: Array<string> = []
    const agent = await openAgent(runtime, (request) => {
      if (isRenderer(request)) {
        renderer.push(textOf(request))
        return reply(written(renderer.length === 1 ? `export default function View() { return <script>{"x"}</script> }` : TIC_TAC_TOE))
      }
      return reply(cell(printed(request).includes("SHOWN")
        ? `ctx.done("Here's a board.")`
        : `const v = await ctx.call("ui/render", { description: "A tic-tac-toe board" })\nconsole.log("SHOWN " + JSON.stringify(v))`))
    })
    const engine = await agent.engine()
    engines.push(engine)
    const answerId = await agent.ask("Show me a tic-tac-toe board")

    expect(await agent.answer(engine, answerId)).toEqual(Exit.succeed({ status: "done" }))
    expect(renderer).toHaveLength(2)
    expect(renderer[1]).toContain("That view failed:")
    const [board] = await views()
    expect(board).toMatchObject({ template: "generated", state: TIC_TAC_TOE_STATE, revision: 0 })
    expect(board!.html).toContain(`data-event="cell:8"`)
    expect(agent.h.line("chat.view.add").map((line) => line.annotations.status)).toEqual([422, 202])

    // A move, as a person's click dispatches it, and a stale one.
    const move = (revision: number, arg: string) =>
      Effect.runPromise(Effect.exit(engine.flows.execute(SetViewState, {
        executionId: crypto.randomUUID(),
        payload: { viewId: board!.id, revision, event: { name: "cell", arg } },
      })))
    expect(await move(0, "4")).toEqual(Exit.succeed({ viewId: board!.id, revision: 1 }))
    expect((await views())[0]).toMatchObject({ state: { cells: ["", "", "", "", "X", "", "", "", ""] }, revision: 1 })
    const stale = await move(0, "0")
    expect(Exit.isFailure(stale)).toBe(true)
    expect(JSON.stringify(stale)).toContain("ViewStale")
  }, WITHIN)

  test("a renderer that never writes a module that renders fails ViewNotRendered after two corrections", async () => {
    let calls = 0
    const agent = await openAgent(runtime, (request) => {
      if (isRenderer(request)) {
        calls++
        return reply("I can't do that.")
      }
      return reply(cell(printed(request).includes("TRIED")
        ? `ctx.done("I couldn't draw it.")`
        : `const v = await ctx.call("ui/render", { description: "A board" })\nconsole.log("TRIED " + JSON.stringify(v))`))
    })
    const engine = await agent.engine()
    engines.push(engine)
    const answerId = await agent.ask("Show me a board")
    expect(await agent.answer(engine, answerId)).toEqual(Exit.succeed({ status: "done" }))
    expect(calls).toBe(3)
    expect(await views()).toEqual([])
  }, WITHIN)
})
