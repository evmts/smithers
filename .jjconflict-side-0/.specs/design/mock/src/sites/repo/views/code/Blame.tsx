import { pluralize } from "../../ui/pluralize"
import { useState } from "react"
import { Link, navigate, useLocation } from "../../../core/router"
import { blame, branch, commit, file, MOCK_NOW, repo, shortSha, to } from "../../fixtures"
import type { BlameRange, FileBlob } from "../../fixtures/types"
import { Empty, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { AgentMark, Box, Icon, PersonChip, RelTime } from "../../ui"
import { CodeView, useLineSelection } from "./CodeView"
import { MakeTodo, SelectionActions, useCodeActions } from "./File"
import { CodeError, CodeLoading, CodeNotFound } from "./Tree"
import { byteSize, FileTree, LatestCommit, latestCommitFor, linesOf, PathHeader, sourceRoute } from "./shared"

export const BlameEmpty = () => <Empty title="No line history for this file." />
export const BlameHistoricalUnavailable = ({ path, revision }: { path: string; revision: string }) => (
  <Empty title={`No file snapshot at ${shortSha(revision)}`}>
    <p>Historical file contents aren't included in this mock.</p>
    <Link className="repo-ui-btn" to={sourceRoute("blame", repo.defaultBranch, path)}>Back to {repo.defaultBranch}</Link>
  </Empty>
)

const BlameAttribution = ({ range, path }: { range: BlameRange; path: string }) => {
  const entry = commit(range.sha)
  if (!entry) return <span className="repo-code-blame-meta">Commit {shortSha(range.sha)} unavailable</span>
  const parent = entry.parents[0]
  const agentLabel = entry.agent
    ? `written by ${entry.author} in run ${entry.agent.run} for ${entry.agent.for}`
    : undefined
  return (
    <div className="repo-code-blame-meta">
      <Link className="repo-code-blame-title" to={to(`commit/${entry.sha}`)}>{entry.title}</Link>
      <div className="repo-code-blame-person">
        <PersonChip login={entry.author} compact />
        <span>{entry.author}</span>
        <RelTime date={entry.date} />
      </div>
      <div className="repo-code-blame-links">
        <Link className="repo-code-sha" to={to(`commit/${entry.sha}`)}>{shortSha(entry.sha)}</Link>
        {parent && (
          <Link
            className="repo-code-prior"
            to={`${sourceRoute("blame", parent, path)}?prior=1&L=${range.start}`}
            title="Blame prior to this change"
            aria-label={`Blame lines ${range.start}-${range.end} prior to ${shortSha(entry.sha)}`}
          >
            <Icon name="clock" size={13} />
            Prior
          </Link>
        )}
      </div>
      {entry.agent && (
        <span className="repo-code-blame-agent" title={agentLabel} aria-label={agentLabel}>
          <AgentMark agent={entry.agent} />
        </span>
      )}
    </div>
  )
}

export const BlameReady = ({ blob, revision }: { blob: FileBlob; revision: string }) => {
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const { selected, select } = useLineSelection(linesOf(blob.content).length)
  const [created, setCreated] = useState(false)
  const ranges = blame(blob.path)
  const todo = query.get("todo") === "1"
  const setTodo = (open: boolean) => {
    const next = new URLSearchParams(location.split("?")[1])
    if (open) next.set("todo", "1")
    else next.delete("todo")
    navigate(`${location.split("?")[0]}?${next}`, { replace: true })
  }
  const onTodo = () => setTodo(true)
  const actions = useCodeActions({ path: blob.path, revision, selected, onTodo })
  return (
    <>
      <PathHeader path={blob.path} revision={revision}>
        <button
          className="repo-ui-btn repo-code-permalink"
          title="/file.permalink"
          aria-label="Copy permalink"
          onClick={() => void actions.copyPermalink()}
        >
          <Icon name="copy" size={14} />
          <span>Copy permalink</span>
        </button>
      </PathHeader>
      <Box header={latestCommitFor(revision, blob.path) && <LatestCommit revision={revision} path={blob.path} />}>
        <div className="repo-code-file-toolbar">
          <nav className="repo-code-segmented" aria-label="File view">
            <Link className="repo-code-segment" to={`${sourceRoute("blob", revision, blob.path)}${selected ? `?L=${selected.start}-${selected.end}` : ""}`}>Code</Link>
            <Link className="repo-code-segment" aria-current="page" to={sourceRoute("blame", revision, blob.path)}>Blame</Link>
          </nav>
          <span className="repo-code-file-stats">{linesOf(blob.content).length} {pluralize(linesOf(blob.content).length, "line")}<span className="repo-code-file-bytes"> · {byteSize(blob.content)}</span></span>
          <span className="repo-code-toolbar-spacer" />
          <Link className="repo-code-toolbar-link" to={to(`commits/${encodeURIComponent(revision)}/${blob.path}`)}>
            <Icon name="clock" size={14} /> History
          </Link>
        </div>
        <SelectionActions selected={selected} onTodo={onTodo} {...actions} />
        <div className="repo-code-blame-ranges" aria-label="Line history">
          {ranges.map(range => {
            const entry = commit(range.sha)
            const age = entry ? Math.max(0, (Date.parse(MOCK_NOW) - Date.parse(entry.date)) / 86400000) : 180
            const strength = Math.round(Math.max(12, 80 - age * 1.5))
            return (
              <section
                className="repo-code-blame-range"
                key={`${range.start}-${range.sha}`}
                aria-label={`Lines ${range.start}-${range.end}`}
                style={{ borderLeftColor: `color-mix(in srgb, var(--brand) ${strength}%, var(--border))` }}
              >
                <BlameAttribution range={range} path={blob.path} />
                <CodeView
                  blob={blob}
                  revision={revision}
                  selected={selected}
                  onSelect={select}
                  startLine={range.start}
                  endLine={range.end}
                />
              </section>
            )
          })}
        </div>
      </Box>
      {todo && (
        <MakeTodo
          path={blob.path}
          selected={selected ?? { start: 1, end: 1 }}
          onClose={() => setTodo(false)}
          onCreated={() => setCreated(true)}
        />
      )}
      {created && (
        <div className="repo-code-todo-toast" role="status">
          <span>TODO added to the <Link to={to("stack")}>Stack</Link></span>
          <button className="repo-ui-icon-btn" title="/notice.dismiss" aria-label="Dismiss notification" onClick={() => setCreated(false)}>×</button>
        </div>
      )}
    </>
  )
}

export const BlameView = ({ path: requestedPath, revision }: { path: string; revision: string }) => {
  const blob = file(requestedPath)
  const path = blob?.path ?? requestedPath
  const location = useLocation()
  const state = useView(`blame:${repo.slug}:${revision}:${path}`)
  const prior = new URLSearchParams(location.split("?")[1]).has("prior")
  const historical = prior && revision !== branch(repo.defaultBranch)?.head
  const content = state === "loading" ? <CodeLoading />
    : state === "error" ? <CodeError path={path} />
    : !blob ? <CodeNotFound path={path} revision={revision} />
    : historical ? <BlameHistoricalUnavailable path={path} revision={revision} />
    : state === "empty" || !blame(path).length ? <BlameEmpty />
    : <BlameReady key={`${repo.slug}:${revision}:${path}`} blob={blob} revision={revision} />
  return (
    <RepoFrame tab="code" title={`Blame · ${path} · ${repo.slug}`} askView={`blame/${revision}/${path}`} askContext={`Line history of ${path} at ${revision}`}>
      <div className="repo-code-layout" data-sidebar={state === "ready"}>
        {state === "ready" && <FileTree key={`${repo.slug}:${path}`} path={path} revision={revision} />}
        <div className="repo-code-main">
          {state !== "ready" || !blob || historical || !blame(path).length ? <PathHeader path={path} revision={revision} /> : null}
          {content}
        </div>
      </div>
    </RepoFrame>
  )
}
