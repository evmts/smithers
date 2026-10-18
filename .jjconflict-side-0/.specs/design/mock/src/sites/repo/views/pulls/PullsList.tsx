import { pluralize } from "../../ui/pluralize"
import { useEffect, useState } from "react"
import { useMock } from "../../../core/mock"
import { Link, navigate } from "../../../core/router"
import { labels, people, pulls, repo, to } from "../../fixtures"
import type { Pull } from "../../fixtures/types"
import { Empty, Failed, Loading, registerSlash, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { AgentMark, Box, Icon, LabelChip, RelTime, Row, StateIcon } from "../../ui"
import { checkState, FamilyNav, localPull, passedAgentChecks, reviewIsNext, reviewRequested, reviewState } from "./shared"

export const PullsLoading = () => <Loading rows={7} />
export const PullsError = () => (
  <Failed what="pull requests" reason="The repository host didn't return pull requests." />
)
export const PullsEmpty = () => (
  <Empty title="No pull requests." action={<Link className="repo-ui-btn repo-ui-btn-primary" to={to("branches")}>Open branches</Link>}>
    <Link to={to("issues")}>Issues</Link>
  </Empty>
)

function matches(item: Pull, query: string): boolean {
  const words = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []
  return words.every((word) => {
    const [key, ...parts] = word.split(":")
    const value = parts.join(":").replace(/^"|"$/g, "")
    if (key === "is") {
      if (value === "open") return item.state === "open" || item.state === "draft"
      if (value === "closed") return item.state === "closed" || item.state === "merged"
      if (value === "merged" || value === "draft") return item.state === value
      if (value === "agent-made") return Boolean(item.agent)
      return true
    }
    if (key === "author") return item.author === value
    if (key === "label") return item.labels.includes(value)
    if (key === "review")
      return (
        reviewState(item) ===
        {
          approved: "Approved",
          required: "Review required",
          changes_requested: "Changes requested"
        }[value]
      )
    return `${item.n} ${item.title}`.toLowerCase().includes(word.toLowerCase())
  })
}

const PullRow = ({ item }: { item: Pull }) => {
  const { flags } = useMock()
  return (
  <Row className="repo-pulls-list-row">
    <Link to={to(`pull/${item.n}`)} aria-label={`${item.state} pull request ${item.n}`}>
      <StateIcon state={item.state} size={20} />
    </Link>
    <div className="repo-pulls-list-main">
      <div className="repo-pulls-list-title">
        <Link to={to(`pull/${item.n}`)}>{item.title}</Link>
        {item.kind === "landing" && <span className="repo-pulls-landing-tag">Landing</span>}
        {item.labels.map((name) => (
          <LabelChip name={name} key={name} />
        ))}
      </div>
      <div className="repo-pulls-meta">
        <span>
          #{item.n} opened <RelTime date={item.opened} /> by {item.author}
          {item.agent && ` for ${item.agent.for}`}
        </span>
        <AgentMark agent={item.agent} />
        {item.reviews.length > 0 && <Link to={to(`pull/${item.n}?receipt=1`)}>Review receipt</Link>}
      </div>
    </div>
    <div className="repo-pulls-list-health">
      <Link to={to(`pull/${item.n}/checks`)} title={item.state === "draft" ? "Draft" : `Checks: ${checkState(item)}`} aria-label={item.state === "draft" ? `Draft pull request #${item.n}` : `Checks for #${item.n}: ${checkState(item)}`}>
        <StateIcon state={item.state === "draft" ? "draft" : checkState(item)} />
      </Link>
      <span className={reviewState(item) === "Changes requested" ? "repo-pulls-warning" : ""}>
        {reviewState(item)}
      </span>
    </div>
    <Link
      className="repo-pulls-comment-count"
      to={to(`pull/${item.n}`)}
      aria-label={`${item.comments.length + item.reviewComments.length} ${pluralize(item.comments.length + item.reviewComments.length, "comment")}`}
    >
      <span aria-hidden="true">◌</span> {item.comments.length + item.reviewComments.length}
    </Link>
    {passedAgentChecks(item) && <p className="repo-pulls-handoff">{flags.as === "in" && flags.role === "member" && reviewIsNext(item) ? "Checks passed. Your review is next." : "Checks passed."}</p>}
  </Row>
  )
}

export const PullsReady = ({ query }: { query: string }) => {
  const { flags } = useMock()
  const [filter, setFilter] = useState(query)
  const all = flags.data === "empty" ? [] : pulls.map(localPull)
  const visible = all.filter((item) => matches(item, query))
  const open = all.filter((item) => item.state === "open" || item.state === "draft").length
  const closed = all.length - open
  const next = all
    .filter(
      (item) =>
        reviewRequested(item)
    )
    .sort((a, b) => Date.parse(a.opened) - Date.parse(b.opened))[0]
  const setQuery = (value: string) => navigate(to(`pulls?q=${encodeURIComponent(value)}`))
  const token = (key: string, value: string) => {
    const clean = query.replace(new RegExp(`(?:^|\\s)${key}:(?:"[^"]*"|\\S+)`, "g"), "").trim()
    setQuery(`${clean} ${key}:${value.includes(" ") ? `"${value}"` : value}`.trim())
  }
  useEffect(() => registerSlash("pull.filter", {
    purpose: "Filter pull requests", access: "public", confirm: false,
    fields: [{ name: "query", label: "Filter", required: false }],
    run: ({ query: next }, { closeAsk }) => {
      if (["author", "label", "review"].includes(next)) {
        closeAsk()
        document.querySelector<HTMLSelectElement>(`select[title="/pull.filter ${next}"]`)?.focus()
      } else { setQuery(next || "is:open"); closeAsk() }
    }
  }), [query])
  return (
    <div className="repo-pulls-page">
      <div className="repo-pulls-topbar">
        <FamilyNav active="pulls" />
        {flags.as === "in" && (next ? (
          <Link
            className="repo-ui-btn repo-ui-btn-primary repo-pulls-next"
            title="/pull.next"
            to={to(`pull/${next.n}`)}
          >
            Open the next one to review <Icon name="chevron" size={14} />
          </Link>
        ) : <p className="repo-ui-muted">Nothing waits on your review.</p>)}
      </div>
      <form
        className="repo-pulls-search"
        onSubmit={(event) => {
          event.preventDefault()
          setQuery(filter)
        }}
      >
        <Icon name="search" />
        <label className="repo-ui-sr" htmlFor="repo-pulls-filter">
          Filter pull requests
        </label>
        <input
          className="repo-ui-input"
          id="repo-pulls-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter pull requests"
        />
        <button className="repo-ui-btn" title={`/pull.filter ${filter}`}>
          Search
        </button>
      </form>
      <Box
        header={
          <div className="repo-pulls-list-controls">
            <div className="repo-pulls-open-closed">
              <Link
                aria-current={!query.includes("is:closed") ? "page" : undefined}
                to={to("pulls?q=is%3Aopen")}
              >
                <StateIcon state="open" /> Open {open}
              </Link>
              <Link
                aria-current={query.includes("is:closed") ? "page" : undefined}
                to={to("pulls?q=is%3Aclosed")}
              >
                <StateIcon state="closed" /> Closed {closed}
              </Link>
            </div>
            <div className="repo-pulls-filters">
              <label>
                <span className="repo-ui-sr">Author</span>
                <select
                  aria-label="Author"
                  value={query.match(/author:(\S+)/)?.[1] ?? ""}
                  title="/pull.filter author"
                  onChange={(event) =>
                    event.target.value
                      ? token("author", event.target.value)
                      : setQuery(query.replace(/\s?author:\S+/g, ""))
                  }
                >
                  <option value="">Author</option>
                  {people.map((person) => (
                    <option key={person.login} value={person.login}>
                      {person.login}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="repo-ui-sr">Label</span>
                <select
                  aria-label="Label"
                  title="/pull.filter label"
                  value={query.match(/label:(\S+)/)?.[1] ?? ""}
                  onChange={(event) =>
                    event.target.value
                      ? token("label", event.target.value)
                      : setQuery(query.replace(/\s?label:\S+/g, ""))
                  }
                >
                  <option value="">Label</option>
                  {labels.map((label) => (
                    <option key={label.name} value={label.name}>
                      {label.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="repo-ui-sr">Reviews</span>
                <select
                  aria-label="Reviews"
                  title="/pull.filter review"
                  value={query.match(/review:(\S+)/)?.[1] ?? ""}
                  onChange={(event) =>
                    event.target.value
                      ? token("review", event.target.value)
                      : setQuery(query.replace(/\s?review:\S+/g, ""))
                  }
                >
                  <option value="">Reviews</option>
                  <option value="required">Review required</option>
                  <option value="approved">Approved</option>
                  <option value="changes_requested">Changes requested</option>
                </select>
              </label>
              <button
                className="repo-pulls-agent-filter"
                aria-pressed={query.includes("is:agent-made")}
                title="/pull.filter is:agent-made"
                onClick={() =>
                  setQuery(
                    query.includes("is:agent-made")
                      ? query.replace(/\s?is:agent-made/g, "")
                      : `${query} is:agent-made`
                  )
                }
              >
                Agent-made
              </button>
            </div>
          </div>
        }
      >
        {visible.length ? (
          visible.map((item) => <PullRow item={item} key={item.n} />)
        ) : all.length ? (
          <Empty
            title="No matching pull requests."
            action={
              <Link to={to("pulls")} className="repo-ui-btn" title="/pull.filter is:open">
                Clear filters
              </Link>
            }
          />
        ) : (
          <PullsEmpty />
        )}
      </Box>
    </div>
  )
}

export const Pulls = ({ query }: { query: string }) => {
  const state = useView(`pulls:${repo.slug}`)
  return (
    <RepoFrame
      tab="pulls"
      title={`Pull requests · ${repo.slug}`}
      askView="pulls"
      askContext={`pull requests in ${repo.slug}`}
    >
      {state === "loading" ? (
        <PullsLoading />
      ) : state === "error" ? (
        <PullsError />
      ) : (
        <PullsReady key={`${repo.slug}:${query}`} query={query} />
      )}
    </RepoFrame>
  )
}
