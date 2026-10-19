import { pluralize } from "../../ui/pluralize"
import { WriteControl } from "../../frame/WriteControl"
import { useCallback, useEffect, useState } from "react"
import { useMock } from "../../../core/mock"
import { Link, useLocation } from "../../../core/router"
import { flows, MOCK_NOW, repo, run, runs, to } from "../../fixtures"
import type { Flow, Trigger } from "../../fixtures/types"
import { Empty, Failed, Loading, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { Box, Icon, PageHeader, RelTime, StateIcon } from "../../ui"
import { FlowRunForm, useFlowCommands } from "./actions"

export const triggerLabel = (trigger: Trigger) => {
  if (trigger.kind === "manual") return "Manual"
  if (trigger.kind === "issue-label") return `On label ${trigger.spec}`
  if (trigger.kind === "push") return `Push to ${trigger.spec}`
  if (trigger.kind === "pull") return `Pull request · ${trigger.spec}`
  const [minute, hour, day, month, weekday] = trigger.spec.split(" ")
  if (/^\d+$/.test(hour) && /^\d+$/.test(minute) && day === "*" && month === "*") {
    return `${weekday === "*" ? "Nightly" : weekday === "1-5" ? "Weekdays" : `Days ${weekday}`} ${hour.padStart(2, "0")}:${minute.padStart(2, "0")} UTC`
  }
  return `Schedule · ${trigger.spec}`
}

const FlowRow = ({ flow }: { flow: Flow }) => {
  const latest = flow.runs.map(id => run(id)).find(Boolean)
  const weekRuns = runs.filter(item => item.flow === flow.name
    && Date.parse(MOCK_NOW) >= Date.parse(item.started)
    && Date.parse(MOCK_NOW) - Date.parse(item.started) <= 7 * 86400000).length
  return (
    <div className="repo-flows-list-row">
      <Icon name="change" size={19} />
      <div className="repo-flows-row-main">
        <Link className="repo-flows-name" to={to(`flows/${flow.name}`)}>{flow.name}</Link>
        <p>{flow.description}</p>
        <Link className="repo-flows-path" to={to(`blob/${repo.defaultBranch}/${flow.file}`)}>{flow.file}</Link>
        <p className="repo-flows-triggers-summary">
          {flow.triggers.filter(trigger => trigger.enabled).map(triggerLabel).join(" · ") || "No enabled triggers"}
        </p>
      </div>
      <div className="repo-flows-row-run">
        {latest ? (
          <Link to={to(`runs/${latest.id}`)}>
            <StateIcon state={latest.state} />
            <span>{latest.state}</span>
            <RelTime date={latest.started} />
          </Link>
        ) : <span className="repo-ui-muted">No runs yet</span>}
        <span className="repo-ui-muted">{weekRuns} {pluralize(weekRuns, "run")} in 7 days</span>
      </div>
    </div>
  )
}

export const FlowsLoading = () => <Loading rows={5} />
export const FlowsError = () => <Failed what="flows" reason="The repository host didn't respond. Flow definitions haven't loaded." />
export const FlowsEmpty = () => (
  <Empty title="No flows yet.">
    <p>Flows live in <code>.smithers/flows/</code></p>
    <Link to={to("docs")}>Read the docs</Link>
  </Empty>
)

export const FlowsReady = () => {
  const { flags } = useMock()
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const [form, setForm] = useState(query.get("run") === "1")
  const [selected, setSelected] = useState<Flow | undefined>()
  const open = useCallback((name?: string) => {
    setSelected(flows.find(flow => flow.name === name))
    setForm(true)
  }, [])
  useFlowCommands(open)
  useEffect(() => setForm(query.get("run") === "1"), [location])
  return (
    <>
      <PageHeader title="Flows" actions={(
        <>
          <Link className="repo-ui-btn repo-ui-btn-quiet" to={to("agents")}>
            <Icon name="agent" />Agents
          </Link>
          <WriteControl primary act="run flows"><button className={`repo-ui-btn${form ? "" : " repo-ui-btn-primary"}`} title="/flow.run" aria-expanded={form} onClick={() => open()}>
            Run a flow
          </button></WriteControl>
        </>
      )} />
      {form && flags.as === "in" && <FlowRunForm key={selected?.name ?? "all"} initial={selected} onClose={() => setForm(false)} />}
      <Box header={(
        <div className="repo-flows-list-header"><span>{flows.length} {pluralize(flows.length, "flow")}</span><span>Last run</span></div>
      )}>
        {flows.map(flow => <FlowRow key={flow.name} flow={flow} />)}
      </Box>
    </>
  )
}

export const Flows = () => {
  const state = useView(`flows:${repo.slug}`)
  return (
    <RepoFrame tab="flows" title={`${repo.slug} · Flows`} askView="flows" askContext={`Flows in ${repo.slug}`}>
      {state === "loading" ? <FlowsLoading />
        : state === "error" ? <FlowsError />
        : state === "empty" ? <FlowsEmpty /> : <FlowsReady key={repo.slug} />}
    </RepoFrame>
  )
}
