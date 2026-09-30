import * as Model from "@smthrs/model/Model"
import type * as ModelEvent from "@smthrs/model/ModelEvent"
import { Deferred, Effect, Stream } from "effect"
import { stubReply } from "../support/ChatStub"
import { createModelTurnHandler, MODEL_HOST_PROTOCOL } from "@smthrs/model-host/HostServer"

const release = await Effect.runPromise(Deferred.make<void>())
let calls = 0
let grants = 0
const handler = createModelTurnHandler({
  authorization: process.env.SMITHERS_CHAT_HOST_TOKEN ?? "",
  callbackBaseUrl: process.env.SMITHERS_CHAT_CALLBACK_URL ?? "",
  resolve: grant => {
    grants++
    const text = grant.request.messages.flatMap(message => "role" in message && message.role === "user" ? [message.content] : []).at(-1)
    const mode = process.env.SMITHERS_CHAT_FIXTURE_MODE ?? "durable"
    const lastMessage = grant.request.messages.at(-1)
    const commandText = lastMessage && "role" in lastMessage && lastMessage.role === "user" ? lastMessage.content : ""
    const command = mode === "graph" ? /^\/(flow\.[a-z.-]+)(?:\s+([\s\S]*))?$/.exec(commandText.trim()) : null
    const events: ModelEvent.ModelEvent[] = text === "__many__" || text === "__partial__"
      ? Array.from({ length: text === "__partial__" ? 64 : 1005 }, (_, index) => ({ type: "text-delta", id: "text", text: `private-native-${index}` }))
      : [{ type: "text-delta", id: "text", text: "private-native-fixture-output" }]
    if (mode === "browser") events.splice(0, events.length,
      { type: "reasoning-delta", id: "reasoning", text: "stub: thinking" },
      { type: "text-delta", id: "text", text: stubReply(grant.request) })
    if (mode === "graph") {
      const last = grant.request.messages.at(-1)
      if (command && grant.request.tools?.some(tool => tool.name === "commands")) {
        const id = crypto.randomUUID()
        events.splice(0, events.length, { type: "tool-call-start", id, name: "commands" },
          { type: "tool-call-end", id, arguments: JSON.stringify({ action: "execute", name: command[1], ...(command[2] === undefined ? {} : { args: command[2] }) }) })
      } else events.splice(0, events.length, { type: "text-delta", id: "text", text: last && "type" in last && last.type === "function_call_output" ? last.output : "Local chat accepts /flow.* commands." })
    }
    if (text !== "__partial__") events.push({ type: "settle", stopReason: command ? "tool-calls" : "stop" })
    const stream = text === "__partial__" ? Stream.fromIterable(events).pipe(Stream.concat(Stream.never))
      : text === "__block__" ? Stream.never
      : text === "__held__" ? Stream.fromEffect(Deferred.await(release)).pipe(Stream.flatMap(() => Stream.fromIterable(events)))
        : Stream.fromIterable(events)
    const resolution = { model: Model.make({ stream: () => { calls++; return stream } }), options: { modelId: "native-durable-fixture", credential: "fixture-provider-secret" } }
    return text === "__before-inference__" ? Deferred.await(release).pipe(Effect.as(resolution)) : Effect.succeed(resolution)
  }
})
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => {
  const path = new URL(request.url).pathname
  if (path === "/fixture/stats") return Response.json({ calls, grants })
  if (path === "/fixture/release" && request.method === "POST")
    return Effect.runPromise(Deferred.succeed(release, undefined)).then(() => new Response(null, { status: 204 }))
  return handler(request)
} })
process.stdout.write(`${JSON.stringify({ origin: server.url.origin, protocol: MODEL_HOST_PROTOCOL })}\n`)
const close = () => { void server.stop(true) }
process.on("SIGTERM", close)
process.on("SIGINT", close)
