import { CircleDashed, GitMerge, GitPullRequest, Pause, X } from "lucide-react"
import type { TodoState } from "@smthrs/rpc/CardPrimitives"
import type { TodoCard } from "@smthrs/rpc/TodoCard"

export type StateWordProps = { state: TodoState; step?: string }
export const stateWords: Record<TodoState, string> = {
  queued: "Queued", starting: "Starting", working: "Working", retrying: "Retrying", needs_you: "Needs you",
  paused: "Paused", failed: "Failed", in_review: "In review", merged: "Merged", dropped: "Dropped"
}
const icons = { in_review: GitPullRequest, merged: GitMerge, failed: X, dropped: CircleDashed, paused: Pause }
export function StateGlyph({ state }: Pick<StateWordProps, "state">) {
  const Icon = state in icons ? icons[state as keyof typeof icons] : undefined
  return Icon ? <Icon className="glyph" size={13} aria-hidden="true" /> : <span className="dot" data-state={state} aria-hidden="true" />
}
export function StateWord({ state, step }: StateWordProps) {
  const label = step ? `${stateWords[state]} · ${step}` : stateWords[state]
  return <span className="state" data-state={state}>
    <StateGlyph state={state} />
    {label}
  </span>
}
/** Why a paused TODO is paused, and by whom: "Stopped" or "daily token budget", then the owner's name. */
export const pauseWords = (pause: NonNullable<TodoCard["pause"]>) =>
  `${pause.reason === "person" ? "Stopped" : "daily token budget"}${pause.owner ? ` · ${pause.owner.name}` : ""}`
