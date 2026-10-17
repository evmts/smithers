import { createInterface } from "node:readline"

const tools = [
  {
    name: "word_count",
    description: "Counts the words in a piece of text",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"]
    },
    outputSchema: {
      type: "object",
      properties: { words: { type: "integer" } },
      required: ["words"]
    }
  },
  {
    name: "explode",
    description: "Always reports a tool-level failure",
    inputSchema: { type: "object", properties: {} }
  }
]

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line)
  if (request.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "quickstart", version: "1.0.0" }
      }
    })
    return
  }
  if (request.method === "tools/list") {
    send({ jsonrpc: "2.0", id: request.id, result: { tools } })
    return
  }
  if (request.method === "tools/call") {
    if (request.params.name === "explode") {
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: { content: [{ type: "text", text: "the tool refused" }], isError: true }
      })
      return
    }
    const text = String(request.params.arguments.text ?? "")
    const words = text.split(/\s+/u).filter((word) => word.length > 0).length
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [{ type: "text", text: String(words) }],
        structuredContent: { words },
        isError: false
      }
    })
  }
})
