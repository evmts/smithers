import { FlowDraftView } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { formReady } from "../actions"
import { MINE } from "../contract"
import { useFlowsUi } from "./FlowsUiContext"

// The new-flow form (decision 0014 §5, the draft card before its first round): the flow's name and what it should do,
// then Draft. A name you already have drafts its next revision.
export function NewFlowCard() {
  const { queries, actions } = useFlowsUi()
  const { data: form } = useLiveQuery(queries.form)
  if (form === undefined) return null
  return (
    <FlowDraftView
      where={MINE}
      name={form.name}
      request={form.request}
      status={null}
      round={0}
      questions={[]}
      answers={{}}
      files={[]}
      checks={[]}
      onNameChange={actions.setName}
      onRequestChange={actions.setRequest}
      {...(formReady(form) ? { onStart: actions.startDraft } : {})}
    />
  )
}
