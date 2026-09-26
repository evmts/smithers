import { flowArgs } from "../flows/FlowArgs"
import { flowAction, flowProps } from "../flows/FlowAction"
/*
 * A chat issue as a conversation (DESIGN §3.1, §3.2), rendered inside the
 * existing `issue` card: rows, not bubbles (a thread is multi-party); one
 * header per persona within five minutes; day dividers; a persona that
 * resolves to an agent profile is a door to it; the task strip when the
 * issue carries intent metadata; the composer whose Enter sends through
 * `issues.comment`; pending rows that settle only on the server's answer.
 * The draft is transient chrome (AGENTS.md: an unsent draft is exempt).
 */
import { Button, Markdown, Textarea } from "@smthrs/ui"
import { useState } from "react"
import { AgentMark } from "../AgentMark"
import type { PersonaRef } from "../Persona"
import type { Card } from "../state/AppState"
import { dayLabel, timeLabel } from "../Timestamps"
import type { RunCommand } from "./CardFamily"

type IssueCard = Extract<Card, { kind: "issue" }>
type IssueRow = Extract<Card, { kind: "issue-list" }>["payload"]["issues"][number]
type Comment = IssueCard["payload"]["comments"][number]
type Threadish = Pick<IssueRow, "state" | "task" | "number"> & { readonly repo: string }

const GROUP_MS = 5 * 60_000

/** The Slack thread's permalink from the mapping the record carries; nothing when unmapped. */
export const slackThreadUrl = (slack: NonNullable<IssueCard["payload"]["slack"]>): string => {
  const base = `https://app.slack.com/client/${encodeURIComponent(slack.teamId)}/${encodeURIComponent(slack.channelId)}`
  return slack.threadTs === undefined ? base : `${base}/thread/${encodeURIComponent(slack.channelId)}-${encodeURIComponent(slack.threadTs)}`
}

/** A due date in the fewest words: the weekday inside a week, else the day. */
export const dueWords = (iso: string, now: number = Date.now()): { readonly words: string; readonly past: boolean } => {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return { words: iso, past: false }
  const days = Math.round((at - now) / 86_400_000)
  const words = days === 0 ? "today" : days === 1 ? "tomorrow" : days > 1 && days < 7 ? new Date(at).toLocaleDateString("en-US", { weekday: "short" }) : iso.slice(5, 10)
  return { words, past: at < now }
}

/** The identity a comment was posted under: its persona, else its author. */
export const commentPersona = (comment: Comment): PersonaRef =>
  comment.persona ?? { id: comment.author ?? "unknown", name: comment.author ?? "unknown", ...(comment.authorAvatar === undefined ? {} : { iconUrl: comment.authorAvatar }) }

/** The task strip: state, owner, due, priority, parent, fixer and verifier — each only when recorded. */
export const TaskStrip = ({ thread, onRunCommand, compact = false }: { readonly thread: Threadish; readonly onRunCommand: RunCommand; readonly compact?: boolean }) => {
  const task = thread.task
  if (task === undefined) return null
  const due = task.due === undefined ? undefined : dueWords(task.due)
  const settled = thread.state === "closed" || thread.state === "verified"
  return (
    <span className="thread-task" data-compact={compact || undefined} aria-label="Task">
      <span className="thread-state" data-state={thread.state}>▮ {thread.state}</span>
      {task.owner === undefined ? null : <AgentMark persona={task.owner} size={16} nameless={compact} onRunCommand={compact ? undefined : onRunCommand} />}
      {due === undefined ? null : <span className="thread-due" data-past={due.past && !settled}>{due.words}</span>}
      {task.priority === undefined ? null : <span className="thread-priority" data-priority={task.priority}>P{task.priority}</span>}
      {task.parent === undefined ? null : compact ? <span className="thread-parent">#{task.parent.number}</span> : (
        <button type="button" className="thread-ref" {...flowAction(onRunCommand, "issues.view", flowArgs("issues.view", { number: task.parent.number, repo: thread.repo }))}>
          #{task.parent.number}{task.parent.title === undefined ? "" : ` ${task.parent.title}`}
        </button>
      )}
      {compact || task.fixedBy === undefined ? null : <span className="thread-by">fixed by <AgentMark persona={task.fixedBy} size={16} onRunCommand={onRunCommand} /></span>}
      {compact || task.verifiedBy === undefined ? null : <span className="thread-by">verified by <AgentMark persona={task.verifiedBy} size={16} onRunCommand={onRunCommand} /></span>}
    </span>
  )
}

/** The state acts an issue offers: a chat opens and closes; a task also gets fixed and verified. */
export const stateActions = (card: IssueCard) => {
  const { state, task, viewer, number, repo } = card.payload
  const args = flowArgs("issues.close", { number, repo })
  const selfVerify = task?.fixedBy !== undefined && viewer !== undefined && task.fixedBy.id === viewer.id
  const acts: Array<{ readonly flow: "issues.close" | "issues.reopen" | "issues.fix" | "issues.verify"; readonly label: string; readonly disabled?: string }> = []
  if (state === "open") {
    if (task !== undefined) acts.push({ flow: "issues.fix", label: "Fixed" })
    acts.push({ flow: "issues.close", label: card.payload.kind === "chat" ? "Close" : "Close issue" })
  } else if (state === "fixed") {
    acts.push({ flow: "issues.verify", label: "Verify", ...(selfVerify ? { disabled: "fixed by you" } : {}) })
    acts.push({ flow: "issues.reopen", label: "Reopen" })
  } else if (state === "verified") {
    acts.push({ flow: "issues.close", label: "Close" })
    acts.push({ flow: "issues.reopen", label: "Reopen" })
  } else acts.push({ flow: "issues.reopen", label: card.payload.kind === "chat" ? "Reopen" : "Reopen issue" })
  return acts.map((act) => ({ ...act, args }))
}

const MessageRow = ({ comment, first, card, onRunCommand }: { readonly comment: Comment; readonly first: boolean; readonly card: IssueCard; readonly onRunCommand: RunCommand }) => {
  const { number, repo } = card.payload
  const persona = commentPersona(comment)
  const reactions = comment.reactions ?? []
  return (
    <li className="thread-message" data-message={comment.id} data-continued={!first || undefined}>
      {first ? (
        <div className="thread-message-head">
          <AgentMark persona={persona} size={28} onRunCommand={onRunCommand} />
          {comment.createdAt === null ? null : <time className="thread-message-time" dateTime={comment.createdAt}>{timeLabel(Date.parse(comment.createdAt))}</time>}
          {comment.origin === "slack" ? <span className="thread-slack">slack</span> : null}
        </div>
      ) : null}
      <div className="thread-message-body">
        <Markdown className="smithers-card-markdown" content={comment.commentBody} />
        {reactions.length === 0 || comment.id === undefined ? null : (
          <div className="thread-reactions" aria-label="Reactions">
            {reactions.map((reaction) => reaction.mine ? (
              <button key={reaction.name} type="button" className="thread-reaction" data-mine aria-label={`Remove your ${reaction.name} reaction`}
                {...flowAction(onRunCommand, "issues.react", flowArgs("issues.react", { number, repo, commentId: comment.id!, name: reaction.name, active: false }))}>
                {reaction.name} {reaction.count}
              </button>
            ) : <span key={reaction.name} className="thread-reaction">{reaction.name} {reaction.count}</span>)}
          </div>
        )}
      </div>
    </li>
  )
}

const Composer = ({ card, onRunCommand }: { readonly card: IssueCard; readonly onRunCommand: RunCommand }) => {
  const { number, repo } = card.payload
  const [draft, setDraft] = useState("")
  const trimmed = draft.trim()
  /* Enter and the Send button are the same act: issues.comment with the number, the text and the repository. */
  const send = () => {
    if (trimmed === "") return
    onRunCommand("issues.comment", flowArgs("issues.comment", { number, repo, text: trimmed }))
    setDraft("")
  }
  return (
    <form className="thread-composer" aria-label="Message" onSubmit={(event) => {
      event.preventDefault()
      if (trimmed === "") return
      onRunCommand("issues.comment", flowArgs("issues.comment", { number, repo, text: trimmed }))
      setDraft("")
    }}>
      <Textarea
        aria-label="Message"
        placeholder="Message"
        rows={1}
        value={draft}
        data-testid="thread-composer"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() }
          if (event.key === "Escape") event.currentTarget.blur()
        }}
      />
      <Button type="submit" size="sm" variant="solid" {...flowProps("issues.comment")} disabled={trimmed === ""}>Send</Button>
    </form>
  )
}

/** The conversation body of a chat issue. */
export const IssueThreadBody = ({ card, onRunCommand }: { readonly card: IssueCard; readonly onRunCommand: RunCommand }) => {
  const { comments, issueBody, slack, task, state, author, authorAvatar, number, repo } = card.payload
  const pending = card.payload.pending ?? []
  const rows: Array<{ readonly comment: Comment; readonly first: boolean; readonly day: string }> = []
  let previous: Comment | undefined
  for (const comment of comments) {
    const at = comment.createdAt === null ? Number.NaN : Date.parse(comment.createdAt)
    const before = previous?.createdAt === null || previous?.createdAt === undefined ? Number.NaN : Date.parse(previous.createdAt)
    const first = previous === undefined || commentPersona(previous).id !== commentPersona(comment).id || Number.isNaN(at) || Number.isNaN(before) || at - before > GROUP_MS
    rows.push({ comment, first, day: comment.createdAt === null ? "" : dayLabel(comment.createdAt) })
    previous = comment
  }
  const days = [...new Set(rows.map((row) => row.day))]
  const acts = stateActions(card)
  const opener: PersonaRef | undefined = author === null ? undefined : { id: author, name: author, ...(authorAvatar === undefined ? {} : { iconUrl: authorAvatar }) }
  return (
    <article className="thread" data-testid={`thread-${number}`} data-kind={task === undefined ? "chat" : "task"} data-state={state} data-keyboard-pane={card.payload.title}>
      {task === undefined && slack === undefined ? null : (
        <header className="thread-head">
          <TaskStrip thread={{ ...card.payload, repo }} onRunCommand={onRunCommand} />
          {slack === undefined ? null : <a className="thread-slack thread-slack-link" href={slackThreadUrl(slack)} target="_blank" rel="noreferrer">slack ↗</a>}
        </header>
      )}
      <ol className="thread-messages" aria-label="Messages">
        {issueBody === "" ? null : (
          <li className="thread-message" data-message="body">
            {opener === undefined ? null : <div className="thread-message-head"><AgentMark persona={opener} size={28} onRunCommand={onRunCommand} /></div>}
            <div className="thread-message-body"><Markdown className="smithers-card-markdown" content={issueBody} /></div>
          </li>
        )}
        {days.map((day) => (
          <li key={day || "undated"} className="thread-day-group">
            {day === "" ? null : <p className="thread-day">{day}</p>}
            <ol className="thread-messages">
              {rows.filter((row) => row.day === day).map((row, index) => <MessageRow key={row.comment.id ?? `${day}-${index}`} comment={row.comment} first={row.first} card={card} onRunCommand={onRunCommand} />)}
            </ol>
          </li>
        ))}
        {pending.map((request) => (
          <li key={request.id} className="thread-message thread-pending" data-pending={request.status} aria-label="Pending message">
            <div className="thread-message-head">
              {card.payload.viewer === undefined ? null : <AgentMark persona={card.payload.viewer} size={28} />}
              <time className="thread-message-time" dateTime={new Date(request.at).toISOString()}>{timeLabel(request.at)}</time>
              <span className="thread-pending-word" role={request.status === "requested" ? undefined : "status"}>
                {request.status === "requested" ? "sending…" : request.status === "unknown" ? "Delivery unknown" : "Not delivered"}
              </span>
              {request.status === "requested" ? null : (
                <Button size="sm" variant="outline" {...flowAction(onRunCommand, "issues.comment.retry", flowArgs("issues.comment.retry", { cardId: card.id, requestId: request.id }))}>Retry</Button>
              )}
            </div>
            <div className="thread-message-body">
              <Markdown className="smithers-card-markdown" content={request.text} />
              {request.error === undefined ? null : <p className="sui-approval-error">{request.error}</p>}
            </div>
          </li>
        ))}
      </ol>
      {state === "closed" ? null : <Composer card={card} onRunCommand={onRunCommand} />}
      <div className="flow-run-actions thread-actions">
        {acts.map((act) => (
          <Button key={act.flow} size="sm" variant="outline" disabled={act.disabled !== undefined} title={act.disabled}
            {...flowAction(onRunCommand, act.flow, act.args)}>{act.label}</Button>
        ))}
      </div>
    </article>
  )
}
