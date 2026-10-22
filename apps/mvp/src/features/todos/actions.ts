import { Clock, Effect, Metric, Option } from "effect"
import { FlowDispatch } from "../../flows/dispatch"
import { repoId } from "../repo/contract"
import { isPrompt, isTitle, stackPath } from "./contract"
import { pendingActions } from "./metrics"
import { type Draft, VIEW } from "./schema"
import { TodosStore } from "./store"

// What a person does with TODOs, as Effects that finish synchronously (decision 0016 §3, docs/features/todos.md). Commit
// and Drop are the flows `todo/commit` and `todo/drop`, dispatched with door `button` in the store's scope: the press
// returns at once, and a committed draft goes once its change is queued. Sending runs in the outbox, never in an action.

/**
 * What a stack route calls on a link's hover or focus (the router's intent preload): starts syncing `owner/name`'s
 * stack without showing it, so the page the click opens has its rows.
 */
export const warm = (owner: string, name: string) =>
  Effect.flatMap(TodosStore, (store) => Effect.asVoid(store.stackOf(repoId(owner, name))))

/** What a stack route calls on a navigation: shows `owner/name`'s stack, and, with `number`, that TODO; and syncs the stack. */
export const open = (owner: string, name: string, number?: number) =>
  Effect.gen(function* () {
    const store = yield* TodosStore
    const id = repoId(owner, name)
    yield* store.view.update(VIEW, (row) => {
      row.owner = owner
      row.name = name
      row.repoId = id
      row.number = number ?? null
    })
    yield* store.stackOf(id)
  }).pipe(Effect.orDie)

/** New TODO on `owner/name`'s stack: an empty private draft. Answers its id. */
export const newDraft = (owner: string, name: string) =>
  Effect.gen(function* () {
    const { drafts } = yield* TodosStore
    const id = crypto.randomUUID()
    yield* drafts.insert({
      id,
      repo: `${owner}/${name}`,
      repoId: repoId(owner, name),
      title: "",
      prompt: "",
      acceptance: [],
      answerId: null,
      createdAt: yield* Clock.currentTimeMillis,
    })
    return id
  }).pipe(Effect.orDie)

/** Changes draft `id`'s text; a draft the device no longer has stays gone. */
const changeDraft = (id: string, change: Partial<Pick<Draft, "title" | "prompt">>) =>
  Effect.gen(function* () {
    const { drafts } = yield* TodosStore
    if (Option.isNone(yield* drafts.get(id))) return
    yield* drafts.update(id, (draft) => void Object.assign(draft, change))
  }).pipe(Effect.orDie)

export const setTitle = (id: string, title: string) => changeDraft(id, { title })
export const setPrompt = (id: string, prompt: string) => changeDraft(id, { prompt })

/** Marks draft `id`'s Commit on its way from this tab, or no longer. */
const setCommitting = (id: string, committing: boolean) =>
  Effect.flatMap(TodosStore, ({ view }) =>
    Effect.orDie(view.update(VIEW, (row) => {
      row.committing = committing ? [...row.committing, id] : row.committing.filter((other) => other !== id)
    })))

/**
 * Commit on draft `id`: `todo/commit` with its title, prompt and criteria, in the store's scope; the draft goes once the
 * change is queued, and stays if it wasn't. Answers the stack's page to show, or nothing when it didn't run: a draft the
 * device doesn't have, a blank title or prompt, or while its Commit is on its way.
 */
export const commit = (id: string) =>
  Effect.gen(function* () {
    const store = yield* TodosStore
    const found = yield* store.drafts.get(id)
    const view = Option.getOrThrow(yield* store.view.get(VIEW))
    if (Option.isNone(found) || view.committing.includes(id)) return undefined
    const draft = found.value
    if (!isTitle(draft.title) || !isPrompt(draft.prompt)) return undefined
    const flows = yield* FlowDispatch
    yield* setCommitting(id, true)
    const done = Effect.gen(function* () {
      // Queued: the flow answered Requested. Its declared failure, or no run at all, keeps the draft.
      const queued = yield* flows.dispatch(
        "todo/commit",
        {
          repo: draft.repo,
          title: draft.title.trim(),
          prompt: draft.prompt,
          ...(draft.acceptance.length === 0 ? {} : { acceptance: draft.acceptance }),
          ...(draft.issue === undefined ? {} : { issue: draft.issue }),
        },
        { door: "button" },
      ).pipe(Effect.map((dispatched) => dispatched._tag === "Done"), Effect.orElseSucceed(() => false))
      if (queued) yield* Effect.ignore(store.drafts.delete(id))
      yield* setCommitting(id, false)
    })
    yield* Effect.forkIn(done, store.scope, { startImmediately: true })
    const [owner, name] = draft.repo.split("/") as [string, string]
    return stackPath(owner, name)
  })

/** Records Edit or Discard on a change, or Discard on a draft. */
const record = (action: "edit" | "discard" | "discard_draft", fields: Record<string, string>) =>
  Effect.andThen(
    Metric.update(Metric.withAttributes(pendingActions, { action }), 1),
    Effect.logInfo("todos.pending").pipe(Effect.annotateLogs({ ...fields, action, feature: "todos" })),
  )

/** Discard on draft `id`: it goes. */
export const discardDraft = (id: string) =>
  Effect.gen(function* () {
    const { drafts } = yield* TodosStore
    if (Option.isNone(yield* drafts.get(id))) return
    yield* Effect.ignore(drafts.delete(id))
    yield* record("discard_draft", { draftId: id })
  })

/**
 * Make TODO on issue `number` of `owner/name` (`todo/issue`), from its row, its page or its key: the press returns the
 * stack's page at once, where the draft shows once the step kept it, its title and prompt the issue's.
 */
export const fromIssue = (owner: string, name: string, number: number) =>
  Effect.gen(function* () {
    const store = yield* TodosStore
    const flows = yield* FlowDispatch
    yield* Effect.forkIn(
      Effect.ignore(flows.dispatch("todo/issue", { repo: `${owner}/${name}`, issue: number }, { door: "button" })),
      store.scope,
      { startImmediately: true },
    )
    return stackPath(owner, name)
  })

/** Drop on TODO `number` of `owner/name` (`todo/drop`): the press returns at once, and the TODO shows Requested. */
export const drop = (owner: string, name: string, number: number) =>
  Effect.gen(function* () {
    const store = yield* TodosStore
    const flows = yield* FlowDispatch
    yield* Effect.forkIn(
      Effect.ignore(flows.dispatch("todo/drop", { repo: `${owner}/${name}`, number }, { door: "button" })),
      store.scope,
      { startImmediately: true },
    )
  })

/**
 * Edit or Discard on a change that wasn't sent: Edit puts a commit's text back in a new draft first. The change goes
 * from the device. Answers the stack's page, or nothing for a change the device doesn't have.
 */
const handle = (opId: string, action: "edit" | "discard") =>
  Effect.gen(function* () {
    const { requested, drafts } = yield* TodosStore
    const found = yield* requested.get(opId)
    if (Option.isNone(found)) return undefined
    const change = found.value
    if (action === "edit" && change.op === "commit") {
      yield* Effect.orDie(drafts.insert({
        id: crypto.randomUUID(),
        repo: change.repo,
        repoId: change.repoId,
        title: change.title,
        prompt: change.prompt,
        acceptance: change.acceptance,
        answerId: null,
        createdAt: yield* Clock.currentTimeMillis,
        ...(change.issue === undefined ? {} : { issue: change.issue }),
      }))
    }
    yield* Effect.ignore(requested.delete(opId))
    yield* record(action, { opId, op: change.op })
    const [owner, name] = change.repo.split("/") as [string, string]
    return stackPath(owner, name)
  })

/** Edit on a commit that wasn't sent: its text goes back to a draft. Answers the stack's page. */
export const edit = (opId: string) => handle(opId, "edit")

/** Discard on a change that wasn't sent: it goes. */
export const discard = (opId: string) => Effect.asVoid(handle(opId, "discard"))

/** Retry returns once the durable launch is requested; the outbox sends in the background. */
export const retry = (owner: string, name: string, number: number) =>
  Effect.gen(function* () {
    const store = yield* TodosStore
    yield* Effect.forkIn(
      Effect.ignore((yield* FlowDispatch).dispatch("todo/Retry", { repo: `${owner}/${name}`, number }, { door: "button" })),
      store.scope, { startImmediately: true },
    )
  })
