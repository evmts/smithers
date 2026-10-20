import { AgentStatusPill, NeedsYouCard } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useStatus } from "./StatusContext"

// An answer's agent status in the conversation (decision 0015): its question card while it needs the person, the
// answer once given, and a Waiting pill while its turn waits. Working, done and failed show as the answer itself.
export function AnswerStatus({ id }: { readonly id: string }) {
  const { queries, actions } = useStatus()
  const { data: statuses } = useLiveQuery(queries.statuses)
  const status = statuses.find((row) => row.id === id)
  if (status === undefined) return null
  if (status.state === "waiting") return <AgentStatusPill state="waiting" />
  const wait = status.wait
  if (wait === undefined || wait === null) return null
  const answered = status.answer?.value
  if (status.state !== "needs_you" && answered === undefined) return null
  return (
    <NeedsYouCard
      data-run={id}
      kind={wait.kind}
      prompt={wait.prompt}
      options={wait.options}
      value={status.draft ?? ""}
      sending={status.sending === true}
      answered={answered}
      focusRequest={status.focus === 0 ? undefined : status.focus ?? undefined}
      onValueChange={(text) => actions.setDraft(id, text)}
      onAnswer={(value) => actions.answer(id, value)}
    />
  )
}

