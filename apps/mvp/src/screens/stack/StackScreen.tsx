import { Badge, Button, EmptyState, StackList, TodoCard } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useNavigate } from "@tanstack/react-router"
import { useAuth } from "../../features/auth/components/AuthContext"
import { SignInButton } from "../../features/auth/components/SignInButton"
import { DraftCard } from "../../features/todos/components/DraftCard"
import { useTodos } from "../../features/todos/components/TodosContext"
import { DISCARD, EDIT, NEW_TODO, NOT_FOUND, todoPath } from "../../features/todos/contract"
import { accessFor, draftsOfRepo, mayChange, notSentRows, stackRows, todoCardOf } from "../../features/todos/view"
import "./stack-screen.css"

// /$owner/$repo/stack and /$owner/$repo/stack/$number (decision 0016 §4): the repository's stack in merge order, then
// this device's commits the stack hasn't numbered, then merged and dropped TODOs; the TODO the URL names at full size;
// this device's drafts; and its changes that weren't sent, with Edit and Discard. New TODO and Drop show for a Member
// or above. A stack this person may not read shows sign-in, or Not found. The route's loader opens the stack (`open`);
// this screen only renders what the device has.
export function StackScreen() {
  const { queries, actions } = useTodos()
  const auth = useAuth()
  const { data: view } = useLiveQuery(queries.view)
  const repoId = view?.repoId ?? ""
  const stack = queries.stack(repoId)
  const { data: todos } = useLiveQuery(stack.todos)
  const { data: requests } = useLiveQuery(stack.requests)
  const { data: sending } = useLiveQuery(queries.sending)
  const { data: requested } = useLiveQuery(queries.requested)
  const { data: drafts } = useLiveQuery(queries.drafts)
  const { data: access } = useLiveQuery(queries.access)
  const { data: session } = useLiveQuery(auth.queries.session)
  const { data: confirmed } = useLiveQuery(auth.queries.confirmed)
  const navigate = useNavigate()
  if (view === undefined) return null
  const status = accessFor(repoId, access)
  if (status === "sign_in") return <main className="stack-screen" aria-label="Stack"><SignInButton /></main>
  if (status === "forbidden") {
    return <main className="stack-screen" aria-label="Stack"><EmptyState title={NOT_FOUND} /></main>
  }
  const { owner, name } = view
  const rows = stackRows(repoId, todos, sending, requested)
  const card = todoCardOf(view.number, rows, todos, requests)
  const may = session !== undefined && mayChange(session, confirmed)
  const notSent = notSentRows(repoId, requested)
  return (
    <main className="stack-screen" aria-label="Stack">
      {/* Blank until the device restored or synced the stack, never the empty state, and never a loading state. */}
      {status === "unknown" && rows.length === 0 ? null : (
        <StackList
          repo={`${owner}/${name}`}
          todos={rows}
          selected={card?.id}
          href={(todo) => (todo.number === null ? undefined : todoPath(owner, name, todo.number))}
          onNavigate={(_, href) => void navigate({ href })}
          onDrop={may ? (todo) => actions.drop(owner, name, todo.number!) : undefined}
          actions={may ? <Button onClick={() => actions.newDraft(owner, name)}>{NEW_TODO}</Button> : undefined}
        />
      )}
      {card === undefined ? null : (
        <TodoCard
          number={card.number}
          title={card.title}
          state={card.state}
          prompt={card.prompt}
          acceptance={card.acceptance}
          {...(card.pending === undefined ? {} : { pending: card.pending })}
          {...(may ? { onDrop: () => actions.drop(owner, name, card.number) } : {})}
        />
      )}
      {draftsOfRepo(repoId, drafts).map((draft) => <DraftCard key={draft.id} draft={draft} />)}
      {notSent.length === 0 ? null : (
        <ul className="stack-not-sent" aria-label="Not sent">
          {notSent.map((change) => (
            <li key={change.id} className="stack-not-sent-row">
              <span className="stack-not-sent-label">{change.label}</span>
              <Badge variant="destructive">{change.reason}</Badge>
              {change.op === "commit" ? (
                <Button variant="outline" size="sm" onClick={() => actions.edit(change.id)}>{EDIT}</Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => actions.discard(change.id)}>{DISCARD}</Button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
