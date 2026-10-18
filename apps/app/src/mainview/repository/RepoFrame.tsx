import { WORDMARK } from "../Wordmark"
import { createContext, useRef, useState, type ReactNode } from "react"
import { BookOpen, CircleDot, Code2, GitPullRequest, Search, X } from "lucide-react"
import "./ui.css"
import "./frame.css"
import "./repository.css"

export const RepositoryAskContext = createContext<(() => void) | null>(null)

const tabs = [
  ["", "Code", Code2], ["issues", "Issues", CircleDot], ["pulls", "Pull requests", GitPullRequest]
] as const

/** Repository route shell. `children` is the plain content slot shared by repo views. */
export function RepoFrame({ repo, login, publicRepo, ask, onAsk, onSignIn, children, issueCount, pullCount }: {
  issueCount?: number; pullCount?: number
  repo: string; member?: boolean; login?: string; publicRepo?: boolean
  ask: ReactNode; onAsk: () => void; onSignIn: () => void; children: ReactNode
}) {
  const [open, setOpen] = useState<boolean | undefined>(undefined)
  const [searchOpen, setSearchOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const base = `/${repo}`
  const [owner, name] = repo.split("/")
  const fileRoute = /^\/(?:tree|blob)\//.test(window.location.pathname.slice(base.length))
  const openAsk = () => { if (!login) { onSignIn(); return }; setOpen(true); onAsk() }
  const close = () => { setOpen(false); trigger.current?.focus() }
  return <div className="repo-frame" data-ask-open={!login ? "false" : open === undefined ? "auto" : String(open)} onKeyDown={event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault(); event.stopPropagation(); openAsk()
    }
    if (event.key === "Escape") { close(); setSearchOpen(false) }
  }}>
    <a className="repo-frame-skip" href="#repo-content">Skip to content</a>
    <header className="repo-frame-global">
      <a className="repo-frame-mark" href="/" aria-label="Smithers home"><pre aria-label="Smithers">{WORDMARK.join("\n")}</pre></a>
      <div className="repo-frame-crumbs"><a href="/">{owner}</a><span>/</span><a href={base}>{name}</a></div>
      <div className="repo-frame-global-spacer" />
      <form className="repo-frame-search" role="search" action={`${base}/search`} data-expanded={searchOpen}>
        <Search size={16} aria-hidden="true" /><input name="q" aria-label="Search this repository" placeholder="Search this repository…" /><kbd>/</kbd>
      </form>
      <button className="repo-ui-icon-btn repo-frame-search-toggle" aria-label="Search repository" aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}><Search size={19}/></button>
      {login ? <><details className="repo-frame-avatar-menu"><summary className="repo-ui-btn" aria-label={`${login}'s account menu`}>{login.slice(0, 1).toUpperCase()}</summary><div className="repo-ui-menu repo-frame-account"><span>{login}</span><a href="/">Your repositories</a></div></details></> : <button className="repo-ui-btn repo-ui-btn-quiet" onClick={onSignIn}>Sign in</button>}
    </header>
    <div className="repo-frame-workspace"><div className="repo-frame-page">
      <header className="repo-frame-repo-header">
        <div className="repo-frame-repo-title-row"><div className="repo-frame-repo-title"><BookOpen size={20} aria-hidden="true"/><h1><a href="/">{owner}</a><span>/</span><a href={base}>{name}</a></h1>{publicRepo && <span className="repo-frame-visibility">Public</span>}</div>
          <button ref={trigger} className={`repo-ui-btn ${fileRoute ? "repo-ui-btn-quiet" : "repo-ui-btn-primary"} repo-frame-ask-button`} aria-label="Ask" aria-controls="repo-ask" aria-expanded={open} onClick={openAsk}>Ask <kbd>⌘K</kbd></button>
        </div>
        <nav className="repo-ui-tabs" aria-label="Repository">{tabs.map(([path, label, Icon]) => <a className="repo-ui-tab" key={path} href={`${base}${path ? `/${path}` : ""}`} aria-current={(path === "issues" ? window.location.pathname.startsWith(`${base}/issues`) : path === "pulls" ? /\/pulls?(?:\/|$)/.test(window.location.pathname.slice(base.length)) : window.location.pathname.replace(/\/$/, "") === base || fileRoute) ? "page" : undefined}><Icon size={16} aria-hidden="true"/>{label}{(path === "issues" ? issueCount : path === "pulls" ? pullCount : undefined) !== undefined && <span className="repo-ui-counter">{path === "issues" ? issueCount : pullCount}</span>}</a>)}</nav>
      </header>
      <main id="repo-content" tabIndex={-1} className="repo-frame-content" data-keyboard-pane="Repository"><RepositoryAskContext.Provider value={openAsk}>{children}</RepositoryAskContext.Provider></main>
    </div>
    <aside id="repo-ask" className="repo-frame-ask" aria-label="Ask" data-keyboard-pane="Ask">
      <div className="repo-frame-ask-heading"><h2>Ask</h2><button className="repo-ui-icon-btn" aria-label="Close Ask" onClick={close}><X size={18}/></button></div>
      <div className="repository-chat">{ask}</div>
    </aside></div>
  </div>
}
