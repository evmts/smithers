export type ChatTurn = { role: "user" | "assistant"; content: string }

export const CHAT_FAILED = "Smithers couldn't answer. Try again."

// Streams Smithers' answer to the conversation as text chunks, from the Worker's POST /api/chat.
export async function* streamAnswer(history: ReadonlyArray<ChatTurn>): AsyncGenerator<string> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: history }),
  })
  if (!response.ok || !response.body) throw new Error(CHAT_FAILED)
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) yield chunk.value
}
