import { createCollection, localOnlyCollectionOptions } from "@tanstack/react-db"

export type Message = {
  id: string
  role: "user" | "assistant"
  text: string
  status: "done" | "streaming" | "failed"
  createdAt: number
}

export type Composer = { id: "composer"; open: boolean; draft: string }

// The conversation, in memory until messages have a server home.
export const messages = createCollection(
  localOnlyCollectionOptions<Message>({ id: "messages", getKey: (message) => message.id }),
)

// The composer: one row, so every view reads the same answer.
export const composer = createCollection(
  localOnlyCollectionOptions<Composer>({
    id: "composer",
    getKey: (row) => row.id,
    initialData: [{ id: "composer", open: false, draft: "" }],
  }),
)
