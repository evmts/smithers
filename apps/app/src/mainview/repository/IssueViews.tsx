import { ageLabel } from "../Timestamps"
import type { Card } from "../state/AppState"
import { RepositoryMarkdown } from "./CodeHome"
import { CircleDot, CircleCheck, Clock, GitPullRequest, Search } from "lucide-react"
import { useContext, type ReactNode } from "react"
import { RepositoryAskContext } from "./RepoFrame"
import "./issues.css"

/** Both trackers use the repository's issue path and retain distinct read identities. */
export const matchesIssueReadKey = (key: string | undefined, repo: string, number?: number): boolean => {
  const keys = number === undefined
    ? [JSON.stringify(["issues", repo, "all", "all", null])]
    : [`issue-${repo}-${number}`, `issue-github-${repo}-${number}`]
  return keys.some(expected => key?.toLowerCase() === expected.toLowerCase())
}

export const Counter = ({ count }: { count: number }) => <span className="repo-ui-counter">{count}</span>
export const LabelChip = ({ name }: { name: string }) => <span className="repo-ui-label repo-ui-tone-neutral">{name}</span>
export const PersonChip = ({ login, compact = false }: { login: string; compact?: boolean }) => <span className="repo-ui-person" title={login}><span className="repo-ui-avatar" data-lane="guest" aria-label={compact ? login : undefined}>{login.slice(0, 1).toUpperCase()}</span>{!compact && <span>{login}</span>}</span>
export const StateIcon = ({ state }: { state: string }) => {
  const Icon = state === "open" ? CircleDot : state === "merged" || state === "draft" ? GitPullRequest : state === "pending" ? Clock : CircleCheck
  return <span className={`repo-ui-state-icon repo-ui-state-${state}`} role="img" aria-label={state}><Icon size={16}/></span>
}
export const RelTime = ({ date }: { date?: string | null }) => date ? <time className="repo-ui-time" dateTime={date} title={new Date(date).toLocaleString()}>{new Date(date).toLocaleDateString()}</time> : null
export const PageHeader = ({ title, children }: { title: ReactNode; children?: ReactNode }) => <header className="repo-ui-page-header"><div className="repo-ui-page-title"><h1>{title}</h1></div>{children}</header>
export const Tabs = ({ items, active, label }: { items: { id: string; label: string; href: string; count?: number }[]; active: string; label: string }) => <nav className="repo-ui-tabs" aria-label={label}>{items.map(item => <a key={item.id} className="repo-ui-tab" href={item.href} aria-current={active === item.id ? "page" : undefined}>{item.label}{item.count !== undefined && <Counter count={item.count}/>}</a>)}</nav>

export function ReadState({ card, what, retry }: { card?: Card; what: string; retry: () => void }) {
  if (!card || card.loading) return <div className="repo-frame-state" role="status">Loading…</div>
  return <div className="repo-frame-state" role="alert"><h2>Couldn't load {what}.</h2><p>{card.body}</p><button className="repo-ui-btn" onClick={retry}>Retry</button></div>
}
export function IssueViews({ repo, number, card, signedIn, run }: { repo: string; number?: number; card?: Card; signedIn: boolean; run: (name: string, args?: string) => void }) {
  const openAsk = useContext(RepositoryAskContext)
  const base = `/${repo}/issues`
  const retry = () => number === undefined ? run("issues.list", JSON.stringify({ repo, filter: "all" })) : run("issues.view", JSON.stringify({ repo, number, source: card?.kind === "issue" ? card.payload.source ?? "smithers-cloud" : new URLSearchParams(window.location.search).get("source") ?? undefined }))
  const write = <button className="repo-ui-btn repo-ui-btn-primary" onClick={() => { if (signedIn) openAsk?.(); run(signedIn ? "issues.create" : "sign-in", signedIn ? JSON.stringify({ repo, source: "github" }) : undefined) }}>{signedIn ? "New issue" : "Sign in"}</button>
  if (!card || card.loading || card.status === "error") return <section aria-label={number === undefined ? "Issues" : `Issue #${number}`}><ReadState card={card} what={number === undefined ? "issues" : "this issue"} retry={retry}/></section>
  if (number !== undefined) {
    if (card.kind !== "issue") return <ReadState card={card} what="this issue" retry={retry}/>
    const item = card.payload
    return <section className="repo-issues-detail" aria-label={`Issue #${number}`}>
      {card.body && <p role="status">{card.body}</p>}
      <header className="repo-issues-detail-heading"><div className="repo-issues-title-line"><h1>{item.title} <span>#{item.number}</span></h1><div className="repo-ui-actions">{write}</div></div><div className="repo-issues-detail-meta"><span className={`repo-issues-state-pill repo-issues-state-${item.state}`}><StateIcon state={item.state}/>{item.state === "open" ? "Open" : "Closed"}</span><span>{item.author} opened this <RelTime date={item.createdAt}/> · {item.comments.length} comments</span></div></header>
      <div className="repo-issues-detail-layout"><div className="repo-issues-timeline">
        {[{ author: item.author, commentBody: item.issueBody, createdAt: item.createdAt }, ...item.comments].map((comment, i) => <article className="repo-issues-comment" key={i}>{comment.author && <span className="repo-issues-comment-avatar"><PersonChip login={comment.author} compact/></span>}<div className="repo-ui-box"><div className="repo-ui-box-header repo-issues-comment-heading"><strong>{comment.author}</strong><span>{i === 0 ? "opened" : "commented"} <RelTime date={comment.createdAt}/></span></div><div className="repo-issues-comment-body"><RepositoryMarkdown content={comment.commentBody}/></div></div></article>)}
        {signedIn ? <button className="repo-ui-btn" onClick={() => { openAsk?.(); run("issues.comment", JSON.stringify({ repo, number, source: item.source ?? "smithers-cloud" })) }}>Comment</button> : <button className="repo-ui-btn" onClick={() => run("sign-in")}>Sign in to comment</button>}
      </div><aside className="repo-ui-sidebar" aria-label="Issue details"><section className="repo-ui-sidebar-section"><h2>Assignees</h2>{item.assignees?.map(person => <PersonChip key={person.login} login={person.login}/>)}</section><section className="repo-ui-sidebar-section"><h2>Labels</h2>{item.labels.map(name => <LabelChip key={name} name={name}/>)}</section></aside></div>
    </section>
  }
  if (card.kind !== "issue-list") return <ReadState card={card} what="issues" retry={retry}/>
  const data = card.payload
  if (data.github?.refusal && data.issues.length === 0) return <ReadState card={{ ...card, body: data.github.refusal }} what="issues" retry={retry}/>
  const query = new URLSearchParams(window.location.search).get("q") ?? "is:open"
  const closed = query.includes("is:closed")
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []
  const rows = data.issues.filter(row => tokens.every(token => {
    const [key, ...parts] = token.split(":")
    const value = parts.join(":").replace(/^"|"$/g, "")
    if (key === "is" && value === "open") return row.state === "open"
    if (key === "is" && value === "closed") return row.state !== "open"
    if (key === "author") return row.author === value
    if (key === "label") return row.labels?.includes(value) === true
    if (key === "assignee") return row.assignees?.some(person => person.login === value) === true
    if (key === "sort") return true
    return `${row.number} ${row.title}`.toLowerCase().includes(token.toLowerCase())
  })).sort((a, b) => {
    if (query.includes("sort:comments-desc")) return b.comments - a.comments
    const time = (value?: string | null) => value ? Date.parse(value) : 0
    if (query.includes("sort:updated-desc")) return time(b.updatedAt) - time(a.updatedAt)
    const order = time(b.createdAt) - time(a.createdAt) || b.number - a.number
    return query.includes("sort:created-asc") ? -order : order
  })

  return <section className="repo-issues-list-page" aria-label="Issues"><nav className="repo-issues-saved" aria-label="Saved issue views"><a href={base} aria-current={!closed ? "page" : undefined}>Open</a></nav><div className="repo-issues-toolbar"><form className="repo-issues-search" action={base}><Search size={16} aria-hidden="true"/><label className="repo-ui-sr" htmlFor="repo-issues-query">Filter issues</label><input className="repo-ui-input" id="repo-issues-query" name="q" defaultValue={query} placeholder="Search all issues"/></form>{write}</div>
    {data.github?.stale && <p role="status">Stale{data.github.syncedAt && ` · synced ${ageLabel(data.github.syncedAt)}`}</p>}
    {data.github?.refusal && <div role="alert"><p>{data.github.refusal}</p><button className="repo-ui-btn" onClick={retry}>Retry</button></div>}
    <div className="repo-ui-box repo-issues-list"><div className="repo-ui-box-header repo-issues-list-heading"><nav className="repo-issues-status-toggle" aria-label="Issue state">{[false, true].map(value => <a key={String(value)} href={`${base}?q=is:${value ? "closed" : "open"}`} aria-current={closed === value ? "page" : undefined}><StateIcon state={value ? "closed" : "open"}/>{value ? "Closed" : "Open"} <Counter count={data.issues.filter(row => (row.state !== "open") === value).length}/></a>)}</nav></div>
      {rows.length ? <div role="list" aria-label="Issues">{rows.map(item => <div className="repo-ui-row repo-issues-list-row" role="listitem" key={`${item.source}-${item.number}`}><div className="repo-issues-row-top"><StateIcon state={item.state}/><div className="repo-issues-row-content"><div className="repo-issues-row-title"><a href={`${base}/${item.number}?source=${item.source ?? "smithers-cloud"}`}>{item.title}</a>{item.labels?.map(name => <LabelChip key={name} name={name}/>)}</div><div className="repo-issues-row-meta">#{item.number} opened <RelTime date={item.createdAt}/>{item.author && ` by ${item.author}`}</div></div><div className="repo-issues-row-counts"><span aria-label={`${item.comments} comments`}>{item.comments}</span></div></div></div>)}</div> : <div className="repo-frame-state"><h2>{data.issues.length ? "No issues match your filters" : "No issues yet"}</h2></div>}
    </div></section>
}
