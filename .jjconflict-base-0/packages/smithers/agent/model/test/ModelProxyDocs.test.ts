import * as ModelPackage from "@smthrs/model"
import * as EffectPackage from "effect"
import { Effect, Logger, Stream } from "effect"
import * as EffectHttp from "effect/http"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { afterEach, describe, expect, it } from "vitest"

const guide = readFileSync(new URL("../docs/guides/proxy-a-model.md", import.meta.url), "utf8")
const modules: Record<string, unknown> = {
  "@smthrs/model": ModelPackage,
  effect: EffectPackage,
  "effect/http": EffectHttp
}

/** Runs the first TypeScript example under `heading` and returns the named bindings it declares. */
const example = <A>(heading: string, names: ReadonlyArray<string>, scope: Record<string, unknown> = {}): A => {
  const section = guide.split(`## ${heading}\n`)[1]
  const fence = section?.match(/```ts\n([\s\S]*?)```/)?.[1]
  expect(fence, `TypeScript example under ${heading}`).toBeDefined()
  const code = ts.transpileModule(fence!, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  return new Function("exports", "require", ...Object.keys(scope), `${code}\nreturn { ${names.join(", ")} }`)(
    {},
    (id: string) => modules[id],
    ...Object.values(scope)
  ) as A
}

const request = ModelPackage.ModelRequest.ModelRequest.make({
  modelId: "browser-choice",
  system: [],
  messages: [ModelPackage.ModelRequest.Message.user("What is NDJSON?")],
  tools: [],
  params: ModelPackage.ModelRequest.GenerationParams.make()
})

/** A model that repeats the last user message back, as one text part, and reports usage. */
const echo = ModelPackage.Model.make({
  stream: (received) => {
    const last = received.messages.at(-1)
    const text = last?.role === "user" ? last.content.map((part) => part.text).join("") : ""
    return Stream.make(
      { type: "text-start", id: "t" } as const,
      { type: "text-delta", id: "t", text: `${received.modelId}: ${text}` } as const,
      { type: "text-end", id: "t" } as const,
      { type: "usage", outputTokens: 6 } as const,
      { type: "settle", stopReason: "stop" } as const
    )
  }
})

const post = (body: ModelPackage.ModelRequest.ModelRequest) =>
  new Request("http://site.test/api/chat", {
    method: "POST",
    body: JSON.stringify(EffectPackage.Schema.encodeSync(ModelPackage.ModelRequest.ModelRequest)(body))
  })

describe("Proxy a model guide", () => {
  const location = Object.getOwnPropertyDescriptor(globalThis, "location")
  afterEach(() => {
    if (location === undefined) Reflect.deleteProperty(globalThis, "location")
    else Object.defineProperty(globalThis, "location", location)
  })

  it("refuses a signed-out caller and hands a signed-in caller's request to the host's model", async () => {
    const { prepare } = example<{
      prepare: (signedIn: boolean, model: ModelPackage.Model.Model) => ModelPackage.ModelProxy.ServeOptions<
        never
      >["prepare"]
    }>("Decide what the caller may choose", ["prepare"])

    const admission = { requestId: "r", invocationId: "i", requestBytes: 64 }
    const refusal = await Effect.runPromise(Effect.flip(prepare(false, echo)(request, admission)))
    const prepared = await Effect.runPromise(prepare(true, echo)(request, admission))

    expect(refusal).toMatchObject({ _tag: "flows/model/ModelProxyRefusal", status: 401, message: "Sign in to chat." })
    expect(prepared.model).toBe(echo)
    expect(prepared.request.modelId).toBe("qwen-3.8-27b")
    expect(prepared.request.messages).toEqual(request.messages)
  })

  it("labels a request, reserves its worst case in prepare and settles it in onEnd", async () => {
    const { served } = example<{ served: ReturnType<typeof ModelPackage.ModelProxy.serve<never>> }>(
      "Meter what each request spends",
      ["served"],
      { model: echo }
    )
    const lines: Array<{ readonly message: unknown; readonly annotations: Record<string, unknown> }> = []
    const logger = Logger.make((options) => {
      const line = Logger.formatStructured.log(options)
      lines.push({ message: line.message, annotations: line.annotations })
    })
    const handler = EffectHttp.HttpEffect.toWebHandler(
      served.pipe(Effect.provideService(Logger.CurrentLoggers, new Set([logger])))
    )

    await (await handler(post(request))).text()

    const usage = lines.find((line) => line.message === "usage")
    const serve = lines.find((line) => line.message === "model.proxy.serve")
    expect(usage?.annotations).toMatchObject({
      outcome: "success",
      tokens: 6,
      requestId: serve?.annotations.requestId,
      invocationId: serve?.annotations.invocationId,
      // The body's bytes, plus the output cap the request left unset.
      reserved: Number(serve?.annotations.requestBytes) + 1_000
    })
    expect(serve?.annotations.invocationId).toMatch(/^[0-9a-f]{32}$/)
    expect(serve?.annotations).toMatchObject({ role: "agent" })
  })

  it("serves the Node handler that the browser example then reads as a Model", async () => {
    const { handler } = example<{ handler: (request: Request) => Promise<Response> }>(
      "Run it on Node or Bun",
      ["handler"],
      { model: echo }
    )
    const { answer } = example<{ answer: (question: string) => Stream.Stream<string, unknown> }>(
      "Call it from a browser",
      ["answer"]
    )
    // A page at http://site.test/chat, so the example's relative URL resolves as it would in a browser.
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { origin: "http://site.test", pathname: "/chat" }
    })
    const posted: Array<string> = []
    const fetch: typeof globalThis.fetch = (input, init) => {
      posted.push(String(input))
      return handler(new Request(input, init))
    }

    const text = await Effect.runPromise(
      Stream.runCollect(answer("What is NDJSON?")).pipe(Effect.provideService(EffectHttp.FetchHttpClient.Fetch, fetch))
    )

    expect(posted).toEqual(["http://site.test/api/chat"])
    expect(text).toEqual(["qwen-3.8-27b: What is NDJSON?"])
  })
})
