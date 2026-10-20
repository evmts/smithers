import { changedAnswers } from "@smthrs/ui"
import { Deferred, Effect, Option, Stream } from "effect"
import { type DispatchFailed, FlowDispatch } from "../../flows/dispatch"
import { RunsNavigation } from "../runs/actions"
import { runPath } from "../runs/contract"
import { draftPath, FLOWS_PATH, MAX_REQUEST_CHARS, NAME_PATTERN, NEW_FLOW_PATH, RESERVED_NAMES } from "./contract"
import { roundExecutionId } from "./round"
import { FlowsUiStore, FORM, type Form, SHOWN, type Shown } from "./store"

// What a person does with their own flows (decision 0014 §2 and §5, docs/features/flows.md#the-browser): the new-flow
// form, a draft's answers, Save, Run, Edit and Delete. Every act runs its flow through `FlowDispatch`, door `button`,
// the same declarations the agent and the slash commands run. A flow that takes a while (a draft round, a run) is
// started and left to run: the page goes where it shows once the engine has recorded the run.

/** Whether the form can start a draft: a name a person's flow may take, and something it should do. */
export const formReady = (form: Pick<Form, "name" | "request">): boolean =>
  NAME_PATTERN.test(form.name) &&
  !(RESERVED_NAMES as ReadonlyArray<string>).includes(form.name) &&
  form.request.trim().length > 0 &&
  form.request.trim().length <= MAX_REQUEST_CHARS

/** Sets fields of the form. */
export const setForm = (fields: Partial<Omit<Form, "id">>) =>
  Effect.flatMap(FlowsUiStore, ({ form }) => form.update(FORM, (draft) => void Object.assign(draft, fields))).pipe(
    Effect.asVoid,
    // The form's row always exists, and its schema takes any text: a refusal is a bug.
    Effect.orDie,
  )

/** Sets fields of the shown draft's row. */
const setShown = (fields: Partial<Omit<Shown, "id">>) =>
  Effect.flatMap(FlowsUiStore, ({ shown }) => shown.update(SHOWN, (draft) => void Object.assign(draft, fields))).pipe(
    Effect.asVoid,
    Effect.orDie,
  )

/** Goes to `path` in this tab. */
const go = (path: string) => Effect.flatMap(RunsNavigation, ({ navigate }) => Effect.sync(() => navigate(path)))

/**
 * Starts `run` in the background and waits only until the engine has recorded it: `true` once it has, `false` when
 * the engine refused it.
 */
const started = (run: (admitted: Deferred.Deferred<void, DispatchFailed>) => Effect.Effect<unknown, unknown>) =>
  Effect.gen(function* () {
    const admitted = yield* Deferred.make<void, DispatchFailed>()
    yield* Effect.forkDetach(Effect.ignore(run(admitted)))
    return yield* Deferred.await(admitted).pipe(Effect.as(true), Effect.orElseSucceed(() => false))
  })

/** The new-flow route's loader: an empty form, or one that edits the flow `name`. */
export const openNew = (name: string | undefined) => setForm({ name: name ?? "", request: "" })

/** Draft: round 0 of a new draft, from the form; its card opens once the engine has the round. */
export const startDraft = Effect.gen(function* () {
  const store = yield* FlowsUiStore
  const form = Option.getOrThrow(yield* store.form.get(FORM))
  if (!formReady(form)) return
  const draftId = crypto.randomUUID()
  const flows = yield* FlowDispatch
  const admitted = yield* started((admitted) =>
    flows.dispatch("flow/new", { name: form.name, request: form.request.trim() }, {
      door: "button",
      executionId: roundExecutionId(draftId, 0),
      admitted,
    })
  )
  if (!admitted) return
  yield* setForm({ name: "", request: "" })
  yield* go(draftPath(draftId))
})

/** The draft route's loader: shows `draftId`, with no refusal. */
export const openDraft = (draftId: string) => setShown({ draftId, refusal: null, busy: false })

/** An answer typed into a question's field. */
export const setAnswer = (draftId: string, questionId: string, value: string) =>
  Effect.gen(function* () {
    const { answers } = yield* FlowsUiStore
    const id = `${draftId}:${questionId}`
    const current = yield* answers.get(id)
    yield* Option.isNone(current)
      ? answers.insert({ id, draftId, questionId, value })
      : answers.update(id, (draft) => void (draft.value = value))
  }).pipe(Effect.asVoid, Effect.orDie)

/** The shown draft and the person's unsent answers to it, by question id. */
const shownDraft = Effect.gen(function* () {
  const store = yield* FlowsUiStore
  const shown = Option.getOrThrow(yield* store.shown.get(SHOWN))
  if (shown.draftId === null) return Option.none()
  const draft = yield* store.drafts.get(shown.draftId)
  const answers = (yield* store.answers.toArray).filter((answer) => answer.draftId === shown.draftId)
  return Option.map(draft, (draft) => ({
    draft,
    answers: Object.fromEntries(answers.map((answer) => [answer.questionId, answer.value])),
    ids: answers.map((answer) => answer.id),
  }))
})

/** Answer: the changed answers start the draft's next round. */
export const answer = Effect.gen(function* () {
  const shown = yield* shownDraft
  if (Option.isNone(shown)) return
  const { draft, answers, ids } = shown.value
  const changed = changedAnswers(draft.questions, answers)
  if (changed.length === 0) return
  const flows = yield* FlowDispatch
  const admitted = yield* started((admitted) =>
    flows.dispatch("flow/answer", { draftId: draft.id, round: draft.round, answers: changed }, { door: "button", admitted })
  )
  if (admitted) yield* Effect.asVoid((yield* FlowsUiStore).answers.delete(ids)).pipe(Effect.orDie)
})

/** What `flow/save` refused, as the code the card shows: `name_taken`, the refusal's own code, else `unavailable`. */
export const savedRefusal = (error: { readonly _tag: string; readonly code?: string }) =>
  error._tag === "@smthrs/mvp/flows/NameTaken" ? "name_taken" : error.code ?? "unavailable"

/** Save: the shown draft becomes the person's flow; the list of flows opens. */
export const save = Effect.gen(function* () {
  const shown = yield* shownDraft
  if (Option.isNone(shown)) return
  yield* setShown({ busy: true, refusal: null })
  const dispatched = yield* (yield* FlowDispatch).dispatch("flow/save", { draftId: shown.value.draft.id }, {
    door: "button",
  }).pipe(Effect.result)
  if (dispatched._tag === "Failure") return yield* setShown({ busy: false, refusal: "unavailable" })
  const ended = dispatched.success
  if (ended._tag === "Failed") return yield* setShown({ busy: false, refusal: savedRefusal(ended.error) })
  yield* synced(ended.value)
  yield* setShown({ busy: false })
  yield* go(FLOWS_PATH)
})

/**
 * Waits until this device has the saved revision, so the list Save opens shows it: Electric delivers it, or the device
 * has it. One Electric doesn't deliver within the store's `confirmWithin` is logged `flow.save.unconfirmed`, and the
 * list opens anyway: the save is done, and the row follows.
 */
const synced = (saved: { readonly flowId: string; readonly revision: number }) =>
  Effect.gen(function* () {
    const { flows, confirmWithin } = yield* FlowsUiStore
    // With the rows the device has as the first batch, so a row that arrived before the wait isn't missed.
    const delivered = yield* flows.changes({ initial: true }).pipe(
      Stream.mapEffect(() => flows.get(saved.flowId)),
      Stream.filter((row) => Option.isSome(row) && row.value.revision >= saved.revision),
      Stream.runHead,
      Effect.timeoutOption(confirmWithin),
    )
    if (Option.isNone(delivered)) {
      yield* Effect.logWarning("flow.save.unconfirmed").pipe(Effect.annotateLogs({ feature: "flows" }))
    }
  })

/** Run: a run of the person's flow `name` at `revision`, whose page opens once the engine has it. */
export const run = (name: string, revision: number) =>
  Effect.gen(function* () {
    const runId = crypto.randomUUID()
    const flows = yield* FlowDispatch
    const admitted = yield* started((admitted) =>
      flows.dispatch("flow/run", { name, revision }, { door: "button", executionId: runId, admitted })
    )
    if (admitted) yield* go(runPath(runId))
  })

/** Edit: a new draft of the flow `name`, from its latest revision. */
export const edit = (name: string) => go(`${NEW_FLOW_PATH}?name=${encodeURIComponent(name)}`)

/** Delete: the person's flow `flowId`. */
export const remove = (flowId: string) =>
  Effect.flatMap(FlowDispatch, (flows) => flows.dispatch("flow/delete", { flowId }, { door: "button" })).pipe(
    Effect.ignore,
  )
