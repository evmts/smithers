import { describe, expect, it } from "@effect/vitest"
import { Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Effect } from "effect"
import * as Schema from "effect/Schema"
import { FlowEngine } from "../src/index.ts"
import { withCrypto } from "./Crypto.ts"

const { Round } = FlowEngine

const flow = Flow.make("engine/Round", { payload: {}, success: Schema.String, body: () => Node.succeed("ready") })

describe("Round identity space", () => {
  it("names round zero's execution id rootExecutionId, apart from the journal lineage", () => {
    const instance = FlowEngine.makeInstance(flow, "run-1")
    // A journal lineage id is well-formed text, so only the type can refuse
    // it where round zero's execution id belongs. Never invoked.
    const wrongSpace = () => {
      // @ts-expect-error a journal lineage id is not an execution id
      Round.initial(instance.lineageId)
      // @ts-expect-error only Round.initial mints a root execution id
      const forged: FlowEngine.Round.Round = { rootExecutionId: instance.lineageId, ordinal: 1 }
      return forged
    }
    expect(wrongSpace).toBeTypeOf("function")
    expect(Round.initial("run-1")).toEqual({ rootExecutionId: "run-1", ordinal: 0 })
    expect(Round.initial("run-1")).not.toHaveProperty("lineageId")
  })
})

describe("Round identity validation", () => {
  it("rejects a trailing high surrogate synchronously", () => {
    for (const id of ["\ud800", "root-\udbff"]) {
      expect(() => Round.initial(id)).toThrow(Round.InvalidRound)
    }
  })

  it.effect("validates trailing high surrogates before deriving any ordinal", () =>
    withCrypto(Effect.gen(function*() {
      for (const ordinal of [0, 1]) {
        const error = yield* Round.executionId({
          rootExecutionId: "root-\ud800" as FlowEngine.Round.RootExecutionId,
          ordinal
        }).pipe(Effect.flip)
        expect(error).toBeInstanceOf(Round.InvalidRound)
      }
    })))

  it.effect("returns the caller's execution id for the initial round", () =>
    withCrypto(Effect.gen(function*() {
      for (const id of ["root", "round-🚀", "e\u0301"]) {
        expect(yield* Round.executionId(Round.initial(id))).toBe(id)
      }
    })))
})

describe("Round.next refusals", () => {
  const roundOf = (rootExecutionId: string, ordinal: number): FlowEngine.Round.Round => ({
    rootExecutionId: rootExecutionId as FlowEngine.Round.RootExecutionId,
    ordinal
  })
  const refusal = (round: FlowEngine.Round.Round, maxRounds: number | undefined) =>
    withCrypto(Round.next(round, { flowName: "engine/Round", maxRounds }).pipe(Effect.flip))

  it.effect("checks the round first, then the budget, then overflow", () =>
    Effect.gen(function*() {
      expect((yield* refusal(roundOf("", 0), 0)).message).toBe(
        "Round rootExecutionId must be non-empty well-formed text"
      )
      expect((yield* refusal(roundOf("run", Number.MAX_SAFE_INTEGER), 0)).message).toBe(
        "Round maxRounds must be a positive safe integer when supplied"
      )
      expect((yield* refusal(roundOf("run", Number.MAX_SAFE_INTEGER), undefined)).message).toBe(
        "Round ordinal cannot be advanced beyond Number.MAX_SAFE_INTEGER"
      )
    }))

  it.effect("names the lineage, flow, budget, and refused round of a spent budget", () =>
    Effect.gen(function*() {
      const error = yield* refusal(roundOf("run-a", 4), 3)
      expect(error).toBeInstanceOf(Flow.MaxRoundsExceeded)
      const exceeded = error as Flow.MaxRoundsExceeded
      expect({
        flowName: exceeded.flowName,
        lineageId: exceeded.lineageId,
        maxRounds: exceeded.maxRounds,
        roundOrdinal: exceeded.roundOrdinal,
        message: exceeded.message
      }).toEqual({
        flowName: "engine/Round",
        lineageId: "run-a",
        maxRounds: 3,
        roundOrdinal: 5,
        message: `Lineage run-a asked for round 5 of "engine/Round", which is past its declared maxRounds of 3. ` +
          "Raise the budget, or make the body's branch settle with Flow.done sooner."
      })
    }))
})
