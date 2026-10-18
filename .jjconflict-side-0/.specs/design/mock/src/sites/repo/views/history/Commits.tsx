import { pluralize } from "../../ui/pluralize"
import { useEffect } from "react"
import { useLocation, Link, navigate } from "../../../core/router"
import { registerSlash, useView, Loading, Failed, Empty } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { commits, file, fmtDate, history, people, repo, shortSha, to, tree } from "../../fixtures"
import type { Commit } from "../../fixtures/types"
import { AgentMark, Box, BranchPicker, CopyButton, PersonChip, RelTime, Row, StateIcon } from "../../ui"
import { HistoryIcon as Icon, useHistoryCommands } from "./shared"

export const CommitsLoading = () => <Loading rows={9} />
export const CommitsError = () => <Failed what="commits" reason="The repository host didn't return commit history." />
export const CommitsEmpty = ({ reference = repo.defaultBranch, path = "" }: { reference?: string; path?: string }) => path ? (
  <Empty title={`No changes to this file in the last ${commits.length} commits`} action={
    <a className="repo-ui-btn" href={`${repo.github ?? `https://github.com/${repo.slug}`}/commits/${encodeURIComponent(reference)}/${path.split("/").map(encodeURIComponent).join("/")}`} target="_blank" rel="noopener noreferrer">Full history on GitHub ↗</a>
  } />
) : <Empty title="No commits found." />

const ChecksSummary = ({ item }: { item: Commit }) => {
  const state = item.checks.some(check => check.state === "failure") ? "failure"
    : item.checks.some(check => check.state === "pending") ? "pending"
    : item.checks.length && item.checks.every(check => check.state === "skipped") ? "skipped" : "success"
  if (!item.checks.length) return null
  return (
    <Link
      className="repo-history-check-summary"
      to={to("commit/" + item.sha + "?checks=1")}
      aria-label={state + " checks for " + shortSha(item.sha)}
      title={item.checks.map(check => check.name + ": " + check.state + " — " + check.detail).join("\n")}
    >
      <StateIcon state={state} size={16} />
    </Link>
  )
}

const CommitRow = ({ item }: { item: Commit }) => (
  <Row className="repo-history-commit-row">
    <div className="repo-history-commit-main">
      <Link className="repo-history-commit-title" to={to("commit/" + item.sha)}>
        {item.title}
      </Link>
      <div className="repo-history-meta">
        <PersonChip login={item.author} />
        {item.agent && <AgentMark agent={item.agent} />}
        <span>committed <RelTime date={item.date} /></span>
      </div>
    </div>
    <div className="repo-history-commit-actions">
      <ChecksSummary item={item} />
      {item.verified && <span className="repo-history-verified">Verified</span>}
      <Link className="repo-history-sha" to={to("commit/" + item.sha)}>{shortSha(item.sha)}</Link>
      <CopyButton text={item.sha} label="Copy SHA" small />
      <Link
        className="repo-ui-icon-btn"
        to={to("tree/" + item.sha)}
        title="Browse files at this commit"
        aria-label={"Browse files at " + shortSha(item.sha)}
      >
        <Icon name="folder" />
      </Link>
    </div>
  </Row>
)

export const CommitsReady = ({ reference, path = "" }: { reference: string; path?: string }) => {
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const author = query.get("author") ?? ""
  const agentOnly = query.get("agent") === "1"
  const page = Math.max(0, Number(query.get("page") ?? 0) || 0)
  const update = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(query)
    Object.entries(values).forEach(([key, value]) => {
      if (value === null) next.delete(key)
      else next.set(key, value)
    })
    navigate(location.split("?")[0] + "?" + next)
  }
  const all = history(reference, path).filter(item => (!author || item.author === author) && (!agentOnly || item.agent))
  const maxPage = Math.max(0, Math.ceil(all.length / 30) - 1)
  const currentPage = Math.min(Math.floor(page), maxPage)
  const visible = all.slice(currentPage * 30, currentPage * 30 + 30)
  const groups = new Map<string, Commit[]>()
  for (const item of visible) {
    const day = item.date.slice(0, 10)
    groups.set(day, [...(groups.get(day) ?? []), item])
  }
  const authors = people.filter(who => history(reference, path).some(item => item.author === who.login))
  useEffect(() => {
    const dispose = [
      registerSlash("commits.filter", {
        purpose: "Filter commit history", access: "public", confirm: false,
        fields: [{ name: "filter", label: "Filter", placeholder: "agent or author:login" }],
        run: ({ filter }) => {
          if (filter === "agent") update({ agent: agentOnly ? null : "1", page: null })
          else if (filter.startsWith("author:")) update({ author: filter === "author:all" ? null : filter.slice(7), page: null })
          else throw new Error("Use agent or author:login.")
        }
      }),
      registerSlash("commits.page", {
        purpose: "Change commit page", access: "public", confirm: false,
        fields: [{ name: "direction", label: "Page", options: ["newer", "older"] }],
        run: ({ direction }) => {
          update({ page: String(Math.max(0, Math.min(maxPage, currentPage + (direction === "older" ? 1 : -1)))) })
          window.scrollTo(0, 0)
        }
      })
    ]
    return () => dispose.forEach(cleanup => cleanup())
  }, [location, reference, path, agentOnly, currentPage, maxPage])
  return (
    <div className="repo-history-stack">
      <div className="repo-history-toolbar">
        <BranchPicker
          currentRef={reference}
        />
        {path ? (
          <span className="repo-history-path">
            History for <Link to={to((tree.some(entry => entry.path === path && entry.kind === "file") ? "blob/" : "tree/") + encodeURIComponent(reference) + "/" + path)}>{path}</Link>
          </span>
        ) : <h1 className="repo-history-heading">Commits</h1>}
        <span className="repo-history-spacer" />
        <span className="repo-history-muted repo-history-count">{path && !all.length ? `Last ${commits.length} commits` : `${all.length} ${pluralize(all.length, "commit")}`}</span>
      </div>
      <div className="repo-history-filters" aria-label="Commit filters">
        <span className="repo-history-muted">Author</span>
        <button
          className="repo-ui-btn repo-history-chip"
          aria-pressed={!author}
          title="/commits.filter author:all"
          onClick={() => update({ author: null, page: null })}
        >
          All
        </button>
        {authors.map(who => (
          <button
            key={who.login}
            className="repo-ui-btn repo-history-chip"
            aria-pressed={author === who.login}
            title={"/commits.filter author:" + who.login}
            onClick={() => update({ author: author === who.login ? null : who.login, page: null })}
          >
            {who.login}
          </button>
        ))}
        <button
          className="repo-ui-btn repo-history-chip repo-history-agent-filter"
          aria-pressed={agentOnly}
          title="/commits.filter agent"
          onClick={() => update({ agent: agentOnly ? null : "1", page: null })}
        >
          <Icon name="agent" size={14} />
          Agent-made only
        </button>
      </div>
      {!visible.length ? author || agentOnly ? <Empty title="No commits match these filters." /> : <CommitsEmpty reference={reference} path={path} /> : (
        <div className="repo-history-days">
          {[...groups.entries()].map(([day, items]) => (
            <section className="repo-history-day" key={day}>
              <h2><Icon name="change" size={16} />Commits on {fmtDate(day)}</h2>
              <Box>{items.map(item => <CommitRow key={item.sha} item={item} />)}</Box>
            </section>
          ))}
        </div>
      )}
      {maxPage > 0 && (
        <nav className="repo-history-pagination" aria-label="Commit pages">
          <button
            className="repo-ui-btn"
            title="/commits.page newer"
            disabled={currentPage === 0}
            onClick={() => { update({ page: String(currentPage - 1) }); window.scrollTo(0, 0) }}
          >
            <Icon name="arrow-left" size={14} />Newer
          </button>
          <span className="repo-history-muted">{currentPage + 1} / {maxPage + 1}</span>
          <button
            className="repo-ui-btn"
            title="/commits.page older"
            disabled={currentPage === maxPage}
            onClick={() => { update({ page: String(currentPage + 1) }); window.scrollTo(0, 0) }}
          >
            Older<Icon name="chevron" size={14} />
          </button>
        </nav>
      )}
    </div>
  )
}

export const Commits = ({ reference, path: requestedPath }: { reference: string; path?: string }) => {
  const path = requestedPath ? file(requestedPath)?.path ?? requestedPath : undefined
  useHistoryCommands()
  const state = useView("commits:" + repo.slug + ":" + reference + ":" + (path ?? ""))
  return (
    <RepoFrame tab="code" title={"Commits · " + repo.slug} askView="commits" askContext={path || reference}>
      <div className="repo-history-page">
        {state === "loading" ? <CommitsLoading />
          : state === "error" ? <CommitsError />
          : state === "empty" ? <CommitsEmpty reference={reference} path={path} />
          : <CommitsReady key={repo.slug + reference + path} reference={reference} path={path} />}
      </div>
    </RepoFrame>
  )
}
