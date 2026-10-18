import { useEffect, useRef } from "react"
import { useMock } from "../../../core/mock"
import { Link, useLocation } from "../../../core/router"
import { flows, MOCK_NOW, repo, to } from "../../fixtures"
import type { Approval, Run } from "../../fixtures/types"
import { Empty, Failed, Loading, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { Box, Counter, Icon, Row } from "../../ui"
import {
  triggerLabel, RunDuration, RunFlowAction, RunsSignedOutNote, RunStarted, RunStatus, usd, useRunRecords, viewerLogin
} from "./shared"

const listURL = (filter: string, flow?: string | null) => {
  const query = new URLSearchParams()
  if (filter !== "all") query.set("filter", filter)
  if (flow) query.set("flow", flow)
  return to(`runs${query.size ? `?${query}` : ""}`)
}

const waitingForViewer = (records: Run[], decisions: Approval[]) => records.filter(item =>
  item.state === "waiting" && decisions.some(decision =>
    decision.run === item.id && decision.state === "waiting" && decision.askedOf === viewerLogin()
  )
)

const RunsNavigation = ({ flow, filter, waiting, signedIn }: { flow: string | null; filter: string; waiting: number; signedIn: boolean }) => (
  <nav className="repo-runs-navigation" aria-label="Run flows">
    <Link className="repo-runs-nav-item" to={to("runs")} aria-current={!flow && filter !== "waiting" ? "page" : undefined}>
      <Icon name="play" size={16} />
      All runs
    </Link>
    {signedIn && <Link
      className="repo-runs-nav-item repo-runs-nav-inbox"
      to={to("runs?filter=waiting")}
      aria-current={filter === "waiting" ? "page" : undefined}
    >
      <Icon name="clock" size={16} />
      Run approvals
      <Counter>{waiting}</Counter>
    </Link>}
    <h2>Flows</h2>
    {flows.map(item => (
      <Link
        className="repo-runs-nav-item repo-runs-nav-flow"
        key={item.name}
        to={listURL("all", item.name)}
        aria-current={flow === item.name ? "page" : undefined}
      >
        <Icon name="file" size={15} />
        {item.name}
      </Link>
    ))}
    {signedIn && <Link className="repo-runs-nav-footer" to={to("approvals")}>
      All approvals
      <Icon name="chevron" size={13} />
    </Link>}
  </nav>
)

const RunListRow = ({ item }: { item: Run }) => (
  <Row className="repo-runs-list-row">
    <RunStatus state={item.state} />
    <div className="repo-runs-row-main">
      <Link className="repo-runs-row-title" to={to(`runs/${item.id}`)}>{item.title}</Link>
      <div className="repo-runs-row-context">
        <Link to={to(`flows/${item.flow}`)}>{item.flow}</Link>
        <span>·</span>
        <span>{triggerLabel(item)} · {item.trigger.by}</span>
      </div>
      <span className="repo-runs-harness">{item.harness}</span>
    </div>
    <div className="repo-runs-row-ref">
      {item.branch && (
        <Link className="repo-runs-branch" to={to(`tree/${encodeURIComponent(item.branch)}`)}>
          <Icon name="change" size={12} />
          {item.branch}
        </Link>
      )}
      <RunStarted date={item.started} />
    </div>
    <div className="repo-runs-row-numbers">
      <span className="repo-runs-duration"><Icon name="clock" size={12} /><RunDuration run={item} /></span>
      <span>{usd(item.cost.usd)}</span>
    </div>
  </Row>
)

export const RunsLoading = () => (
  <div className="repo-runs-layout">
    <Loading rows={5} />
    <Loading rows={7} />
  </div>
)

export const RunsError = () => (
  <Failed what="runs" reason="The run service didn't respond. Run history hasn't loaded." />
)

export const RunsEmpty = () => (
  <Empty title="No runs yet." action={<RunFlowAction />}>
    <p>Flows run when their triggers fire, or run one now.</p>
  </Empty>
)

export const RunsReady = ({ embedded = false, filterOverride }: { embedded?: boolean; filterOverride?: string } = {}) => {
  const { flags } = useMock()
  const signedIn = flags.as === "in"
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const requested = !signedIn && (filterOverride ?? query.get("filter")) === "waiting" ? "all" : filterOverride ?? query.get("filter") ?? "all"
  const filter = ["all", "active", "waiting", "failed", "succeeded"].includes(requested) ? requested : "all"
  const flow = embedded ? null : query.get("flow")
  const filters = useRef<HTMLElement>(null)
  useEffect(() => {
    const selected = filters.current?.querySelector<HTMLElement>("[aria-current]")
    if (filters.current && selected) filters.current.scrollLeft = Math.max(0, selected.offsetLeft - filters.current.offsetLeft - 16)
  }, [filter])
  const { records, decisions } = useRunRecords()
  const waiting = signedIn ? waitingForViewer(records, decisions) : []
  const visible = records.filter(item => (!flow || item.flow === flow) && (
    filter === "active" ? ["running", "queued"].includes(item.state)
      : filter === "waiting" ? waiting.some(record => record.id === item.id)
      : filter === "all" || item.state === filter
  ))
  if (embedded) return <Box className="repo-runs-embedded" header={filter === "waiting" ? "Waiting on you" : "Runs"}>{visible.length ? visible.map(item => <RunListRow key={item.id} item={item} />) : <Empty title="No matching runs." />}</Box>
  const scoped = records.filter(item => !flow || item.flow === flow)
  const needsViewer = visible.find(item => waiting.some(record => record.id === item.id))
  const running = scoped.filter(item => item.state === "running").length
  const failedToday = scoped.filter(item => item.state === "failed"
    && (item.finished ?? item.started).slice(0, 10) === MOCK_NOW.slice(0, 10)).length
  return (
    <div className="repo-runs-layout">
      <RunsNavigation flow={flow} filter={filter} waiting={waiting.length} signedIn={signedIn} />
      <div className="repo-runs-main">
        <div className="repo-runs-page-heading">
          <div>
            <h1>{flow ?? "All runs"}</h1>
            <p className="repo-runs-summary">
              {running} running{signedIn && <> · {waiting.filter(item => !flow || item.flow === flow).length} waiting on you</>} · {failedToday} failed today
            </p>
          </div>
          {needsViewer ? (
            <Link className="repo-ui-btn repo-ui-btn-primary" to={to(`runs/${needsViewer.id}`)}>
              Open the run that needs you
            </Link>
          ) : null}
        </div>
        <Box className="repo-runs-list" header={(
          <nav ref={filters} className="repo-runs-filters" aria-label="Run status">
            {(["all", "active", "waiting", "failed", "succeeded"] as const).filter(key => signedIn || key !== "waiting").map(key => (
              <Link
                key={key}
                to={listURL(key, flow)}
                aria-current={filter === key ? "page" : undefined}
                className="repo-runs-filter"
              >
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </Link>
            ))}
          </nav>
        )}>
          {visible.length ? visible.map(item => <RunListRow key={item.id} item={item} />) : (
            <Empty title={filter === "waiting" ? "Nothing is waiting on you." : "No matching runs."}>
              <Link className="repo-ui-btn" to={to("runs")}>All runs</Link>
            </Empty>
          )}
        </Box>
      </div>
    </div>
  )
}

export const RunsSignedOut = () => (
  <>
    <RunsSignedOutNote />
    <RunsReady />
  </>
)

export const RunsContent = ({ embedded = false, filterOverride }: { embedded?: boolean; filterOverride?: string } = {}) => {
  const state = useView(`runs:${repo.slug}`)
  const { flags } = useMock()
  return state === "loading" ? <RunsLoading />
    : state === "error" ? <RunsError />
    : state === "empty" ? <RunsEmpty />
    : <>{flags.as === "out" && <RunsSignedOutNote />}<RunsReady embedded={embedded} filterOverride={filterOverride} /></>
}

export const Runs = () => (
  <RepoFrame tab="runs" title={`Runs · ${repo.slug}`} askView="runs" askContext={`${repo.slug} run history`}>
    <RunsContent key={repo.slug} />
  </RepoFrame>
)
