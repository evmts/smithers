import { ConfirmView } from "./views/ConfirmView"
import type { ComponentType } from "react"
import { ConfirmCardSchema, type ConfirmViewProps } from "@smthrs/rpc/ConfirmCard"
import { cardActions, type CardActionDefinition, type CardCommandDispatch } from "../flows/cardActions"

export interface ConfirmContainerProps {
  /** T-APP-04: private entry from confirmations:<member>, never a shared conversation. */
  readonly card: { readonly id: string; readonly audience_member_id: string; readonly payload: { readonly model?: unknown } }
  readonly memberId: string
  readonly session: boolean
  /** Current catalog authorization for the bound command, supplied by the host. */
  readonly mayApprove: boolean
  readonly dispatch: CardCommandDispatch
  readonly View?: ComponentType<ConfirmViewProps>
  readonly view: ConfirmViewProps["view"]
  readonly onView: ConfirmViewProps["onView"]
}
export const ConfirmContainer = ({ card, memberId, session, mayApprove, dispatch, View = ConfirmView, view, onView }: ConfirmContainerProps) => {
  if (!session || card.audience_member_id !== memberId || !card.payload.model) return null
  const model = ConfirmCardSchema.parse(card.payload.model)
  const definitions: CardActionDefinition[] = []
  const revision = model.subject.revision
  if (!model.receipt && revision !== undefined) {
    const args = { confirmation: card.id, revision, subject_kind: model.subject.kind, subject_ref: model.subject.ref }
    const review = model.review
    if (mayApprove) definitions.push({ tag: "confirm.approve", label: model.kind === "review_merge" ? "Merge" : model.action.verb,
      primary: true, args, command_input: { confirmation: card.id, revision, subject: { kind: model.subject.kind, ref: model.subject.ref } },
      disabled: model.kind === "review_merge" && (!review || review.merge.state !== "ready" || review.evidence.revision !== revision ||
        review.approved_revision !== undefined && review.approved_revision !== revision)
        ? { reason: review?.merge.detail ?? "Review the current revision" } : undefined })
    definitions.push({ tag: "confirm.cancel", label: "Cancel", args, command_input: { confirmation: card.id, revision } })
  }
  const bindings = cardActions(dispatch, definitions)
  return <View model={model} actions={bindings.actions} gestures={bindings.gestures} onAction={bindings.onAction} view={view} onView={onView} />
}
