import { useId } from "react"
import { fmtDate, repo, to } from "../../fixtures"
import { Link } from "../../../core/router"
import { percent, type SuiteRecord } from "./model"

export const EvalHistory = ({ suite, small = false }: { suite: SuiteRecord; small?: boolean }) => {
  const id = useId()
  if (suite.gate && suite.unexecuted) return <p className="repo-evals-history">No held-out model runs.</p>
  if (suite.latest.run.startsWith("run-eval-snapshot-")) return <figure className={`repo-evals-history${small ? " repo-evals-sparkline" : ""}`} aria-label="Recorded snapshot">
    {suite.unexecuted ? <span className="repo-ui-muted">Unexecuted</span> : <span>Snapshot · {percent(suite.latest.score)} <span className="repo-ui-muted">/ {percent(suite.latest.baseline)} baseline</span></span>}
    {!small && !suite.importedSnapshot && <figcaption><Link to={to(`blob/${repo.defaultBranch}/${suite.sourceFile ?? suite.file}`)}>Source</Link></figcaption>}
  </figure>
  const width = small ? 128 : 720
  const height = small ? 36 : 180
  const pad = small ? 4 : 28
  const horizontalPad = small ? 4 : 0
  const samples = suite.history
  const x = (index: number) => horizontalPad + (samples.length <= 1 ? 0.5 : index / (samples.length - 1)) * (width - 2 * horizontalPad)
  const y = (score: number) => height - pad - Math.min(1, Math.max(0, score)) * (height - 2 * pad)
  const points = samples.map((sample, i) => `${x(i)},${y(sample.score)}`).join(" ")
  return (
    <figure className={`repo-evals-history${small ? " repo-evals-sparkline" : ""}`}>
      <div className={small ? undefined : "repo-evals-plot"}>
      {!small && [0, 0.5, 1].map(score => <span key={score} className="repo-evals-axis-label" aria-hidden="true" style={{ top: `${y(score) / height * 100}%` }}>{score * 100}</span>)}
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={small ? undefined : "none"} role="img" aria-labelledby={id}>
        <title id={id}>{suite.title}: {samples.map(point => `${fmtDate(point.date)} ${percent(point.score)}`).join(", ")}. Baseline {percent(suite.latest.baseline)}.</title>
        {!small && [0, 0.5, 1].map(score => <g key={score} className="repo-evals-gridline"><line x1={horizontalPad} x2={width - horizontalPad} y1={y(score)} y2={y(score)} /></g>)}
        <line className="repo-evals-baseline" x1={horizontalPad} x2={width - horizontalPad} y1={y(suite.latest.baseline)} y2={y(suite.latest.baseline)} />
        {samples.length > 1 && <polyline className="repo-evals-trend" points={points} />}
        {samples.map((sample, i) => <circle className="repo-evals-point" key={`${sample.date}:${i}`} cx={x(i)} cy={y(sample.score)} r={small ? 2 : 3.5}><title>{fmtDate(sample.date)}: {percent(sample.score)}</title></circle>)}
      </svg>
      </div>
      {!small && <figcaption><span>{samples[0] ? fmtDate(samples[0].date) : "No history"}</span><span className="repo-evals-chart-key">Score <span aria-hidden="true">—</span> Baseline <span aria-hidden="true">┄</span></span><span>{samples.at(-1) ? fmtDate(samples.at(-1)!.date) : ""}</span></figcaption>}
    </figure>
  )
}
