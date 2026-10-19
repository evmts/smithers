import { ModelRequest } from "@smthrs/model"
import { Cause, ConfigProvider, Effect, Exit, Layer, Stream } from "effect"
import { createServer, type IncomingHttpHeaders, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, test } from "vitest"
import { HostModel } from "../src/HostModel.ts"

const custom = (record: object) => JSON.stringify({ protocol: "openai-chat", modelId: "fixture-1", credential: "FIXTURE", ...record })

const load = (env: Record<string, string>, fallback?: Parameters<typeof HostModel.layerConfig>[1]) =>
  Effect.runPromiseExit(
    Effect.gen(function*() {
      return yield* HostModel
    }).pipe(
      Effect.provide(
        HostModel.layerConfig("CHAT_MODEL", fallback).pipe(
          Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env })))
        )
      )
    )
  )

describe("HostModel.layerConfig", () => {
  test("serves the model a record names, with its key pinned to the record's origin", async () => {
    const exit = await load({
      CHAT_MODEL: custom({ baseUrl: "https://models.example" }),
      SMITHERS_MODEL_KEY_FIXTURE: "fixture-key",
      SMITHERS_MODEL_KEY_FIXTURE_ORIGIN: "https://models.example"
    })
    expect(Exit.isSuccess(exit) && exit.value.modelId).toBe("fixture-1")
  })

  test("uses the fallback record when the name is unset", async () => {
    const exit = await load(
      { SMITHERS_MODEL_KEY_FIXTURE: "fixture-key", SMITHERS_MODEL_KEY_FIXTURE_ORIGIN: "https://models.example" },
      { protocol: "openai-chat", baseUrl: "https://models.example", modelId: "fallback-1", credential: "FIXTURE" }
    )
    expect(Exit.isSuccess(exit) && exit.value.modelId).toBe("fallback-1")
  })

  test("fails with a config error when the record's key is missing", async () => {
    const exit = await load({ CHAT_MODEL: custom({ baseUrl: "https://models.example" }) })
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("SMITHERS_MODEL_KEY_FIXTURE")
  })

  test("refuses to send a key to an origin it is not pinned to", async () => {
    const exit = await load({
      CHAT_MODEL: custom({ baseUrl: "https://elsewhere.example" }),
      SMITHERS_MODEL_KEY_FIXTURE: "fixture-key",
      SMITHERS_MODEL_KEY_FIXTURE_ORIGIN: "https://models.example"
    })
    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain("CHAT_MODEL is not usable")
  })

  test("fails with a config error when the record is not JSON", async () => {
    const exit = await load({ CHAT_MODEL: "not json" })
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("ConfigError")
  })
})

// Real HTTP on loopback: a provider that answers, and one that redirects to an origin the key isn't pinned to.
const servers: Array<Server> = []
afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done)))))

const listen = async (handler: Parameters<typeof createServer>[1]) => {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const ask = (env: Record<string, string>) =>
  Effect.runPromiseExit(
    Effect.gen(function*() {
      const { model, modelId } = yield* HostModel
      return yield* model.stream(
        ModelRequest.ModelRequest.make({
          modelId,
          system: [],
          messages: [ModelRequest.Message.user("hi")],
          tools: [],
          params: ModelRequest.GenerationParams.make({})
        })
      ).pipe(Stream.runCollect)
    }).pipe(
      Effect.provide(
        HostModel.layerConfig("CHAT_MODEL").pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))))
      )
    )
  )

describe("HostModel's provider transport", () => {
  test("sends the key to the planned origin", async () => {
    const seen: Array<IncomingHttpHeaders> = []
    const origin = await listen((request, response) => {
      seen.push(request.headers)
      response.writeHead(200, { "content-type": "text/event-stream" })
      response.end("data: [DONE]\n\n")
    })
    await ask({
      CHAT_MODEL: custom({ baseUrl: origin }),
      SMITHERS_MODEL_KEY_FIXTURE: "fixture-key",
      SMITHERS_MODEL_KEY_FIXTURE_ORIGIN: origin
    })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.authorization).toBe("Bearer fixture-key")
  })

  test("refuses a provider redirect, so the key never reaches another origin", async () => {
    const elsewhere: Array<IncomingHttpHeaders> = []
    const target = await listen((request, response) => {
      elsewhere.push(request.headers)
      response.end("{}")
    })
    const origin = await listen((_, response) => {
      response.writeHead(307, { location: `${target}/v1/chat/completions` })
      response.end()
    })
    const exit = await ask({
      CHAT_MODEL: custom({ baseUrl: origin }),
      SMITHERS_MODEL_KEY_FIXTURE: "fixture-key",
      SMITHERS_MODEL_KEY_FIXTURE_ORIGIN: origin
    })
    expect(Exit.isFailure(exit)).toBe(true)
    expect(elsewhere).toEqual([])
  })
})
