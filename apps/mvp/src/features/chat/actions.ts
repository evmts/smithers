import type { Store } from "@livestore/livestore"
import { events, QUESTION_MAX_LENGTH, type schema } from "./schema"

export type ChatStore = Store<typeof schema>

// What a person does to chat state: one synchronous commit each, called from React event handlers and
// key bindings with the tab's store. Answers are written by the answerer (answerer.ts), never by a component.

export const openComposer = (store: ChatStore) => store.commit(events.composerSet({ open: true }))
export const closeComposer = (store: ChatStore) => store.commit(events.composerSet({ open: false }))
export const toggleComposer = (store: ChatStore, open: boolean) => store.commit(events.composerSet({ open: !open }))
export const setDraft = (store: ChatStore, draft: string) => store.commit(events.composerSet({ draft }))

// Clears the draft and asks the question; this tab's answerer picks up the empty answer. A blank or too long
// question commits nothing and keeps the draft. Returns whether the question was asked.
export const ask = (store: ChatStore, text: string) => {
  const question = text.trim()
  if (question === "" || question.length > QUESTION_MAX_LENGTH) return false
  store.commit(
    events.composerSet({ draft: "" }),
    events.questionAsked({
      id: crypto.randomUUID(),
      text: question,
      answerId: crypto.randomUUID(),
      askedBy: store.sessionId,
      createdAt: Date.now(),
    }),
  )
  return true
}
