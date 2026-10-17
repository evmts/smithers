import { cardActions, type CardActionDefinition, type CardCommandDispatch } from "./cardActions"
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
 * catalog does not enable here cannot open a form whose Save can only fail. A
 * flow the catalog enables is offered unchanged — the host's own answer stays
 * the authority on whether it works.
 *
 * This is the shortcut's availability test, and it stays the authority wherever
 * a trigger has to say the sentence (`Commands.explainAbsent`): the slash line,
 * a direct submit and the agent's call all still answer with it.
 */
export const answerDoorUnavailable = (
  catalog: AnswerDoorCatalog | undefined,
  tag: AnswerDoorTag
): string | undefined =>
  catalog === undefined || catalog.find(tag) !== undefined
    ? undefined
    : catalog.explainAbsent(tag)?.reason ?? absentReason(tag, "origin")

/** One answer door as the catalog adapter takes it, with its tag still readable. */
type AnswerDoorDefinition = Extract<CardActionDefinition, { readonly tag: AnswerDoorTag }>

/**
 * J9 answer doors. The answer View renders these viewer-filtered actions.
 *
 * A door this host does not run is OMITTED, not offered disabled beside its
 * reason ([#4031](https://github.com/smithersai/smithers/issues/4031)): the
 * footer under every completed answer is the one place that sentence is nobody's
 * question, so repeating `/todo.new is not available on this origin yet.` after
 * each reply was implementation prose in the transcript (MINIMAL TEXT, M-48).
 * Nothing is hidden that a press could have done — the omitted door had no
 * working action behind it — and nothing is claimed about a capability this host
 * lacks: an explicit slash line, form submit or agent call still gets the
 * catalog's refusal, and the door returns the moment the catalog enables it.
 *
 * A reason that is NOT the catalog's absence — a temporary permission or a
 * missing input — still arrives as this definition's own `disabled` and is still
 * rendered with its sentence, because that one answers a door the host does run.
 */
export const answerActions = (
  dispatch: CardCommandDispatch,
  text: string,
  catalog?: AnswerDoorCatalog
) => {
  const doors: ReadonlyArray<AnswerDoorDefinition> = [
    { tag: "todo.new", label: "Make TODO", command_input: { text } },
    { tag: "wiki.save", label: "Save to wiki", command_input: { text },
      input: [{ name: "name", label: "Name", kind: "text", required: true }],
      resolve_input: input => ({ name: input.name ?? "", text }) }
  ]
  return cardActions(dispatch, doors.filter(door => answerDoorUnavailable(catalog, door.tag) === undefined))
}
