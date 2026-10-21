import { Collection, type Outbox } from "@smthrs/effect-tanstack-db"
import { Effect, Option } from "effect"
import { describe, expect, test } from "vitest"
import { type Unsent, Unsent as UnsentRow } from "../features/chat/schema"
import { keepParked as keepParkedQuestion } from "../features/chat/store"
import { type Requested, Requested as RequestedRow } from "../features/issues/schema"
import { keepParked as keepParkedWrite } from "../features/issues/writes"
import { plain } from "../test/deviceFixture"

// A write the outbox parked, one an older build stored that this build can't send as it meant (decision 0021 §4),
// goes to its feature, which shows it Not sent: a question as an `unsent` row, an issue write as a `not_sent` request.
// One whose row doesn't say enough to show stays parked.

const parked = (name: string, row: unknown): Outbox.Parked => ({ id: "tx-1", name, reason: "newer", rows: [row] })

const run = <A>(effect: Effect.Effect<A, never, import("effect").Scope.Scope>) => Effect.runPromise(Effect.scoped(effect))

describe("a parked question", () => {
  const question = { id: "q1", answerId: "a1", text: "Asked before the deploy", queuedAt: 1, v: 1 }

  test("shows Not sent with Retry and Discard, and leaves the outbox", async () => {
    const shown = await run(Effect.gen(function* () {
      const unsent = yield* Collection.local<Unsent, string>({ id: "unsent", schema: UnsentRow, getKey: (row) => row.id })
      const took = yield* keepParkedQuestion(unsent, parked("ask", { ...question, conversationId: "c1" }))
      return { took, row: Option.map(yield* unsent.get("q1"), plain).pipe(Option.getOrUndefined) }
    }))
    expect(shown).toEqual({
      took: true,
      row: { id: "q1", answerId: "a1", text: "Asked before the deploy", queuedAt: 1, reason: "not_admitted", conversationId: "c1" },
    })
  })

  test("that doesn't say its text stays parked", async () => {
    const took = await run(Effect.gen(function* () {
      const unsent = yield* Collection.local<Unsent, string>({ id: "unsent", schema: UnsentRow, getKey: (row) => row.id })
      return yield* keepParkedQuestion(unsent, parked("ask", { id: "q1" }))
    }))
    expect(took).toBe(false)
  })
})

describe("a parked issue write", () => {
  const write = {
    id: "w1",
    repo: "owner/name",
    repoId: "r1",
    op: "issue/comment",
    via: "agent",
    title: "",
    number: 3,
    body: "Written by the agent",
    queuedAt: 2,
    v: 1,
  }

  test("shows Not sent, as not allowed, and leaves the outbox", async () => {
    const shown = await run(Effect.gen(function* () {
      const requested = yield* Collection.local<Requested, string>({
        id: "requested",
        schema: RequestedRow,
        getKey: (row) => row.id,
      })
      const took = yield* keepParkedWrite(requested, parked("issue-write", write))
      return { took, row: Option.map(yield* requested.get("w1"), plain).pipe(Option.getOrUndefined) }
    }))
    expect(shown).toEqual({
      took: true,
      row: {
        id: "w1",
        repo: "owner/name",
        repoId: "r1",
        op: "issue/comment",
        title: "",
        number: 3,
        body: "Written by the agent",
        queuedAt: 2,
        status: "not_sent",
        reason: "not_allowed",
      },
    })
  })

  test("that doesn't name its repository stays parked", async () => {
    const took = await run(Effect.gen(function* () {
      const requested = yield* Collection.local<Requested, string>({
        id: "requested",
        schema: RequestedRow,
        getKey: (row) => row.id,
      })
      return yield* keepParkedWrite(requested, parked("issue-write", { id: "w1" }))
    }))
    expect(took).toBe(false)
  })
})
