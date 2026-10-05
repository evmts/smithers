// A scripted model for one TODO's coding run (J1 rehearsal, C-J1-04).
//
// It answers the OpenAI-compatible chat completions and the gateway
// evaluator the packaged coding host calls through the metered model proxy,
// so a whole coding/request and coding/vibe run needs no live model or key.
// GET /turns answers how many turns it served, by role.
import { appendFileSync } from "node:fs"
import { createServer } from "node:http"

const trace = process.env.TRACE_FILE
const turns = { total: 0, chat: 0, evaluator: 0, roles: {} }
const record = (kind, role, detail) => {
  turns.total++
  turns[kind]++
  turns.roles[role] = (turns.roles[role] ?? 0) + 1
  console.log(`provider ${kind} ${role}`)
  if (trace) appendFileSync(trace, JSON.stringify({ n: turns.total, kind, role, ...detail }) + "\n")
}

const text = (content) => typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => part?.text ?? "").join("") : ""

const chat = (input) => {
  const messages = input.messages ?? []
  const system = text(messages.find((message) => message.role === "system")?.content)
  const last = text(messages.at(-1)?.content)
  return { system, last, messages: messages.length, tools: (input.tools ?? []).map((tool) => tool.function?.name ?? tool.name) }
}

const stream = (response, content) => {
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
  response.write(`data: ${JSON.stringify({ id: "chatcmpl-todo", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] })}\n\n`)
  response.write(`data: ${JSON.stringify({ id: "chatcmpl-todo", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`)
  // The metered model proxy settles the call from this usage report.
  response.write(`data: ${JSON.stringify({ id: "chatcmpl-todo", choices: [], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } })}\n\n`)
  response.end("data: [DONE]\n\n")
}

const answerQuestion = (name, question) => {
  switch (question.type) {
    case "boolean":
      return { type: "boolean", probability: 0.99 }
    case "score":
      return { type: "score", score: (question.criteria?.length ?? 1) - 1 }
    case "choice": {
      const keys = Object.keys(question.criteria ?? {})
      const choice = ["implement", "none"].find((key) => keys.includes(key)) ?? keys[0]
      return { type: "choice", choice }
    }
    default:
      throw new Error(`unexpected evaluation type: ${question.type}`)
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200).end("ok")
    return
  }
  if (request.method === "GET" && request.url === "/turns") {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(turns))
    return
  }
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  let input
  try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { input = {} }
  if (request.method === "POST" && request.url === "/v1/chat/completions") {
    const shape = chat(input)
    record("chat", "unknown", { model: input.model, system: shape.system.slice(0, 4000), last: shape.last.slice(0, 4000), messages: shape.messages, tools: shape.tools })
    stream(response, "```cell\nctx.done({ messages: [\"scripted\"] });\n```")
    return
  }
  if (request.method === "POST" && request.url === "/v4/ai/evaluation-model") {
    let answers
    try {
      answers = Object.fromEntries(Object.entries(input.questions ?? {}).map(([name, question]) => [name, answerQuestion(name, question)]))
    } catch (error) {
      record("evaluator", "refused", { error: error.message, input: JSON.stringify(input).slice(0, 4000) })
      response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: error.message }))
      return
    }
    record("evaluator", Object.keys(answers).join(","), { input: JSON.stringify(input).slice(0, 4000), answers })
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ answers }))
    return
  }
  record("chat", "unrouted", { method: request.method, url: request.url })
  response.writeHead(404).end("unknown provider route")
})
server.listen(Number(process.env.PORT ?? 8080), process.env.HOST ?? "127.0.0.1")
