import { mayAsk, type Role } from "../auth/contract"
import { viewerOf } from "../commands/catalog"
import { NOT_SENT_COPY, type NotSentReason, type TodoState } from "./contract"
import type { Access, Draft, Requested, Sending, Todo, TodoRequest } from "./schema"

// What the stack's screens show, from the rows the device has (decision 0016 §4, docs/features/todos.md#the-browser):
// pure functions the views call with their live queries' rows, so no view decides anything. A change this device made
// shows until Electric shows what it did: a commit as `T–` and Requested at the end of the stack, a drop as Requested
// on its TODO, either as Not sent once the route refused it.

/** A row of the stack as `StackList` shows it. */
export interface StackRow {
  readonly id: string
  readonly number: number | null
  readonly title: string
  readonly state: TodoState
  readonly pending?: "requested" | "not_sent"
}

/** A change this device holds: in the outbox (`sending`), or taken or refused (`requested`). */
type Mine = Pick<Sending, "id" | "repoId" | "op" | "title" | "number" | "queuedAt"> & {
  readonly status?: Requested["status"]
}

/** This device's changes to repository `repoId`: the outbox's first, each op id once. */
const mineOf = (repoId: string, sending: ReadonlyArray<Mine>, requested: ReadonlyArray<Mine>): ReadonlyArray<Mine> => {
  const kept = new Set(requested.map((row) => row.id))
  return [...sending.filter((row) => !kept.has(row.id)), ...requested].filter((row) => row.repoId === repoId)
}

const pendingOf = (row: Mine): "requested" | "not_sent" => (row.status === "not_sent" ? "not_sent" : "requested")

/**
 * The stack of repository `repoId`: its open TODOs in order, then this device's commits the stack hasn't numbered yet,
 * in the order made, then its merged and dropped TODOs, latest first. A TODO this device asked to drop shows its drop.
 */
export const stackRows = (
  repoId: string,
  todos: ReadonlyArray<Todo>,
  sending: ReadonlyArray<Mine>,
  requested: ReadonlyArray<Mine>,
): ReadonlyArray<StackRow> => {
  const mine = mineOf(repoId, sending, requested)
  const ids = new Set(todos.map((todo) => todo.id))
  const drops = new Map(mine.filter((row) => row.op === "drop").map((row) => [row.number, pendingOf(row)]))
  const rowOf = (todo: Todo): StackRow => {
    const pending = todo.state === "dropped" ? undefined : drops.get(todo.number)
    return {
      id: todo.id,
      number: todo.number,
      title: todo.title,
      state: todo.state,
      ...(pending === undefined ? {} : { pending }),
    }
  }
  const mineTodos = todos.filter((todo) => todo.repoId === repoId)
  const open = mineTodos.filter((todo) => todo.position !== null).sort((a, b) => a.position! - b.position!)
  const settled = mineTodos.filter((todo) => todo.position === null).sort((a, b) => b.number - a.number)
  const committing = mine
    .filter((row) => row.op === "commit" && !ids.has(row.id))
    .sort((a, b) => a.queuedAt - b.queuedAt)
    .map((row): StackRow => ({ id: row.id, number: null, title: row.title, state: "queued", pending: pendingOf(row) }))
  return [...open.map(rowOf), ...committing, ...settled.map(rowOf)]
}

/** A change this device made that the route refused, with Edit (a commit's) and Discard. */
export interface NotSentRow {
  readonly id: string
  readonly op: "commit" | "drop"
  /** What it was: a commit's title, or `Drop T4`. */
  readonly label: string
  readonly reason: string
}

/** This device's changes to repository `repoId` the route refused, in the order made. */
export const notSentRows = (repoId: string, requested: ReadonlyArray<Requested>): ReadonlyArray<NotSentRow> =>
  requested
    .filter((row) => row.repoId === repoId && row.status === "not_sent")
    .sort((a, b) => a.queuedAt - b.queuedAt)
    .map((row) => ({
      id: row.id,
      op: row.op,
      label: row.op === "commit" ? row.title : `Drop T${row.number}`,
      reason: NOT_SENT_COPY[row.reason as NotSentReason],
    }))

/**
 * The op ids of this device's changes to repository `repoId` whose result Electric delivered: a commit whose TODO is
 * there, a drop whose TODO is dropped.
 */
export const deliveredOf = (
  repoId: string,
  todos: ReadonlyArray<Todo>,
  requested: ReadonlyArray<Requested>,
): ReadonlyArray<string> => {
  const ids = new Set(todos.map((todo) => todo.id))
  const dropped = new Set(todos.filter((todo) => todo.state === "dropped").map((todo) => todo.number))
  return requested
    .filter((row) => row.repoId === repoId && (row.op === "commit" ? ids.has(row.id) : dropped.has(row.number)))
    .map((row) => row.id)
}

/** One TODO at full size, as `TodoCard` shows it. */
export interface TodoCardProps {
  readonly id: string
  readonly number: number
  readonly title: string
  readonly state: TodoState
  readonly prompt: string
  readonly acceptance: ReadonlyArray<string>
  readonly pending?: "requested" | "not_sent"
}

/** TODO `number` of the stack, with its latest prompt, once the device has both. */
export const todoCardOf = (
  number: number | null,
  rows: ReadonlyArray<StackRow>,
  todos: ReadonlyArray<Todo>,
  requests: ReadonlyArray<TodoRequest>,
): TodoCardProps | undefined => {
  const todo = todos.find((row) => row.number === number)
  if (todo === undefined) return undefined
  const request = requests.find((row) => row.todoId === todo.id && row.revision === todo.revision)
  if (request === undefined) return undefined
  const pending = rows.find((row) => row.id === todo.id)?.pending
  return {
    id: todo.id,
    number: todo.number,
    title: todo.title,
    state: todo.state,
    prompt: request.prompt,
    acceptance: request.acceptance,
    ...(pending === undefined ? {} : { pending }),
  }
}

/** The drafts of repository `repoId` on this device, newest first. */
export const draftsOfRepo = (repoId: string, drafts: ReadonlyArray<Draft>): ReadonlyArray<Draft> =>
  drafts.filter((draft) => draft.repoId === repoId).sort((a, b) => b.createdAt - a.createdAt)

/** The drafts the agent made in answer `answerId`, in the order made. */
export const draftsOfAnswer = (answerId: string, drafts: ReadonlyArray<Draft>): ReadonlyArray<Draft> =>
  drafts.filter((draft) => draft.answerId === answerId).sort((a, b) => a.createdAt - b.createdAt)

/** Whether this person may read repository `repoId`'s stack, as its shape last said: `unknown` until it says. */
export const accessFor = (repoId: string, access: ReadonlyArray<Access>): Access["status"] =>
  access.find((row) => row.id === repoId)?.status ?? "unknown"

/**
 * Whether the person at the page may commit and drop TODOs: Member and above (`repo:todo-commit`, `repo:todo-drop`), as
 * sign-in last said, or the session this device last confirmed while it can't say.
 */
export const mayChange = (
  session: { readonly status: "loading" | "signed_in" | "signed_out" | "unreachable"; readonly role: Role | null },
  confirmed: { readonly role: Role | null } | undefined,
): boolean => {
  const viewer = viewerOf(session, confirmed)
  return viewer.signedIn && mayAsk(viewer.role)
}
