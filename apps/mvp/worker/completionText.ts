// Turns an OpenAI-style chat completion SSE stream into the plain text of the answer.
export const completionText = () => {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffered = ""
  const emit = (line: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    if (!line.startsWith("data:")) return
    const data = line.slice(5).trim()
    if (data === "" || data === "[DONE]") return
    const text = JSON.parse(data).choices?.[0]?.delta?.content
    if (typeof text === "string" && text !== "") controller.enqueue(encoder.encode(text))
  }
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffered += decoder.decode(chunk, { stream: true })
      const lines = buffered.split("\n")
      buffered = lines.pop() ?? ""
      for (const line of lines) emit(line, controller)
    },
    flush(controller) {
      emit(buffered, controller)
    },
  })
}
