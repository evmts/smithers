import type { Card } from "../state/AppState"
import { RepositoryMarkdown } from "./CodeHome"
import { Counter, LabelChip, PersonChip, ReadState, RelTime, StateIcon, Tabs } from "./IssueViews"
import { parseUnifiedFile } from "@smthrs/ui/diff-paginate"
import "./pulls.css"

type Pull = Extract<Card, { kind: "pr" }>["payload"]
const isOpen = (state: string) => ["open", "draft"].includes(state)

export function DiffView({ files }: { files: NonNullable<Pull["files"]> }) {
  return <div className="repo-ui-diffs">{files.map(file => {
    const parsed = file.patch === undefined ? undefined : parseUnifiedFile(file.patch)
    return <details className="repo-ui-diff" key={file.path} open><summary><span className="repo-ui-diff-path">{file.oldPath ? `${file.oldPath} → ` : ""}{file.path}</span>{file.additions !== undefined && <span className="repo-ui-add">+{file.additions}</span>}{file.deletions !== undefined && <span className="repo-ui-del">−{file.deletions}</span>}</summary>{parsed && <div className="repo-ui-code-scroll"><pre>{parsed.lines.map((line, i) => <span key={i} className={`repo-ui-diff-line repo-ui-diff-${line.header ? "hunk" : line.kind}`}><span>{line.lnOld ?? ""}</span><span>{line.ln ?? ""}</span><code>{line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}{line.text}</code></span>)}</pre></div>}</details>
  })}</div>
}

export function PullViews({ repo, number, tab = "conversation", card, retry }: { repo: string; number?: number; tab?: "conversation" | "commits" | "checks" | "files"; card?: Card; retry: () => void }) {
  const base = `/${repo}`
  if (!card || card.loading || card.status === "error") return <section aria-label={number === undefined ? "Pull requests" : `Pull request #${number}`}><ReadState card={card} what={number === undefined ? "pull requests" : "this pull request"} retry={retry}/></section>
  if (number === undefined) {
    if (card.kind !== "pr-list") return <ReadState card={card} what="pull requests" retry={retry}/>
    const all = card.payload.landings
    const query = new URLSearchParams(window.location.search).get("q") ?? "is:open"
    const closed = query.includes("is:closed")
    const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []
    const rows = all.filter(item => tokens.every(token => {
      const [key, ...parts] = token.split(":")
      const value = parts.join(":").replace(/^"|"$/g, "")
      if (key === "is" && value === "open") return isOpen(item.state)
      if (key === "is" && value === "closed") return !isOpen(item.state)
      if (key === "is" && value === "draft") return item.draft === true || item.state === "draft"
      if (key === "is" && value === "merged") return item.state === "merged"
      if (key === "author") return item.author === value
      if (key === "label") return item.labels?.includes(value) === true
      return `${item.number} ${item.title}`.toLowerCase().includes(token.toLowerCase())
    }))
    const filterLink = (key: string, value: string) => {
      const rest = tokens.filter(token => !token.startsWith(`${key}:`))
      if (value) rest.push(`${key}:${value.includes(" ") ? `"${value}"` : value}`)
      return `${base}/pulls?q=${encodeURIComponent(rest.join(" "))}`
    }
    const authors = [...new Set(all.flatMap(item => item.author ? [item.author] : []))]
    const labels = [...new Set(all.flatMap(item => item.labels ?? []))]

    return <section className="repo-pulls-page" aria-label="Pull requests"><div className="repo-pulls-topbar"><nav className="repo-pulls-family-nav" aria-label="Pull requests navigation"><a href={`${base}/pulls`} aria-current="page">Pull requests</a></nav></div><form className="repo-pulls-search" action={`${base}/pulls`}><label className="repo-ui-sr" htmlFor="repo-pulls-filter">Filter pull requests</label><input className="repo-ui-input" id="repo-pulls-filter" name="q" defaultValue={query} placeholder="Filter pull requests"/><button className="repo-ui-btn">Search</button></form><div className="repo-ui-box"><div className="repo-ui-box-header repo-pulls-list-controls"><nav className="repo-pulls-open-closed" aria-label="Pull request state">{[false, true].map(value => <a key={String(value)} href={`${base}/pulls?q=is:${value ? "closed" : "open"}`} aria-current={closed === value ? "page" : undefined}><StateIcon state={value ? "closed" : "open"}/>{value ? "Closed" : "Open"} <Counter count={all.filter(item => isOpen(item.state) !== value).length}/></a>)}</nav><div className="repo-pulls-filters">{([["author", "Author", authors], ["label", "Label", labels]] as const).filter(([, , options]) => options.length > 0).map(([key, label, options]) => <label key={String(key)}><span className="repo-ui-sr">{label}</span><select aria-label={String(label)} value={tokens.find(token => token.startsWith(`${key}:`))?.slice(String(key).length + 1).replace(/^"|"$/g, "") ?? ""} onChange={event => window.location.assign(filterLink(String(key), event.target.value))}><option value="">{label}</option>{options.map(value => <option key={value} value={value}>{value}</option>)}</select></label>)}</div></div>{rows.length ? <div role="list" aria-label="Pull requests">{rows.map(item => <div className="repo-ui-row repo-pulls-list-row" role="listitem" key={item.number}><a href={`${base}/pull/${item.number}`} aria-label={`${item.state} pull request ${item.number}`}><StateIcon state={item.state}/></a><div className="repo-pulls-list-main"><div className="repo-pulls-list-title"><a href={`${base}/pull/${item.number}`}>{item.title}</a>{item.labels?.map(name => <LabelChip name={name} key={name}/>)}</div><div className="repo-pulls-meta">#{item.number} opened <RelTime date={item.createdAt}/>{item.author && ` by ${item.author}`}</div></div></div>)}</div> : <div className="repo-frame-state"><h2>{all.length ? "No pull requests match your filters." : "No pull requests."}</h2></div>}</div></section>
  }
  if (card.kind !== "pr") return <ReadState card={card} what="this pull request" retry={retry}/>
  const item = card.payload
  const url = `${base}/pull/${number}`
  const failure = tab === "conversation" ? undefined : item.readErrors?.[tab] ?? (tab === "commits" && item.commits === undefined ? "Commits unavailable." : tab === "files" && item.files === undefined ? "Files unavailable." : undefined)
  const limit = tab === "commits" || tab === "checks" ? item.readLimits?.[tab] : undefined
  return <section className="repo-pulls-page" aria-label={`Pull request #${number}`}>
    <header className="repo-pulls-detail-header"><div className="repo-pulls-title-row"><h1>{item.title} <span>#{number}</span></h1></div><div className="repo-pulls-branch-summary"><span className={`repo-pulls-status repo-pulls-status-${item.state}`}><StateIcon state={item.state}/>{item.draft ? "Draft" : item.state === "merged" ? "Merged" : isOpen(item.state) ? "Open" : "Closed"}</span><p>{item.baseBranch && <>into <a className="repo-pulls-ref" href={`${base}/tree/${encodeURIComponent(item.baseBranch)}`}>{item.baseBranch}</a> </>}{item.branch && <>from <a className="repo-pulls-ref" href={`${base}/tree/${encodeURIComponent(item.branch)}`}>{item.branch}</a> </>}{item.author && `· opened by ${item.author}`}</p></div></header>
    <Tabs label="Pull request" active={tab} items={[{ id: "conversation", label: "Conversation", href: url }, { id: "commits", label: "Commits", href: `${url}/commits`, count: item.commits?.length }, { id: "checks", label: "Checks", href: `${url}/checks`, count: item.readErrors?.checks ? undefined : item.checks.length }, { id: "files", label: "Files changed", href: `${url}/files`, count: item.files?.length }]}/>
    <section aria-label={tab === "files" ? "Files changed" : tab[0]!.toUpperCase() + tab.slice(1)}>
      {failure ? <div className="repo-frame-state" role="alert"><p>{failure}</p><button className="repo-ui-btn" onClick={retry}>Retry</button></div> : <>
        {limit && <p role="status">{limit}</p>}
        {tab === "conversation" ? <div className="repo-pulls-detail-layout"><div className="repo-pulls-conversation"><article className="repo-ui-box"><div className="repo-ui-box-header">{item.author && <PersonChip login={item.author}/>}<RelTime date={item.createdAt}/></div><div className="repo-pulls-card-body"><RepositoryMarkdown content={item.prBody}/></div></article>{item.reviews.map((review, i) => <article className="repo-ui-box" key={i}><div className="repo-ui-box-header">{review.author} · {review.type}</div><RepositoryMarkdown content={review.reviewBody}/></article>)}{isOpen(item.state) && item.sourceRepo !== undefined && <div className="repo-ui-box"><div className="repo-ui-box-header">{!item.draft && !item.readErrors?.checks && !item.readLimits?.checks && item.checks.length > 0 && item.checks.every(check => check.state === "success") && <p>Checks passed.</p>}<a className="repo-ui-btn" href={`https://github.com/${item.sourceRepo}/pull/${number}`} target="_blank" rel="noopener noreferrer">Merge on GitHub ↗</a></div></div>}</div><aside className="repo-ui-sidebar" aria-label="Pull request details">{item.labels !== undefined && <section className="repo-ui-sidebar-section"><h2>Labels</h2>{item.labels.map(name => <LabelChip key={name} name={name}/>)}</section>}{item.reviews.some(review => review.author) && <section className="repo-ui-sidebar-section"><h2>Reviewers</h2>{[...new Set(item.reviews.flatMap(review => review.author ? [review.author] : []))].map(login => <PersonChip key={login} login={login}/>)}</section>}</aside></div>
          : tab === "commits" ? item.commits?.length ? <div className="repo-ui-box" role="list" aria-label="Commits">{item.commits.map((commit, i) => <div className="repo-ui-row" role="listitem" key={i}><strong>{commit.message}</strong><div className="repo-pulls-meta">{commit.author}<RelTime date={commit.timestamp}/>{commit.commitId && <code>{commit.commitId}</code>}</div></div>)}</div> : <div className="repo-frame-state"><h2>No commits.</h2></div>
          : tab === "checks" ? item.checks.length ? <div className="repo-ui-box" role="list" aria-label="Checks">{item.checks.map(check => <div className="repo-ui-row" role="listitem" key={check.context}><StateIcon state={check.state}/><strong>{check.context}</strong><span>{check.state}</span></div>)}</div> : <div className="repo-frame-state"><h2>No checks reported.</h2></div>
          : item.files?.length ? <DiffView files={item.files}/> : <div className="repo-frame-state"><h2>No changed files</h2></div>}
      </>}
    </section>
  </section>
}
