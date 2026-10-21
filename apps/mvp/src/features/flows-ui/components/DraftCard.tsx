import { FlowDraftView } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { draftFailureWords, MINE, SAVE_REFUSALS } from "../contract"
import { useFlowsUi } from "./FlowsUiContext"

// One draft at full size (decision 0014 §5): its round's status, questions with the defaults it assumed, its flow.ts
// and checks, Answer while the person changed an answer, and Save once it is ready and every check passed.
export function DraftCard() {
  const { queries, actions } = useFlowsUi()
  const { data } = useLiveQuery(queries.draft)
  const { data: unsent } = useLiveQuery(queries.answers)
  if (data === undefined) return null
  const { draft, shown } = data
  const answers = Object.fromEntries(
    (unsent ?? []).filter((answer) => answer.draftId === draft.id).map((answer) => [answer.questionId, answer.value]),
  )
  const saveable = draft.status === "ready" && draft.checks.length > 0 && draft.checks.every((check) => check.ok)
  return (
    <>
      <FlowDraftView
        where={MINE}
        name={draft.name ?? ""}
        request={draft.request}
        status={draft.status}
        round={draft.round}
        questions={draft.questions}
        answers={answers}
        files={draft.files}
        checks={draft.checks}
        failure={draft.failure === null ? null : draftFailureWords(draft.failure)}
        onAnswerChange={(id, value) => actions.setAnswer(draft.id, id, value)}
        onAnswer={actions.answer}
        {...(draft.status === "saved" ? {} : { onSave: actions.save, saveDisabled: !saveable || shown.busy })}
      />
      {shown.refusal === null ? null : <p role="alert">{SAVE_REFUSALS[shown.refusal] ?? shown.refusal}</p>}
    </>
  )
}
