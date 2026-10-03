import { MembersView } from "./views/MembersView"
import type { ComponentType } from "react"
import { MembersCardSchema, type MembersViewProps } from "@smthrs/rpc/MembersCard"
import { cardActions, type CardActionDefinition, type CardCommandDispatch } from "../flows/cardActions"

export interface MembersContainerProps {
  /** T-APP-06: injected committed members topic projection; no optimistic roster edits. */
  readonly card: { readonly payload: { readonly model?: unknown } }
  readonly role: "owner" | "maintainer" | "member"
  readonly session: boolean
  readonly dispatch: CardCommandDispatch
  readonly View?: ComponentType<MembersViewProps>
  readonly view: MembersViewProps["view"]
  readonly onView: MembersViewProps["onView"]
}
const writableRole = (role: unknown): role is "maintainer" | "member" => role === "maintainer" || role === "member"
const validLogin = (login: string) => /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(login)
export const MembersContainer = ({ card, role, session, dispatch, View = MembersView, view, onView }: MembersContainerProps) => {
  if (!session || !card.payload.model) return null
  const source = MembersCardSchema.parse(card.payload.model)
  const allowed = role !== "member"
  const definitions: CardActionDefinition[] = allowed ? [{ tag: "members.add", label: "Add", primary: true,
    command_input: { login: "", role: "member" }, input: [
      { name: "login", label: "GitHub username", kind: "text", required: true }
    ], resolve_input: input => ({ login: input.login ?? "", role: "member" }) }] : []
  for (const member of source.members) {
    if (!allowed || member.role === "owner") continue
    // Row args identify the binding. Form input can never retarget a different person.
    definitions.push({ tag: "members.role", label: "Role", args: { login: member.login },
      command_input: { login: member.login, role: member.role },
      input: [{ name: "role", label: "Role", kind: "choice", choices: ["maintainer", "member"], value: member.role, required: true }],
      resolve_input: input => ({ login: member.login, role: input.role as "maintainer" | "member" }) },
    { tag: "members.remove", label: "Remove", args: { login: member.login }, command_input: { login: member.login } })
  }
  const guardedDispatch: CardCommandDispatch = (tag, input) => {
    if (tag === "members.add" && input && "login" in input && !validLogin(input.login)) return
    if ((tag === "members.role" || tag === "members.add") && input && "role" in input && !writableRole(input.role)) return
    return dispatch(tag, input)
  }
  const bindings = cardActions(guardedDispatch, definitions)
  const footer = cardActions(guardedDispatch, definitions.filter(definition => definition.tag === "members.add"))
  const model = MembersCardSchema.parse({ ...source, members: source.members.map(member => ({ ...member,
    actions: cardActions(guardedDispatch, definitions.filter(definition => definition.args?.login === member.login)).actions })) })
  return <View model={model} actions={footer.actions} gestures={bindings.gestures}
    onAction={bindings.onAction} view={view} onView={onView} />
}
