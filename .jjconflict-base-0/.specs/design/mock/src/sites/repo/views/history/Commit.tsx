import { pluralize } from "../../ui/pluralize"
import { useEffect } from "react"
import { Link, useLocation } from "../../../core/router"
import { registerSlash, useView, Loading, Failed, Empty } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { commit, commits, issue, pull, repo, run, shortSha, to } from "../../fixtures"
import type { Commit, DiffFile } from "../../fixtures/types"
import { AgentMark, Box, CopyButton, Markdown, PersonChip, RelTime, Row, StateIcon } from "../../ui"
import { HistoryIcon as Icon, useHistoryCommands } from "./shared"

export const CommitLoading = () => <Loading variant="detail" rows={7} />
export const CommitError = () => <Failed what="this commit" reason="The repository host didn't return the commit or its diff." />
export const CommitEmpty = ({ sha }: { sha: string }) => <Empty title="Commit not found." action={<Link className="repo-ui-btn repo-ui-btn-primary" to={to("commits/" + repo.defaultBranch)}>Open commits</Link>}><p className="repo-history-missing-sha">{sha}</p></Empty>

const AgentReceipt = ({ item }: { item: Commit }) => {
  if (!item.agent) return null
  const linkedPull = item.pull ? pull(item.pull) : undefined
  const linkedRun = run(item.agent.run)
  const fixed = linkedPull?.fixes ?? (linkedRun?.issue ? [linkedRun.issue] : [])
  const reviewers = linkedPull?.reviews.filter(review => review.state === "approved" && !review.agent) ?? []
  return (
    <Box className="repo-history-receipt" header={<><Icon name="agent" size={15} />Agent receipt</>}>
      <dl className="repo-history-facts">
        <div>
          <dt>Run</dt>
          <dd><Link to={to("runs/" + item.agent.run)}>{item.agent.run}</Link></dd>
        </div>
        {linkedPull && fixed.length > 0 && (
          <div>
            <dt>{linkedPull?.merged ? "Fixed" : "Addresses"}</dt>
            <dd>
              {fixed.map(n => (
                <Link key={n} to={to("issues/" + n)}>#{n} {issue(n)?.title}</Link>
              ))}
            </dd>
          </div>
        )}
        {linkedPull && <><div>
          <dt>{reviewers.length ? "Reviewed by" : "Review"}</dt>
          <dd>{reviewers.length
            ? reviewers.map(review => <PersonChip key={review.author} login={review.author} />)
            : <span className="repo-history-muted">Evidence unavailable</span>}
          </dd>
        </div>
        <div>
          <dt>{linkedPull?.merged ? "Merged by" : "Merge"}</dt>
          <dd>
            {linkedPull?.merged ? (
              <>
                <PersonChip login={linkedPull.merged.by} />
                <Link to={to("pull/" + linkedPull.n)}>#{linkedPull.n}</Link>
                <RelTime date={linkedPull.merged.date} />
              </>
            ) : <span className="repo-history-muted">Evidence unavailable</span>}
          </dd>
        </div></>}
        {!linkedPull && item.branches.includes(repo.defaultBranch) && <div>
          <dt>On {repo.defaultBranch}</dt>
          <dd><Link to={to("commit/" + item.sha)}><code>{shortSha(item.sha)}</code></Link></dd>
        </div>}
      </dl>
    </Box>
  )
}

const CommitChecks = ({ item }: { item: Commit }) => (
  <Box header={`${item.checks.length} ${pluralize(item.checks.length, "check")}`} id="repo-history-checks">
    {item.checks.map(check => (
      <Row className="repo-history-check" key={check.name}>
        <StateIcon state={check.state} />
        <div>
          <strong>{check.name}</strong>
          <p className="repo-history-muted">{check.detail}</p>
        </div>
        <span className="repo-history-spacer" />
        <span className="repo-history-muted">{check.state}</span>
        {check.duration && <span className="repo-history-muted">{check.duration}</span>}
        {check.run && <Link to={to("runs/" + check.run)} aria-label={"Open " + check.name + " run"}>Details</Link>}
      </Row>
    ))}
  </Box>
)

/* Local DiffView adds line permalinks and View file, absent from the shared DiffView contract. */
const HistoryDiffFile = ({ file, sha, selectedFile, selectedLine }: {
  file: DiffFile
  sha: string
  selectedFile: string | null
  selectedLine: string | null
}) => {
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const lineRoute = (line: string) => {
    const next = new URLSearchParams(query)
    next.set("file", file.path)
    next.set("L", line)
    return to("commit/" + sha + "?" + next)
  }
  return (
    <details className="repo-history-diff" open id={"repo-history-file-" + file.path}>
      <summary title={"/diff.toggle " + file.path}>
        <Icon name="chevron-down" size={13} />
        <span className="repo-history-diff-path">{file.from ? file.from + " → " : ""}{file.path}</span>
        <span className="repo-history-add">+{file.additions}</span>
        <span className="repo-history-del">−{file.deletions}</span>
      </summary>
      <div className="repo-history-diff-tools">
        <span className="repo-history-muted">{file.status} · Unified</span>
        <Link
          className="repo-ui-btn repo-ui-btn-quiet"
          to={to("blob/" + (file.status === "deleted" ? commit(sha)?.parents[0] ?? sha : sha) + "/" + file.path)}
        >
          {file.status === "deleted" ? "View previous file" : "View file"}
        </Link>
      </div>
      <div className="repo-history-diff-scroll">
        <pre>{file.lines.map((line, i) => {
          return (
            <span
              className={"repo-history-diff-line repo-history-diff-" + line.kind}
              key={i}
              data-selected={selectedFile === file.path
                && (selectedLine === "R" + line.new || selectedLine === "L" + line.old) || undefined}
            >
              {line.old ? (
                <Link
                  id={"repo-history-line-" + file.path + "-L" + line.old}
                  to={lineRoute("L" + line.old)}
                  aria-label={file.path + " old line " + line.old}
                >
                  {line.old}
                </Link>
              ) : <span />}
              {line.new ? (
                <Link
                  id={"repo-history-line-" + file.path + "-R" + line.new}
                  to={lineRoute("R" + line.new)}
                  aria-label={file.path + " line " + line.new}
                >
                  {line.new}
                </Link>
              ) : <span />}
              <code>{line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}{line.text || " "}</code>
            </span>
          )
        })}</pre>
      </div>
    </details>
  )
}

const HistoryDiffView = ({ item }: { item: Commit }) => {
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const selectedFile = query.get("file")
  const selectedLine = query.get("L")
  const additions = item.files.reduce((sum, file) => sum + file.additions, 0)
  const deletions = item.files.reduce((sum, file) => sum + file.deletions, 0)
  useEffect(() => registerSlash("diff.toggle", {
    purpose: "Collapse or expand a diff", access: "public", confirm: false,
    fields: [{ name: "path", label: "File", options: item.files.map(file => file.path) }],
    run: ({ path }, { closeAsk }) => {
      const target = document.getElementById("repo-history-file-" + path) as HTMLDetailsElement | null
      if (target) { closeAsk(); target.open = !target.open; target.scrollIntoView({ block: "nearest" }) }
    }
  }), [item.sha])
  useEffect(() => {
    if (!selectedFile) return
    const target = document.getElementById(selectedLine
      ? "repo-history-line-" + selectedFile + "-" + selectedLine
      : "repo-history-file-" + selectedFile)
    const details = target?.closest("details")
    if (details) details.open = true
    const frame = requestAnimationFrame(() => {
      target?.scrollIntoView({ block: "start", behavior: "instant" })
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedFile, selectedLine])
  return (
    <section className="repo-history-stack" aria-label="Commit diff">
      <div className="repo-history-diff-heading">
        <h2>{item.files.length} changed {pluralize(item.files.length, "file")}</h2>
        <span className="repo-history-add">+{additions}</span>
        <span className="repo-history-del">−{deletions}</span>
      </div>
      <div className="repo-history-diff-layout">
        <aside className="repo-history-file-list" aria-label="Changed files">
          {item.files.map(file => (
            <Link
              key={file.path}
              to={to("commit/" + item.sha + "?file=" + encodeURIComponent(file.path))}
              aria-current={selectedFile === file.path ? "location" : undefined}
            >
              <Icon name="file" size={14} />
              <span>{file.path}</span>
              <span className="repo-history-add">+{file.additions}</span>
              <span className="repo-history-del">−{file.deletions}</span>
            </Link>
          ))}
        </aside>
        <div className="repo-history-stack">
          {item.files.map(file => (
            <HistoryDiffFile
              key={file.path}
              file={file}
              sha={item.sha}
              selectedFile={selectedFile}
              selectedLine={selectedLine}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export const CommitReady = ({ item }: { item: Commit }) => {
  const location = useLocation()
  const linkedPull = item.pull ? pull(item.pull) : undefined
  const firstBranch = item.branches.includes(repo.defaultBranch) ? repo.defaultBranch : item.branches[0]
  const otherBranches = item.branches.filter(name => name !== firstBranch)
  const branchLink = (name: string) => <Link key={name} to={to("tree/" + encodeURIComponent(name))}>{name}</Link>
  const child = commits.find(candidate => candidate.parents.includes(item.sha))
  useEffect(() => {
    if (new URLSearchParams(location.split("?")[1]).has("checks")) {
      document.getElementById("repo-history-checks")?.scrollIntoView({ block: "center" })
    }
  }, [location])
  return (
    <div className="repo-history-stack">
      <header className="repo-history-commit-header">
        <div>
          <span className="repo-history-eyebrow">Commit {shortSha(item.sha)}</span>
          <h1>{item.title}</h1>
        </div>
        <Link className="repo-ui-btn repo-ui-btn-primary" title={"/code.browse " + item.sha} to={to("tree/" + item.sha)}>
          Browse files
        </Link>
      </header>
      {item.body && <Markdown source={item.body} />}
      <Box>
        <Row className="repo-history-author-row">
          <PersonChip login={item.author} />
          {item.agent && <AgentMark agent={item.agent} />}
          <RelTime date={item.date} />
          <span className="repo-history-spacer" />
          {item.verified && <span className="repo-history-verified">Verified</span>}
          <CopyButton text={item.sha} label={shortSha(item.sha)} small />
        </Row>
        {item.agent && (
          <div className="repo-history-agent-credit">
            Made by {item.author} in <Link to={to("runs/" + item.agent.run)}>run {item.agent.run}</Link>
            {(item.agent.for === item.author ? "" : " for " + item.agent.for) + " · " + item.agent.harness}
          </div>
        )}
        <dl className="repo-history-facts">
          <div>
            <dt>{pluralize(item.parents.length, "Parent")}</dt>
            <dd>{item.parents.length ? item.parents.map(sha => (
              <Link className="repo-history-sha" key={sha} to={to("commit/" + sha)}>{shortSha(sha)}</Link>
            )) : <span className="repo-history-muted">Initial commit</span>}</dd>
          </div>
          <div>
            <dt>Branches</dt>
            <dd className="repo-history-commit-branches">
              {firstBranch && branchLink(firstBranch)}
              <span className="repo-history-branches-desktop">{otherBranches.map(branchLink)}</span>
              {otherBranches.length > 0 && <details className="repo-history-more-branches"><summary>{otherBranches.length} more {pluralize(otherBranches.length, "branch", "branches")}</summary><div>{otherBranches.map(branchLink)}</div></details>}
            </dd>
          </div>
          {linkedPull && (
            <div>
              <dt>{linkedPull.kind === "landing" ? "Landing" : "Pull request"}</dt>
              <dd>
                <StateIcon state={linkedPull.state} />
                <Link to={to("pull/" + linkedPull.n)}>#{linkedPull.n} {linkedPull.title}</Link>
              </dd>
            </div>
          )}
        </dl>
      </Box>
      {item.agent && <AgentReceipt item={item} />}
      {item.checks.length > 0 && <CommitChecks item={item} />}
      <HistoryDiffView item={item} />
      <nav className="repo-history-prev-next" aria-label="Adjacent commits">
        {item.parents[0] && (
          <Link to={to("commit/" + item.parents[0])}><Icon name="arrow-left" size={14} />Previous commit</Link>
        )}
        <span className="repo-history-spacer" />
        {child && <Link to={to("commit/" + child.sha)}>Next commit<Icon name="chevron" size={14} /></Link>}
      </nav>
    </div>
  )
}

export const CommitPage = ({ sha }: { sha: string }) => {
  useHistoryCommands()
  const state = useView("commit:" + repo.slug + ":" + sha)
  const item = commit(sha)
  return (
    <RepoFrame tab="code" title={(item?.title ?? "Commit") + " · " + repo.slug} askView="commit" askContext={"commit " + shortSha(sha)}>
      <div className="repo-history-page">
        {state === "loading" ? <CommitLoading />
          : state === "error" ? <CommitError />
          : state === "empty" || !item ? <CommitEmpty sha={sha} />
          : <CommitReady key={item.sha} item={item} />}
      </div>
    </RepoFrame>
  )
}
