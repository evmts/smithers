import { DiffView } from "./views/DiffView"
import type { ComponentType } from "react"
import { DiffCardSchema, type DiffViewProps } from "@smthrs/rpc/DiffCard"
import { cardActions, type CardCommandDispatch } from "../flows/cardActions"

/** T-APP-15 S1 read-only diff. Burst restore belongs to T-APP-11 at S2. */
export interface DiffContainerProps {
  readonly card: { readonly payload: { readonly model?: unknown } }
  readonly dispatch: CardCommandDispatch
  readonly View?: ComponentType<DiffViewProps>
  readonly view: DiffViewProps["view"]
  readonly onView: DiffViewProps["onView"]
}
export const DiffContainer = ({ card, dispatch, View = DiffView, view, onView }: DiffContainerProps) => {
  if (!card.payload.model) return null
  const model = DiffCardSchema.parse(card.payload.model)
  const bindings = cardActions(dispatch, [])
  return <View model={model} actions={bindings.actions} gestures={bindings.gestures} onAction={bindings.onAction} view={view} onView={onView} />
}
