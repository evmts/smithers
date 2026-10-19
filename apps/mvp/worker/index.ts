import { completionText } from "./completionText"

interface Env {
  ASSETS: Fetcher
  CEREBRAS_API_KEY: string
}

type ChatMessage = { role: "user" | "assistant"; content: string }

// Qwen at low reasoning: about as fast as gpt-oss-120b on Cerebras and far stronger (docs/features/chat.md).
const MODEL = "qwen-3.8-27b"
const REASONING_EFFORT = "low"
const INSTRUCTIONS = "You are Smithers, a codebase maintainer agent. Answer briefly and plainly."
const MAX_MESSAGES = 40
const MAX_CHARS = 8_000

const isChatMessage = (value: unknown): value is ChatMessage => {
  const message = value as ChatMessage
  return (
    (message?.role === "user" || message?.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.length <= MAX_CHARS
  )
}

const refuse = (status: number, message: string) => Response.json({ message }, { status })

async function chat(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ messages?: unknown }>().catch(() => ({ messages: undefined }))
  const messages = body.messages
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES || !messages.every(isChatMessage)) {
    return refuse(400, "Send between 1 and 40 messages of at most 8,000 characters.")
  }
  const upstream = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.CEREBRAS_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, reasoning_effort: REASONING_EFFORT, stream: true, messages: [{ role: "system", content: INSTRUCTIONS }, ...messages] }),
  })
  if (!upstream.ok || !upstream.body) return refuse(502, "Smithers couldn't answer. Try again.")
  return new Response(upstream.body.pipeThrough(completionText()), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  })
}

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === "/api/chat" && request.method === "POST") return chat(request, env)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
