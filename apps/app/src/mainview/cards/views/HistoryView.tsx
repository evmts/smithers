import { useState, type ReactNode } from "react"
import { Markdown } from "@smthrs/ui/markdown"
import type { Action, CatalogTag } from "@smthrs/rpc/CardAction"
import type { UserFailure } from "@smthrs/rpc/UserFailure"
import type { SharedConversation } from "../../state/seams/SharedConversationSeam"

/** One archived chat's row: its line, when it was archived, its summary, and the runs it started. */
export interface HistoryChat { readonly id: string; readonly title: string; readonly archivedAt: number; readonly summary: string | undefined; readonly runs: ReadonlyArray<string> }
/** A branch's chats; a null branch holds chats archived with no branch, listed directly under the repository. */
export interface HistoryBranchRows { readonly branch: string | null; readonly current: boolean; readonly chats: ReadonlyArray<HistoryChat> }
/** A repository's branches; a null repository is the no-repository group. */
export interface HistoryRepositoryRows { readonly repository: string | null; readonly current: boolean; readonly branches: ReadonlyArray<HistoryBranchRows> }

export interface HistoryViewProps {
  readonly model: {
    readonly repositories: ReadonlyArray<HistoryRepositoryRows>
    /** False until the first listing answers. */
    readonly loaded: boolean
    /** A listing that failed; rows already read stay beside it. */
    readonly failure: UserFailure | undefined
    /** The selected archive's entries, once read. */
    readonly opened: SharedConversation | undefined
  }
  /** One `run` action per run a chat started, told apart by `args.id`. */
  readonly actions: ReadonlyArray<Action>
  readonly onAction: (tag: CatalogTag, input?: Record<string, string>) => void
  /** The archive whose entries the card shows. */
  readonly view: { readonly selected: string | undefined }
  readonly onView: (patch: { readonly selected: string | undefined }) => void
}

const day = (at: number): string => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" })

/** A repository or a branch: one row that opens the rows under it. */
function Group({ name, kind, count, open: initially, children }: { name: string; kind: "repository" | "branch"; count: number; open: boolean; children: ReactNode }) {
  // Transient chrome (apps/app/AGENTS.md): an open/closed disclosure with no address.
  const [open, setOpen] = useState(initially)
  return <li data-history={kind} data-name={name}>
    <button type="button" className="tree-row" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      <span className="tree-name">{name}</span>
      <span className="history-count">{count}</span>
    </button>
    {open ? <ol>{children}</ol> : null}
  </li>
}

/** Archived entries are prose only: no control in them can act on a live chat. */
function Entries({ conversation }: { conversation: SharedConversation }) {
  return <div className="archive-entries" data-content="" data-archived-entries={conversation.id}>
    {conversation.entries.map(entry => {
      if (!("frames" in entry)) return "text" in entry ? <Markdown key={entry.id} content={entry.text} /> : null
      const frames = entry.frames.filter(frame => frame.runId === entry.runId)
      const answer = frames.flatMap(frame => frame.type === "delta" && frame.kind === "text" ? [frame.text] : []).join("")
      return <section key={entry.id} data-archived-turn={entry.id} data-state={entry.state}>
        <p className="history-prompt"><strong>{entry.authorLogin}</strong> {entry.prompt}</p>
        {answer.trim() ? <Markdown content={answer} /> : null}
        {frames.flatMap(frame => frame.type === "card"
          ? [<article key={frame.card.id} data-archive-card={frame.card.kind}><strong>{frame.card.title}</strong></article>] : [])}
      </section>
    })}
  </div>
}

function Chat({ chat, selected, opened, actions, onAction, onView }: { chat: HistoryChat; selected: boolean; opened: SharedConversation | undefined } & Pick<HistoryViewProps, "actions" | "onAction" | "onView">) {
  const runs = chat.runs.flatMap(id => actions.filter(action => action.tag === "run" && action.args?.id === id))
  return <li data-history="chat" data-archive={chat.id}>
    <button type="button" className="tree-row" aria-expanded={selected} aria-current={selected ? "true" : undefined} onClick={() => onView({ selected: selected ? undefined : chat.id })}>
      <span className="tree-name">{chat.title}</span>
      <time dateTime={new Date(chat.archivedAt).toISOString()}>{day(chat.archivedAt)}</time>
    </button>
    {selected ? <div className="history-chat">
      {chat.summary ? <p className="history-summary" data-content="">{chat.summary}</p> : null}
      {runs.length > 0 ? <ol className="history-runs">{runs.map(action => <li key={action.label} data-history="run">
        <button type="button" className="tree-row" data-flow={action.tag} onClick={() => onAction(action.tag, action.args)}><span className="tree-name">{action.label}</span></button>
      </li>)}</ol> : null}
      {opened ? <Entries conversation={opened} /> : null}
    </div> : null}
  </li>
}

/** Archived chats as a tree: repository, branch, chat, then the runs the chat started. */
export function HistoryView({ model, actions, onAction, view, onView }: HistoryViewProps) {
  const { repositories, loaded, failure, opened } = model
  const chats = (rows: ReadonlyArray<HistoryChat>) => rows.map(chat =>
    <Chat key={chat.id} chat={chat} selected={chat.id === view.selected} opened={chat.id === view.selected ? opened : undefined} actions={actions} onAction={onAction} onView={onView} />)
  const holds = (rows: ReadonlyArray<HistoryChat>) => rows.some(chat => chat.id === view.selected)
  return <article className="history-card" aria-label="History" data-keyboard-pane="History">
    {failure ? <p className="history-note" role="status" data-failure={failure.tag ?? undefined}>{failure.sentence}</p> : null}
    {loaded && repositories.length === 0 && !failure ? <p className="history-note">No archived chats</p> : null}
    {repositories.length > 0 ? <ol className="history-tree">{repositories.map(repository => {
      const all = repository.branches.flatMap(branch => branch.chats)
      return <Group key={repository.repository ?? "\u0000"} kind="repository" name={repository.repository ?? "No repository"} count={all.length}
        open={repository.current || repositories.length === 1 || holds(all)}>
        {repository.branches.map(branch => branch.branch === null
          // A chat archived with no branch sits directly under its repository.
          ? chats(branch.chats)
          : <Group key={branch.branch} kind="branch" name={branch.branch} count={branch.chats.length}
            open={branch.current || repository.branches.length === 1 || holds(branch.chats)}>{chats(branch.chats)}</Group>)}
      </Group>
    })}</ol> : null}
  </article>
}
