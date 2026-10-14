import { cardActions, type CardCommandDispatch } from "./cardActions"
import { absentReason, type AbsentExplanation } from "./Commands"

/** The two doors an answer offers (J9); each one is a catalog flow, never a button of its own. */
export type AnswerDoorTag = "todo.new" | "wiki.save"

/** What the answer door asks the catalog: whether this flow runs here, and the one sentence when it does not. */
export interface AnswerDoorCatalog {
  readonly find: (name: string) => unknown
  readonly explainAbsent: (name: string) => AbsentExplanation | undefined
}

/**
 * Why this host does not run an answer door, or undefined when it does.
 *
 * The three-door law makes the button the same act as the slash line and the
 * agent's call, so it may not offer what the catalog refuses: a door the
 * catalog does not enable here is shown disabled, with the honest refusal the
 * slash door already answers (`Commands.explainAbsent`), instead of opening a
 * form whose Save can only fail. A flow the catalog enables is offered
 * unchanged — the host's own answer stays the authority on whether it works.
 */
export const answerDoorUnavailable = (
  catalog: AnswerDoorCatalog | undefined,
  tag: AnswerDoorTag
): string | undefined =>
  catalog === undefined || catalog.find(tag) !== undefined
    ? undefined
    : catalog.explainAbsent(tag)?.reason ?? absentReason(tag, "origin")

/** J9 answer doors. The answer View renders these viewer-filtered actions. */
export const answerActions = (
  dispatch: CardCommandDispatch,
  text: string,
  catalog?: AnswerDoorCatalog
) => {
  const refused = (tag: AnswerDoorTag) => {
    const reason = answerDoorUnavailable(catalog, tag)
    return reason === undefined ? {} : { disabled: { reason } }
  }
  return cardActions(dispatch, [
    { tag: "todo.new", label: "Make TODO", command_input: { text }, ...refused("todo.new") },
    { tag: "wiki.save", label: "Save to wiki", command_input: { text }, ...refused("wiki.save"),
      input: [{ name: "name", label: "Name", kind: "text", required: true }],
      resolve_input: input => ({ name: input.name ?? "", text }) }
  ])
}
