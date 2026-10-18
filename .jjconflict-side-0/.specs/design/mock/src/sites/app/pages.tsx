/* Deep-link pages: tree, blob, issues, changes, runs — each opens its card large atop the repo transcript. */
import { useMock } from "../core/mock"
import type { RouteContext } from "../core/router"
import { BlobCard, ChangesCard, IssueCard, IssuesCard, PrCard, RunCard, TreeCard } from "./cards"
import type { RepoData } from "./data"
import { INSTALL_REPLY, RepoPage } from "./repo"
import { Card, Markdown } from "./lib"
import { Link } from "../core/router"

export const TreePage = ({ context }: { context: RouteContext }) => {
  const dir = context.params["*"] ?? ""
  return (
    <RepoPage
      context={context}
      topRail={{ id: "tree", label: dir === "" ? "Files" : dir }}
      topCard={(repo: RepoData) => <div data-rail="tree"><TreeCard repo={repo} dir={dir} /></div>}
    />
  )
}

export const BlobPage = ({ context }: { context: RouteContext }) => {
  const path = context.params["*"] ?? ""
  return (
    <RepoPage
      context={context}
      topRail={{ id: "blob", label: path.split("/").pop() ?? path }}
      topCard={(repo: RepoData) => <div data-rail="blob"><BlobCard repo={repo} path={path} query={context.query} /></div>}
    />
  )
}

export const IssuesPage = ({ context }: { context: RouteContext }) => {
  const view = context.query.get("view") ?? "open"
  return (
    <RepoPage
      context={context}
      topRail={{ id: "issues", label: view === "factory" ? "Fixed by agents" : "Issues" }}
      topCard={(repo: RepoData) => <div data-rail="issues"><IssuesCard repo={repo} view={view} /></div>}
    />
  )
}

export const IssuePage = ({ context }: { context: RouteContext }) => {
  const n = Number(context.params.n)
  return (
    <RepoPage
      context={context}
      topRail={{ id: "issue", label: `Issue #${n}` }}
      topCard={(repo: RepoData) => {
        let issue = repo.issues.find(each => each.n === n)
        try { const published = JSON.parse(sessionStorage.getItem(`app-published:${repo.slug}`) ?? "null"); if (published?.n === n) issue = published } catch { /* storage unavailable */ }
        return (
          <div data-rail="issue">
            {issue === undefined ? (
              <Card title={`No issue #${n} on ${repo.slug}.`}>
                <p className="app-pr-note" style={{ marginBottom: 12 }}>It may have been renamed or deleted.</p>
                <Link to={`smithers.sh/${repo.slug}/issues`} className="app-btn app-btn-secondary app-btn-sm">All issues</Link>
              </Card>
            ) : <IssueCard repo={repo} issue={issue} />}
          </div>
        )
      }}
    />
  )
}

export const PullsPage = ({ context }: { context: RouteContext }) => (
  <RepoPage
    context={context}
    topRail={{ id: "pulls", label: "Changes" }}
    topCard={(repo: RepoData) => <div data-rail="pulls"><ChangesCard repo={repo} /></div>}
  />
)

export const PullPage = ({ context }: { context: RouteContext }) => {
  const { flags } = useMock()
  const n = Number(context.params.n)
  return (
    <RepoPage
      context={context}
      topRail={{ id: "pull", label: `Change #${n}` }}
      topCard={(repo: RepoData) => {
        const pull = repo.pulls.find(each => each.n === n)
        const member = flags.as === "in" && (repo.memberButtons || flags.role === "member")
        return (
          <div data-rail="pull">
            {pull === undefined ? (
              <Card title={`No change #${n} on ${repo.slug}.`}>
                <p className="app-pr-note" style={{ marginBottom: 12 }}>It may have been renamed or deleted.</p>
                <Link to={`smithers.sh/${repo.slug}/pulls`} className="app-btn app-btn-secondary app-btn-sm">All changes</Link>
              </Card>
            ) : <PrCard repo={repo} pull={pull} state={context.query.get("state")} member={member} />}
          </div>
        )
      }}
    />
  )
}

const RUN_STAGE: Record<string, number> = { admitted: 0, allocating: 1, cloning: 2, model: 3, verifying: 4 }

export const RunPage = ({ context }: { context: RouteContext }) => {
  const { flags } = useMock()
  const id = context.params.id
  return (
    <RepoPage
      context={context}
      topRail={{ id: "run", label: `Run ${id}` }}
      topCard={(repo: RepoData) => {
        if (flags.landing === "install" && context.query.has("run")) return <div data-rail="run"><Card title="Changes run on your machine"><Markdown source={INSTALL_REPLY} resolve={href => href.startsWith("https:") ? { kind: "external", href } : { kind: "route", to: href }} /></Card></div>
        const run = repo.runs.find(each => each.id === id)
        if (run === undefined) {
          return (
            <div data-rail="run">
              <Card title={`No run ${id} on ${repo.slug}.`}>
                <p className="app-pr-note" style={{ marginBottom: 12 }}>It may belong to another repo.</p>
                <Link to={`smithers.sh/${repo.slug}`} className="app-btn app-btn-secondary app-btn-sm">Open {repo.slug}</Link>
              </Card>
            </div>
          )
        }
        const member = flags.as === "in" && (repo.memberButtons || flags.role === "member")
        const override = context.query.get("run")
        let status = run.status
        let activeStage = run.activeStage
        if (override !== null && override in RUN_STAGE) { status = "running"; activeStage = RUN_STAGE[override] }
        if (override === "needs-you") { status = "needs-you"; activeStage = 3 }
        if (override === "failed") { status = "failed"; activeStage = 4 }
        if (override === "pr" || override === "merged") { status = "done"; activeStage = run.stages.length - 1 }
        const pull = (override === "pr" || override === "merged") ? repo.pulls.find(each => each.state === "open") ?? repo.pulls[0] : undefined
        return (
          <div data-rail="run" style={{ display: "grid", gap: 24 }}>
            <RunCard repo={repo} run={run} status={status} activeStage={activeStage} failureNote={status === "failed" ? "Verifying failed: 2 tests already fail on main before this change." : undefined} member={member} />
            {pull !== undefined && <PrCard repo={repo} pull={pull} state={override === "merged" ? "merged" : null} member={member} />}
          </div>
        )
      }}
    />
  )
}

export const CommitPage = ({ context }: { context: RouteContext }) => <RepoPage context={context} topRail={{ id: "commit", label: context.params.sha }} topCard={repo => {
  const issue = repo.issues.find(issue => issue.receipt?.commit === context.params.sha)
  return <div data-rail="commit"><Card title={`Commit ${context.params.sha}`}><p>{issue?.title ?? "Commit not found"}</p>{issue && <><p className="app-pr-note">Commit on main · {issue.receipt?.reported}</p><Link to={`smithers.sh/${repo.slug}/issues/${issue.n}`}>#{issue.n}</Link><Markdown source={issue.body} resolve={() => ({ kind: "text" })} /></>}</Card></div>
}} />
