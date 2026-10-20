import { Effect, Option } from "effect"
import { FlowDispatch } from "../../flows/dispatch"
import type { AnswerValue, Local } from "./schema"
import { StatusStore } from "./store"

// What a person does about the agent's status (decision 0015): answer its open question, keep a draft, hide a toast,
// and ask the card to take focus. Each finishes at once; an answer runs on as `run/answer` in the store's scope, and
// the card shows it sending until the run's row says it was answered.

/** This tab's row for run `id`'s question `version`, made fresh when it has none or an older question's. */
const touch = (id: string, version: number, change: (row: Local) => Partial<Local>) =>
  Effect.gen(function* () {
    const { local } = yield* StatusStore
    const current = yield* local.get(id)
    const fresh: Local = { id, version, draft: "", hidden: false, sending: false, focus: 0 }
    const base = Option.isSome(current) && current.value.version === version ? current.value : fresh
    const next = { ...base, ...change(base) }
    if (Option.isNone(current)) {
      yield* local.insert(next)
      return
    }
    yield* local.update(id, (draft) => Object.assign(draft, next))
  }).pipe(
    // A local collection refuses only a row its own schema rejects, which these never are: a bug, not a state.
    Effect.orDie,
  )

/** The open question of run `id`, as the conversation has it, if it is open. */
const openQuestion = (id: string) =>
  Effect.gen(function* () {
    const { statuses } = yield* StatusStore
    const row = (yield* statuses.toArray).find((status) => status.id === id)
    // A run that needs the person has a row with its question: Postgres' CHECK holds `wait` to `needs_you`.
    return row?.state === "needs_you" ? Option.some({ version: row.version!, execution: row.wait!.execution }) : Option.none()
  })

/** Keeps the field's text for run `id`'s open question. */
export const setDraft = (id: string, text: string) =>
  Effect.gen(function* () {
    const open = yield* openQuestion(id)
    if (Option.isNone(open)) return
    yield* touch(id, open.value.version, () => ({ draft: text }))
  })

/** Hides the toast for run `id`'s open question in this tab; the card and the header still show it. */
export const hide = (id: string) =>
  Effect.gen(function* () {
    const open = yield* openQuestion(id)
    if (Option.isNone(open)) return
    yield* touch(id, open.value.version, () => ({ hidden: true }))
  })

/** Asks run `id`'s card to take focus and come into view, from a toast's or the header's Answer. */
export const focus = (id: string) =>
  Effect.gen(function* () {
    const open = yield* openQuestion(id)
    if (Option.isNone(open)) return
    yield* touch(id, open.value.version, (row) => ({ focus: row.focus + 1 }))
  })

/** Focuses the oldest question that needs the person: the header's pill. */
export const focusFirst = Effect.gen(function* () {
  const { needs } = yield* StatusStore
  const [first] = yield* needs.toArray
  if (first !== undefined) yield* focus(first.id)
})

/**
 * Answers run `id`'s open question with `value`: dispatches `run/answer` (door `button`) in the background, which
 * records it and delivers it to the run. The card shows it sending until the row says it was answered; a refused
 * answer clears that, so the person can answer again. Does nothing unless the question is open.
 */
export const answer = (id: string, value: AnswerValue) =>
  Effect.gen(function* () {
    const open = yield* openQuestion(id)
    if (Option.isNone(open)) return
    const { version, execution } = open.value
    const { scope } = yield* StatusStore
    const flows = yield* FlowDispatch
    yield* touch(id, version, () => ({ sending: true }))
    yield* flows.dispatch("run/answer", { runId: id, version, execution, value }, { door: "button" }).pipe(
      Effect.ignore,
      Effect.andThen(touch(id, version, () => ({ sending: false }))),
      Effect.forkIn(scope),
    )
  })
