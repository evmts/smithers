import { useLiveQuery } from "@tanstack/react-db"
import { composer, messages } from "./collections"

// Every read of chat state goes through these live queries.

export const useConversation = () =>
  useLiveQuery((q) => q.from({ message: messages }).orderBy(({ message }) => message.createdAt)).data

export const useComposer = () => {
  const [row] = useLiveQuery((q) => q.from({ composer })).data
  return row ?? { id: "composer" as const, open: false, draft: "" }
}

export const useAnswering = () => useConversation().some((message) => message.status === "streaming")
