import { queryDb } from "@livestore/livestore"
import { tables } from "./schema"

export const conversation$ = queryDb(tables.messages.orderBy("position", "asc"))

export const composer$ = queryDb(tables.composer.get())

// Answers a tab asked for that are still streaming.
export const awaiting$ = (sessionId: string) =>
  queryDb(tables.messages.where({ role: "assistant", status: "streaming", askedBy: sessionId }), {
    deps: [sessionId],
  })
