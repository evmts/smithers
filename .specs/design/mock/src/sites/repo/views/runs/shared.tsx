import { HeldCodeChange } from "../../ui/HeldCodeChange"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { signInRoute } from "../../../core/catalog"
import { still, useMock } from "../../../core/mock"
import { Link, navigate, useLocation } from "../../../core/router"
import { approvals, flows, fmtAgo, MOCK_NOW, people, repo, runs, to } from "../../fixtures"
import type { Approval, Run, Stage } from "../../fixtures/types"
import { registerSlash, SignInWall } from "../../frame"
import { decisionStackItems, resolveStackDecision, sameDecision } from "../../frame/waiting"
import { Box, CopyButton, PersonChip, RelTime, StateIcon, toast } from "../../ui"

type Changes = { runs: Record<string, Run>; approvals: Record<string, Approval> }
const memory = new Map<string, Changes>()
const changeEvent = "repo-runs-local-change"

// Old snapshots can retain queued downstream work after the run was cancelled.
export const settledRun = (item: Run): Run => item.state !== "cancelled" ? item : {
  ...item,
  stages: item.stages.map(stage => stage.state === "queued" || stage.state === "waiting"
    ? { ...stage, state: "skipped", summary: "Skipped — run cancelled" }
    : stage.state === "running" ? { ...stage, state: "cancelled" } : stage)
}

// Changes stay in this mock's browser tab; fixture data is never mutated.
const savedChanges = (slug: string): Changes => {
  try {
    const saved = sessionStorage.getItem(`repo-runs:${slug}`)
    if (saved) {
      const parsed = JSON.parse(saved) as Changes
      if (parsed.runs && parsed.approvals) return parsed
    }
  } catch { /* The in-memory mock still works without browser storage. */ }
  return memory.get(slug) ?? { runs: {}, approvals: {} }
}

const saveChanges = (slug: string, update: (current: Changes) => Changes) => {
  const next = update(savedChanges(slug))
  memory.set(slug, next)
  try { sessionStorage.setItem(`repo-runs:${slug}`, JSON.stringify(next)) } catch { /* Optional persistence. */ }
  window.dispatchEvent(new Event(changeEvent))
}

export const viewerLogin = () => people.find(person => person.role === "owner")?.login ?? repo.owner

const registerFlowRun = () => registerSlash("flow.run", {
  purpose: "Run a flow", confirm: false,
  fields: [{ name: "flow", label: "Flow", required: false, options: flows.map(item => item.name) }],
  run: ({ flow: name }, { closeAsk, location }) => {
    const query = new URLSearchParams(location.split("?")[1])
    query.delete("confirm"); query.delete("approval"); query.delete("option"); query.delete("action")
    query.set("run", "1")
    navigate(to(`flows${name ? `/${encodeURIComponent(name)}` : ""}?${query}`))
    closeAsk()
  }
})

export const useRunRecords = (selectedId?: string, registerCommands = true) => {
  const slug = repo.slug
  const [changes, setChanges] = useState(() => savedChanges(slug))
  useEffect(() => {
    const refresh = () => setChanges(savedChanges(slug))
    refresh()
    window.addEventListener(changeEvent, refresh)
    return () => window.removeEventListener(changeEvent, refresh)
  }, [slug])
  const records = [...runs.map(item => changes.runs[item.id] ?? item), ...Object.values(changes.runs).filter(item => !runs.some(existing => existing.id === item.id))].map(settledRun)
  const decisions = approvals.map(item => changes.approvals[item.id] ?? item)
  useEffect(() => {
    if (!registerCommands) return
    const open = (id: string, confirm?: string, approval?: string, option?: string) => {
      const query = new URLSearchParams(window.location.hash.split("?")[1])
      query.delete("confirm"); query.delete("approval"); query.delete("option")
      if (confirm) query.set("confirm", confirm)
      if (approval) query.set("approval", approval)
      if (option) query.set("option", option)
      query.set("action", String(Date.now()))
      navigate(to(`runs/${id}?${query}`))
    }
    const runFields = (state: string) => [{
      name: "run", label: "Run", required: !selectedId,
      options: records.filter(item => item.state === state).map(item => item.id)
    }]
    const runAction = (id: string, state: string, act: string) => {
      const item = records.find(item => item.id === (id || selectedId))
      if (!item || item.state !== state) throw new Error(`Choose a ${state} run.`)
      open(item.id, act)
    }
    const dispose = [
      registerSlash("run.cancel", {
        purpose: "Cancel a running run", fields: runFields("running"), confirm: false,
        run: ({ run: id }, { closeAsk }) => { runAction(id, "running", "cancel"); closeAsk() }
      }),
      registerSlash("run.retry", {
        purpose: "Retry a failed run", fields: runFields("failed"), confirm: false,
        run: ({ run: id }, { closeAsk }) => { runAction(id, "failed", "retry"); closeAsk() }
      }),
      registerSlash("approval.answer", {
        purpose: "Answer a run approval", confirm: false,
        fields: [
          { name: "approval", label: "Approval", options: decisions.filter(item => item.state === "waiting" && item.askedOf === viewerLogin()).map(item => item.id) },
          { name: "option", label: "Answer", required: false }
        ],
        run: ({ approval: id, option }, { closeAsk }) => {
          const item = decisions.find(item => item.id === id && item.state === "waiting" && item.askedOf === viewerLogin())
          if (!item) throw new Error("This approval is not waiting on you.")
          if (option && !item.options.includes(option)) throw new Error("Choose an answer from the approval card.")
          open(item.run, option ? "approval" : undefined, item.id, option)
          closeAsk()
        }
      }),
      registerFlowRun()
    ]
    return () => dispose.forEach(cleanup => cleanup())
  }, [changes, slug, selectedId, registerCommands])
  const updateRun = (item: Run) => saveChanges(slug, current => ({
    ...current,
    runs: { ...current.runs, [item.id]: settledRun(item) }
  }))
  const decide = (item: Approval, option: string) => {
    const denied = /^(deny|denied|reject|keep results local)\b/i.test(option)
    const decision: Approval = {
      ...item,
      state: denied ? "denied" : "approved",
      decided: { by: viewerLogin(), date: MOCK_NOW, option }
    }
    const run = records.find(record => record.id === item.run)
    let continued = run
    if (run) {
      const waitingIndex = run.stages.findIndex(stage => stage.state === "waiting")
      const nextIndex = waitingIndex >= 0 ? waitingIndex : run.stages.findIndex(stage => stage.state === "queued")
      continued = {
        ...run,
        state: "running",
        stages: run.stages.map((stage, i) => i === nextIndex ? {
          ...stage,
          state: "running",
          started: MOCK_NOW,
          duration: undefined,
          summary: `Continuing with: ${option}`,
          log: [...stage.log, `${viewerLogin()} answered: ${option}`, "checkpoint restored; continuing the run"]
        } : stage),
        trace: [...run.trace, {
          at: MOCK_NOW,
          stage: run.stages[nextIndex]?.id ?? "",
          kind: "approval",
          text: `${viewerLogin()}: ${option}`
        }]
      }
    }
    saveChanges(slug, current => ({
      runs: continued ? { ...current.runs, [continued.id]: continued } : current.runs,
      approvals: { ...current.approvals, [item.id]: decision }
    }))
    resolveStackDecision(decision)
    toast("Decision recorded. Run continuing.")
  }
  return { records, decisions, updateRun, decide }
}

export const useStill = () => {
  const location = useLocation()
  return still || new URLSearchParams(location.split("?")[1]).get("still") === "1"
}

export const useElapsed = (started: string, live: boolean) => {
  const frozen = useStill()
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    setElapsed(0)
    if (!live || frozen) return
    const mounted = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - mounted) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [started, live, frozen])
  const seconds = Math.max(0, Math.floor((Date.parse(MOCK_NOW) - Date.parse(started)) / 1000) + elapsed)
  if (!Number.isFinite(seconds)) return "0 s"
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} m ${String(seconds % 60).padStart(2, "0")} s`
  return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} m`
}

export const RunStatus = ({ state, label = false }: { state: string; label?: boolean }) => {
  const frozen = useStill()
  return (
    <span className="repo-runs-status" data-live={state === "running" && !frozen || undefined}>
      <StateIcon state={state} />
      {label && <span>{state.charAt(0).toUpperCase() + state.slice(1)}</span>}
    </span>
  )
}

export const RunDuration = ({ run }: { run: Run }) => {
  const elapsed = useElapsed(run.started, run.state === "running")
  return <span>{run.state === "running" ? elapsed : run.duration}</span>
}

export const StageDuration = ({ stage }: { stage: Stage }) => {
  const elapsed = useElapsed(stage.started ?? MOCK_NOW, stage.state === "running")
  if (stage.state === "skipped" && stage.summary === "Skipped — run cancelled") return <span>{stage.summary}</span>
  return <span>{stage.state === "running" ? elapsed : stage.state === "failed" ? `Failed${stage.duration ? ` · ${stage.duration}` : ""}` : stage.duration ?? (stage.state === "queued" ? "Queued" : stage.state === "waiting" ? "Waiting" : stage.state)}</span>
}

export const RunStarted = ({ date, label = true }: { date: string; label?: boolean }) => (
  <time className="repo-ui-time" dateTime={date} title={new Date(date).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}>
    {label && "Started "}{fmtAgo(date)}
  </time>
)

export const usd = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2
}).format(value)

export const clock = (date: string) => new Date(date).toLocaleTimeString("en-GB", {
  timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit"
})

export const RunsSignedOutNote = () => (
  <p className="repo-runs-public-note">Public run history. Sensitive log values are redacted.</p>
)

export const RunsDenied = ({ act = "approve runs" }: { act?: string }) => (
  <p className="repo-runs-permission" role="note">Only members can {act}.</p>
)

export const RunsSignIn = ({ act }: { act: string }) => <SignInWall act={act} />

export const HeldRunAction = ({ id }: { id?: string }) => {
  const command = id ? `smthrs runs retry ${id}` : `smthrs flow start ${flows[0]?.name ?? ""}`.trim()
  return (
    <div className="repo-runs-held" role="note">
      <HeldCodeChange />
      <div className="repo-runs-command">
        <code>{command}</code>
        <CopyButton text={command} small />
      </div>
    </div>
  )
}

export const RunFlowAction = ({ primary = true }: { primary?: boolean }) => {
  const { flags } = useMock()
  const location = useLocation()
  const [held, setHeld] = useState(false)
  useEffect(() => registerFlowRun(), [repo.slug])
  const className = `repo-ui-btn${primary ? " repo-ui-btn-primary" : ""}`
  if (flags.as === "out") return (
    <Link className={className} title="/signin" to={signInRoute(location)}>Sign in</Link>
  )
  if (flags.role !== "member") return (
    <div className="repo-runs-action-gate">
      <button className={className} title="/flow.run" disabled>Run a flow</button>
      <RunsDenied act="run flows" />
    </div>
  )
  if (flags.host === "hosted" && flags.landing === "install") return (
    <div className="repo-runs-action-gate">
      <button className={className} title="/flow.run" aria-expanded={held} onClick={() => setHeld(!held)}>
        Run a flow
      </button>
      {held && <HeldRunAction />}
    </div>
  )
  return <Link className={className} title="/flow.run" to={to("flows?run=1")}>Run a flow</Link>
}

export const ConfirmCard = ({ question, command, label, onConfirm, onClose, children }: {
  question: string
  command: string
  label: string
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}) => {
  const confirm = useRef<HTMLButtonElement>(null)
  useEffect(() => { confirm.current?.focus() }, [])
  return (
    <div className="repo-runs-confirm" role="group" aria-label={question} onKeyDown={event => {
      if (event.key === "Escape") onClose()
    }}>
      <strong>{question}</strong>
      {children}
      <div className="repo-ui-actions">
        <button ref={confirm} className="repo-ui-btn repo-ui-btn-primary" title={command.replace(/^(\/[\w.-]+)/, "$1.confirm")} onClick={onConfirm}>
          {label}
        </button>
        <button className="repo-ui-btn repo-ui-btn-quiet" title="/cancel" onClick={onClose}>Go back</button>
      </div>
    </div>
  )
}

export const ApprovalCard = ({ item, decide }: {
  item: Approval
  decide: (item: Approval, option: string) => void
}) => {
  const { flags } = useMock()
  const location = useLocation()
  const [option, setOption] = useState<string | null>(() => {
    const query = new URLSearchParams(location.split("?")[1])
    const choice = query.get("option")
    return query.get("confirm") === "approval" && query.get("approval") === item.id
      ? choice && item.options.includes(choice) ? choice : item.options[0] ?? null : null
  })
  useEffect(() => {
    const query = new URLSearchParams(location.split("?")[1])
    if (query.get("confirm") !== "approval" || query.get("approval") !== item.id) return
    const choice = query.get("option")
    setOption(choice && item.options.includes(choice) ? choice : item.options[0] ?? null)
  }, [location, item.id])
  const mine = item.askedOf === viewerLogin()
  return (
    <Box className="repo-runs-approval" header={(
      <div className="repo-runs-approval-heading">
        <RunStatus state={item.state} />
        <strong>{item.title}</strong>
        <Link to={to(`runs/${item.run}`)}>{item.run}</Link>
      </div>
    )}>
      <div className="repo-runs-card-body">
        {decisionStackItems().filter(value => sameDecision(value, item)).map(value => <p key={value.id} className="repo-runs-approval-context"><Link to={to("stack")}>{value.title}</Link>{value.issue && <> · <Link to={to(`issues/${value.issue}`)}>#{value.issue}</Link></>}{value.pull && <> · <Link to={to(`pull/${value.pull}`)}>#{value.pull}</Link></>}</p>)}
        <p className="repo-runs-question">{item.question}</p>
        <div className="repo-runs-approval-by">
          <span>Asked of</span>
          <PersonChip login={item.askedOf} /> ·
          <RelTime date={item.asked} />
        </div>
        {item.decided ? (
          <p className="repo-runs-decision">
            <StateIcon state={item.state} />
            <strong>{item.decided.option}</strong>
            <span>by {item.decided.by}</span>
            <RelTime date={item.decided.date} />
          </p>
        ) : !mine ? (
          <p className="repo-ui-muted">Waiting on {item.askedOf}.</p>
        ) : flags.as === "out" ? (
          <Link className="repo-ui-btn" title="/signin" to={signInRoute(location)}>
            Sign in to answer
          </Link>
        ) : flags.role !== "member" ? (
          <>
            <div className="repo-ui-actions">
              {item.options.map(choice => (
                <button className="repo-ui-btn" key={choice} title={`/approval.answer ${item.id} ${choice}`} disabled>
                  {choice}
                </button>
              ))}
            </div>
            <RunsDenied />
          </>
        ) : option !== null ? (
          <ConfirmCard
            question="Record this decision?"
            command={`/approval.answer ${item.id} ${option}`}
            label="Confirm decision"
            onClose={() => setOption(null)}
            onConfirm={() => { decide(item, option); setOption(null) }}
          >
            <p>{option}</p>
          </ConfirmCard>
        ) : (
          <div className="repo-ui-actions">
            {item.options.map(choice => (
              <button
                className="repo-ui-btn"
                key={choice}
                title={`/approval.answer ${item.id} ${choice}`}
                onClick={() => setOption(choice)}
              >
                {choice}
              </button>
            ))}
          </div>
        )}
      </div>
    </Box>
  )
}

export const triggerLabel = (item: Run) => item.trigger.kind === "manual" ? "Started manually"
  : item.trigger.kind === "issue" || item.trigger.kind === "todo" ? `Started from issue ${item.trigger.ref ?? (item.issue ? "#" + item.issue : "")}`.trim()
  : item.trigger.kind === "pull" ? `Started from pull request ${item.trigger.ref ?? (item.pull ? "#" + item.pull : "")}`.trim()
  : item.trigger.kind === "schedule" ? "Started on schedule" : "Started from a push"
