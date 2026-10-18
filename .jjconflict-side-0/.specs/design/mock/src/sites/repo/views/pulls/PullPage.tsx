import { pluralize } from "../../ui/pluralize"
import { WriteControl } from "../../frame/WriteControl"
import { useEffect, useState } from "react"
import { Link, navigate, useLocation } from "../../../core/router"
import { commit, fmtDate, people, pull, repo, run, shortSha, to } from "../../fixtures"
import type { Check, Pull as PullRecord } from "../../fixtures/types"
import { Empty, Failed, Loading, registerSlash, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import {
  AgentMark,
  Box,
  CopyButton,
  Icon,
  LabelChip,
  PersonChip,
  RelTime,
  Row,
  Sidebar,
  SidebarSection,
  StateIcon,
  Tabs,
  toast
} from "../../ui"
import { Conversation } from "./Conversation"
import { PullFiles } from "./PullFiles"
import { Access, FormCard, githubPull, PullStatus, useLocal, type PullDetailProps } from "./shared"

export type PullTab = "conversation" | "commits" | "checks" | "files"

export const PullLoading = () => <Loading variant="detail" rows={7} />
export const PullError = () => (
  <Failed what="this pull request" reason="The repository host didn't return this pull request." />
)
export const PullEmpty = () => (
  <Empty
    title="Pull request not found."
    action={
      <Link className="repo-ui-btn" to={to("pulls")}>
        Pull requests
      </Link>
    }
  />
)

const PullHeader = ({ item, update }: PullDetailProps) => {
  const [edit, setEdit] = useState(false)
  const location = useLocation()
  const conflicts = new URLSearchParams(location.split("?")[1]).get("conflicts") === "1"
  const [title, setTitle] = useState(item.title)
  return (
    <header className="repo-pulls-detail-header">
      <div className="repo-pulls-title-row">
        <h1>
          {item.title} <span>#{item.n}</span>
        </h1>
        <div className="repo-ui-actions">
          <WriteControl><button
            className="repo-ui-btn"
            title={`/pull.edit ${item.n}`}
            onClick={() => setEdit(!edit)}
            aria-expanded={edit}
          >
            Edit
          </button></WriteControl>
          <details className="repo-ui-dropdown repo-pulls-code-menu">
            <summary className="repo-ui-btn" title={`/change.checkout ${item.n}`}>
              Code <Icon name="chevron-down" size={13} />
            </summary>
            <div className="repo-ui-menu">
              <h3>Check out locally</h3>
              {[`smthrs change checkout ${item.n}`, `gh pr checkout ${item.n}`].map((command) => (
                <div className="repo-pulls-command" key={command}>
                  <code>{command}</code>
                  <CopyButton text={command} small />
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
      <div className="repo-pulls-branch-summary">
        <PullStatus state={item.state} />
        <p>
          {item.merged && <>{item.merged.by} merged </>}{!item.commits.length && item.files.length ? "Uncommitted proposal" : `${item.commits.length} ${pluralize(item.commits.length, "commit")}`} into{" "}
          <Link className="repo-pulls-ref" to={to(`tree/${encodeURIComponent(item.base)}`)}>
            {item.base}
          </Link>{" "}
          from{" "}
          <Link className="repo-pulls-ref" to={to(`tree/${encodeURIComponent(item.head)}`)}>
            {item.head}
          </Link>
          {" · opened by "}{item.author}{item.agent && ` for ${item.agent.for}`}
        </p>
      </div>
      {item.state === "open" && (conflicts || item.kind === "landing") && <div className={"repo-pulls-title-status" + (conflicts ? " repo-pulls-danger" : "")} role="status">
        <StateIcon state={conflicts ? "failure" : "pending"} />
        <span>{conflicts ? `Conflicts with ${item.base}` : !item.commits.length ? "Uncommitted proposal" : !item.checks.length || item.checks.some(check => check.state !== "success") ? "Checks incomplete" : `Awaiting ${item.agent?.for ?? item.author}'s merge`}</span>
        <a className="repo-ui-btn" href={githubPull(item.n)} target="_blank" rel="noopener">{conflicts ? "Resolve on GitHub" : "View on GitHub"}</a>
      </div>}
      {item.agent && (
        <div className="repo-pulls-agent-context">
          <AgentMark run={item.agent.run} />
          <span>
            · <Link to={to(`runs/${item.agent.run}`)}>{item.agent.run}</Link> ·{" "}
            {item.agent.harness}
          </span>
        </div>
      )}
      {edit && (
        <FormCard title="Edit pull request" onCancel={() => setEdit(false)}>
          <Access act="edit this pull request">
            <form
              className="repo-pulls-form"
              onSubmit={(event) => {
                event.preventDefault()
                if (!title.trim()) return
                update((current) => ({ ...current, title: title.trim() }))
                setEdit(false)
                toast("Title updated.")
              }}
            >
              <label htmlFor="repo-pulls-edit-title">Title</label>
              <input
                className="repo-ui-input"
                id="repo-pulls-edit-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
              <WriteControl><button className="repo-ui-btn" title={`/pull.edit ${item.n}`}>
                Save
              </button></WriteControl>
            </form>
          </Access>
        </FormCard>
      )}
    </header>
  )
}

const PullSidebar = ({ item, update }: PullDetailProps) => {
  const [request, setRequest] = useState(false)
  const [reviewer, setReviewer] = useState("")
  const [assignee, setAssignee] = useLocal<string[]>(`assignees:${item.n}`, [])
  const [assign, setAssign] = useState(false)
  return (
    <Sidebar>
      <SidebarSection title="Reviewers">
        <div className="repo-pulls-sidebar-list">
          {item.reviewers.map((login) => (
            <div className="repo-pulls-sidebar-person" key={login}>
              <PersonChip login={login} />
              <StateIcon
                state={
                  item.reviews.filter(review => review.author === login && review.state !== "commented").at(-1)?.state ?? "pending"
                }
                size={16}
              />
              {item.reviews.filter(review => review.author === login && review.state !== "commented").at(-1)?.state === "changes_requested" && <span className="repo-pulls-review-warning">Changes requested</span>}
            </div>
          ))}
          {!item.reviewers.length && <span className="repo-ui-muted">None requested</span>}
          <WriteControl><button
            className="repo-pulls-text-button"
            title={`/pull.reviewers.request ${item.n}`}
            onClick={() => setRequest(!request)}
            aria-expanded={request}
          >
            Request review
          </button></WriteControl>
        </div>
        {request && (
          <FormCard title="Request review" onCancel={() => setRequest(false)}>
            <Access act="request a review">
              <form
                className="repo-pulls-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!reviewer) return
                  update((current) => ({ ...current, reviewers: [...current.reviewers, reviewer] }))
                  setRequest(false)
                  toast(`Review requested from ${reviewer}.`)
                }}
              >
                <label htmlFor="repo-pulls-reviewer">Reviewer</label>
                <select
                  className="repo-ui-input"
                  id="repo-pulls-reviewer"
                  required
                  value={reviewer}
                  onChange={(event) => setReviewer(event.target.value)}
                >
                  <option value="">Select a member</option>
                  {people
                    .filter(
                      (person) =>
                        person.kind === "human" &&
                        person.login !== item.author &&
                        person.role !== "contributor" &&
                        !item.reviewers.includes(person.login)
                    )
                    .map((person) => (
                      <option key={person.login}>{person.login}</option>
                    ))}
                </select>
                <WriteControl><button
                  className="repo-ui-btn"
                  title={`/pull.reviewers.request ${item.n} ${reviewer}`}
                  disabled={!reviewer}
                >
                  Request
                </button></WriteControl>
              </form>
            </Access>
          </FormCard>
        )}
      </SidebarSection>
      <SidebarSection title="Assignees">
        <div className="repo-pulls-sidebar-list">
          {assignee.map((login) => (
            <PersonChip login={login} key={login} />
          ))}
          {!assignee.length && <span className="repo-ui-muted">No one assigned</span>}
          <WriteControl><button
            className="repo-pulls-text-button"
            title={`/pull.assign ${item.n}`}
            onClick={() => setAssign(!assign)}
          >
            Assign
          </button></WriteControl>
        </div>
        {assign && (
          <FormCard title="Assign this pull request" onCancel={() => setAssign(false)}>
            <Access act="assign this pull request">
              <label className="repo-pulls-form" htmlFor="repo-pulls-assignee">
                Assignee
                <select
                  className="repo-ui-input"
                  id="repo-pulls-assignee"
                  value=""
                  onChange={(event) => {
                    if (!event.target.value) return
                    setAssignee([event.target.value])
                    setAssign(false)
                    toast("Assignee updated.")
                  }}
                >
                  <option value="">Select a member</option>
                  {people
                    .filter((person) => person.kind === "human")
                    .map((person) => (
                      <option key={person.login}>{person.login}</option>
                    ))}
                </select>
              </label>
            </Access>
          </FormCard>
        )}
      </SidebarSection>
      <SidebarSection title="Labels">
        <div className="repo-pulls-labels">
          {item.labels.length ? (
            item.labels.map((name) => <LabelChip key={name} name={name} />)
          ) : (
            <span className="repo-ui-muted">None</span>
          )}
        </div>
      </SidebarSection>
      <SidebarSection title="Fixes">
        <div className="repo-pulls-sidebar-list">
          {item.fixes.length ? (
            item.fixes.map((n) => (
              <Link to={to(`issues/${n}`)} key={n}>
                <StateIcon state="open" /> #{n}
              </Link>
            ))
          ) : (
            <span className="repo-ui-muted">No linked issues</span>
          )}
        </div>
      </SidebarSection>
      {item.agent && (
        <SidebarSection title="Run">
          <Link to={to(`runs/${item.agent.run}`)}>{item.agent.run}</Link>
        </SidebarSection>
      )}
      <SidebarSection title="Branch sandbox">
        <WriteControl><Link
          className="repo-pulls-sidebar-link"
          title={`/box.open ${item.head}`}
          to={to(`branches/${encodeURIComponent(item.head)}/terminal`)}
        >
          {item.head}
          <span aria-hidden="true">↗</span>
        </Link></WriteControl>
      </SidebarSection>
    </Sidebar>
  )
}

export const PullCommits = ({ item }: { item: PullRecord }) => {
  const grouped = new Map<string, string[]>()
  item.commits.forEach((sha) => {
    const date = fmtDate(commit(sha)?.date ?? item.opened)
    grouped.set(date, [...(grouped.get(date) ?? []), sha])
  })
  if (!item.commits.length) return <div className="repo-pulls-empty-region"><Empty title="No commits" />{item.files.length > 0 && <p className="repo-ui-muted">Uncommitted proposal. Commit history is unavailable.</p>}</div>
  return (
    <div className="repo-pulls-commit-groups">
      {[...grouped].map(([day, shas]) => (
        <section key={day}>
          <h2>Commits on {day}</h2>
          <Box>
            {shas.map((sha) => {
              const entry = commit(sha)
              return (
                <Row className="repo-pulls-commit-row" key={sha}>
                  <PersonChip login={entry?.author ?? item.author} compact />
                  <div className="repo-pulls-list-main">
                    <Link className="repo-pulls-commit-title" to={to(`commit/${sha}`)}>
                      {entry?.title ?? shortSha(sha)}
                    </Link>
                    <div className="repo-pulls-meta">
                      <span>{entry?.author ?? item.author}</span>
                      <AgentMark agent={entry?.agent} />
                      {entry && <RelTime date={entry.date} />}
                    </div>
                  </div>
                  <Link className="repo-pulls-sha" to={to(`commit/${sha}`)}>
                    {shortSha(sha)}
                  </Link>
                </Row>
              )
            })}
          </Box>
        </section>
      ))}
    </div>
  )
}

const CheckDetail = ({ check }: { check: Check }) => {
  const execution = check.run ? run(check.run) : undefined
  const stage = execution?.stages.find((stage) =>
    check.state === "failure"
      ? stage.state === "failed"
      : stage.label.toLowerCase().includes(check.name.toLowerCase())
  )
  return (
    <Box
      className="repo-pulls-check-detail"
      header={
        <div className="repo-pulls-check-detail-head">
          <StateIcon state={check.state} />
          <strong>{check.name}</strong>
          <span className="repo-ui-muted">{check.duration}</span>
        </div>
      }
    >
      <div className="repo-pulls-card-body">
        <h2>
          {check.state === "failure"
            ? "Check failed"
            : check.state === "pending"
              ? "Check in progress"
              : check.state === "skipped"
                ? "Check skipped"
                : "Check passed"}
        </h2>
        <p className={check.state === "failure" ? "repo-pulls-danger" : "repo-ui-muted"}>
          {check.detail}
        </p>
        <pre className="repo-pulls-log" aria-label={`${check.name} log`}>
          {[check.detail, ...(stage?.log ?? [])].join("\n")}
        </pre>
        {check.run && <Link to={to(`runs/${check.run}`)}>Open run {check.run} →</Link>}
      </div>
    </Box>
  )
}

export const PullChecks = ({ item }: { item: PullRecord }) => {
  const location = useLocation()
  const initial = new URLSearchParams(location.split("?")[1]).get("check")
  const [selected, setSelected] = useState(
    initial ?? item.checks.find((check) => check.state === "failure")?.name ?? item.checks[0]?.name
  )
  const check = item.checks.find((check) => check.name === selected) ?? item.checks[0]
  return (
    <div className="repo-pulls-checks-layout">
      <nav className="repo-pulls-check-list" aria-label="Checks">
        <h2>{item.checks.length} {pluralize(item.checks.length, "check")}</h2>
        {item.checks.map((entry) => (
          <button
            key={entry.name}
            className="repo-pulls-check-select"
            title={`/pull.check ${item.n} ${entry.name}`}
            aria-current={entry.name === check?.name ? "true" : undefined}
            onClick={() => setSelected(entry.name)}
          >
            <StateIcon state={entry.state} />
            <span>{entry.name}</span>
            <span className="repo-ui-muted">{entry.duration}</span>
          </button>
        ))}
      </nav>
      {check ? <CheckDetail check={check} /> : <Empty title="No checks on this pull request" />}
    </div>
  )
}

export const PullReady = ({ initial, tab, emptyTab }: { initial: PullRecord; tab: PullTab; emptyTab?: PullTab }) => {
  const [stored, update] = useLocal<PullRecord>(`pull:${initial.n}`, initial)
  const item = emptyTab === "commits" ? { ...stored, commits: [] } : emptyTab === "checks" ? { ...stored, checks: [] } : emptyTab === "files" ? { ...stored, files: [] } : stored
  const location = useLocation()
  useEffect(() => {
    const fields = [{ name: "pull", label: "Pull request number", type: "number" as const, min: 1, required: false }]
    const open = (number: string, act: "review" | "merge" | "fix", decision?: string) => {
      const n = number ? Number(number) : item.n
      const target = n === item.n ? item : pull(n)
      if (!target) throw new Error(`Pull request #${n} was not found.`)
      if (act === "fix" && !target.checks.some(check => check.state === "failure")) throw new Error("This pull request has no failed checks to fix.")
      const query = new URLSearchParams(location.split("?")[1])
      query.delete("review"); query.delete("merge"); query.delete("fix"); query.delete("decision")
      query.set(act, String(Date.now()))
      if (decision) query.set("decision", decision)
      navigate(to(`pull/${n}${act === "review" ? "/files" : ""}?${query}`))
    }
    const dispose = [
      registerSlash("pull.review", {
        purpose: "Review a pull request", access: "signed-in", confirm: false,
        fields: [...fields, { name: "decision", label: "Review", required: false, options: ["commented", "approved", "changes_requested"] }],
        run: ({ pull: number, decision }, { closeAsk }) => { open(number, "review", decision); closeAsk() }
      }),
      registerSlash("pull.merge", {
        purpose: "Open merge confirmation", fields, confirm: false,
        run: ({ pull: number }, { closeAsk }) => { open(number, "merge"); closeAsk() }
      }),
      registerSlash("change.fix", {
        purpose: "Ask the agent to fix a check", fields, confirm: false,
        run: ({ pull: number }, { closeAsk }) => { open(number, "fix"); closeAsk() }
      })
    ]
    return () => dispose.forEach(cleanup => cleanup())
  }, [item, location])
  return (
    <div className="repo-pulls-page">
      <PullHeader item={item} update={update} />
      <Tabs
        active={tab}
        label="Pull request"
        items={[
          {
            id: "conversation",
            label: "Conversation",
            to: to(`pull/${item.n}`),
            count: item.comments.length + item.reviews.length + item.reviewComments.length
          },
          {
            id: "commits",
            label: "Commits",
            to: to(`pull/${item.n}/commits`),
            count: item.commits.length
          },
          {
            id: "checks",
            label: "Checks",
            to: to(`pull/${item.n}/checks`),
            count: item.checks.length
          },
          {
            id: "files",
            label: "Files changed",
            to: to(`pull/${item.n}/files`),
            count: item.files.length
          }
        ]}
      />
      <div className="repo-pulls-tab-content">
        {tab === "files" ? (
          <PullFiles item={item} update={update} />
        ) : tab === "checks" ? (
          <PullChecks item={item} />
        ) : (
          <div className="repo-pulls-detail-layout">
            {tab === "commits" ? (
              <PullCommits item={item} />
            ) : (
              <Conversation item={item} update={update} />
            )}
            <PullSidebar item={item} update={update} />
          </div>
        )}
      </div>
    </div>
  )
}

export const PullPage = ({ n, tab }: { n: number; tab: PullTab }) => {
  const state = useView(`pull:${repo.slug}:${n}`)
  const item = pull(n)
  return (
    <RepoFrame
      tab="pulls"
      title={`${item?.title ?? "Pull request"} · ${repo.slug}`}
      askView="pull"
      askContext={`${repo.slug} pull request #${n}`}
    >
      {state === "loading" ? (
        <PullLoading />
      ) : state === "error" ? (
        <PullError />
      ) : !item || (state === "empty" && tab === "conversation") ? (
        <PullEmpty />
      ) : (
        <PullReady key={`${repo.slug}:${n}`} initial={item} tab={tab} emptyTab={state === "empty" ? tab : undefined} />
      )}
    </RepoFrame>
  )
}
