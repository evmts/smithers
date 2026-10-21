import { useLiveQuery } from "@tanstack/react-db"
import { draftsOfAnswer } from "../view"
import { DraftCard } from "./DraftCard"
import { useTodos } from "./TodosContext"

// The drafts the agent made in an answer, under that answer (decision 0016 §3): only on the device of the person who
// asked, since a draft is theirs alone until they commit it.
export function AnswerDrafts({ id }: { readonly id: string }) {
  const { queries } = useTodos()
  const { data: drafts } = useLiveQuery(queries.drafts)
  return draftsOfAnswer(id, drafts).map((draft) => <DraftCard key={draft.id} draft={draft} />)
}
