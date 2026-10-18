import { HeldCodeChange } from "../../ui/HeldCodeChange"
import { pluralize } from "../../ui/pluralize"
import { WriteControl } from "../../frame/WriteControl"
import { useCallback, useEffect, useRef, useState } from "react"
import { Icon } from "../../../app/lib"
import { MAYA, signInRoute } from "../../../core/catalog"
import { useMock } from "../../../core/mock"
import { Link, navigate, useLocation } from "../../../core/router"
import { branches, MOCK_NOW, pull, repo, runs, shortSha, to } from "../../fixtures"
import type { Issue as IssueData, TimelineEvent } from "../../fixtures/types"
import { Denied, Empty, Failed, Loading, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { Box, PersonChip, RelTime, Sidebar, SidebarSection, StateIcon, toast } from "../../ui"
import { useIssueCommands } from "./commands"
import { addIssueComment, makeTodo, saveIssue, setIssueClosed, startIssueRun, todoFor, useIssues } from "./model"
import { CommentBox, ConfirmCard, FactoryReceipt, IssueLabels, MarkdownField } from "./shared"
import { useGitHubSync } from "../../frame/githubSync"

type AgentAct = "implement" | "repro"
export const IssueLoading = () => <Loading variant="detail" rows={7}/>
export const IssueError = () => <Failed what="this issue" reason={useGitHubSync().failure}/>
export const IssueNotFound = () => (
  <Empty title="Issue not found" action={<Link className="repo-ui-btn" to={to("issues")}>Back to issues</Link>}/>
)
export const IssueDenied = () => <Denied act="start agent work"/>
export const IssueHeld = () => (
  <div className="repo-issues-held">
    <HeldCodeChange />
  </div>
)
export const IssueSignedOut = () => {
  const location = useLocation()
  return <Link className="repo-ui-btn" title="/signin" to={signInRoute(location)}>Sign in to comment</Link>
}

type IssueTimelineEvent = TimelineEvent | { kind: "accepted"; actor: string; date: string }
const TimelineEventRow = ({ event, index }: { event: IssueTimelineEvent; index: number }) => {
  let content
  if (event.kind === "accepted") content = <>accepted this issue</>
  else if (event.kind === "labeled") content = <>added <IssueLabels names={[event.label]}/></>
  else if (event.kind === "assigned") content = <>assigned <PersonChip login={event.assignee}/></>
  else if (event.kind === "todo") content = <Link to={to("stack")}>made a TODO on the Stack</Link>
  else if (event.kind === "run") content = <>started <Link to={to(`runs/${event.run}`)}>{event.run}</Link></>
  else if (event.kind === "reopened") content = <>reopened this issue</>
  else if (event.kind === "closed") content = (
    <>
      closed this {event.reason === "not_planned" ? "as not planned" : "as completed"}
      {event.pull && <> in <Link to={to(`pull/${event.pull}`)}>#{event.pull}</Link></>}
      {event.sha && <> · <Link className="repo-issues-sha" to={to(`commit/${event.sha}`)}>{shortSha(event.sha)}</Link></>}
    </>
  )
  else content = (
    <>
      referenced this
      {event.sha && <> in <Link className="repo-issues-sha" to={to(`commit/${event.sha}`)}>{shortSha(event.sha)}</Link></>}
      {event.pull && <> · <Link to={to(`pull/${event.pull}`)}>#{event.pull}</Link></>}
    </>
  )
  return (
    <div className="repo-issues-timeline-event" id={`repo-issues-event-${index}`}>
      <span className="repo-issues-event-icon" aria-hidden="true">
        <Icon name={event.kind === "run" ? "clock" : event.kind === "closed" ? "issue-closed" : event.kind === "todo" ? "check" : "dot"} size={14}/>
      </span>
      <span><strong>{event.actor}</strong> {content} <RelTime date={event.date}/></span>
    </div>
  )
}

const IssueEditor = ({ issue, onClose }: { issue: IssueData; onClose: () => void }) => {
  const [title, setTitle] = useState(issue.title)
  const [body, setBody] = useState(issue.body)
  return (
    <Box className="repo-issues-edit-box">
      <form className="repo-issues-edit-form" onSubmit={event => {
        event.preventDefault()
        if (!title.trim()) return
        saveIssue({ ...issue, title: title.trim(), body, updated: MOCK_NOW })
        toast("Issue updated.")
        onClose()
      }}>
        <label htmlFor="repo-issues-edit-title">Title</label>
        <input className="repo-ui-input" id="repo-issues-edit-title" value={title} required autoFocus
          onChange={event => setTitle(event.target.value)}/>
        <MarkdownField id="repo-issues-edit-body" label="Description" value={body} onChange={setBody}/>
        <div className="repo-ui-actions">
          <button className="repo-ui-btn repo-ui-btn-primary" title={`/issue.edit ${issue.n}`} disabled={!title.trim()}>Save changes</button>
          <button type="button" className="repo-ui-btn repo-ui-btn-quiet" title="/cancel" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Box>
  )
}

export const IssueImplementConfirm = ({ issue, act, onClose }: { issue: IssueData; act: AgentAct; onClose: () => void }) => {
  const { flags } = useMock()
  const runLabel = act === "implement" ? "Implement" : "Reproduce"
  return (
    <ConfirmCard title={`${runLabel} #${issue.n}`} onClose={onClose}>
      {flags.as === "out" ? <IssueSignedOut/> : flags.role === "reader" ? <IssueDenied/> : flags.host === "hosted" && flags.landing === "install" ? (
        <IssueHeld/>
      ) : flags.host === "hosted" && flags.hosted === "paused" ? <p>Hosted machines are paused. Try again when they resume.</p> : flags.model === "none" ? (
        <p><Link to={to("settings/models")}>Connect a model</Link> to start this run.</p>
      ) : (
        <>
          <p>{act === "implement" ? "Start a run on a new branch? You review and merge the pull request." : "Start a run to reproduce this issue?"}</p>
          <div className="repo-ui-actions">
            <button type="button" className="repo-ui-btn repo-ui-btn-primary" title={`/issue.${act}.start ${issue.n}`} onClick={() => {
              const started = startIssueRun(issue, act)
              onClose()
              navigate(to(`runs/${started.id}`))
              setTimeout(() => toast(`${runLabel} run started.`), 0)
            }}>Start run</button>
            <button type="button" className="repo-ui-btn repo-ui-btn-quiet" title="/cancel" onClick={onClose}>Cancel</button>
          </div>
        </>
      )}
    </ConfirmCard>
  )
}

const SmithersSection = ({ issue, initialAct }: { issue: IssueData; initialAct: AgentAct | null }) => {
  const { flags } = useMock()
  const [act, setAct] = useState<AgentAct | null>(initialAct)
  const openRun = useCallback((target: IssueData, requestedAct: AgentAct) => {
    if (target.n === issue.n) setAct(requestedAct)
    else navigate(to(`issues/${target.n}?act=${requestedAct}`))
  }, [issue.n])
  useIssueCommands(openRun)
  const todo = todoFor(issue)
  const linkedRuns = runs.filter(entry => entry.issue === issue.n)
  useEffect(() => { setAct(initialAct) }, [initialAct])
  return (
    <SidebarSection title="Smithers">
      <div className="repo-issues-smithers">
        {flags.as === "out" ? null : (
          <>
            {!todo && <button type="button" className="repo-ui-btn" title={`/issue.todo ${issue.n}`}
              disabled={flags.role !== "member"} onClick={() => { makeTodo(issue); toast("TODO added to the Stack.") }}>Make TODO</button>}
            <div className="repo-issues-agent-acts">
              <button type="button" className="repo-ui-btn" title={`/issue.implement ${issue.n}`}
                disabled={flags.role !== "member"} onClick={() => openRun(issue, "implement")}>Implement</button>
              <button type="button" className="repo-ui-btn" title={`/issue.repro ${issue.n}`}
                disabled={flags.role !== "member"} onClick={() => openRun(issue, "repro")}>Reproduce</button>
            </div>
            {flags.role !== "member" && <p className="repo-issues-permission">Only members can make TODOs or start agent work.</p>}
          </>
        )}
        {todo && <Link className="repo-issues-linked-item" to={to("stack")}><Icon name="check" size={15}/>TODO · {todo.state.replaceAll("-", " ")}</Link>}
        {linkedRuns.map(entry => (
          <Link key={entry.id} className="repo-issues-linked-item" to={to(`runs/${entry.id}`)}>
            <StateIcon state={entry.state} size={14}/><span>{entry.id}</span><span className="repo-ui-muted">{entry.state}</span>
          </Link>
        ))}
        {act && <IssueImplementConfirm issue={issue} act={act} onClose={() => setAct(null)}/>}
      </div>
    </SidebarSection>
  )
}

const IssueSidebar = ({ issue, act }: { issue: IssueData; act: AgentAct | null }) => {
  const linkedBranches = branches.filter(branch => (branch.pull && issue.pulls.includes(branch.pull)) || runs.some(entry => entry.issue === issue.n && entry.branch === branch.name))
  return (
    <Sidebar>
      <SidebarSection title="Assignees">
        <div className="repo-issues-sidebar-items">
          {issue.assignees.length ? issue.assignees.map(login => <PersonChip key={login} login={login}/>) : <span className="repo-ui-muted">No one assigned</span>}
        </div>
      </SidebarSection>
      <SidebarSection title="Labels">
        {issue.labels.length ? <IssueLabels names={issue.labels}/> : <span className="repo-ui-muted">None</span>}
      </SidebarSection>
      <SidebarSection title="Milestone"><span className="repo-ui-muted">{issue.milestone ?? "No milestone"}</span></SidebarSection>
      <SidebarSection title="Development">
        <div className="repo-issues-sidebar-items">
          {issue.pulls.map(n => (
            <Link key={n} className="repo-issues-linked-item" to={to(`pull/${n}`)}>
              <StateIcon state={pull(n)?.state ?? "open"} size={15}/><span>#{n} {pull(n)?.title ?? "Pull request"}</span>
            </Link>
          ))}
          {linkedBranches.map(branch => (
            <Link className="repo-issues-linked-item repo-issues-branch" key={branch.name} to={to(`tree/${encodeURIComponent(branch.name)}`)}>
              <Icon name="change" size={14}/><span>{branch.name}</span>
            </Link>
          ))}
          {issue.receipt?.landed && <Link className="repo-issues-linked-item" to={to(`commit/${issue.receipt.landed.sha}`)}>Commit {issue.receipt.landed.sha.slice(0, 7)}</Link>}
          {!issue.pulls.length && !linkedBranches.length && !issue.receipt?.landed && <span className="repo-ui-muted">No linked changes</span>}
        </div>
      </SidebarSection>
      <SmithersSection issue={issue} initialAct={act}/>
    </Sidebar>
  )
}

const IssueComposer = ({ issue }: { issue: IssueData }) => {
  const { flags } = useMock()
  const [body, setBody] = useState("")
  const composer = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const canClose = flags.as === "in" && flags.role === "member"
  useEffect(() => {
    if (new URLSearchParams(location.split("?")[1]).get("focus") !== "comments") return
    composer.current?.scrollIntoView({ block: "center" })
    composer.current?.querySelector("textarea")?.focus()
  }, [location])
  const submit = () => {
    if (!body.trim() || flags.as === "out") return
    addIssueComment(issue, body)
    setBody("")
    toast("Comment added.")
  }
  const toggle = () => {
    if (!canClose) return
    const closing = issue.state === "open"
    setIssueClosed(issue, closing)
    toast(closing ? "Issue closed." : "Issue reopened.")
  }
  return (
    <div className="repo-issues-composer" ref={composer} id="repo-issues-comments">
      {flags.as === "out" ? null : (
        <>
          <PersonChip login={MAYA.login} compact/>
          <form onSubmit={event => { event.preventDefault(); submit() }}>
            <MarkdownField id="repo-issues-comment" label="Add a comment" value={body} onChange={setBody}/>
            <div className="repo-issues-composer-actions">
              {canClose && <button type="button" className="repo-ui-btn" title={`/issue.${issue.state === "open" ? "close" : "reopen"} ${issue.n}`} onClick={toggle}>
                <StateIcon state={issue.state === "open" ? "closed" : "open"} size={15}/>{issue.state === "open" ? "Close issue" : "Reopen issue"}
              </button>}
              <button className="repo-ui-btn" title={`/issue.comment ${issue.n}`} disabled={!body.trim()}>Comment</button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}

export const IssueReady = ({ issue }: { issue: IssueData }) => {
  const { flags } = useMock()
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const [editing, setEditing] = useState(false)
  const canEdit = flags.as === "in" && flags.role === "member"
  const requested = query.get("act") ?? query.get("dialog")
  const act = requested === "implement" || requested === "repro" ? requested : null
  const lastStateEvent = [...issue.events].reverse().find(event => event.kind === "closed" || event.kind === "reopened")
  const notPlanned = issue.state === "closed" && lastStateEvent?.kind === "closed" && lastStateEvent.reason === "not_planned"
  const accepted = issue.receipt?.accepted
  const acceptedEvent = issue.events.findIndex(event => event.kind === "labeled" && event.label === "accepted")
  const acceptance: IssueTimelineEvent[] = accepted && acceptedEvent === -1
    ? [{ kind: "accepted", actor: accepted.by, date: accepted.date }] : []
  const timeline = [
    ...issue.comments.map((comment, index) => ({ kind: "comment" as const, date: comment.date, comment, index })),
    ...[...issue.events, ...acceptance].map((event, index) => ({ kind: "event" as const, date: event.date, event, index }))
  ].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  useEffect(() => {
    if (query.get("evidence") !== "accepted") return
    const index = acceptedEvent === -1 ? issue.events.length : acceptedEvent
    document.getElementById(`repo-issues-event-${index}`)?.scrollIntoView({ block: "center" })
  }, [location, issue.n, issue.events.length, acceptedEvent])
  return (
    <div className="repo-issues-detail">
      <header className="repo-issues-detail-heading">
        <div className="repo-issues-title-line">
          <h1>{issue.title} <span>#{issue.n}</span></h1>
          <div className="repo-ui-actions">
            {canEdit && <button type="button" className="repo-ui-btn" title={`/issue.edit ${issue.n}`} onClick={() => setEditing(!editing)}>Edit</button>}
            <WriteControl primary act="create issues"><Link className={`repo-ui-btn${act || editing ? "" : " repo-ui-btn-primary"}`} title="/issue.new" to={to("issues/new")}>New issue</Link></WriteControl>
          </div>
        </div>
        <div className="repo-issues-detail-meta">
          <span className={`repo-issues-state-pill repo-issues-state-${notPlanned ? "not-planned" : issue.state}`}>
            <StateIcon state={issue.state} size={15}/>{issue.state === "open" ? "Open" : notPlanned ? "Not planned" : "Closed"}
          </span>
          <span><strong>{issue.author}</strong> opened this <RelTime date={issue.opened}/> · {issue.comments.length} {pluralize(issue.comments.length, "comment")}</span>
        </div>
      </header>
      {issue.receipt && <FactoryReceipt issue={issue}/>}
      {editing && canEdit && <IssueEditor issue={issue} onClose={() => setEditing(false)}/>}
      <div className="repo-issues-detail-layout">
        <div className="repo-issues-timeline">
          <CommentBox opened comment={{ author: issue.author, date: issue.opened, body: issue.body }}/>
          <div className="repo-issues-timeline-items">
            {timeline.map(item => item.kind === "comment" ? (
              <CommentBox key={`comment-${item.index}`} comment={item.comment} id={`repo-issues-comment-${item.index}`}/>
            ) : <TimelineEventRow key={`event-${item.index}`} event={item.event} index={item.index}/>)}
          </div>
          <IssueComposer issue={issue}/>
        </div>
        <IssueSidebar issue={issue} act={act}/>
      </div>
    </div>
  )
}

export const Issue = ({ n }: { n: number }) => {
  const state = useView(`issue:${repo.slug}:${n}`)
  const all = useIssues()
  const issue = all.find(item => item.n === n)
  return (
    <RepoFrame tab="issues" title={`${issue ? `${issue.title} #${n}` : "Issue not found"} · ${repo.slug}`}
      askView={`issues/${n}`} askContext={`issue #${n}${issue ? ` · ${issue.title}` : ""} in ${repo.slug}`}>
      {state === "loading" ? <IssueLoading/> : state === "error" ? <IssueError/> : !issue || state === "empty" ? (
        <IssueNotFound/>
      ) : <IssueReady key={`${repo.slug}:${n}`} issue={issue}/>}
    </RepoFrame>
  )
}
