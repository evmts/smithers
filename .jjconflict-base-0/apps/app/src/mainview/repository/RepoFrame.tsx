import { flowProps } from "../flows/FlowAction"
import type { RunDynamicCommand } from "../cards/CardFamily"
import { WORDMARK } from "../Wordmark"
import { createContext, useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { BookOpen, X } from "lucide-react"
import "./ui.css"
import "./frame.css"
import "./repository.css"

export const RepositoryAskContext = createContext<((runCommand?: RunDynamicCommand) => void) | null>(null)

/**
 * The frame's notice region (the mock's `.repo-ui-toasts`), set while the Ask is
 * collapsed: ShellRail portals its already filtered ToastStack there, so a live
 * or failed notice (repository loading, a background branch request) stays
 * visible outside a hidden Ask, and `reveal` opens the Ask before a notice's
 * action acts on a card inside it. Null while the Ask is open: the notices then
 * render inside it, as before.
 */
export const RepositoryNoticesContext = createContext<{ readonly host: HTMLElement; readonly reveal: () => void } | null>(null)

const tabs = [
  ["", "Code"], ["issues", "Issues"], ["pulls", "Pull requests"]
] as const

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
 * Repository route shell. `children` is the plain content slot shared by repo views.
 * `guest` is this repository's guest-conversation admission (`guestAdmission`):
 * an admitted guest opens Ask like a member; signed out without it, Ask leads
 * to sign-in (PM gap list row 15).
 */
export function RepoFrame({ repo, login, guest, publicRepo, ask, onRunCommand, children }: {
  repo: string; login?: string; guest?: boolean; publicRepo?: boolean
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
  const [open, setOpen] = useState<boolean | undefined>(undefined)
  const canAsk = Boolean(login) || guest === true
  const expanded = canAsk && (open ?? docked)
  // Transient chrome: the mounted notice region's node, for the Ask's notices while it is collapsed.
  const [notices, setNotices] = useState<HTMLDivElement | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const base = `/${repo}`
  const [owner, name] = repo.split("/")
  const fileRoute = /^\/(?:tree|blob)\//.test(window.location.pathname.slice(base.length))
  const openAsk = (runCommand = onRunCommand) => { if (!canAsk) { runCommand("sign-in"); return }; setOpen(true); runCommand("chat.open") }
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
        <div className="repo-frame-repo-title-row"><div className="repo-frame-repo-title"><BookOpen size={20} aria-hidden="true"/><h1><a href="/">{owner}</a><span>/</span><a href={base}>{name}</a></h1>{publicRepo && <span className="repo-frame-visibility">Public</span>}</div>
          <button ref={trigger} className={`repo-ui-btn ${fileRoute ? "repo-ui-btn-quiet" : "repo-ui-btn-primary"} repo-frame-ask-button`} aria-label="Ask" aria-controls="repo-ask" aria-expanded={expanded} {...flowProps(canAsk ? "chat.open" : "sign-in")} onClick={() => openAsk(onRunCommand)}>Ask <kbd>⌘K</kbd></button>
        </div>
        <nav className="repo-ui-tabs" aria-label="Repository">{tabs.map(([path, label]) => <a className="repo-ui-tab" key={path} href={`${base}${path ? `/${path}` : ""}`} aria-current={window.location.pathname.replace(/\/$/, "") === `${base}${path ? `/${path}` : ""}` || (path === "" && fileRoute) ? "page" : undefined}>{label}</a>)}</nav>
      </header>
      <main id="repo-content" tabIndex={-1} className="repo-frame-content" data-keyboard-pane="Repository"><RepositoryAskContext.Provider value={openAsk}>{children}</RepositoryAskContext.Provider></main>
    </div>
    <aside id="repo-ask" className="repo-frame-ask" aria-label="Ask" data-keyboard-pane="Ask" onKeyDownCapture={event => {
      // A collapsed Ask's only reachable controls are its notices in the frame's region: the chord opens the Ask
      // from there, ahead of the hidden chat's own handler, which would only toggle an unseen composer.
      if (expanded || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return
      event.preventDefault(); event.stopPropagation(); openAsk()
    }}>
      <div className="repo-frame-ask-heading"><h2>Ask</h2><button className="repo-ui-icon-btn" aria-label="Close Ask" {...flowProps("chat.close")} onClick={() => close(onRunCommand)}><X size={18}/></button></div>
      <div className="repository-chat"><RepositoryNoticesContext.Provider value={expanded || notices === null ? null : { host: notices, reveal: () => openAsk() }}>{typeof ask === "function" ? ask(expanded) : ask}</RepositoryNoticesContext.Provider></div>
    </aside></div>
    </div>
    <div ref={setNotices} className="repo-ui-toasts" data-keyboard-pane="Notifications" />
  </div>
}
