import type { RepositoryTab } from "@smthrs/rpc/RepositoryHome"
import { flowProps } from "../flows/FlowAction"
import type { RunDynamicCommand } from "../cards/CardFamily"
import { WORDMARK } from "@smthrs/ui"
import { createContext, useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { BookOpen, X } from "lucide-react"
import { githubSyncChip, type GitHubSync } from "./githubSync"
import "./ui.css"
import "./frame.css"
import "./repository.css"

export const RepositoryAskContext = createContext<((runCommand?: RunDynamicCommand) => void) | null>(null)

/** Whether the frame's Ask is open: a view with its own prompt (the Code home's prompt block) shows one prompt, so it steps aside while the Ask is open. */
export const RepositoryAskOpenContext = createContext<boolean>(false)

/**
 * The frame's notice region (the mock's `.repo-ui-toasts`), set while the Ask is
 * collapsed: ShellRail portals its already filtered ToastStack there, so a live
 * or failed notice (repository loading, a background branch request) stays
 * visible outside a hidden Ask, and `reveal` opens the Ask before a notice's
 * action acts on a card inside it, for a viewer who can Ask (a member, or a
 * guest admitted to this repository). It is not the Ask button: a viewer who
 * cannot Ask is never sent to sign-in by a notice's action
 * (a public notice's Retry only retries; a sign-in notice signs in once, by its
 * own action). Null while the Ask is open: the notices then render inside it,
 * as before.
 */
export const RepositoryNoticesContext = createContext<{ readonly host: HTMLElement; readonly reveal: () => void } | null>(null)

/**
 * The repository tabs, in Monday's order (PM gap list F2): Code, Issues, Pull
 * requests, Flows, then the repository's declared tabs (b5's
 * `.smithers/ui/tabs.json` slot, inserted before Settings), then Settings for
 * members only. Runs and Wiki are cut: no tab, no link.
 */
const tabs = [
  ["", "Code"], ["issues", "Issues"], ["pulls", "Pull requests"], ["flows", "Flows"], ["settings", "Settings"]
] as const

/**
 * The GitHub sync chip (mock RepoFrame.tsx GitHubSyncChip; the rule and the
 * strings in githubSync.ts). A member's chip links to Settings -> GitHub sync
 * (`/settings/sync`, mounted by the frame's Settings tab); everyone else reads
 * it as text (mock: `flags.role === "member"`). A failure's reason is the
 * mirror run's raw git or GitHub error (last_mirror_error), so only a member
 * reads it; a visitor reads "GitHub sync failed".
 */
function GitHubSyncChip({ sync, settingsHref }: { sync: GitHubSync; settingsHref?: string }) {
  const chip = githubSyncChip(sync)
  if (chip === null) return null
  const className = `repo-frame-github${chip.state === "failed" ? " repo-frame-sync-error" : ""}`
  const content = <>
    <span className="repo-frame-sync-separator" aria-hidden="true">·</span>
    {chip.state === "failed" && <X size={16} aria-hidden="true" />}
    {chip.state === "failed" ? settingsHref === undefined ? "GitHub sync failed" : chip.failure : chip.state === "stale" ? `Synced ${chip.age}` : "Synced with GitHub"}
  </>
  return settingsHref === undefined ? <span className={className}>{content}</span> : <a className={className} href={settingsHref}>{content}</a>
}

/**
 * The session's guest-conversation admission names this repository. The
 * projection writes `guest:<repo>:<session>` only while the visitor is signed
 * out and the server's `/guest` read allowed the repository (AppProjection
 * `repo.selected`); the server keeps guest authority, so the frame reads the
 * receipt and never invents an identity.
 */
export const guestAdmission = (conversation: string | undefined, repo: string): boolean =>
  conversation !== undefined && conversation.toLowerCase().startsWith(`guest:${repo.toLowerCase()}:`)

/**
 * The frame Ask composer's placeholder (PM d-szeq1q): a person with write access
 * (signed in and the entry's can_write, App.tsx `member`) can ask or describe a
 * change; a signed-in reader can ask. Signed out it is not the frame's to say
 * (undefined): the chat keeps its own words behind the sign-in door.
 */
export const frameAskPlaceholder = (signedIn: boolean, canWrite: boolean): string | undefined =>
  !signedIn ? undefined : canWrite ? "Ask a question or describe a change…" : "Ask a question…"

/**
 * Repository route shell. `children` is the plain content slot shared by repo views.
 * `guest` is this repository's guest-conversation admission (`guestAdmission`):
 * an admitted guest opens Ask like a member; signed out without it, Ask leads
 * to sign-in (PM gap list row 15) that returns to this page with `?ask=1`, and
 * `askRequested` (the entry's reading of that marker, RepoLink.askRequested)
 * opens Ask on arrival for a viewer who can Ask. Signed out it opens nothing:
 * nothing redirects on load.
 */
export function RepoFrame({ declaredTabs = [], repo, login, guest, publicRepo, member = false, sync, ask, onRunCommand, children, issueCount, pullCount, issuesPartial, pullsPartial, askRequested, askTitle, askContext }: {
  declaredTabs?: readonly RepositoryTab[]
  issueCount?: number; pullCount?: number
  /** The tab counts' lists are one page of more: each count is drawn as a floor, "30+". */
  issuesPartial?: boolean; pullsPartial?: boolean
  repo: string; login?: string; guest?: boolean; publicRepo?: boolean; askRequested?: boolean
  /** The repository document's can_write for this viewer (RepositoryEntry.canWrite); only a member sees Settings. */
  member?: boolean
  /** The document's GitHub mirror health off the entry (RepositoryEntry.githubSync), for the header's sync chip. */
  sync?: GitHubSync
  /** The Ask heading: the home's own prompt title when it declares one (else "Ask"), and what the Ask is about, "<repo> at <ref>" (Design (K)). */
  askTitle?: string; askContext?: string
  onRunCommand: RunDynamicCommand; ask: ReactNode | ((visible: boolean) => ReactNode); children: ReactNode
}) {
  const frame = useRef<HTMLDivElement>(null)
  const subscribeWidth = useCallback((notify: () => void) => {
    const node = frame.current
    if (!node) return () => {}
    const observer = new ResizeObserver(notify)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const docked = useSyncExternalStore(subscribeWidth, () => (frame.current?.clientWidth ?? 0) >= 1440, () => false)
  // Transient chrome (the Ask's disclosure); its first value is the entry's one Ask request.
  const [open, setOpen] = useState<boolean | undefined>(askRequested === true ? true : undefined)
  // `?ask=1` is explicit intent (PM d-sll0uk): an Ask request that reaches a frame already on the page
  // (a reopened or re-admitted entry) opens Ask too, over any earlier closed state. Adjusted during
  // render from the previous request, not in an effect (components acquire no effects: Architecture.test).
  const [askSeen, setAskSeen] = useState(askRequested === true)
  if ((askRequested === true) !== askSeen) {
    setAskSeen(askRequested === true)
    if (askRequested === true) setOpen(true)
  }
  const canAsk = Boolean(login) || guest === true
  const expanded = canAsk && (open ?? docked)
  // Transient chrome: the mounted notice region's node, for the Ask's notices while it is collapsed.
  const [notices, setNotices] = useState<HTMLDivElement | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const base = `/${repo}`
  const [owner, name] = repo.split("/")
  const fileRoute = /^\/(?:tree|blob)\//.test(window.location.pathname.slice(base.length))
  const navigation = [...tabs.filter(([path]) => path !== "settings"), ...declaredTabs.map(tab => [tab.type === "docs" ? "docs" : `evals/${tab.suite}`, tab.title] as const), ...tabs.filter(([path]) => path === "settings" && member)]
  const active = (path: string) => {
    const below = window.location.pathname.slice(base.length)
    if (path === "") return window.location.pathname.replace(/\/$/, "") === base || fileRoute
    if (path === "pulls") return /^\/pulls?(?:\/|$)/.test(below)
    return below === `/${path}` || below.startsWith(`/${path}/`)
  }
  const openAsk = (runCommand = onRunCommand) => {
    if (!canAsk) {
      // The Ask door's sign-in returns to this page with Ask open: the marker rides the address sign-in reads its return from (RepoLink.signInReturnTo). No draft travels.
      const search = new URLSearchParams(window.location.search)
      search.set("ask", "1")
      window.history.replaceState(window.history.state, "", `${window.location.pathname}?${search}${window.location.hash}`)
      runCommand("sign-in")
      return
    }
    setOpen(true); runCommand("chat.open")
  }
  // A notice's action reveals the Ask its target lives in; never sign-in, which only the Ask button and ⌘K lead to.
  const reveal = () => { if (canAsk) openAsk() }
  const close = (runCommand = onRunCommand) => { runCommand("chat.close"); setOpen(false); trigger.current?.focus() }
  return <div ref={frame} className="repo-frame" data-ask-open={!canAsk ? "false" : open === undefined ? "auto" : String(open)} onKeyDown={event => {
    if (event.defaultPrevented) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault(); event.stopPropagation(); openAsk()
    }
    if (event.key === "Escape") {
      const details = (event.target as HTMLElement).closest("details[open]")
      if (details) { details.removeAttribute("open"); details.querySelector<HTMLElement>("summary")?.focus(); return }
      if (event.target === document.getElementById("repo-ask") || (event.target as HTMLElement).closest(".repo-frame-ask-heading")) close()
    }
  }}>
    <div className="repo-frame-scroll">
    <a className="repo-frame-skip" href="#repo-content">Skip to content</a>
    <header className="repo-frame-global">
      <a className="repo-frame-mark" href="/" aria-label="Smithers home"><pre aria-label="Smithers">{WORDMARK.join("\n")}</pre></a>
      <div className="repo-frame-crumbs"><a href="/">{owner}</a><span>/</span><a href={base}>{name}</a></div>
      <div className="repo-frame-global-spacer" />
      {login ? <><details className="repo-frame-avatar-menu"><summary className="repo-frame-avatar-button repo-ui-btn" aria-label={`${login}'s account menu`}>{login.slice(0, 1).toUpperCase()}</summary><div className="repo-ui-menu repo-frame-account"><span>{login}</span><a href="/">Your repositories</a></div></details></> : <button className="repo-ui-btn repo-ui-btn-quiet" {...flowProps("sign-in")} onClick={() => onRunCommand("sign-in")}>Sign in</button>}
    </header>
    <div className="repo-frame-workspace"><div className="repo-frame-page">
      <header className="repo-frame-repo-header">
        <div className="repo-frame-repo-title-row"><div className="repo-frame-repo-title"><BookOpen size={20} aria-hidden="true"/><h1><a href="/">{owner}</a><span>/</span><a href={base}>{name}</a></h1>{publicRepo && <span className="repo-frame-visibility">Public</span>}{sync !== undefined && <GitHubSyncChip sync={sync} settingsHref={member ? `${base}/settings/sync` : undefined} />}</div>
          <button ref={trigger} className="repo-ui-btn repo-frame-ask-button" aria-label="Ask" aria-controls="repo-ask" aria-expanded={expanded} {...flowProps(canAsk ? "chat.open" : "sign-in")} onClick={() => openAsk(onRunCommand)}>Ask <kbd>⌘K</kbd></button>
        </div>
        <nav className="repo-ui-tabs" aria-label="Repository">{navigation.map(([path, label]) => <a className="repo-ui-tab" key={path} href={`${base}${path ? `/${path}` : ""}`} aria-current={active(path) ? "page" : undefined}>{label}{(path === "issues" ? issueCount : path === "pulls" ? pullCount : undefined) !== undefined && <span className="repo-ui-counter">{path === "issues" ? issueCount : pullCount}{(path === "issues" ? issuesPartial : pullsPartial) && "+"}</span>}</a>)}</nav>
      </header>
      <main onClick={event => { if ((event.target as HTMLElement).closest("[data-ask-page]")) openAsk() }} id="repo-content" tabIndex={-1} className="repo-frame-content" data-keyboard-pane="Repository"><RepositoryAskContext.Provider value={openAsk}><RepositoryAskOpenContext.Provider value={expanded}>{children}</RepositoryAskOpenContext.Provider></RepositoryAskContext.Provider></main>
    </div>
    <aside id="repo-ask" className="repo-frame-ask" aria-label="Ask" data-keyboard-pane="Ask" onKeyDownCapture={event => {
      // A collapsed Ask's only reachable controls are its notices in the frame's region: the chord opens the Ask
      // from there, ahead of the hidden chat's own handler, which would only toggle an unseen composer.
      if (expanded || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return
      event.preventDefault(); event.stopPropagation(); openAsk()
    }}>
      <div className="repo-frame-ask-heading"><div><h2>{askTitle ?? "Ask"}</h2>{askContext !== undefined && <p>Asking about {askContext}</p>}</div><button className="repo-ui-icon-btn" aria-label="Close Ask" {...flowProps("chat.close")} onClick={() => close(onRunCommand)}><X size={18}/></button></div>
      <div className="repository-chat"><RepositoryNoticesContext.Provider value={expanded || notices === null ? null : { host: notices, reveal }}>{typeof ask === "function" ? ask(expanded) : ask}</RepositoryNoticesContext.Provider></div>
    </aside></div>
    </div>
    <div ref={setNotices} className="repo-ui-toasts" data-keyboard-pane="Notifications" />
  </div>
}
