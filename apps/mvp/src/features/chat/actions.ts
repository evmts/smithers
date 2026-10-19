import { CHAT_FAILED, streamAnswer } from "./api"
import { composer, messages, type Composer, type Message } from "./collections"

// Every write to chat state goes through these actions.

const updateComposer = (change: (draft: Composer) => void) => composer.update("composer", change)

export const openComposer = () => updateComposer((draft) => void (draft.open = true))
export const closeComposer = () => updateComposer((draft) => void (draft.open = false))
export const toggleComposer = () => updateComposer((draft) => void (draft.open = !draft.open))
export const setDraft = (text: string) => updateComposer((draft) => void (draft.draft = text))

const addMessage = (role: Message["role"], text: string, status: Message["status"]) => {
  const id = crypto.randomUUID()
  messages.insert({ id, role, text, status, createdAt: Date.now() })
  return id
}

const history = () =>
  [...messages.values()]
    .filter((message) => message.status === "done")
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ role, text }) => ({ role, content: text }))

// Sends the user's text with the conversation so far and streams Smithers' answer into a new message.
export async function sendMessage(text: string) {
  setDraft("")
  addMessage("user", text, "done")
  const turns = history()
  const answer = addMessage("assistant", "", "streaming")
  try {
    for await (const delta of streamAnswer(turns)) messages.update(answer, (draft) => void (draft.text += delta))
    messages.update(answer, (draft) => void (draft.status = "done"))
  } catch {
    messages.update(answer, (draft) => {
      draft.text = CHAT_FAILED
      draft.status = "failed"
    })
  }
}
