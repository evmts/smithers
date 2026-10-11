/** A real subscription session on the direct route, signed with this machine's own Codex login. */
import * as ModelEvent from "@smthrs/model/ModelEvent"
import * as ModelRequest from "@smthrs/model/ModelRequest"
import * as RequestExecutor from "@smthrs/model/RequestExecutor"
import { Effect, Layer, Stream } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import { expect, it } from "vitest"
import * as CodexLogin from "../src/internal/CodexLogin.ts"
import { readText } from "../src/internal/HostFiles.ts"
import * as NodeControl from "../src/NodeControl.ts"

const transport = RequestExecutor.layer.pipe(Layer.provide(FetchHttpClient.layer))

it("resolves a logged-in ChatGPT seat and completes a real two-call session directly", async (ctx) => {
  if (process.env["SMITHERS_LIVE_MODEL_TESTS"] !== "1") {
    if (process.env["SMITHERS_REQUIRE_LIVE_CREDENTIALS"] === "1") {
      throw new Error("Required live evidence needs SMITHERS_LIVE_MODEL_TESTS=1")
    }
    ctx.skip("live provider tests require SMITHERS_LIVE_MODEL_TESTS=1")
  }
  const environment = { ...process.env, SMITHERS_OPENAI_AUTH: "chatgpt" }
  const file = CodexLogin.locate(environment)
  if (CodexLogin.unusable(file, readText(file)) !== undefined) {
    if (process.env["SMITHERS_REQUIRE_LIVE_CREDENTIALS"] === "1") {
      throw new Error("Live Codex evidence requires a ChatGPT login from `codex login`")
    }
    ctx.skip("Codex must be logged in using ChatGPT")
  }
  const turn = (declared: string, messages: ReadonlyArray<ModelRequest.Message>, cacheKey: string) =>
    Effect.gen(function*() {
      const executor = yield* RequestExecutor.RequestExecutor
      const seat = yield* NodeControl.seatResolver(environment, executor).resolve(declared)
      expect(seat.id).toBe(declared)
      expect(seat.modelId).toBe("gpt-6.1-sol")
      const request = ModelRequest.ModelRequest.make({
        modelId: seat.modelId,
        system: [ModelRequest.SystemPart.make({ text: "Answer with the exact text the user asks for." })],
        messages,
        tools: [],
        params: ModelRequest.GenerationParams.make({ reasoningEffort: "low" }),
        cacheKey
      })
      const prepared = yield* seat.route.prepare(request)
      expect(prepared.routeId).toBe("openai-chatgpt")
      expect(prepared.protocolId).toBe("openai-responses-chatgpt")
      expect(prepared.publicHeaders["session-id"]).toBe(cacheKey)
      return ModelEvent.ModelEvent.settledMessage(Array.from(yield* Stream.runCollect(seat.model.stream(request))))
    }).pipe(Effect.scoped, Effect.provide(transport), Effect.runPromise)
  const text = (settled: Awaited<ReturnType<typeof turn>>) =>
    settled.message.content.filter((part) => part.type === "text").map((part) => part.text).join("")

  for (const declared of ["codex:sol", "openai:gpt-6.1-sol", "sol"]) {
    const key = `smithers-live-${declared}-${Date.now()}`
    const first = await turn(declared, [ModelRequest.Message.user("Reply exactly LIVE_OK")], key)
    expect(first.message.stopReason).toBe("stop")
    expect(text(first)).toContain("LIVE_OK")
    expect(first.usage.outputTokens).toBeGreaterThan(0)
    // The next call of the session replays the first answer, reasoning included, and the backend accepts it.
    const second = await turn(declared, [
      ModelRequest.Message.user("Reply exactly LIVE_OK"),
      first.message,
      ModelRequest.Message.user("Reply exactly LIVE_AGAIN")
    ], key)
    expect(text(second)).toContain("LIVE_AGAIN")
  }
}, 180_000)
