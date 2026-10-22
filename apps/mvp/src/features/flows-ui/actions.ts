import { answersToSend } from "@smthrs/ui"
import { Deferred, Effect, Option, Stream } from "effect"
import { type DispatchFailed, FlowDispatch } from "../../flows/dispatch"
import { RunsNavigation } from "../runs/actions"
import { runPath } from "../runs/contract"
import { draftPath, FLOWS_PATH, MAX_REQUEST_CHARS, NAME_PATTERN, NEW_FLOW_PATH, RESERVED_NAMES } from "./contract"
import { roundExecutionId } from "./round"
import { CODE, type Code, FlowsUiStore, FORM, type Form, SHOWN, type Shown } from "./store"

// What a person does with their own flows (decision 0014 §2 and §5, docs/features/flows.md#the-browser): the new-flow
// form, a draft's answers, Save, Run, Edit, Code and Delete. Every act runs its flow through `FlowDispatch`, door
// `button`, the same declarations the agent and the slash commands run. A flow that takes a while (a draft round, a
// run) is started and left to run: the page goes where it shows once the engine has recorded the run.

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

/**
 * Draft: round 0 of a new draft, from the form; its card opens once the engine has the round. The draft's id is the
 * form's, so a second press before the first is admitted starts the same execution, which the engine runs once; the
 * form then takes a new one.
 */
export const startDraft = Effect.gen(function* () {
  const store = yield* FlowsUiStore
  const form = Option.getOrThrow(yield* store.form.get(FORM))
  if (!formReady(form)) return
  const { draftId } = form
  const flows = yield* FlowDispatch
  const admitted = yield* started((admitted) =>
    flows.dispatch("flow/new", { name: form.name, request: form.request.trim() }, {
      door: "button",
      executionId: roundExecutionId(draftId, 0),
      admitted,
    })
  )
  if (!admitted) return
  if ((Option.getOrThrow(yield* store.form.get(FORM))).draftId === draftId) {
    yield* setForm({ name: "", request: "", draftId: crypto.randomUUID() })
  }
  yield* go(draftPath(draftId))
})

/** The draft route's loader: shows `draftId`, with no refusal, and reads its round from this device's engine. */
export const openDraft = (draftId: string) =>
  Effect.andThen(setShown({ draftId, refusal: null, busy: false }), Effect.flatMap(FlowsUiStore, (store) => store.readRound))

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

/**
 * Answer: the changed answers, and each blocking question nobody answered at the value its field shows (its default
 * until the person types), start the draft's next round.
 */
export const answer = Effect.gen(function* () {
  const shown = yield* shownDraft
  if (Option.isNone(shown)) return
  const { draft, answers, ids } = shown.value
  const changed = answersToSend(draft.questions, answers)
  if (changed.length === 0) return
  const flows = yield* FlowDispatch
  const admitted = yield* started((admitted) =>
    flows.dispatch("flow/answer", { draftId: draft.id, round: draft.round, answers: changed }, { door: "button", admitted })
  )
  if (admitted) yield* Effect.asVoid((yield* FlowsUiStore).answers.delete(ids)).pipe(Effect.orDie)
})

/**
 * Draft again: the shown draft's next round, from its request and what it drafted so far, at the first round after its
 * own that this device's engine holds no run of; a round already started here is left to run. Its card follows the
 * new round once the device has its row.
 */
export const draftAgain = Effect.gen(function* () {
  const shown = yield* shownDraft
  if (Option.isNone(shown)) return
  const { draft } = shown.value
  const store = yield* FlowsUiStore
  const next = yield* store.nextRound(draft.id, draft.round)
  // A round started here already, its row on the way: a second press starts nothing.
  if (next._tag === "Pending") return
  if (next._tag === "Unreadable") return yield* setShown({ refusal: "again_unavailable" })
  const flows = yield* FlowDispatch
  const admitted = yield* started((admitted) =>
    // `flow/new` names every draft it writes.
    flows.dispatch("flow/new", { name: draft.name!, request: draft.request }, {
      door: "button",
      executionId: roundExecutionId(draft.id, next.round),
      admitted,
    })
  )
  if (!admitted) yield* setShown({ refusal: "again_unavailable" })
})

/** Delete: the draft `draftId`, its round stopped here; the list of flows opens once it is gone. */
export const deleteDraft = (draftId: string) =>
  Effect.gen(function* () {
    const dispatched = yield* (yield* FlowDispatch).dispatch("flow/draft/delete", { draftId }, { door: "button" }).pipe(
      Effect.result,
    )
    if (dispatched._tag === "Success" && dispatched.success._tag === "Done") return yield* go(FLOWS_PATH)
    const { draftId: showing } = Option.getOrThrow(yield* (yield* FlowsUiStore).shown.get(SHOWN))
    if (showing === draftId) yield* setShown({ refusal: "delete_unavailable" })
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

/** Sets fields of the code row. */
const setCode = (fields: Partial<Omit<Code, "id">>) =>
  Effect.flatMap(FlowsUiStore, ({ code }) => code.update(CODE, (draft) => void Object.assign(draft, fields))).pipe(
    Effect.asVoid,
    Effect.orDie,
  )

/** The code row. */
const codeRow = Effect.flatMap(FlowsUiStore, ({ code }) => code.get(CODE)).pipe(Effect.map(Option.getOrThrow))

/**
 * The code route's loader: reads the flow `name`'s latest code through `flow/read` and shows it. A read that ends after
 * the tab moved on to another flow's code changes nothing.
 */
export const openCode = (name: string) =>
  Effect.gen(function* () {
    yield* setCode({ name, state: "loading", revision: 0, source: "", text: "", busy: false, refusal: null })
    const dispatched = yield* (yield* FlowDispatch).dispatch("flow/read", { name }, { door: "button" }).pipe(Effect.result)
    if ((yield* codeRow).name !== name) return
    const ended = dispatched._tag === "Success" ? dispatched.success : undefined
    if (ended?._tag !== "Done") {
      // The engine refused the read, or ChatApi did: the flow isn't the person's, or the read failed.
      const notFound = ended?._tag === "Failed" && ended.error._tag === "@smthrs/mvp/flows/FlowNotFound"
      return yield* setCode({ state: notFound ? "not_found" : "unavailable" })
    }
    yield* setCode({ state: "read", revision: ended.value.revision, source: ended.value.source, text: ended.value.source })
  })

/** The code as the person edits it. */
export const editCode = (text: string) => setCode({ text })

/** What `flow/write` refused, as the code the page shows: a check as `check:<check>`, ChatApi's code, else `unavailable`. */
export const writtenRefusal = (error: { readonly _tag: string; readonly code?: string; readonly check?: string }) =>
  error.check !== undefined
    ? `check:${error.check}`
    : error.code ?? (error._tag === "@smthrs/mvp/flows/FlowNotFound" ? "not_found" : "unavailable")

/** Whether the shown code can be saved: read, changed, not empty, and no write in flight. */
export const codeSaveable = (code: Pick<Code, "state" | "busy" | "text" | "source">): boolean =>
  code.state === "read" && !code.busy && code.text !== code.source && code.text.trim() !== ""

/** Save: the edited code becomes the flow's next revision through `flow/write`; the list of flows opens. */
export const saveCode = Effect.gen(function* () {
  const code = yield* codeRow
  if (!codeSaveable(code)) return
  yield* setCode({ busy: true, refusal: null })
  const dispatched = yield* (yield* FlowDispatch).dispatch(
    "flow/write",
    { name: code.name, revision: code.revision, source: code.text },
    { door: "button" },
  ).pipe(Effect.result)
  if (dispatched._tag === "Failure") return yield* setCode({ busy: false, refusal: "unavailable" })
  const ended = dispatched.success
  if (ended._tag === "Failed") return yield* setCode({ busy: false, refusal: writtenRefusal(ended.error) })
  yield* synced(ended.value)
  yield* setCode({ busy: false, revision: ended.value.revision, source: code.text })
  yield* go(FLOWS_PATH)
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
