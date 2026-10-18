/** Offline provider transport for the coding guide's real CLI host. */
import { MockAgent } from "@effect/platform-node/Undici"
import { Effect } from "effect"
import "./scripted-native-host.ts"
import { layerRebuildableRequestExecutor, platform } from "../../src/internal/NodeControlHost.ts"

Object.assign(platform, {
  requestExecutor: layerRebuildableRequestExecutor(Effect.acquireRelease(
    Effect.sync(() => {
      const agent = new MockAgent()
      agent.disableNetConnect()
      const answer =
        "```cell\nawait ctx.call(\"write\", {\"path\": \"index.js\", \"content\": \"export function slugify(text) { return text.toLowerCase().replace(/[^a-z0-9\\\\s-]/g, \\\"\\\").replace(/\\\\s+/g, \\\"-\\\").replace(/^-+|-+$/g, \\\"\\\") }\\n\"})\nawait ctx.call(\"write\", {\"path\": \"index.test.js\", \"content\": \"import { test } from 'node:test'; import assert from 'node:assert/strict'; import { slugify } from './index.js'; test('slugify', () => { assert.equal(slugify(' Hello, World! '), 'hello-world'); assert.equal(slugify(''), ''); });\\n\"})\nctx.done(JSON.stringify({ summary: \"Added slugify and tests.\" }))\n```"
      const stream = [
        { type: "response.output_text.delta", item_id: "msg_1", delta: answer },
        { type: "response.output_text.done", item_id: "msg_1" },
        {
          type: "response.completed",
          response: { id: "init_fixture", usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 } }
        }
      ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
      agent.get("https://api.openai.com").intercept({ method: "POST", path: "/v1/responses" })
        .reply(200, stream, { headers: { "content-type": "text/event-stream" } }).persist()
      return agent
    }),
    (agent) => Effect.promise(() => agent.close())
  ))
})
