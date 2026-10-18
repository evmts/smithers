/* The repo home route: access gates, home blocks, guest chat, and maya's change flow. */
import { useEffect, useState } from "react"
import { importedRepos, signInRoute } from "../core/catalog"
import { still, useMock, useRead } from "../core/mock"
import { Link, navigate, useLocation, type RouteContext } from "../core/router"
import { BugCard, BugSentCard, CeilingCard, ConnectModelCard, docResolver, ExampleCard, ImportCard, NeedsYouCard, PersonPrompt, PrCard, RefusedCard, RunCard, SignInCard, SignInToAskReply, SmithersReply, UnknownRepoCard } from "./cards"
import { GENERIC_ANSWER, isChangeRequest, REPOS, type Answer, type RepoData } from "./data"
import { AppFrame, type RailEntry } from "./frame"
import { Icon, Markdown, ReadError, SkeletonRows } from "./lib"

type Access = "home" | "signin" | "import" | "unknown"

const resolveAccess = (slug: string, flags: { as: "out" | "in"; repos: "some" | "none" }, card: string | null): Access => {
  if (REPOS[slug] !== undefined && !slug.startsWith("maya/")) return "home"
  if (slug.startsWith("maya/")) {
    if (flags.as === "out") return "signin"
    if (card === "import") return "import"
    if (REPOS[slug] !== undefined && (slug === "maya/hello-smithers" || slug === "maya/effeck-example")) return "home"
    return importedRepos(flags.repos).some(repo => repo.slug === slug) ? "home" : "import"
  }
  return flags.as === "out" ? "signin" : "unknown"
}

type Entry =
  | { kind: "qa"; id: string; ask: string; answer: Answer }
  | { kind: "signin-reply"; id: string; ask: string; why: "off" | "change" }
  | { kind: "ceiling"; id: string; ask: string }
  | { kind: "note"; id: string; ask: string; md: string }

type FlowState =
  | { kind: "none" }
  | { kind: "model-none" }
  | { kind: "refused" }
  | { kind: "running"; stage: number }
  | { kind: "needs-you" }
  | { kind: "failed" }
  | { kind: "pr" }
  | { kind: "merged" }

const RUN_STAGE: Record<string, number> = { admitted: 0, allocating: 1, cloning: 2, model: 3, verifying: 4 }
const MAYA_ASK = "Fix #11: empty query values parse to undefined instead of an empty string"

const queryFlow = (run: string | null): FlowState => {
  if (run === null) return { kind: "none" }
  if (run === "model-none") return { kind: "model-none" }
  if (run === "refused") return { kind: "refused" }
  if (run === "needs-you") return { kind: "needs-you" }
  if (run === "failed") return { kind: "failed" }
  if (run === "pr") return { kind: "pr" }
  if (run === "merged") return { kind: "merged" }
  if (run === "reopened") return { kind: "running", stage: 4 }
  const stage = RUN_STAGE[run]
  return stage === undefined ? { kind: "none" } : { kind: "running", stage }
}

export const INSTALL_REPLY = "Changes run on your machine today. Install Smithers, start the coding flow in this repo, then review the diff and push it yourself.\n\n[Install Smithers](smithers.sh/docs/installation) · [Coding guide on GitHub ↗](https://github.com/smithersai/smithers/blob/main/packages/smithers/docs/guides/change-code.md)"

export const RepoPage = ({ context, topCard, topRail }: { context: RouteContext; topCard?: (repo: RepoData) => React.ReactNode; topRail?: RailEntry }) => {
  const { flags } = useMock()
  const slug = `${context.params.owner}/${context.params.repo}`
  const card = context.query.get("card")
  const access = resolveAccess(slug, flags, card)
  const repo = REPOS[slug]

  if (access === "signin") {
    return (
      <AppFrame repo={null} rail={[{ id: "card", label: "Sign in" }]} onSend={() => {}}>
        <div data-rail="card"><SignInCard slug={slug} /></div>
      </AppFrame>
    )
  }
  if (access === "import") {
    return (
      <AppFrame repo={null} rail={[{ id: "card", label: `Import ${slug}` }]} onSend={() => {}}>
        <div data-rail="card"><ImportCard slug={slug} /></div>
      </AppFrame>
    )
  }
  if (access === "unknown" || repo === undefined) {
    return (
      <AppFrame repo={null} rail={[{ id: "card", label: slug }]} onSend={() => {}}>
        <div data-rail="card"><UnknownRepoCard slug={slug} /></div>
      </AppFrame>
    )
  }
  return <RepoHome repo={repo} context={context} topCard={topCard} topRail={topRail} />
}

const RepoHome = ({ repo, context, topCard, topRail }: { repo: RepoData; context: RouteContext; topCard?: (repo: RepoData) => React.ReactNode; topRail?: RailEntry }) => {
  const { flags } = useMock()
  const location = useLocation()
  const composer = { open: () => navigate(`${location.split("?")[0]}?compose=`) }
  const member = flags.as === "in" && (repo.memberButtons || flags.role === "member")
  const filesRead = useRead(`home-files:${repo.slug}`)

  const [extra, setExtra] = useState<Entry[]>([])
  const [startedFlow, setStartedFlow] = useState<FlowState | null>(null)
  const [showAllReadme, setShowAllReadme] = useState(false)

  const runParam = member && topCard === undefined ? context.query.get("run") : null
  const flow: FlowState = flags.landing === "install" ? { kind: "none" } : startedFlow ?? queryFlow(runParam)

  const base: Entry[] = []
  const askParam = context.query.get("ask")
  if (askParam === "1" && repo.answers.length > 0) {
    base.push({ kind: "qa", id: "qa-0", ask: repo.answers[0].q, answer: repo.answers[0] })
    if (flags.guest === "ceiling" && flags.as === "out") base.push({ kind: "ceiling", id: "ceiling", ask: "How do I self-host it?" })
  }
  if (askParam === "fix") base.push({ kind: "signin-reply", id: "qa-fix", ask: "Fix the broken converter test", why: "change" })
  if ((askParam === "change" || runParam !== null) && member && flags.landing === "install") {
    base.push({ kind: "note", id: "ask-change", ask: MAYA_ASK, md: INSTALL_REPLY })
  }
  if (runParam !== null && flow.kind !== "none") base.push({ kind: "note", id: "flow-ask", ask: MAYA_ASK, md: "" })
  const entries = [...base, ...extra]

  const run = repo.runs[0]
  const openPull = repo.pulls.find(pull => pull.state === "open") ?? repo.pulls[0]

  useEffect(() => {
    if (startedFlow === null || startedFlow.kind !== "running" || still || run === undefined) return
    const timer = setTimeout(() => {
      if (startedFlow.stage < run.stages.length - 1) setStartedFlow({ kind: "running", stage: startedFlow.stage + 1 })
      else setStartedFlow({ kind: "pr" })
    }, 1500)
    return () => clearTimeout(timer)
  }, [startedFlow, run])

  const startFlow = (text: string) => {
    if (flags.landing === "install") {
      setExtra(current => [...current, { kind: "note", id: `flow-ask-${current.length}`, ask: text, md: INSTALL_REPLY }])
      return
    }
    setExtra(current => [...current, { kind: "note", id: `flow-ask-${current.length}`, ask: text, md: "" }])
    if (flags.model === "none") setStartedFlow({ kind: "model-none" })
    else if (flags.hosted === "paused") setStartedFlow({ kind: "refused" })
    else setStartedFlow({ kind: "running", stage: 0 })
  }

  const send = (text: string) => {
    if (member && isChangeRequest(text)) { startFlow(text); return }
    const id = `qa-${base.length + extra.length}`
    if (flags.as === "out") {
      if (flags.guest === "off") { setExtra(current => [...current, { kind: "signin-reply", id, ask: text, why: "off" }]); return }
      if (flags.guest === "ceiling") { setExtra(current => [...current, { kind: "ceiling", id, ask: text }]); return }
      if (isChangeRequest(text)) { setExtra(current => [...current, { kind: "signin-reply", id, ask: text, why: "change" }]); return }
    }
    if (flags.as === "in" && !member && isChangeRequest(text)) {
      setExtra(current => [...current, { kind: "note", id, ask: text, md: `That change would run on ${repo.slug}, which you don't maintain. [Open your own repo](smithers.sh/) to make changes.` }])
      return
    }
    const found = repo.answers.find(answer => answer.q === text)
    const answer = found ?? { ...GENERIC_ANSWER(repo), q: text }
    setExtra(current => [...current, { kind: "qa", id, ask: text, answer }])
  }

  const card = context.query.get("card")
  const from = context.query.get("from")
  const reopened = runParam === "reopened"

  useEffect(() => {
    const target = flags.landing === "install" && runParam !== null ? "ask-change" : runParam !== null && runParam !== "model-none" && runParam !== "refused" ? "flow-ask"
      : runParam !== null ? "run"
      : askParam === "fix" ? "qa-fix"
      : askParam === "change" ? "ask-change"
      : askParam !== null ? "qa-0"
      : card !== null ? "card"
      : null
    if (target === null) return
    const timer = setTimeout(() => {
      document.querySelector(`[data-rail="${target}"]`)?.scrollIntoView({ block: "start" })
    }, 60)
    return () => clearTimeout(timer)
  }, [location, flags.landing])

  const rail: RailEntry[] = []
  if (topRail !== undefined) rail.push(topRail)
  if (card === "ask-signin") rail.push({ id: "card", label: "Sign in to ask" })
  if (card === "bug") rail.push({ id: "card", label: "Report a bug" })
  if (card === "bug-sent") rail.push({ id: "card", label: "Bug published" })
  if (card === "example") rail.push({ id: "card", label: "Start from our example" })
  rail.push({ id: "home", label: repo.slug })
  rail.push({ id: "ask", label: member ? "What should we work on?" : repo.askTitle })
  if (flags.data !== "empty" && repo.fixed.length > 0) rail.push({ id: "fixed", label: "Fixed by agents" })
  rail.push({ id: "files", label: "Files" })
  rail.push({ id: "readme", label: "README.md" })
  for (const entry of entries) rail.push({ id: entry.id, label: entry.ask.length > 38 ? `${entry.ask.slice(0, 38)}…` : entry.ask })
  if (flow.kind === "running" || flow.kind === "needs-you" || flow.kind === "failed" || flow.kind === "pr" || flow.kind === "merged") rail.push({ id: "run", label: "Run" })
  if (flow.kind === "pr" || flow.kind === "merged") rail.push({ id: "pr", label: `Change #${openPull?.n ?? ""}` })

  const chips = member ? repo.memberChips : repo.visitorChips

  return (
    <AppFrame repo={repo} rail={rail} onSend={send}>
      {topCard !== undefined && topCard(repo)}
      {card === "ask-signin" && <div data-rail="card"><QuestionSignIn repo={repo} question={context.query.get("draft") ?? ""} /></div>}
      {card === "bug" && <div data-rail="card"><BugCard repo={repo} from={from} onClose={() => navigate(`smithers.sh/${repo.slug}`)} /></div>}
      {card === "bug-sent" && <div data-rail="card"><BugSentCard repo={repo} /></div>}
      {card === "example" && <div data-rail="card"><ExampleCard repo={repo} /></div>}

      <section data-rail="home">
        <h1 className="app-repo-title">{repo.slug}</h1>
        <p className="app-repo-desc">{repo.description}</p>
        <div className="app-repo-meta">
          <span className="app-meta-line1">Public · {repo.license} · <span className="app-mono">main</span></span>
          {repo.mirrorOf !== undefined && (
            <>
              <span className="app-repo-meta-dot app-meta-pre">·</span>
              <a className="app-meta-mirror" href={repo.mirrorOf} target="_blank" rel="noopener noreferrer">Mirrors github.com/smithersai/smithers ↗</a>
            </>
          )}
          <span className="app-repo-meta-dot app-meta-pre">·</span>
          <span className="app-meta-last">Last change merged {repo.lastChange}</span>
        </div>
      </section>

      {repo.text !== "" && <p className="app-text-block">{repo.text}</p>}

      <section data-rail="ask" className="app-card">
        <h2 className="app-block-title">{member ? "What should we work on?" : repo.askTitle}</h2>
        {flags.as === "out" && flags.guest === "off" ? (
          <Link to={signInRoute(location)} className="app-ask-btn" style={{ textDecoration: "none" }}>
            Sign in to {repo.askTitle.charAt(0).toLowerCase() + repo.askTitle.slice(1)}
          </Link>
        ) : (
          <button type="button" className="app-ask-btn" onClick={() => composer.open()}>{repo.askPlaceholder}</button>
        )}
        {chips.length > 0 && (
          <div className="app-chips" style={{ marginTop: 10 }}>
            {chips.map(chip => (
              <button key={chip} type="button" className="app-chip" onClick={() => {
                if (member && chip === "Fix an issue") {
                  const issue = repo.issues.find(each => each.state === "open")
                  send(issue === undefined ? "Fix an issue" : `Fix #${issue.n}: ${issue.title}`)
                } else if (member && chip === "Review a change") {
                  if (openPull !== undefined) navigate(`smithers.sh/${repo.slug}/pull/${openPull.n}`)
                } else if (flags.as === "out" && flags.guest === "off") {
                  navigate(`smithers.sh/${repo.slug}?card=ask-signin&draft=${encodeURIComponent(chip)}`)
                } else {
                  send(chip)
                }
              }}>{chip}</button>
            ))}
          </div>
        )}
        {flags.as === "out" && flags.guest === "ok" && (
          <p className="app-guest-note">Guest answers come from the docs and README. 7 of 10 left today.</p>
        )}
        {(repo.slug === "effeck/effeck-example" || repo.slug === "smithersai/hello-smithers") && flags.as === "in" && flags.landing === "open" && flags.hosted === "up" && card !== "example" && (
          <div style={{ marginTop: 10 }}>
            <Link to={`smithers.sh/${repo.slug}?card=example`} className="app-btn app-btn-secondary app-btn-sm">Start from this example</Link>
          </div>
        )}
      </section>

      {repo.links.length > 0 && (
        <div className="app-links-row">
          {repo.links.map(link => link.card === "bug" ? (
            <button key={link.label} type="button" className="app-chip" onClick={() => navigate(repo.slug === "effeck/effeck" ? `smithers.sh/${repo.slug}/issues` : `smithers.sh/${repo.slug}?card=bug`)}>{link.label}</button>
          ) : (
            <Link key={link.label} to={link.route ?? ""} className="app-chip">{link.needsConverter && flags.converter === "off" ? "Install VibeLang" : link.label}</Link>
          ))}
        </div>
      )}

      {flags.data !== "empty" && repo.fixed.length > 0 && (
        <section data-rail="fixed" className="app-card">
          <h2 className="app-block-title">Fixed by agents</h2>
          <ul className="app-fixed-list">
            {repo.fixed.map(pair => (
              <li key={pair.issue}>
                <span className="app-fixed-date">{pair.date}</span>
                <Link to={`smithers.sh/${repo.slug}/issues/${pair.issue}`}>#{pair.issue} {pair.title}</Link>
                {" → "}
                {repo.github !== null ? (
                  <a className="app-fixed-sha" href={`${repo.github}/commit/${pair.sha}`} target="_blank" rel="noopener noreferrer">{pair.sha}</a>
                ) : (
                  <Link className="app-fixed-sha" to={`smithers.sh/${repo.slug}/commit/${pair.sha}`}>{pair.sha}</Link>
                )}
                {" "}<span className="app-fixed-agent">({pair.agent})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section data-rail="files" className="app-card">
        <h2 className="app-block-title">Files</h2>
        {filesRead.state === "loading" && <SkeletonRows rows={6} />}
        {filesRead.state === "error" && <ReadError what={repo.github !== null ? "the files from GitHub" : "the files"} onRetry={filesRead.retry} />}
        {filesRead.state === "ready" && (
          <>
            <div className="app-file-rows">
              {(repo.tree[""] ?? []).slice(0, 8).map(row => (
                <Link key={row.name} className="app-file-row" to={row.kind === "dir" ? `smithers.sh/${repo.slug}/tree/main/${row.name}` : `smithers.sh/${repo.slug}/blob/main/${row.name}`}>
                  <Icon name={row.kind} />
                  <span className="app-file-name">{row.name}</span>
                  <span className="app-file-note">{row.note}</span>
                  <span className="app-file-age">{row.age}</span>
                </Link>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <Link to={`smithers.sh/${repo.slug}/tree/main`} className="app-btn app-btn-quiet app-btn-sm">All files</Link>
            </div>
          </>
        )}
      </section>

      <section data-rail="readme" className="app-card">
        <h2 className="app-block-title">README.md</h2>
        <div className={showAllReadme ? undefined : "app-md-clip"}>
          <Markdown source={repo.readme} resolve={docResolver(repo, "README.md")} />
        </div>
        {!showAllReadme && (
          <div style={{ marginTop: 8 }}>
            <button type="button" className="app-btn app-btn-secondary app-btn-sm" onClick={() => setShowAllReadme(true)}>Show all</button>
          </div>
        )}
      </section>

      {entries.map(entry => {
        if (entry.kind === "qa") {
          return (
            <div key={entry.id} style={{ display: "grid", gap: 12 }}>
              <div data-rail={entry.id}><PersonPrompt who={flags.as === "in" ? "maya" : "guest"} name={flags.as === "in" ? "Maya" : "You"} text={entry.ask} /></div>
              <SmithersReply answer={entry.answer} repo={repo} signedOut={flags.as === "out"} />
            </div>
          )
        }
        if (entry.kind === "ceiling") {
          return (
            <div key={entry.id} style={{ display: "grid", gap: 12 }}>
              <div data-rail={entry.id}><PersonPrompt who="guest" name="You" text={entry.ask} /></div>
              <CeilingCard />
            </div>
          )
        }
        if (entry.kind === "signin-reply") {
          return (
            <div key={entry.id} style={{ display: "grid", gap: 12 }}>
              <div data-rail={entry.id}><PersonPrompt who="guest" name="You" text={entry.ask} /></div>
              <SignInToAskReply what={entry.why} />
            </div>
          )
        }
        return (
          <div key={entry.id} data-rail={entry.id}>
            <PersonPrompt who="maya" name="Maya" text={entry.ask} />
            {entry.md !== "" && <div style={{ marginTop: 8 }}><div className="app-reply-head"><span className="app-reply-name">Smithers</span></div><Markdown source={entry.md} resolve={docResolver(repo)} dense /></div>}
          </div>
        )
      })}

      {flow.kind === "model-none" && (
        <div data-rail="run"><ConnectModelCard onConnected={() => setStartedFlow({ kind: "running", stage: 0 })} /></div>
      )}
      {flow.kind === "refused" && (
        <div data-rail="run"><RefusedCard onSendAgain={() => setStartedFlow({ kind: "refused" })} /></div>
      )}
      {(flow.kind === "running" || flow.kind === "needs-you" || flow.kind === "failed" || flow.kind === "pr" || flow.kind === "merged") && run !== undefined && (
        <div data-rail="run">
          {reopened && <p className="app-section-note" style={{ marginBottom: 8 }}>Still running · started 3 min ago</p>}
          <RunCardView repo={repo} flow={flow} setFlow={setStartedFlow} member={member} />
        </div>
      )}
      {(flow.kind === "pr" || flow.kind === "merged") && openPull !== undefined && (
        <div data-rail="pr"><PrCard repo={repo} pull={openPull} state={flow.kind === "merged" ? "merged" : null} member={member} /></div>
      )}
    </AppFrame>
  )
}

const RunCardView = ({ repo, flow, setFlow, member }: { repo: RepoData; flow: FlowState; setFlow: (next: FlowState) => void; member: boolean }) => {
  const run = repo.runs[0]
  if (run === undefined || flow.kind === "none" || flow.kind === "model-none" || flow.kind === "refused") return null
  if (flow.kind === "needs-you") {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <RunCard repo={repo} run={run} status="needs-you" activeStage={3} member={member} />
        <NeedsYouCard onAnswer={() => setFlow({ kind: "running", stage: 4 })} />
      </div>
    )
  }
  if (flow.kind === "failed") {
    return <RunCard repo={repo} run={run} status="failed" activeStage={4} failureNote="Verifying failed: 2 tests already fail on main before this change." member={member} onRetry={() => setFlow({ kind: "running", stage: 4 })} />
  }
  if (flow.kind === "pr" || flow.kind === "merged") {
    return <RunCard repo={repo} run={run} status="done" activeStage={run.stages.length - 1} member={member} />
  }
  return <RunCard repo={repo} run={run} status="running" activeStage={flow.stage} member={member} />
}

const QuestionSignIn = ({ repo, question }: { repo: RepoData; question: string }) => <section className="app-card"><h2 className="app-block-title">Sign in to ask: {question}</h2><Link className="app-btn app-btn-primary" to={signInRoute(`smithers.sh/${repo.slug}?as=in&compose=${encodeURIComponent(question)}`)}>Sign in with GitHub</Link></section>
