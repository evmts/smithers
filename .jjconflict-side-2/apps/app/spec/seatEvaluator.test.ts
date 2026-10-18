import * as Model from "@smthrs/model/Model"
import type { ModelRequest } from "@smthrs/model/ModelRequest"
import { expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { seatEvaluator } from "./seatEvaluator.ts"

test("resolved seat gets the pinned model and temperature zero through layerFromSeat", async () => {
  const seen: ModelRequest[] = []
  const model = Model.make({
    stream: (request) => {
      seen.push(request)
      return Stream.fromIterable([
        { type: "text-start", id: "answer" },
        {
          type: "text-delta",
          id: "answer",
          text: JSON.stringify({ answers: { honesty: { type: "score", score: 4 } } })
        },
        { type: "text-end", id: "answer" },
        { type: "settle", stopReason: "stop" }
      ])
    }
  })
  expect(() => seatEvaluator({ modelId: "wrong", model }, "pinned")).toThrow("policy model")
  expect(() => seatEvaluator({ id: "openai:pinned", modelId: "pinned", model }, "pinned", "claude")).toThrow(
    "policy engine"
  )
  for (const id of ["anthropic:pinned", "claude-code:other"]) {
    expect(() => seatEvaluator({ id, modelId: "pinned", model }, "pinned", "claude", "claude-code:pinned")).toThrow("policy seat")
  }
  expect(() => seatEvaluator({ id: "claude-code:pinned", modelId: "wrong", model }, "pinned", "claude", "claude-code:pinned")).toThrow("policy model")
  const evaluator = await Effect.runPromise(
    seatEvaluator({ id: "claude-code:pinned", modelId: "pinned", model }, "pinned", "claude", "claude-code:pinned")
  )
  const response = await Effect.runPromise(
    evaluator.evaluate({
      state: "page",
      questions: { honesty: { type: "score", instructions: "Judge", criteria: ["1", "2", "3", "4", "5"] } }
    })
  )
  expect(response.answers.honesty).toEqual({ type: "score", score: 4 })
  expect(seen).toHaveLength(1)
  expect(seen[0]?.modelId).toBe("pinned")
  expect(seen[0]?.params.temperature).toBe(0)
})
