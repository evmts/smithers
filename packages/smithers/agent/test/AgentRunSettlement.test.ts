/**
 * The success `agent/run` settles with, through the engine's own codec.
 *
 * `agent/run` declares `success: Schema.Unknown`, which `Schema.toCodecJson`
 * reads as "any JSON value". A flow whose success is `Schema.Void` completes
 * with `undefined`, which is not JSON, so `engine-store` degraded the
 * settlement into `UnencodableResult` and the run read `failed` although its
 * flow completed (`smthrs flow start docs-sync --wait`, 2026-10-16).
 */
import { Flow } from "@smthrs/flow"
import { Effect, Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"
import * as AgentSession from "../src/AgentSession.ts"

const encode = (value: unknown) =>
  Effect.runPromiseExit(
    Schema.encodeEffect(
      Schema.toCodecJson(Flow.Result({
        success: AgentSession.agentFlow.successSchema,
        error: AgentSession.agentFlow.errorSchema
      }))
    )(new Flow.Complete({ exit: Exit.succeed(value) }))
  )

describe("agent/run settlement success", () => {
  it("a void flow's undefined is not JSON, so the raw value is what the codec rejected", async () => {
    expect(Exit.isFailure(await encode(undefined))).toBe(true)
  })

  it("settles a void flow's completion as null, which the codec accepts", async () => {
    expect(AgentSession.settlementSuccess(undefined)).toBeNull()
    expect(Exit.isSuccess(await encode(AgentSession.settlementSuccess(undefined)))).toBe(true)
  })

  it.each([{ value: null }, { value: 0 }, { value: false }, { value: "" }, { value: "done" }, { value: { messages: ["a"] } }, {
    value: [1, 2]
  }])("keeps the JSON value $value unchanged", async ({ value }) => {
    expect(AgentSession.settlementSuccess(value)).toEqual(value)
    expect(Exit.isSuccess(await encode(AgentSession.settlementSuccess(value)))).toBe(true)
  })
})
