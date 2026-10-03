import { CodeEditorView } from "./views/CodeEditorView"
import type { ComponentType } from "react"
import { FileCardSchema, type CodeEditorViewProps } from "@smthrs/rpc/FileCard"
import { cardActions, type CardActionDefinition, type CardCommandDispatch } from "../flows/cardActions"

/** T-APP-15: injectable projection from branch:<id>:files and the content route, like TodoContainer. */
export interface FileContainerProps {
  readonly card: { readonly payload: { readonly model?: unknown } }
  readonly dispatch: CardCommandDispatch
  readonly View?: ComponentType<CodeEditorViewProps>
  readonly view: CodeEditorViewProps["view"]
  readonly onView: CodeEditorViewProps["onView"]
}
export const FileContainer = ({ card, dispatch, View = CodeEditorView, view, onView }: FileContainerProps) => {
  if (!card.payload.model) return null
  const source = FileCardSchema.parse(card.payload.model)
  // S1 has no collaborative document binding or presence projection.
  const model = FileCardSchema.parse({ ...source, mode: "read_only", authors: [], editors: [],
    gone: undefined, outside: undefined, saved: undefined, unsaved: undefined })
  const definitions: CardActionDefinition<"code.hover" | "code.definition", "hover" | "definition">[] = model.content.kind === "text" ? [
    { tag: "code.hover", gesture: "hover", label: "Hover", args: { path: model.path },
      command_input: { path: model.path, line: 1, col: 0 },
      resolve_input: input => ({ path: model.path, line: Number(input.line), col: Number(input.col) }) },
    { tag: "code.definition", gesture: "definition", label: "Go to definition", args: { path: model.path },
      command_input: { path: model.path, line: 1, col: 0 },
      resolve_input: input => ({ path: model.path, line: Number(input.line), col: Number(input.col) }) }
  ] : []
  const bindings = cardActions<"hover" | "definition">((tag, input) => {
    if ((tag === "code.hover" || tag === "code.definition") && input && "line" in input && "col" in input
      && (!Number.isInteger(input.line) || input.line < 1 || !Number.isInteger(input.col) || input.col < 0)) return
    return dispatch(tag, input)
  }, definitions)
  return <View model={model} actions={bindings.actions} gestures={bindings.gestures} onAction={bindings.onAction} view={view} onView={onView} />
}
