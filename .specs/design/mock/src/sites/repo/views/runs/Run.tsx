import { pluralize } from "../../ui/pluralize"
import { useEffect, useRef, useState } from "react"
import { signInRoute } from "../../../core/catalog"
import { useMock } from "../../../core/mock"
import { Link, useLocation } from "../../../core/router"
import { flow, MOCK_NOW, pull, repo, shortSha, to } from "../../fixtures"
import type { Approval, Run as RunRecord, Stage } from "../../fixtures/types"
import { Empty, Failed, Loading, useRepoFrame, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { AgentMark, Box, CodeView, Icon, PersonChip, Tabs, toast } from "../../ui"
import {
  ApprovalCard, clock, ConfirmCard, triggerLabel, HeldRunAction, RunDuration, RunsDenied,
  RunsSignedOutNote, RunStarted, RunStatus, StageDuration, usd, useRunRecords, useStill
} from "./shared"

const currentStage = (item: RunRecord) => item.stages.find(stage => stage.state === item.state)
  ?? item.stages.find(stage => stage.id === item.failure?.stage)
  ?? item.stages[item.stages.length - 1]

const runURL = (id: string, key: string, value: string) => {
  const location = window.location.hash.replace(/^#\/?/, "")
  const query = new URLSearchParams(location.split("?")[1])
  query.set(key, value)
  return to(`runs/${id}?${query}`)
}

export const RunLoading = () => <Loading variant="detail" rows={8} />
export const RunError = () => (
  <Failed what="this run" reason="The worker connection failed. The run may still be continuing." />
)
export const RunEmpty = () => (
  <Empty title="Run not found." action={<Link className="repo-ui-btn" to={to("runs")}>All runs</Link>} />
)
export const RunSignedOut = () => <RunsSignedOutNote />
export const RunReader = () => <RunsDenied />
export const RunHeldRetry = ({ id }: { id: string }) => <HeldRunAction id={id} />

export const RunResumed = ({ item }: { item: RunRecord }) => item.resumed ? (
  <p className="repo-runs-resumed">
    <Icon name="clock" size={14} />
    <span>
      Resumed at {clock(item.resumed.at).slice(0, 5)} UTC from checkpoint '{item.resumed.checkpoint}' after the tab closed.
    </span>
  </p>
) : null

const RunHeader = ({ item }: { item: RunRecord }) => (
  <header className="repo-runs-detail-heading">
    <div className="repo-runs-breadcrumb">
      <Link to={to("runs")}>Runs</Link>
      <span>/</span>
      <span>{item.id}</span>
    </div>
    <div className="repo-runs-title-row">
      <h1>{item.title}</h1>
      <RunStatus state={item.state} label />
    </div>
    <div className="repo-runs-trigger">
      <PersonChip login={item.trigger.by} />
      <span>{triggerLabel(item)}</span>
      {item.trigger.ref && !["issue", "todo", "pull"].includes(item.trigger.kind) && (
        item.trigger.kind === "issue" || item.trigger.kind === "todo" ? (
          <Link to={to(`issues/${item.issue ?? item.trigger.ref.replace("#", "")}`)}>{item.trigger.ref}</Link>
        ) : item.trigger.kind === "pull" && item.pull ? (
          <Link to={to(`pull/${item.pull}`)}>{item.trigger.ref}</Link>
        ) : <span>{item.trigger.ref}</span>
      )}
      <RunStarted date={item.started} />
    </div>
  </header>
)

const RunFacts = ({ item }: { item: RunRecord }) => (
  <Box className="repo-runs-facts">
    <dl className="repo-runs-facts-grid">
      <div>
        <dt>Flow</dt>
        <dd><Link to={to(`flows/${item.flow}`)}>{item.flow}</Link></dd>
      </div>
      <div>
        <dt>Agent and model</dt>
        <dd>{item.harness}</dd>
      </div>
      <div>
        <dt>Started</dt>
        <dd><RunStarted date={item.started} label={false} /></dd>
      </div>
      <div>
        <dt>{item.state === "running" ? "Elapsed" : "Duration"}</dt>
        <dd><RunDuration run={item} /></dd>
      </div>
      <div>
        <dt>Usage</dt>
        <dd>{usd(item.cost.usd)} USD <span>· {item.cost.tokens.toLocaleString("en-US")} {pluralize(item.cost.tokens, "token")}</span></dd>
      </div>
    </dl>
    {(item.branch || item.issue || item.pull) && (
      <div className="repo-runs-references">
        {item.branch && (
          <Link className="repo-runs-branch" to={to(`tree/${encodeURIComponent(item.branch)}`)}>
            <Icon name="change" size={13} />
            {item.branch}
          </Link>
        )}
        {item.issue && <Link to={to(`issues/${item.issue}`)}>Issue #{item.issue}</Link>}
        {item.pull && <Link to={to(`pull/${item.pull}`)}>Pull #{item.pull}</Link>}
      </div>
    )}
  </Box>
)

export const RunRunning = ({ item, update }: { item: RunRecord; update: (item: RunRecord) => void }) => {
  const { flags } = useMock()
  const location = useLocation()
  const [confirm, setConfirm] = useState(() => new URLSearchParams(location.split("?")[1]).get("confirm") === "cancel")
  useEffect(() => {
    setConfirm(new URLSearchParams(location.split("?")[1]).get("confirm") === "cancel")
  }, [location])
  const cancel = () => {
    update({
      ...item,
      state: "cancelled",
      finished: MOCK_NOW,
      stages: item.stages.map(stage => stage.state === "running" ? { ...stage, state: "cancelled" } : stage),
      trace: [...item.trace, {
        at: MOCK_NOW, stage: currentStage(item)?.id ?? "", kind: "message", text: "Run cancelled by the repository member."
      }]
    })
    setConfirm(false)
    toast("Run cancelled. Checkpoint kept.")
  }
  return (
    <div className="repo-runs-running-actions">
      {flags.as === "out" ? (
        <Link className="repo-ui-btn" title="/signin" to={signInRoute(location)}>Sign in to cancel</Link>
      ) : flags.role !== "member" ? (
        <div className="repo-runs-action-gate">
          <button className="repo-ui-btn" title={`/run.cancel ${item.id}`} disabled>Cancel run</button>
          <RunsDenied act="cancel runs" />
        </div>
      ) : confirm ? (
        <ConfirmCard
          question="Cancel this run?"
          command={`/run.cancel ${item.id}`}
          label="Cancel run"
          onConfirm={cancel}
          onClose={() => setConfirm(false)}
        >
          <p>The last checkpoint will be kept.</p>
        </ConfirmCard>
      ) : (
        <button className="repo-ui-btn" title={`/run.cancel ${item.id}`} onClick={() => setConfirm(true)}>Cancel run</button>
      )}
    </div>
  )
}

export const RunWaiting = ({ items, decide }: {
  items: Approval[]
  decide: (item: Approval, option: string) => void
}) => (
  <div className="repo-runs-waiting-cards">
    {items.map(item => <ApprovalCard key={item.id} item={item} decide={decide} />)}
    {!items.length && <p className="repo-ui-muted">Waiting for the requested decision.</p>}
  </div>
)

export const RunFailed = ({ item, update }: { item: RunRecord; update: (item: RunRecord) => void }) => {
  const { flags } = useMock()
  const { openAsk } = useRepoFrame()
  const location = useLocation()
  const [confirm, setConfirm] = useState(() => new URLSearchParams(location.split("?")[1]).get("confirm") === "retry")
  useEffect(() => {
    setConfirm(new URLSearchParams(location.split("?")[1]).get("confirm") === "retry")
  }, [location])
  const stage = item.stages.find(stage => stage.id === item.failure?.stage)
    ?? item.stages.find(stage => stage.state === "failed")
  const held = flags.host === "hosted" && flags.landing === "install"
  const unavailable = flags.host === "hosted" && flags.hosted === "paused"
    ? "Hosted machines are paused. Try again when they resume."
    : flags.model === "none" ? "Connect a model to retry this run." : null
  const retry = () => {
    if (flags.as !== "in" || flags.role !== "member" || held || unavailable) return
    const failedIndex = item.stages.findIndex(candidate => candidate.id === stage?.id)
    update({
      ...item,
      state: "running",
      failure: undefined,
      finished: undefined,
      stages: item.stages.map((candidate, i) => i === failedIndex ? {
        ...candidate,
        state: "running",
        started: MOCK_NOW,
        duration: undefined,
        summary: "Retrying from the saved checkpoint.",
        log: [...candidate.log, "retry requested by a repository member", "checkpoint restored; retry in progress"]
      } : i > failedIndex ? { ...candidate, state: "queued", duration: undefined } : candidate),
      trace: [...item.trace, {
        at: MOCK_NOW, stage: stage?.id ?? "", kind: "checkpoint", text: `Retry started from ${stage?.label ?? "the last checkpoint"}.`
      }]
    })
    setConfirm(false)
    toast(`Retrying from ${stage?.label ?? "the last checkpoint"}.`)
  }
  return (
    <Box className="repo-runs-failure" header={(
      <div className="repo-runs-approval-heading">
        <RunStatus state="failed" />
        <strong>{stage?.label ?? "Run"} failed</strong>
      </div>
    )}>
      <div className="repo-runs-card-body">
        <p>{item.failure?.reason ?? stage?.summary}</p>
        <div className="repo-ui-actions">
          {flags.as === "out" ? (
            <Link className="repo-ui-btn repo-ui-btn-primary" title="/signin" to={signInRoute(location)}>
              Sign in to retry
            </Link>
          ) : flags.role !== "member" ? (
            <button className="repo-ui-btn" title={`/run.retry ${item.id}`} disabled>Retry from {stage?.label}</button>
          ) : !held && !unavailable && !confirm && (
            <button className="repo-ui-btn repo-ui-btn-primary" title={`/run.retry ${item.id}`} onClick={() => setConfirm(true)}>
              Retry from {stage?.label ?? "checkpoint"}
            </button>
          )}
          <button
            className="repo-ui-btn repo-ui-btn-quiet"
            title={`/ask Why did ${item.id} fail?`}
            onClick={() => openAsk(`Why did ${item.id} fail at ${stage?.label}? ${item.failure?.reason ?? stage?.summary}`)}
          >
            Ask about this failure
          </button>
        </div>
        {flags.as === "in" && flags.role !== "member" && <RunsDenied act="retry runs" />}
        {flags.as === "in" && flags.role === "member" && held && <RunHeldRetry id={item.id} />}
        {flags.as === "in" && flags.role === "member" && !held && unavailable && <p role="status">{unavailable}</p>}
        {confirm && !held && !unavailable && flags.as === "in" && flags.role === "member" && (
          <ConfirmCard
            question={`Retry from ${stage?.label ?? "the last checkpoint"}?`}
            command={`/run.retry ${item.id}`}
            label="Retry run"
            onConfirm={retry}
            onClose={() => setConfirm(false)}
          />
        )}
        {stage && <details className="repo-runs-failure-log"><summary>Failure log</summary><CodeView code={stage.log.join("\n")} path="Failure log" /></details>}
      </div>
    </Box>
  )
}

export const RunSucceeded = ({ item }: { item: RunRecord }) => {
  const result = item.pull ? pull(item.pull) : undefined
  if (!result) return <p className="repo-runs-result"><RunStatus state="succeeded" />Flow completed.</p>
  return (
    <div className="repo-runs-result">
      <RunStatus state="succeeded" />
      <Link to={to(`pull/${result.n}`)}>Pull #{result.n}: {result.title}</Link>
      {result.agent && <AgentMark agent={result.agent} />}
      {result.merged && (
        <Link to={to(`commit/${result.merged.sha}`)}>Landed {shortSha(result.merged.sha)}</Link>
      )}
    </div>
  )
}

export const RunCancelled = () => (
  <p className="repo-runs-result repo-ui-muted"><RunStatus state="cancelled" />Run cancelled. Last checkpoint kept.</p>
)

const StageStrip = ({ item, selected, select }: {
  item: RunRecord
  selected: string
  select: (id: string) => void
}) => (
  <ol className="repo-runs-stage-strip" aria-label="Run stages">
    {item.stages.map((stage, i) => (
      <li key={stage.id}>
        {i > 0 && <span className="repo-runs-stage-connector" aria-hidden="true">→</span>}
        <button
          className="repo-runs-stage"
          aria-pressed={selected === stage.id}
          title={`/run.stage ${item.id} ${stage.id}`}
          onClick={() => select(stage.id)}
        >
          <RunStatus state={stage.state} />
          <span><strong>{stage.label}</strong><StageDuration stage={stage} /></span>
        </button>
      </li>
    ))}
  </ol>
)

const StageLog = ({ item, stage }: { item: RunRecord; stage: Stage }) => {
  const [full, setFull] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const lines = full ? stage.log : stage.log.slice(-6)
  useEffect(() => {
    if (stage.state === "running" && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [stage.id, stage.state, stage.log.length, full])
  return (
    <Box className="repo-runs-stage-panel" header={(
      <div className="repo-runs-log-heading">
        <RunStatus state={stage.state} />
        <h2>{stage.label}</h2>
        <StageDuration stage={stage} />
      </div>
    )}>
      <div className="repo-runs-stage-summary">
        <p>{stage.summary || (stage.state === "queued" ? "Waiting for the previous stage." : "No summary recorded.")}</p>
      </div>
      {stage.log.length ? (
        <>
          <div className="repo-runs-log-scroll" ref={log} tabIndex={0} aria-label={`${stage.label} log`}>
            <CodeView
              code={lines.join("\n")}
              startLine={full ? 1 : Math.max(1, stage.log.length - 5)}
              path={`${item.id} / ${stage.label}`}
            />
          </div>
          {stage.log.length > 6 && (
            <div className="repo-runs-log-footer">
              <button
                className="repo-ui-btn repo-ui-btn-quiet"
                title={`/run.logs ${item.id} ${stage.id}`}
                aria-expanded={full}
                onClick={() => setFull(!full)}
              >
                {full ? "Show log tail" : "Show full log"}
              </button>
              <span>{stage.log.length} {pluralize(stage.log.length, "line")}</span>
            </div>
          )}
        </>
      ) : (
        <p className="repo-runs-no-log">{stage.state === "queued" ? "No output yet." : "No log output recorded."}</p>
      )}
    </Box>
  )
}

export const RunGraph = ({ item, selected, select }: {
  item: RunRecord
  selected: string
  select: (id: string) => void
}) => {
  const definition = flow(item.flow)
  const frozen = useStill()
  if (!definition) return <Empty title="Flow graph unavailable." />
  return (
    <Box className="repo-runs-graph" header="Flow graph">
      <ol className="repo-runs-graph-nodes">
        {definition.graph.nodes.map(node => {
          const stage = item.stages.find(stage => stage.id === node.id || stage.label === node.label)
          const parents = definition.graph.edges.filter(([, end]) => end === node.id)
          return (
            <li className="repo-runs-graph-node" key={node.id}>
              {parents.length > 0 && (
                <div className="repo-runs-graph-edge">
                  <span aria-hidden="true">↓</span>
                  <span>from {parents.map(([start]) => definition.graph.nodes.find(node => node.id === start)?.label ?? start).join(", ")}</span>
                </div>
              )}
              <button
                className="repo-runs-graph-button"
                data-current={stage?.state === "running" || stage?.state === "waiting" || undefined}
                data-live={stage?.state === "running" && !frozen || undefined}
                aria-pressed={selected === stage?.id}
                title={`/run.stage ${item.id} ${stage?.id ?? node.id}`}
                onClick={() => select(stage?.id ?? node.id)}
              >
                <RunStatus state={stage?.state ?? "queued"} />
                <strong>{node.label}</strong>
                <span>{node.kind}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </Box>
  )
}

export const RunTrace = ({ item }: { item: RunRecord }) => {
  const events = [...item.trace]
  if (item.resumed) {
    const text = `Resumed from checkpoint '${item.resumed.checkpoint}' after the tab closed.`
    const existing = events.findIndex(event => event.at === item.resumed?.at && event.kind === "checkpoint")
    if (existing >= 0) events[existing] = { ...events[existing], text }
    else events.push({ at: item.resumed.at, stage: "", kind: "checkpoint", text })
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return (
    <Box className="repo-runs-trace" header="Trace · UTC">
      <ol>
        {events.map((event, i) => (
          <li key={`${event.at}:${i}`} className="repo-runs-trace-event" data-kind={event.kind}>
            <time dateTime={event.at}>{clock(event.at)}</time>
            <span className="repo-runs-trace-kind">{event.kind}</span>
            <div>
              <p>{event.text}</p>
              <span>{item.stages.find(stage => stage.id === event.stage)?.label}</span>
            </div>
          </li>
        ))}
      </ol>
      {!events.length && <Empty title="No trace events yet." />}
    </Box>
  )
}

export const RunReady = ({ id }: { id: string }) => {
  const { flags } = useMock()
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const { records, decisions, updateRun, decide } = useRunRecords(id)
  const item = records.find(item => item.id === id)
  const [selected, setSelected] = useState<string | null>(null)
  const selectedItem = item?.stages.find(stage => stage.id === selected)
    ?? item?.stages.find(stage => stage.id === query.get("stage"))
    ?? (item ? currentStage(item) : undefined)
  useEffect(() => { setSelected(null) }, [id, item?.state])
  if (!item) return <RunEmpty />
  const view = query.get("view") === "graph" ? "graph" : query.get("view") === "trace" ? "trace" : "summary"
  return (
    <div className="repo-runs-detail">
      {flags.as === "out" && <RunSignedOut />}
      <RunHeader item={item} />
      <Tabs
        label="Run details"
        active={view}
        items={[
          { id: "summary", label: "Summary", to: runURL(id, "view", "summary") },
          { id: "graph", label: "Graph", to: runURL(id, "view", "graph") },
          { id: "trace", label: "Trace", to: runURL(id, "view", "trace") }
        ]}
      />
      {view === "summary" && <>
        {item.state === "waiting" && <RunWaiting items={decisions.filter(approval => approval.run === id && approval.state === "waiting")} decide={decide} />}
        {item.state === "failed" && <RunFailed item={item} update={updateRun} />}
        <RunResumed item={item} />
        {item.state === "running" && <RunRunning item={item} update={updateRun} />}
        {item.state === "succeeded" && <RunSucceeded item={item} />}
        {item.state === "cancelled" && <RunCancelled />}
      </>}
      {view === "trace" ? <RunTrace item={item} /> : (
        <>
          {view === "graph" ? (
            <RunGraph item={item} selected={selectedItem?.id ?? ""} select={setSelected} />
          ) : <StageStrip item={item} selected={selectedItem?.id ?? ""} select={setSelected} />}
          {selectedItem && <StageLog key={`${item.id}:${selectedItem.id}`} item={item} stage={selectedItem} />}
        </>
      )}
      <details className="repo-runs-details"><summary>Details · {item.flow} · {usd(item.cost.usd)}</summary><RunFacts item={item} /></details>
      {view !== "summary" && item.state === "waiting" && <RunWaiting items={decisions.filter(approval => approval.run === id && approval.state === "waiting")} decide={decide} />}
    </div>
  )
}

export const Run = ({ id }: { id: string }) => {
  const state = useView(`run:${repo.slug}:${id}`)
  return (
    <RepoFrame tab="runs" title={`${id} · ${repo.slug}`} askView="run" askContext={`${repo.slug} / ${id}`}>
      {state === "loading" ? <RunLoading />
        : state === "error" ? <RunError />
        : state === "empty" ? <RunEmpty />
        : <RunReady key={`${repo.slug}:${id}`} id={id} />}
    </RepoFrame>
  )
}
