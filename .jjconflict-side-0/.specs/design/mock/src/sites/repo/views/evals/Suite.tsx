import { signInRoute } from "../../../core/catalog"
import { useEffect, useRef, useState } from "react"
import { useMock, useRead } from "../../../core/mock"
import { Link, navigate, useLocation } from "../../../core/router"
import { MOCK_NOW, repo, runs, to } from "../../fixtures"
import type { Run } from "../../fixtures/types"
import { Denied, Empty, Failed, Loading, registerSlash, SignInWall } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { Box, CopyButton, PageHeader, toast } from "../../ui"
import { DocsCode } from "../hovers"
import { EvalState, EvalsEmpty } from "./Evals"
import { EvalHistory } from "./History"
import { useEvalCommands } from "./actions"
import { configuredEvals, percent, type SuiteRecord } from "./model"

export const EvalSuiteLoading = () => <Loading variant="detail" rows={6} />
export const EvalSuiteError = ({ retry }: { retry: () => void }) => <Failed what="this eval" reason="The eval score store didn't respond." onRetry={retry} />
export const EvalSuiteEmpty = ({ suite }: { suite?: SuiteRecord }) => suite?.gate ? <Empty title="No golden results"><p>20 held-out cases · .smithers/flows/convert/golden/</p><Link className="repo-ui-btn repo-ui-btn-primary" to={to(`tree/${repo.defaultBranch}/.smithers/flows/convert/golden`)}>Open golden cases</Link></Empty> : <EvalsEmpty />
export const EvalSuiteSignedOut = () => <SignInWall act="run this eval" />
export const EvalSuiteReader = () => <Denied act="run evals" />
export const EvalSuiteMissing = () => <Empty title="Eval suite not found." action={<Link className="repo-ui-btn" to={to("evals")}>All evals</Link>} />

export const EvalSuiteHeld = ({ suite }: { suite: SuiteRecord }) => <div className="repo-evals-held"><p>Hosted eval runs are held.</p>{suite.runnable === false ? <p>{suite.unavailable ?? "No executable suite module is registered."}</p> : <><p>Run it locally:</p><div className="repo-evals-command"><code>smthrs eval run {suite.file}</code><CopyButton text={`smthrs eval run ${suite.file}`} /></div></>}</div>

const SelectedCase = ({ suite, id }: { suite: SuiteRecord; id: string }) => {
  const card = useRef<HTMLElement>(null)
  useEffect(() => {
    card.current?.scrollIntoView({ block: "start" })
    card.current?.focus({ preventScroll: true })
  }, [id])
  const entry = suite.cases.find(entry => entry.id === id)
  if (!entry) return <Empty title="Golden case not found" />
  return <section className="repo-evals-selected" ref={card} tabIndex={-1} aria-label="Selected golden case">
    <h2>{entry.title}</h2><code>{entry.id}</code>
    {[["Input · TypeScript", entry.input], ["Expected · VibeLang", entry.expected], ["Model output · VibeLang", entry.actual]].map(([label, code]) => <div className="repo-evals-case-source" key={label}><h3>{label}</h3>{code ? <DocsCode code={code} /> : <p>Model conversion not run.</p>}</div>)}
    <div><h3>Compiler diagnostics</h3><p>{entry.diagnostics ?? "No actual model output to compile."}</p></div>
    {entry.source && <Link to={to(`blob/${repo.defaultBranch}/${entry.source}`)}>Expected source</Link>}
  </section>
}

export const EvalCases = ({ suite }: { suite: SuiteRecord }) => {
  const location = useLocation()
  const [expanded, setExpanded] = useState<string[]>(() => {
    const id = new URLSearchParams(location.split("?")[1]).get("case")
    return id ? [id] : []
  })
  return <Box header={suite.unexecuted ? `Cases · ${suite.cases.length} unexecuted` : `Cases · ${suite.latest.passed}/${suite.latest.total} pass`}>
    <table className="repo-evals-cases" aria-label="Eval cases">
      <thead><tr><th scope="col">Case</th><th scope="col">Score</th><th scope="col">Baseline</th><th scope="col">Result</th></tr></thead>
      {suite.cases.map(entry => <tbody className="repo-evals-case" key={entry.id}>
        <tr><th scope="row"><button id={`repo-evals-case-${entry.id}`} className="repo-evals-case-toggle" title={`/eval.case ${suite.id} ${entry.id}`} aria-expanded={expanded.includes(entry.id)} aria-controls={`repo-evals-detail-${entry.id}`} onClick={() => setExpanded(current => current.includes(entry.id) ? current.filter(id => id !== entry.id) : [...current, entry.id])}><span>{entry.title}</span><span className="repo-evals-expand" aria-hidden="true">{expanded.includes(entry.id) ? "⌃" : "⌄"}</span></button></th>
          <td data-label="Score">{suite.unexecuted ? "—" : percent(entry.score)}</td><td data-label="Baseline" className="repo-ui-muted">{suite.unexecuted ? "—" : percent(entry.baseline)}</td><td data-label="Result" className={suite.unexecuted ? "repo-ui-muted" : entry.passed ? "repo-evals-case-pass" : "repo-evals-case-fail"}>{suite.unexecuted ? "Unexecuted" : entry.passed ? "Pass" : "Fail"}</td></tr>
        <tr hidden={!expanded.includes(entry.id)} id={`repo-evals-detail-${entry.id}`}><td colSpan={4} className="repo-evals-case-detail"><code>{entry.id}</code><p>{entry.detail ?? `${entry.passed ? "Met" : "Missed"} the declared case threshold.`}</p>{suite.gate && <Link to={`${to(`evals/${suite.id}`)}?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.split("?")[1])), case: entry.id })}`}>Open case evidence</Link>}</td></tr>
      </tbody>)}
    </table>
  </Box>
}

export const EvalSuiteReady = ({ suite }: { suite: SuiteRecord }) => {
  const { flags } = useMock()
  const location = useLocation()
  const selected = new URLSearchParams(location.split("?")[1]).get("case")
  const confirm = new URLSearchParams(location.split("?")[1]).get("act") === "run"
  const card = useRef<HTMLElement>(null)
  const [started, setStarted] = useState<string | null>(null)
  const starting = useRef(false)
  const path = () => {
    const query = new URLSearchParams(location.split("?")[1]); query.delete("act")
    return `${to(`evals/${encodeURIComponent(suite.id)}`)}${query.size ? `?${query}` : ""}`
  }
  const open = () => {
    const query = new URLSearchParams(location.split("?")[1]); query.set("act", "run")
    navigate(`${to(`evals/${encodeURIComponent(suite.id)}`)}?${query}`)
  }
  const canRun = flags.as === "in" && flags.role === "member"
  const held = flags.host === "hosted" && flags.landing === "install"
  const start = () => {
    if (!canRun || held || suite.runnable === false || starting.current || (flags.host === "hosted" && flags.hosted === "paused")) return
    const existing = runs.find(run => run.id.startsWith(`run-eval-mock-${suite.id}-`) && ["queued", "running"].includes(run.state))
    if (existing) { setStarted(existing.id); return }
    starting.current = true
    const id = `run-eval-mock-${suite.id}-${Date.now()}`
    const record: Run = {
      id, flow: "eval.run", title: `Eval: ${suite.title}`, state: "queued", trigger: { kind: "manual", by: "maya", ref: suite.id },
      harness: "Offline suite", started: MOCK_NOW, duration: "Queued", cost: { usd: 0, tokens: 0 }, approvals: [],
      stages: [{ id: "evaluate", label: "Evaluate", state: "queued", summary: "Waiting for a worker.", log: [`Requested ${suite.file}.`, "Waiting for a worker."] }],
      trace: [{ at: MOCK_NOW, stage: "evaluate", kind: "message", text: `maya requested ${suite.id}. Waiting for a worker.` }]
    }
    runs.unshift(record)
    repo.counts.runsActive += 1
    setStarted(id)
    toast("Eval queued.")
    starting.current = false
  }
  useEffect(() => { if (confirm) card.current?.focus({ preventScroll: true }) }, [confirm])
  useEffect(() => {
    const dispose = [
      registerSlash("eval.confirm", { purpose: "Confirm eval run", confirm: false, fields: [], run: () => start() }),
      registerSlash("eval.case", {
        purpose: "Open eval case", confirm: false, access: "public",
        fields: [{ name: "suite", label: "Suite", options: [suite.id] }, { name: "case", label: "Case", options: suite.cases.map(entry => entry.id) }],
        run: (values, { closeAsk }) => {
          if (suite.gate) {
            const query = new URLSearchParams(location.split("?")[1]); query.set("case", values.case)
            navigate(`${to(`evals/${suite.id}`)}?${query}`)
            closeAsk()
            return
          }
          const button = document.getElementById(`repo-evals-case-${values.case}`)
          button?.click()
          button?.focus()
        }
      })
    ]
    return () => dispose.forEach(cleanup => cleanup())
  }, [suite, location, canRun, held, flags.hosted, flags.host])
  return <div className="repo-evals-suite">
    <nav className="repo-evals-crumb" aria-label="Evals"><Link to={to("evals")}>Evals</Link><span>/</span><span>{suite.id}</span></nav>
    <PageHeader title={suite.title} actions={flags.as === "out" ? confirm ? null : <Link className="repo-ui-btn repo-ui-btn-primary" to={signInRoute(location)} title="/signin">Sign in to run</Link> : flags.role !== "member" ? <span className="repo-evals-readonly">Members can run evals.</span> : <button className={`repo-ui-btn${confirm ? "" : " repo-ui-btn-primary"}`} title={`/eval.run ${suite.id}`} onClick={open} aria-expanded={confirm} aria-controls="repo-evals-confirm">Run this eval</button>}>
      <div className="repo-evals-suite-subtitle"><EvalState suite={suite} />{suite.importedSnapshot ? <span>Imported snapshot · not in this repository</span> : <Link to={to(`blob/${repo.defaultBranch}/${suite.file}`)}><code>{suite.file}</code></Link>}</div>
    </PageHeader>
    {confirm && <section className="repo-evals-confirm" id="repo-evals-confirm" ref={card} tabIndex={-1} aria-labelledby="repo-evals-confirm-title"><div className="repo-evals-confirm-heading"><h2 id="repo-evals-confirm-title">Run {suite.title}?</h2><button className="repo-ui-btn repo-ui-btn-quiet" title="/eval.cancel" onClick={() => navigate(path())}>Cancel</button></div>
      {flags.as === "out" ? <EvalSuiteSignedOut /> : flags.role !== "member" ? <EvalSuiteReader /> : held ? <EvalSuiteHeld suite={suite} /> : suite.runnable === false ? <p>{suite.unavailable ?? "No executable suite module is registered."}</p> : flags.host === "hosted" && flags.hosted === "paused" ? <p>Hosted machines are paused. Try again when they resume.</p> : started ? <p role="status">Queued · <Link to={to(`runs/${started}`)}>View run</Link></p> : <><p><code>{suite.file}</code></p><button className="repo-ui-btn repo-ui-btn-primary" title="/eval.confirm" onClick={start}>Confirm run</button></>}
    </section>}
    {selected && suite.gate && <SelectedCase suite={suite} id={selected} />}
    <dl className="repo-evals-facts"><div><dt>Score / baseline</dt><dd>{suite.unexecuted ? <span className="repo-ui-muted">Unexecuted</span> : <><strong>{percent(suite.latest.score)}</strong><span className="repo-ui-muted"> / {percent(suite.latest.baseline)}</span></>}</dd></div><div><dt>Scorer</dt><dd>{suite.scorer}</dd></div><div><dt>Threshold</dt><dd>{suite.threshold}</dd></div><div><dt>{suite.latest.run.startsWith("run-eval-snapshot-") ? "Evidence" : "Last run"}</dt><dd>{suite.unexecuted ? "Evidence unavailable" : suite.importedSnapshot ? "Imported snapshot · not in this repository" : suite.latest.run.startsWith("run-eval-snapshot-") ? <Link to={to(`blob/${repo.defaultBranch}/${suite.sourceFile ?? suite.file}`)}>Recorded snapshot</Link> : <Link to={to(`runs/${suite.latest.run}`)}><time dateTime={suite.latest.date}>{new Date(suite.latest.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</time></Link>}</dd></div></dl>
    {suite.note && <p className="repo-evals-note">{suite.note}</p>}
    {suite.gate && <section className="repo-evals-gate" aria-label="Gate evidence"><strong className="repo-evals-case-fail">Holdout {suite.gate.holdout} · gate not run</strong><dl>{Object.entries(suite.gate.identities).map(([key, digest]) => <div key={key}><dt>{key} digest</dt><dd><code>{digest ?? "No model execution receipt"}</code></dd></div>)}</dl><Link to={to(`runs/${suite.gate.validation.run}`)}>{suite.gate.validation.kind} · {suite.gate.validation.passed}/{suite.gate.validation.total} · excluded from gate</Link><Link to={to("evals/docs-examples-compile")}>Docs examples compile</Link></section>}
    <Box header={suite.latest.run.startsWith("run-eval-snapshot-") ? "Recorded snapshot" : "Score history"}><EvalHistory suite={suite} /></Box>
    <EvalCases key={`${suite.id}:${selected}`} suite={suite} />
  </div>
}

export const EvalSuite = ({ id }: { id: string }) => {
  const { flags } = useMock()
  const read = useRead(`eval:${repo.slug}:${id}`)
  const suite = configuredEvals().find(value => value.id === id)
  useEvalCommands()
  return <RepoFrame tab="evals" title={`${suite?.title ?? "Eval"} · ${repo.slug}`} askView="evals" askContext={suite ? `the ${suite.title} eval` : `evals in ${repo.slug}`}>
    {read.state === "loading" ? <><EvalSuiteLoading />{suite?.gate && <p>Loading converter golden set…</p>}</> : read.state === "error" ? <EvalSuiteError retry={read.retry} /> : flags.data === "empty" || !configuredEvals().length ? <EvalSuiteEmpty suite={suite} /> : !suite ? <EvalSuiteMissing /> : <EvalSuiteReady key={`${repo.slug}:${id}`} suite={suite} />}
  </RepoFrame>
}
