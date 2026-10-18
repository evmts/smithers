import type { RepositoryTab } from "@smthrs/rpc/RepositoryHome"
import { WORDMARK } from "../Wordmark"
import { createContext, useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { BookOpen, X } from "lucide-react"
import "./ui.css"
import "./frame.css"
import "./repository.css"

export const RepositoryAskContext = createContext<(() => void) | null>(null)

const tabs = [
  ["", "Code"], ["issues", "Issues"], ["pulls", "Pull requests"]
] as const

/** Repository route shell. `children` is the plain content slot shared by repo views. */
export function RepoFrame({ repo, login, publicRepo, declaredTabs = [], ask, onAsk, onSignIn, children }: {
  declaredTabs?: readonly RepositoryTab[]; repo: string; login?: string; publicRepo?: boolean
  ask: ReactNode | ((visible: boolean) => ReactNode); onAsk: () => void; onSignIn: () => void; children: ReactNode
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
  const expanded = Boolean(login) && (open ?? docked)
  const trigger = useRef<HTMLButtonElement>(null)
  const base = `/${repo}`
  const [owner, name] = repo.split("/")
  const fileRoute = /^\/(?:tree|blob)\//.test(window.location.pathname.slice(base.length))
  const navigation = [...tabs.filter(([path]) => String(path) !== "settings"), ...declaredTabs.map(tab => [tab.type === "docs" ? "docs" : `evals/${tab.suite}`, tab.title] as const), ...tabs.filter(([path]) => String(path) === "settings")]
  const active = (path: string) => window.location.pathname.replace(/\/$/, "") === `${base}${path ? `/${path}` : ""}` || (path === "" && fileRoute) || (path !== "" && window.location.pathname.startsWith(`${base}/${path}/`))
  const openAsk = () => { if (!login) { onSignIn(); return }; setOpen(true); onAsk() }
  const close = () => { setOpen(false); trigger.current?.focus() }
  return <div ref={frame} className="repo-frame" data-ask-open={!login ? "false" : open === undefined ? "auto" : String(open)} onKeyDown={event => {
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
      {login ? <><details className="repo-frame-avatar-menu"><summary className="repo-frame-avatar-button repo-ui-btn" aria-label={`${login}'s account menu`}>{login.slice(0, 1).toUpperCase()}</summary><div className="repo-ui-menu repo-frame-account"><span>{login}</span><a href="/">Your repositories</a></div></details></> : <button className="repo-ui-btn repo-ui-btn-quiet" onClick={onSignIn}>Sign in</button>}
    </header>
    <div className="repo-frame-workspace"><div className="repo-frame-page">
      <header className="repo-frame-repo-header">
        <div className="repo-frame-repo-title-row"><div className="repo-frame-repo-title"><BookOpen size={20} aria-hidden="true"/><h1><a href="/">{owner}</a><span>/</span><a href={base}>{name}</a></h1>{publicRepo && <span className="repo-frame-visibility">Public</span>}</div>
          <button ref={trigger} className={`repo-ui-btn ${fileRoute ? "repo-ui-btn-quiet" : "repo-ui-btn-primary"} repo-frame-ask-button`} aria-label="Ask" aria-controls="repo-ask" aria-expanded={expanded} onClick={openAsk}>Ask <kbd>⌘K</kbd></button>
        </div>
        <nav className="repo-ui-tabs" aria-label="Repository">{navigation.map(([path, label]) => <a className="repo-ui-tab" key={path} href={`${base}${path ? `/${path}` : ""}`} aria-current={active(path) ? "page" : undefined}>{label}</a>)}</nav>
      </header>
      <main onClick={event => { if ((event.target as HTMLElement).closest("[data-ask-page]")) openAsk() }} id="repo-content" tabIndex={-1} className="repo-frame-content" data-keyboard-pane="Repository"><RepositoryAskContext.Provider value={openAsk}>{children}</RepositoryAskContext.Provider></main>
    </div>
    <aside id="repo-ask" className="repo-frame-ask" aria-label="Ask" data-keyboard-pane="Ask">
      <div className="repo-frame-ask-heading"><h2>Ask</h2><button className="repo-ui-icon-btn" aria-label="Close Ask" onClick={close}><X size={18}/></button></div>
      <div className="repository-chat">{typeof ask === "function" ? ask(expanded) : ask}</div>
    </aside></div>
    </div>
  </div>
}
