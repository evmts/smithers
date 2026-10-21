import { Model, type ModelEvent } from "@smthrs/model"
import { Stream } from "effect"

// Model is the only scripted seam: the same sealed ModelStep, engine and persistent projection still run.
export const scriptedSummary = Model.make({
  stream: request => {
    const text = request.messages.flatMap(message => message.content.flatMap(part => part.type === "text" ? [part.text] : [])).join("")
    const entry = JSON.parse(text) as { role: string }
    return Stream.fromIterable<ModelEvent.ModelEvent>([
      { type: "text-delta", id: "summary", text: entry.role === "user" ? "Find the release regression" : "Release regression check completed" },
      { type: "usage", inputTokens: 12, outputTokens: 5 },
      { type: "settle", stopReason: "stop" },
    ])
  },
})
