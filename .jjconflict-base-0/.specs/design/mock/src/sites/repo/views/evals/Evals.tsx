import { useMock, useRead } from "../../../core/mock"
import { Link } from "../../../core/router"
import { fmtAgo, repo, to } from "../../fixtures"
import { Empty, Failed, Loading, } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { PageHeader } from "../../ui"
import { EvalHistory } from "./History"
import { configuredEvals, percent, stateLabel, type SuiteRecord } from "./model"
import { useEvalCommands } from "./actions"
import { EvalSuite } from "./Suite"

export const EvalsLoading = () => <Loading rows={5} />
export const EvalsError = ({ retry }: { retry: () => void }) => <Failed what="eval suites" reason="The eval score store didn't respond." onRetry={retry} />
export const EvalsEmpty = () => <Empty title="No eval suites yet."><Link className="repo-ui-btn repo-ui-btn-primary" to="smithers.sh/smithers-canary/smithers/blob/main/packages/smithers/agent/evals/docs/guides/author-a-suite.md">Read eval setup</Link></Empty>
export const EvalsSignedOut = () => <span className="repo-evals-readonly">Read-only · sign in to run an eval.</span>
export const EvalsReader = () => <span className="repo-evals-readonly">Read-only · members can run evals.</span>

export const EvalState = ({ suite }: { suite: SuiteRecord }) => <span className={`repo-evals-state repo-evals-state-${suite.latest.state}`}><span aria-hidden="true">{suite.latest.state === "pass" ? "✓" : suite.latest.state === "regressed" ? "↓" : "–"}</span>{stateLabel(suite.latest.state)}</span>

export const EvalsReady = () => {
  const suites = configuredEvals()
  const { flags } = useMock()
  return <>
    <PageHeader title={repo.config.evals?.title ?? "Evals"} actions={flags.as === "out" ? <EvalsSignedOut /> : flags.role === "reader" ? <EvalsReader /> : undefined} />
    <div className="repo-evals-list" role="table" aria-label="Eval suites">
      <div className="repo-evals-list-head" role="row"><span role="columnheader">Suite</span><span role="columnheader">Score / baseline</span><span role="columnheader">History</span><span role="columnheader">State</span><span role="columnheader">Last run</span></div>
      {suites.map(suite => <div className="repo-evals-list-row" role="row" key={suite.id}>
        <div className="repo-evals-suite-cell" role="cell"><Link className="repo-evals-suite-title" to={to(`evals/${encodeURIComponent(suite.id)}`)}>{suite.title}</Link>{suite.importedSnapshot ? <span className="repo-evals-file">Imported snapshot · not in this repository</span> : <Link className="repo-evals-file" to={to(`blob/${repo.defaultBranch}/${suite.file}`)}><code>{suite.file}</code></Link>}<span className="repo-evals-row-facts">{suite.scorer}<span aria-hidden="true"> · </span>{suite.threshold}</span></div>
        <div className="repo-evals-score-cell" role="cell">{suite.unexecuted ? <span className="repo-ui-muted">Unexecuted</span> : <><strong>{percent(suite.latest.score)}</strong><span className="repo-ui-muted"> / {percent(suite.latest.baseline)}</span></>}</div>
        <div role="cell"><EvalHistory suite={suite} small /></div>
        <div role="cell"><EvalState suite={suite} /></div>
        <div className="repo-evals-last-run" role="cell">{suite.unexecuted ? "Evidence unavailable" : suite.latest.run.startsWith("run-eval-snapshot-") ? "Recorded snapshot" : <Link to={to(`runs/${suite.latest.run}`)}><time dateTime={suite.latest.date}>{fmtAgo(suite.latest.date)}</time></Link>}</div>
      </div>)}
    </div>
  </>
}

export const Evals = () => {
  return repo.config.evals?.title === "Golden set" ? <EvalSuite id="convert-golden" /> : <EvalsIndex />
}

const EvalsIndex = () => {
  const { flags } = useMock()
  const read = useRead(`evals:${repo.slug}`)
  useEvalCommands()
  return <RepoFrame tab="evals" title={`Evals · ${repo.slug}`} askView="evals" askContext={`evals in ${repo.slug}`}>
    {read.state === "loading" ? <EvalsLoading /> : read.state === "error" ? <EvalsError retry={read.retry} /> : flags.data === "empty" || !repo.config.evals || !configuredEvals().length ? <EvalsEmpty /> : <EvalsReady />}
  </RepoFrame>
}
