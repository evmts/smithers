import { HeldCodeChange } from "../../repo/ui/HeldCodeChange"
import { pluralize } from "../../repo/ui/pluralize"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { useMock, useRead } from "../../core/mock"
import { Link, navigate, useLocation } from "../../core/router"
import { repo, shortSha, to } from "../../repo/fixtures"
import { extras } from "../../repo/fixtures/data/Effect-TS__effect"
import { Denied, Empty, Failed, Loading, registerSlash, RepoFrame, SignInWall, usePackageScope } from "../../repo/frame"
import { AgentMark, CopyButton, Icon, Markdown, PageHeader } from "../../repo/ui"
import { computePreview, hydrateVersionPull, loadSession, movedHead, preparationFailure, previewIsStale, saveSession, slugOf, versionPullNumber, type ReleaseSession } from "./model"

export const ReleasePlanLoading = () => <Loading variant="detail" rows={8} />
export const ReleasePlanFailed = ({ retry }: { retry: () => void }) => <Failed what="the release plan" reason="The repository host didn't return the changesets and package manifests." onRetry={retry} />
export const ReleasePlanEmpty = () => <Empty title="No pending changesets" action={<Link className="repo-ui-btn" to={to("releases")}>Releases</Link>} />
export const ReleasePlanSignedOut = () => <SignInWall act="prepare a version PR" />
export const ReleasePlanDenied = () => <Denied act="prepare a version PR" />

export const ReleasePlanHeld = () => <section data-repo-action className="effect-release-held" aria-label="Run locally" role="status">
  <HeldCodeChange />
  <div className="effect-release-command"><code>pnpm changeset version</code><CopyButton text="pnpm changeset version" /></div>
</section>

export const ReleasePlanStale = () => <div className="effect-release-notice effect-release-notice-warning" role="status">
  <Icon name="clock" /><div><h2>Main moved since this preview</h2><p>Preview again before preparing the version PR.</p></div>
</div>

export const ReleasePlanRunning = () => <section className="effect-release-progress" role="status" aria-live="polite">
  <span className="effect-release-spinner" aria-hidden="true" />
  <div><h2>Preparing version PR</h2><p>Updating versions and changelogs on <code>changeset-release/main</code>.</p></div>
  <Link to={to(`runs/${extras.releasePlan.preview.run}`)}>Open run</Link>
</section>

export const ReleasePlanExisting = () => {
  const { withScope } = usePackageScope()
  return <section className="effect-release-notice effect-release-notice-review" aria-live="polite">
    <Icon name="change" /><div><h2>Version PR is open</h2>
      <Link to={withScope(to(`pull/${versionPullNumber}`))}>Version packages <span>#{versionPullNumber}</span></Link>
      <p>Awaiting a person’s review and merge.</p>
      <AgentMark agent={hydrateVersionPull().agent} />
    </div>
  </section>
}

const Changesets = () => <section className="effect-release-box" aria-labelledby="effect-release-changesets">
  <header><h2 id="effect-release-changesets">Pending changesets</h2><span>{extras.releasePlan.changesets.length}</span></header>
  {extras.releasePlan.changesets.map(changeset => <article className="effect-release-changeset" key={changeset.id}>
    <div className="effect-release-changeset-bumps">{changeset.packages.map(pkg => <span key={pkg.name}><code>{pkg.name}</code><span aria-hidden="true"> → </span><span>{pkg.type}</span></span>)}</div>
    <Link className="effect-release-summary" to={to(`blob/${repo.defaultBranch}/${changeset.path}`)} title={changeset.path}><Markdown source={changeset.summary} /></Link>
    <Link className="effect-release-file" to={to(`blob/${repo.defaultBranch}/${changeset.path}`)}><Icon name="file" size={13} />{changeset.id}.md</Link>
  </article>)}
</section>

const PackageLink = ({ name }: { name: string }) => {
  const pkg = repo.config.packages?.find(value => value.name === name)
  return pkg ? <Link to={to(`packages/${slugOf(pkg)}?package=${slugOf(pkg)}`)}><code>{name}</code></Link> : <code>{name}</code>
}

const Impact = ({ session }: { session: ReleaseSession }) => {
  const plan = extras.releasePlan
  const preview = session.preview
  const dependencyPackages = new Set(plan.dependencyPropagation.map(value => value.package)).size
  return <section className="effect-release-box" aria-labelledby="effect-release-impact">
    <header><h2 id="effect-release-impact">Release impact</h2><span>{plan.fixedGroup.length} public {pluralize(plan.fixedGroup.length, "package")}</span></header>
    <div className={`effect-release-version${preview ? " effect-release-version-computed" : ""}`}>
      <code>{plan.currentVersion}</code><span className="effect-release-arrow" aria-hidden="true">→</span><strong><code>{preview?.nextVersion ?? "4.0.0-rc.N"}</code></strong>
      <span>{preview ? "Preview computed" : "Next version after preview"}</span>
    </div>
    <div className="effect-release-direct"><span>Direct changes</span><PackageLink name="effect" /><span>patch · 2 changesets</span></div>
    <details className="effect-release-disclosure">
      <summary><span>Fixed group</span><span>{plan.fixedGroupExpansion.length} more {pluralize(plan.fixedGroupExpansion.length, "package")}</span><Icon name="chevron-down" size={14} /></summary>
      <p>All {plan.fixedGroup.length} public {pluralize(plan.fixedGroup.length, "package")} move together.</p>
      <div className="effect-release-package-grid">{plan.fixedGroup.map(name => <PackageLink key={name} name={name} />)}</div>
    </details>
    <details className="effect-release-disclosure">
      <summary><span>Dependency propagation</span><span>{dependencyPackages} packages</span><Icon name="chevron-down" size={14} /></summary>
      <p>Included in the fixed group.</p>
      <div className="effect-release-dependencies">{plan.dependencyPropagation.map(dependency => <div key={`${dependency.package}:${dependency.dependency}`}>
        <PackageLink name={dependency.package} /><span>→</span><PackageLink name={dependency.dependency} /><span>{dependency.kind}</span>
      </div>)}</div>
    </details>
    <details className="effect-release-disclosure">
      <summary><span>Excluded</span><span>{plan.privatePackagesExcluded.length} private tools</span><Icon name="chevron-down" size={14} /></summary>
      <div className="effect-release-package-grid">{plan.privatePackagesExcluded.map(name => <PackageLink key={name} name={name} />)}</div>
    </details>
  </section>
}

type ReadyProps = {
  session: ReleaseSession
  stale: boolean
  confirming: boolean
  gate?: ReactNode
  onPreview: () => void
  onPrepare: () => void
  onConfirm: () => void
  onCancel: () => void
}
export const ReleasePlanReady = ({ session, stale, confirming, gate, onPreview, onPrepare, onConfirm, onCancel }: ReadyProps) => {
  const { scope, withScope } = usePackageScope()
  const opened = session.state === "opened"
  const running = session.state === "running"
  const prepared = Boolean(session.preview) && !stale
  const showConfirmation = confirming && prepared
  const action = opened
    ? <Link className="repo-ui-btn repo-ui-btn-primary" title="/release.prepare" to={withScope(to(`pull/${versionPullNumber}`))}>Open version PR</Link>
    : !showConfirmation && !running && !gate
      ? <button className="repo-ui-btn repo-ui-btn-primary" title={prepared ? "/release.prepare" : "/release.preview"} onClick={prepared ? onPrepare : onPreview}>{prepared ? "Prepare version PR" : stale ? "Preview again" : "Preview release"}</button>
      : undefined
  return <div className="effect-release-page">
    <nav className="effect-release-breadcrumb" aria-label="Breadcrumb"><Link to={withScope(to("releases"))}>Releases</Link><span>/</span><span>Version packages</span></nav>
    <PageHeader title="Version packages" />
    <section className="effect-release-top-summary" aria-label="Release summary">
      <p><code>{extras.releasePlan.currentVersion}</code> → {session.preview?.nextVersion ? <code>{session.preview.nextVersion}</code> : <span>Preview needed</span>} · {extras.releasePlan.fixedGroup.length} public {pluralize(extras.releasePlan.fixedGroup.length, "package")}</p>
        <div className="effect-release-actions">
          {action}
          {gate}
          {showConfirmation && !gate && !running && !opened && <section data-repo-action className="effect-release-confirm" aria-labelledby="effect-release-confirm-title">
            <h2 id="effect-release-confirm-title">Prepare version PR?</h2>
            <p>{session.preview?.packages.length} {pluralize(session.preview?.packages.length ?? 0, "package")} → <code>{session.preview?.nextVersion}</code></p>
            <p>You review and merge. The Release workflow publishes.</p>
            <form onSubmit={event => { event.preventDefault(); onConfirm() }}><button autoFocus className="repo-ui-btn repo-ui-btn-primary" title="/release.prepare.confirm">Prepare version PR</button><button type="button" className="repo-ui-btn repo-ui-btn-quiet" title="/release.prepare.cancel" onClick={onCancel}>Cancel</button></form>
          </section>}
        </div>
    </section>
    {scope && <p className="effect-release-scope"><code>{scope.name}</code> selected · Release includes all 31 public packages.</p>}
    <div className="effect-release-layout">
      <div className="effect-release-main">
        {stale && !opened && <ReleasePlanStale />}
        {opened && <ReleasePlanExisting />}
        {running && <ReleasePlanRunning />}
        {session.state === "failed" && <div className="effect-release-notice effect-release-notice-danger" role="alert"><Icon name="x" /><div><h2>Couldn’t prepare the version PR</h2><p>{preparationFailure}</p><button className="repo-ui-btn" title="/release.prepare" onClick={onPrepare}>Retry preparation</button></div></div>}
        <Impact session={session} />
        <details className="effect-release-changesets-detail"><summary>{extras.releasePlan.changesets.length} pending changesets</summary><Changesets /></details>

      </div>
      <aside className="effect-release-sidebar">
        <section><h2>Prerelease</h2><p><code>{extras.releasePlan.tag}</code><span>npm tag</span></p><Link to={to(`blob/${repo.defaultBranch}/.changeset/pre.json`)}><Icon name="file" size={14} />.changeset/pre.json</Link></section>
        <section><h2>Changesets</h2><Link to={to(`blob/${repo.defaultBranch}/${extras.releasePlan.source}`)}>Fixed group configuration</Link><Link to={to(`tree/${repo.defaultBranch}/${extras.releasePlan.historyDirectory}`)}>Prerelease history</Link></section>
        <section><h2>After merge</h2><Link to={to(`blob/${repo.defaultBranch}/${extras.releasePlan.releaseWorkflow}`)}><Icon name="file" size={14} />Release workflow</Link></section>
        {session.preview && <section><h2>Preview</h2><Link to={to(`commit/${session.preview.base}`)}><code>{shortSha(session.preview.base)}</code></Link><Link to={to(`runs/${extras.releasePlan.preview.run}`)}>Open run</Link></section>}
      </aside>
    </div>
  </div>
}

const ReleasePlanContent = () => {
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const { flags } = useMock()
  const { scope, withScope } = usePackageScope()
  const read = useRead(`release-plan:${repo.slug}:${repo.defaultBranch}:${scope?.slug ?? "all"}`)
  const [session, setSession] = useState<ReleaseSession>(() => {
    const scenario = query.get("screen")
    if (scenario) {
      const preview = query.get("preview") === "1" || query.has("stale") || query.has("existing") || query.has("preparing") || query.has("failed") ? computePreview() : null
      return { preview, state: query.has("existing") ? "opened" : query.has("preparing") ? "running" : query.has("failed") ? "failed" : "idle" }
    }
    const saved = loadSession()
    if (query.has("existing")) return { preview: computePreview(), state: "opened" }
    if (query.has("stale")) return { preview: computePreview(), state: "idle" }
    if (query.get("preview") === "1" && saved.state !== "opened") return { preview: computePreview(), state: "idle" }
    return saved
  })
  const [confirming, setConfirming] = useState(query.get("act") === "prepare")
  const [gateRequested, setGateRequested] = useState(query.get("act") === "prepare")
  const preparing = useRef(session.state === "running")
  const currentHead = query.has("stale") ? movedHead : extras.releasePlan.preview.baseSha
  const stale = Boolean(session.preview && previewIsStale(session.preview, currentHead))
  const held = flags.host === "hosted" && flags.landing === "install"
  const persist = (next: ReleaseSession) => { saveSession(next); setSession(next) }
  const preview = () => {
    if (read.state !== "ready" || flags.data === "empty" || preparing.current) return
    const next = { ...session, preview: computePreview(currentHead), state: "idle" as const }
    persist(next); setConfirming(false); setGateRequested(false)
  }
  const prepare = () => {
    if (read.state !== "ready" || flags.data === "empty") return
    if (session.state === "opened") { navigate(withScope(to(`pull/${versionPullNumber}`))); return }
    if (preparing.current) return
    if (flags.as === "out" || flags.role !== "member" || held) { setGateRequested(true); return }
    if (!session.preview || stale) { preview(); return }
    setConfirming(true)
  }
  const confirm = () => {
    if (session.state === "opened") { navigate(withScope(to(`pull/${versionPullNumber}`))); return }
    if (preparing.current || flags.as === "out" || flags.role !== "member" || held || !session.preview || stale) return
    preparing.current = true
    setConfirming(false)
    persist({ ...session, state: "running", requestedAt: Date.now() })
  }
  const callbacks = useRef({ preview, prepare, confirm })
  callbacks.current = { preview, prepare, confirm }
  useEffect(() => {
    const cancel = () => { setConfirming(false); setGateRequested(false) }
    const dispose = [
      registerSlash("release.preview", { purpose: "Preview release", access: "public", fields: [], confirm: false, run: (_, context) => { callbacks.current.preview(); context.closeAsk() } }),
      registerSlash("release.prepare", { purpose: "Prepare version PR", fields: [], confirm: false, run: (_, context) => { callbacks.current.prepare(); context.closeAsk() } }),
      registerSlash("release.prepare.confirm", { purpose: "Prepare the previewed version PR", fields: [], confirm: false, run: (_, context) => { callbacks.current.confirm(); context.closeAsk() } }),
      registerSlash("release.prepare.cancel", { purpose: "Cancel version PR preparation", access: "public", fields: [], confirm: false, run: (_, context) => { cancel(); context.closeAsk() } })
    ]
    return () => dispose.forEach(dispose => dispose())
  }, [])
  useEffect(() => {
    if (session.state !== "running" || query.has("preparing")) return
    const delay = Math.max(0, 1200 - (Date.now() - (session.requestedAt ?? Date.now())))
    const timer = setTimeout(() => {
      preparing.current = false
      if (query.get("fail") === "1") persist({ ...session, state: "failed" })
      else { hydrateVersionPull(); persist({ ...session, state: "opened" }) }
    }, delay)
    return () => clearTimeout(timer)
  }, [session.state, session.requestedAt])
  if (read.state === "loading") return <ReleasePlanLoading />
  if (read.state === "error") return <ReleasePlanFailed retry={read.retry} />
  if (flags.data === "empty") return <ReleasePlanEmpty />
  const gate = flags.as === "out" ? <ReleasePlanSignedOut />
    : gateRequested && flags.role !== "member" ? <ReleasePlanDenied />
      : held ? <ReleasePlanHeld /> : undefined
  return <ReleasePlanReady session={session} stale={stale} confirming={confirming} gate={gate}
    onPreview={preview} onPrepare={prepare} onConfirm={confirm} onCancel={() => { setConfirming(false); setGateRequested(false) }} />
}

export const ReleasePlan = () => <RepoFrame tab="code" title={`Version packages · ${repo.slug}`} askView="releases/plan" askContext={`${repo.slug} release plan · all 31 public packages`}><ReleasePlanContent /></RepoFrame>
