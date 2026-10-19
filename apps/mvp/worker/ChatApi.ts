import { ModelRequest } from "@smthrs/model"
import { HostModel } from "@smthrs/model-host"
import { AgentInstructions } from "@smthrs/rpc"
import * as Cloudflare from "alchemy/Cloudflare"
import { Config, Effect, Option, Schema, Stream } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"

// The model when CHAT_MODEL is unset: a Smithers configured-model record (@smthrs/rpc ConfiguredModel).
const DEFAULT_CHAT_MODEL = {
  protocol: "openai-chat",
  baseUrl: "https://api.cerebras.ai",
  modelId: "qwen-3.8-27b",
  credential: "CEREBRAS_API_KEY",
}

const INSTRUCTIONS = [AgentInstructions.AGENT_NAME_LINE, "Answer briefly and plainly."]

const MAX_BODY_BYTES = 512 * 1024

const ChatRequest = Schema.Struct({
  messages: Schema.Array(
    Schema.Struct({
      role: Schema.Literals(["user", "assistant"]),
      content: Schema.String.check(Schema.isMaxLength(32_000)),
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(40)),
})

const refuse = (status: number, message: string) => HttpServerResponse.jsonUnsafe({ message }, { status })

// The model, chosen by configuration: CHAT_MODEL and its credential. Alchemy binds each Config read to the Worker,
// and HostModel's transport refuses provider redirects, so the key stays on its planned origin.
const ChatModel = HostModel.layerConfig("CHAT_MODEL", DEFAULT_CHAT_MODEL)

// POST /api/chat: adds Smithers' instructions, streams the model's answer, and sends back plain text.
// Alchemy runs this Effect for each request; nothing here leaves Effect.
export default class ChatApi extends Cloudflare.Worker<ChatApi>()(
  "ChatApi",
  {
    main: "worker/ChatApi.ts",
    compatibility: { date: "2026-10-01", flags: ["enable_request_signal"] },
    // Browsers reach it only through the site, so locally it takes any free port and the site keeps 1337.
    dev: { port: 0 },
  },
  Effect.gen(function* () {
    const { model, modelId } = yield* HostModel
    const reasoningEffort = yield* Config.schema(ModelRequest.ReasoningEffort, "CHAT_REASONING_EFFORT").pipe(
      Config.withDefault("low" as const),
    )

    const answer = (messages: typeof ChatRequest.Type.messages) =>
      model
        .stream(
          ModelRequest.ModelRequest.make({
            modelId,
            system: INSTRUCTIONS.map((text) => ModelRequest.SystemPart.make({ text })),
            messages: messages.map(({ role, content }) =>
              role === "user" ? ModelRequest.Message.user(content) : ModelRequest.Message.assistant(content),
            ),
            tools: [],
            params: ModelRequest.GenerationParams.make({ reasoningEffort }),
          }),
        )
        .pipe(
          Stream.filter((event) => event.type === "text-delta"),
          Stream.map((event) => event.text),
          Stream.encodeText,
        )

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        if (request.method !== "POST" || request.url !== "/api/chat") return HttpServerResponse.empty({ status: 404 })
        if (Number(request.headers["content-length"] ?? MAX_BODY_BYTES + 1) > MAX_BODY_BYTES) {
          return refuse(413, "Send at most 512 KB.")
        }
        const body = yield* HttpServerRequest.schemaBodyJson(ChatRequest).pipe(Effect.option)
        if (Option.isNone(body)) return refuse(400, "Send between 1 and 40 messages of at most 32,000 characters.")
        return HttpServerResponse.stream(answer(body.value.messages), {
          contentType: "text/plain; charset=utf-8",
          headers: { "cache-control": "no-store" },
        })
      }),
    }
  }).pipe(Effect.provide(ChatModel)),
) {}
