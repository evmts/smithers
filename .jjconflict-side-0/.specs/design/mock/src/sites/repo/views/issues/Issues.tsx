import { pluralize } from "../../ui/pluralize"
import { WriteControl } from "../../frame/WriteControl"
import { useEffect, useState, type ReactNode } from "react"
import { Icon } from "../../../app/lib"
import { MAYA } from "../../../core/catalog"
import { useMock } from "../../../core/mock"
import { Link, navigate, useLocation } from "../../../core/router"
import { labels, people, repo, to } from "../../fixtures"
import type { Issue } from "../../fixtures/types"
import { Empty, Failed, Loading, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { Box, LabelChip, PersonChip, RelTime, Row, StateIcon } from "../../ui"
import { useIssueCommands } from "./commands"
import { latestReceiptDate, matchesIssue, queryTokens, stageFor, todoFor, updateQuery, useIssues } from "./model"
import { CommentCount, FactoryReceipt, IssueLabels } from "./shared"
import { useGitHubSync } from "../../frame/githubSync"

export const IssuesLoading = () => <Loading rows={9}/>
export const IssuesError = () => (
  <Failed what="issues" reason={useGitHubSync().failure}/>
)
export const IssuesEmpty = ({ fixed = false }: { fixed?: boolean }) => (
  <Empty title={fixed ? "No issues fixed by agents yet." : "No issues yet"} action={
    <WriteControl primary act="create issues"><Link to={to("issues/new")} className="repo-ui-btn repo-ui-btn-primary" title="/issue.new">New issue</Link></WriteControl>
  }/>
)
export const IssuesNoResults = ({ onClear }: { onClear: () => void }) => (
  <Empty title="No issues match your filters" action={
    <button type="button" className="repo-ui-btn" title="/issues.filter is:open" onClick={onClear}>Clear filters</button>
  }/>
)

const FilterMenu = ({ name, command, children }: { name: string; command: string; children: ReactNode }) => (
  <details className="repo-ui-dropdown repo-issues-filter-menu">
    <summary className="repo-issues-filter-trigger" title={command}>
      {name}<Icon name="chevron-down" size={12}/>
    </summary>
    <div className="repo-ui-menu">{children}</div>
  </details>
)
const MenuOption = ({ title, children, onSelect }: { title: string; children: ReactNode; onSelect: () => void }) => (
  <button type="button" className="repo-ui-menu-item" title={title} onClick={event => {
    const menu = event.currentTarget.closest("details")
    if (menu) menu.open = false
    onSelect()
  }}>{children}</button>
)

export const IssueListRow = ({ item, evidence = false }: { item: Issue; evidence?: boolean }) => {
  const stage = stageFor(item)
  return (
    <Row className="repo-issues-list-row" role="listitem">
      <div className="repo-issues-row-top">
        <StateIcon state={item.state}/>
        <div className="repo-issues-row-content">
          <div className="repo-issues-row-title">
            <Link to={to(`issues/${item.n}`)}>{item.title}</Link>
            <IssueLabels names={item.labels}/>
          </div>
          <div className="repo-issues-row-meta">
            <span>#{item.n} {evidence && item.receipt?.landed && <Link className="repo-issues-fix-sha" to={to(`commit/${item.receipt.landed.sha}`)}><code>{item.receipt.landed.sha.slice(0, 7)}</code></Link>}opened <RelTime date={item.opened}/> by {item.author}</span>
            {!evidence && stage && <span className="repo-issues-stage"><i/>{stage}</span>}
          </div>
        </div>
        <div className="repo-issues-row-counts">
          {item.pulls.length > 0 && (
            <Link className="repo-issues-count" to={to(`pull/${item.pulls[0]}`)} title={`${item.pulls.length} linked pull requests`}>
              <Icon name="change" size={15}/><span>{item.pulls.length}</span>
            </Link>
          )}
          <div className="repo-issues-assignees">
            {item.assignees.map(login => <PersonChip key={login} login={login} compact/>)}
          </div>
          <Link to={to(`issues/${item.n}?focus=comments`)}><CommentCount count={item.comments.length}/></Link>
        </div>
      </div>
      {evidence && <FactoryReceipt issue={item} compact/>}
    </Row>
  )
}

export const IssuesReady = ({ items, evidence }: { items: Issue[]; evidence: boolean }) => (
  <div role="list" aria-label="Issues">
    {items.map(item => <IssueListRow key={item.n} item={item} evidence={evidence}/>)}
  </div>
)
export const IssuesSignedOut = (props: { items: Issue[]; evidence: boolean }) => <IssuesReady {...props}/>

const IssuesContent = () => {
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const filter = query.get("q") ?? "is:open"
  const [input, setInput] = useState(filter)
  const { flags } = useMock()
  const state = useView(`issues:${repo.slug}:${filter}`)
  const loaded = useIssues()
  const all = flags.data === "empty" ? [] : loaded
  const fixed = queryTokens(filter).some(token => token.toLowerCase() === "is:fixed-by-agents")
  const hasTodo = /\bis:todo\b/.test(filter)
  const closed = /\bis:closed\b/.test(filter)
  const withoutState = updateQuery(filter, "state", "")
  const filtered = all.filter(item => matchesIssue(item, filter))
  const rows = [...filtered].sort((a, b) => {
    if (fixed) return latestReceiptDate(b) - latestReceiptDate(a) || b.n - a.n
    if (filter.includes("sort:created-asc")) return Date.parse(a.opened) - Date.parse(b.opened)
    if (filter.includes("sort:updated-desc")) return Date.parse(b.updated) - Date.parse(a.updated)
    if (filter.includes("sort:comments-desc")) return b.comments.length - a.comments.length
    return Date.parse(b.opened) - Date.parse(a.opened)
  })
  const openCount = state === "empty" ? 0 : all.filter(item => item.state === "open" && matchesIssue(item, withoutState)).length
  const closedCount = state === "empty" ? 0 : all.filter(item => item.state === "closed" && matchesIssue(item, withoutState)).length
  const milestones = [...new Set(all.flatMap(item => item.milestone ? [item.milestone] : []))]
  const setFilter = (value: string) => {
    const next = new URLSearchParams(query)
    next.set("q", value)
    navigate(`${to("issues")}?${next}`)
  }
  const select = (key: string, value: string) => setFilter(updateQuery(filter, key, value))
  useEffect(() => { setInput(filter) }, [filter])
  const chips = [
    { label: "Open", value: "is:open" },
    ...(flags.as === "in" ? [{ label: "Yours", value: `is:open author:${MAYA.login}` }] : []),
    { label: "Fixed by agents", value: "is:fixed-by-agents" },
    { label: "Has TODO", value: "is:todo" }
  ]
  return (
    <div className="repo-issues-list-page">
      <nav className="repo-issues-saved" aria-label="Saved issue views">
        {chips.map(chip => (
          <Link key={chip.label} to={to(`issues?q=${encodeURIComponent(chip.value)}`)}
            aria-current={filter === chip.value ? "page" : undefined}>
            {chip.label}
            {chip.label === "Has TODO" && <span className="repo-issues-chip-count">{all.filter(item => todoFor(item)).length}</span>}
          </Link>
        ))}
      </nav>
      <div className="repo-issues-toolbar">
        <form className="repo-issues-search" onSubmit={event => { event.preventDefault(); setFilter(input) }}>
          <label className="repo-ui-sr" htmlFor="repo-issues-query">Filter issues</label>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>
          </svg>
          <input className="repo-ui-input" id="repo-issues-query" value={input}
            onChange={event => setInput(event.target.value)} placeholder="Search all issues"/>
        </form>
        <details className="repo-ui-dropdown repo-issues-directory">
          <summary className="repo-ui-btn" title="/issues.labels">Labels <span>{labels.length}</span></summary>
          <div className="repo-ui-menu">
            {labels.map(label => (
              <Link key={label.name} className="repo-ui-menu-item" to={to(`issues?q=${encodeURIComponent(`is:open label:"${label.name}"`)}`)}>
                <LabelChip label={label}/><span className="repo-ui-muted">{all.filter(item => item.labels.includes(label.name)).length}</span>
              </Link>
            ))}
          </div>
        </details>
        <details className="repo-ui-dropdown repo-issues-directory">
          <summary className="repo-ui-btn" title="/issues.milestones">Milestones</summary>
          <div className="repo-ui-menu">
            {milestones.length ? milestones.map(milestone => (
              <div className="repo-issues-milestone" key={milestone}>
                <strong>{milestone}</strong>
                <span className="repo-ui-muted">{all.filter(item => item.milestone === milestone && item.state === "open").length} open</span>
              </div>
            )) : <p className="repo-ui-muted">No milestones yet.</p>}
          </div>
        </details>
        {state !== "empty" && (
          <WriteControl primary act="create issues"><Link className="repo-ui-btn repo-ui-btn-primary" title="/issue.new" to={to("issues/new")}>New issue</Link></WriteControl>
        )}
      </div>
      {hasTodo && <p className="repo-issues-view-note"><Link to={to("stack")}>Open the Stack <Icon name="chevron" size={13}/></Link></p>}
      {state === "loading" ? <IssuesLoading/> : state === "error" ? <IssuesError/> : state === "empty" ? <IssuesEmpty fixed={fixed}/> : (
        <Box className="repo-issues-list" header={
          <div className="repo-issues-list-heading">
            {fixed ? <span className="repo-issues-results-count">{rows.length} {pluralize(rows.length, "issue")}</span> : <nav className="repo-issues-status-toggle" aria-label="Issue state">
              <Link to={to(`issues?q=${encodeURIComponent(updateQuery(filter, "state", "open"))}`)} aria-current={!closed ? "page" : undefined}>
                <StateIcon state="open" size={16}/>Open <span>{openCount}</span>
              </Link>
              <Link to={to(`issues?q=${encodeURIComponent(updateQuery(filter, "state", "closed"))}`)} aria-current={closed ? "page" : undefined}>
                <Icon name="check" size={15}/>Closed <span>{closedCount}</span>
              </Link>
            </nav>}
            <div className="repo-issues-filters">
              <FilterMenu name="Author" command="/issues.filter author:">
                <MenuOption title="/issues.filter author:any" onSelect={() => select("author", "")}>Anyone</MenuOption>
                {people.map(who => (
                  <MenuOption key={who.login} title={`/issues.filter author:${who.login}`} onSelect={() => select("author", who.login)}>
                    <PersonChip login={who.login}/>
                  </MenuOption>
                ))}
              </FilterMenu>
              <FilterMenu name="Label" command="/issues.filter label:">
                <MenuOption title="/issues.filter label:any" onSelect={() => select("label", "")}>Any label</MenuOption>
                {labels.map(label => (
                  <MenuOption key={label.name} title={`/issues.filter label:${label.name}`} onSelect={() => select("label", label.name)}>
                    <LabelChip label={label}/>
                  </MenuOption>
                ))}
              </FilterMenu>
              <FilterMenu name="Assignee" command="/issues.filter assignee:">
                <MenuOption title="/issues.filter assignee:any" onSelect={() => select("assignee", "")}>Anyone</MenuOption>
                {people.filter(who => who.kind === "human").map(who => (
                  <MenuOption key={who.login} title={`/issues.filter assignee:${who.login}`} onSelect={() => select("assignee", who.login)}>
                    <PersonChip login={who.login}/>
                  </MenuOption>
                ))}
              </FilterMenu>
              {!fixed && <FilterMenu name="Sort" command="/issues.sort">
                {[
                  ["Newest", "created-desc"], ["Oldest", "created-asc"],
                  ["Recently updated", "updated-desc"], ["Most commented", "comments-desc"]
                ].map(([name, value]) => (
                  <MenuOption key={value} title={`/issues.sort ${value}`} onSelect={() => select("sort", value)}>{name}</MenuOption>
                ))}
              </FilterMenu>}
            </div>
          </div>
        }>
          {rows.length === 0 ? <IssuesNoResults onClear={() => setFilter("is:open")}/> : flags.as === "out" ? (
            <IssuesSignedOut items={rows} evidence={fixed}/>
          ) : <IssuesReady items={rows} evidence={fixed}/>}
        </Box>
      )}
    </div>
  )
}

export const Issues = () => {
  useIssueCommands()
  return (
    <RepoFrame tab="issues" title={`Issues · ${repo.slug}`} askView="issues" askContext={`issues in ${repo.slug}`}>
      <IssuesContent/>
    </RepoFrame>
  )
}
