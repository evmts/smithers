// `core/waits` (src/features/status/queries.ts, decision 0017): the open waits addressed to the viewer, from the
// synced `runs` in every conversation, with the home conversation's settled answers winning over their runs' rows, over
// real local collections holding the rows Electric would deliver.
import { Collection } from "@smthrs/effect-tanstack-db"
import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { plain } from "../../test/deviceFixture"
import { WAITS_ROW } from "./contract"
import { Message } from "../chat/schema"
import { waitsQuery } from "./queries"
import { Run } from "./schema"

const question = { execution: "q/call/0.0", kind: "question", prompt: "Which branch?", options: ["main", "docs-v2"] } as const
const approval = { execution: "a/call/0.0", kind: "approval", prompt: "Delete docs-v1?", options: [] } as const

const row = (id: string, fields: Partial<Run> = {}): Run => ({
  id,
  flow: "chat/Answer",
  status: "needs_you",
  waiting: "input",
  wait: question,
  version: 1,
  answer: null,
  answeredAt: null,
  createdAt: "2026-10-21T10:00:00.000Z",
  updatedAt: "2026-10-21T10:00:00.000Z",
  ...fields,
})

/** Whether `value` is what one of WAITS_ROW's properties describes. */
const fits = (value: unknown, property: { readonly type: string; readonly enum?: ReadonlyArray<string> }): boolean =>
  property.type === "integer"
    ? Number.isInteger(value)
    : property.type === "array"
    ? Array.isArray(value) && value.every((item) => typeof item === "string")
    : typeof value === property.type && (property.enum === undefined || property.enum.includes(value as string))

/** The home conversation's answer `id`, in `status`. */
const answer = (id: string, status: Message["status"]): Message => ({
  id,
  role: "assistant",
  text: "",
  status,
  questionId: null,
  failure: null,
  modelId: null,
  stopReason: null,
  inputTokens: null,
  outputTokens: null,
  position: 1,
  createdAt: "2026-10-21T10:00:00.000Z",
  updatedAt: "2026-10-21T10:00:00.000Z",
})

/** The waits over `rows` and the home conversation's `home`, then again after `change` runs on the runs. */
const waitsOver = (
  rows: ReadonlyArray<Run>,
  change?: (runs: Collection.Collection<Run, string | number>) => Effect.Effect<unknown, unknown>,
  home: ReadonlyArray<Message> = [],
) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const runs = yield* Collection.local<Run, string | number>({
      id: `runs-${crypto.randomUUID()}`,
      schema: Run,
      getKey: (run) => run.id,
      initialData: rows,
    })
    const messages = yield* Collection.local<Message, string | number>({
      id: `messages-${crypto.randomUUID()}`,
      schema: Message,
      getKey: (message) => message.id,
      initialData: home,
    })
    const waits = yield* waitsQuery(messages, runs)
    yield* waits.preload
    // TanStack DB adds its virtual `$` fields to every result row; the row itself is the rest.
    const read = Effect.map(waits.toArray, (rows) => rows.map(plain))
    const before = yield* read
    if (change !== undefined) yield* change(runs)
    return [before, yield* read] as const
  })))

describe("waitsQuery", () => {
  test("lists each open wait, oldest first then by id, in exactly WAITS_ROW's fields", async () => {
    const [waits] = await waitsOver([
      row("c", { createdAt: "2026-10-21T10:00:02.000Z", wait: approval, waiting: "approval", version: 3 }),
      row("b", { createdAt: "2026-10-21T10:00:01.000Z" }),
      row("a", { createdAt: "2026-10-21T10:00:01.000Z", version: 2 }),
    ])
    expect(waits).toEqual([
      {
        runId: "a", version: 2, execution: "q/call/0.0", kind: "question", prompt: "Which branch?",
        options: ["main", "docs-v2"], question: true, approval: false, createdAt: "2026-10-21T10:00:01.000Z",
      },
      expect.objectContaining({ runId: "b", version: 1 }),
      {
        runId: "c", version: 3, execution: "a/call/0.0", kind: "approval", prompt: "Delete docs-v1?", options: [],
        question: false, approval: true, createdAt: "2026-10-21T10:00:02.000Z",
      },
    ])
    // Each row is what WAITS_ROW says, which the plugin loader checks `$item.<field>` references against.
    for (const wait of waits) {
      expect(Object.keys(wait).sort()).toEqual([...WAITS_ROW.required].sort())
      for (const [field, value] of Object.entries(wait)) expect(fits(value, WAITS_ROW.properties[field as keyof typeof WAITS_ROW.properties]), field).toBe(true)
    }
  })

  test("leaves out a run that is answered, working, waiting its turn, settled, or holds no wait", async () => {
    const [waits] = await waitsOver([
      row("open"),
      row("answered", { answer: { value: "main" }, answeredAt: "2026-10-21T10:01:00.000Z" }),
      row("working", { status: "working", waiting: null }),
      row("turn", { status: "waiting", waiting: "turn", wait: null }),
      row("done", { status: "done", waiting: null }),
      row("failed", { status: "failed", waiting: null }),
      row("no-wait", { wait: null }),
    ])
    expect(waits.map((wait) => wait.runId)).toEqual(["open"])
  })

  test("follows the rows: an answer closes a wait, a new question opens one", async () => {
    const [before, after] = await waitsOver([row("a"), row("b", { status: "working", waiting: null })], (runs) =>
      Effect.gen(function* () {
        yield* runs.update("a", (draft) => {
          draft.answer = { value: "main" }
          draft.answeredAt = "2026-10-21T10:01:00.000Z"
        })
        yield* runs.update("b", (draft) => {
          draft.status = "needs_you"
          draft.waiting = "approval"
          draft.wait = { ...approval, options: [] }
          draft.version = 2
        })
      }))
    expect(before.map((wait) => wait.runId)).toEqual(["a"])
    expect(after).toEqual([expect.objectContaining({ runId: "b", version: 2, kind: "approval", approval: true })])
  })

  test("a home answer that already settled wins over its run's row; one still streaming, or on a branch, keeps its wait", async () => {
    const [waits] = await waitsOver(
      [row("done"), row("failed"), row("streaming"), row("branch")],
      undefined,
      [answer("done", "done"), answer("failed", "failed"), answer("streaming", "streaming")],
    )
    expect(waits.map((wait) => wait.runId)).toEqual(["branch", "streaming"])
  })
})
