/* The app frame: top bar with wordmark and crumbs, the timeline rail, and the composer. */
import { createContext, useEffect, useRef, useState, type ReactNode } from "react"
import { CATALOG, importedRepos, MAYA, signInRoute } from "../core/catalog"
import { useMock } from "../core/mock"
import { Link, navigate, useLocation } from "../core/router"
import { WORDMARK } from "../core/wordmark"
import type { RepoData } from "./data"
import { Icon } from "./lib"

export const ComposerContext = createContext<{ open: (prefill?: string) => void }>({ open: () => {} })

export interface RailEntry { id: string; label: string }

const Menu = ({ side = "left", onClose, children }: { side?: "left" | "right"; onClose: () => void; children: ReactNode }) => (
  <>
    <button type="button" className="app-menu-backdrop" aria-label="Close menu" onClick={onClose} />
    <div className={`app-menu${side === "right" ? " app-menu-right" : ""}`} role="menu">{children}</div>
  </>
)

const TopBar = ({ repo }: { repo: RepoData | null }) => {
  const { flags, set } = useMock()
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState<"repo" | "branch" | "account" | null>(null)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const slug = repo?.slug ?? location.split("?")[0].split("/").slice(1, 3).join("/")
  const agentBranch = repo !== null && repo.slug === "maya/tinyhttp" ? repo.pulls.find(pull => pull.state === "open")?.branch : undefined

  return (
    <header className="app-topbar" data-scrolled={scrolled}>
      <Link to="smithers.sh/" className="app-wordmark"><pre aria-label="Smithers">{WORDMARK.join("\n")}</pre></Link>
      <nav className="app-crumbs" aria-label="Repository">
        <span className="app-menu-wrap">
          <button type="button" className="app-crumb-btn" aria-haspopup="menu" aria-expanded={menu === "repo"} onClick={() => setMenu(menu === "repo" ? null : "repo")}>
            <span className="app-crumb-text">{slug}</span> <Icon name="chevron-down" size={12} />
          </button>
          {menu === "repo" && (
            <Menu onClose={() => setMenu(null)}>
              {CATALOG.map(entry => (
                <Link key={entry.slug} to={`smithers.sh/${entry.slug}`} onClick={() => setMenu(null)}>{entry.slug}</Link>
              ))}
              {flags.as === "in" && importedRepos(flags.repos).length > 0 && (
                <>
                  <div className="app-menu-sep" />
                  <div className="app-menu-note">Your repositories</div>
                  {importedRepos(flags.repos).map(entry => (
                    <Link key={entry.slug} to={`smithers.sh/${entry.slug}?as=in`} onClick={() => setMenu(null)}>{entry.slug}</Link>
                  ))}
                </>
              )}
              <div className="app-menu-sep" />
              <Link to="smithers.sh/" onClick={() => setMenu(null)}>Open another repo</Link>
            </Menu>
          )}
        </span>
        <span className="app-crumbs-sep">/</span>
        <span className="app-menu-wrap app-branch-crumb">
          <button type="button" className="app-crumb-btn" aria-haspopup="menu" aria-expanded={menu === "branch"} onClick={() => setMenu(menu === "branch" ? null : "branch")}>
            main <Icon name="chevron-down" size={12} />
          </button>
          {menu === "branch" && (
            <Menu onClose={() => setMenu(null)}>
              <button type="button" className="app-menu-item" onClick={() => setMenu(null)}>main</button>
              {agentBranch !== undefined && (
                <button type="button" className="app-menu-item" onClick={() => setMenu(null)}>{agentBranch}</button>
              )}
            </Menu>
          )}
        </span>
      </nav>
      <div className="app-topbar-right">
        <Link to="smithers.sh/docs" className="app-docs-link">Docs</Link>
        {flags.as === "out" ? (
          <Link to={signInRoute(location)} className="app-btn app-btn-secondary app-btn-sm">Sign in</Link>
        ) : (
          <span className="app-menu-wrap">
            <button type="button" className="app-avatar-btn" aria-label={`${MAYA.name}'s account`} aria-haspopup="menu" aria-expanded={menu === "account"} onClick={() => setMenu(menu === "account" ? null : "account")}>M</button>
            {menu === "account" && (
              <Menu side="right" onClose={() => setMenu(null)}>
                <Link to="smithers.sh/" onClick={() => setMenu(null)}>Your repositories</Link>
                <div className="app-menu-sep" />
                <button type="button" className="app-menu-item" onClick={() => { set({ as: "out" }); setMenu(null) }}>Sign out</button>
              </Menu>
            )}
          </span>
        )}
      </div>
    </header>
  )
}

const Rail = ({ entries }: { entries: RailEntry[] }) => {
  const [active, setActive] = useState(entries[0]?.id ?? "")
  useEffect(() => {
    const onScroll = () => {
      let current = entries[0]?.id ?? ""
      for (const entry of entries) {
        const el = document.querySelector(`[data-rail="${entry.id}"]`)
        if (el && el.getBoundingClientRect().top <= 180) current = entry.id
      }
      setActive(current)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [entries])
  if (entries.length === 0) return null
  return (
    <nav className="app-rail" aria-label="Transcript">
      <div className="app-rail-inner">
        <div className="app-rail-list">
          {entries.map(entry => (
            <button key={entry.id} type="button" className="app-rail-item" data-active={active === entry.id} onClick={() => {
              setActive(entry.id)
              document.querySelector(`[data-rail="${entry.id}"]`)?.scrollIntoView({ block: "start" })
            }}>{entry.label}</button>
          ))}
        </div>
      </div>
    </nav>
  )
}

export const AppFrame = ({ repo, rail, onSend, children }: {
  repo: RepoData | null
  rail: RailEntry[]
  onSend: (text: string) => void
  children: ReactNode
}) => {
  const { flags } = useMock()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const openWith = (prefill?: string) => {
    if (prefill !== undefined) setText(prefill)
    setOpen(true)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(value => !value)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const composeParam = new URLSearchParams(location.split("?")[1] ?? "").get("compose")
  useEffect(() => {
    if (composeParam !== null) openWith(composeParam === "" ? undefined : composeParam)
  }, [composeParam])

  useEffect(() => {
    if (open) areaRef.current?.focus()
  }, [open])

  const send = () => {
    const value = text.trim()
    if (value === "") return
    setText("")
    setOpen(false)
    if (value === "/bug") { navigate(`smithers.sh/${slug}/bug`); return }
    onSend(value)
  }

  const slug = repo?.slug ?? location.split("?")[0].split("/").slice(1, 3).join("/")
  const member = flags.as === "in" && repo !== null && (repo.memberButtons || flags.role === "member")
  const guestOff = flags.as === "out" && flags.guest === "off" && repo !== null && !repo.memberButtons
  const dockLabel = repo === null ? "Ask Smithers…"
    : member ? "Ask for a change…"
    : guestOff ? "Sign in to ask"
    : repo.askPlaceholder

  return (
    <ComposerContext.Provider value={{ open: openWith }}>
      <div className="app-frame">
        <TopBar repo={repo} />
        <div className="app-body">
          <Rail entries={rail} />
          <main className="app-main">
            <div className="app-transcript">{children}</div>
          </main>
        </div>
        <button type="button" className="app-chat-chip" onClick={() => setOpen(true)}>Chat <kbd>⌘K</kbd></button>
        <div className="app-dock">
          <button type="button" onClick={() => guestOff ? navigate(signInRoute(location)) : setOpen(true)}>{dockLabel}</button>
        </div>
        {open && (
          <div className="app-composer-wrap">
            <button type="button" className="app-composer-backdrop" aria-label="Close chat" onClick={() => setOpen(false)} />
            <div className="app-composer" role="dialog" aria-label="Chat">
              <div className="app-composer-input">
                <textarea
                  ref={areaRef}
                  aria-label="Message Smithers"
                  placeholder="Ask Smithers to work on something…"
                  value={text}
                  onChange={event => setText(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send() }
                    if (event.key === "Escape") setOpen(false)
                  }}
                />
                <button type="button" className="app-composer-send" aria-label="Send" disabled={text.trim() === ""} onClick={send}>
                  <Icon name="send" size={14} />
                </button>
              </div>
              <div className="app-composer-commands">
                <button type="button" className="app-command" onClick={() => areaRef.current?.focus()}>
                  <span>Ask Smithers</span>
                </button>
                <button type="button" className="app-command" onClick={() => { setOpen(false); navigate(`smithers.sh/${slug}?card=bug`) }}>
                  <span className="app-command-kbd">/bug</span> <span className="app-command-label">Report a bug</span>
                </button>
                <button type="button" className="app-command" onClick={() => { setOpen(false); navigate(`smithers.sh/${slug}/tree/main`) }}>
                  <span className="app-command-kbd">/files</span> <span className="app-command-label">Files</span>
                </button>
                <button type="button" className="app-command" onClick={() => { setOpen(false); navigate(`smithers.sh/${slug}/issues`) }}>
                  <span className="app-command-kbd">/issues</span> <span className="app-command-label">Issues</span>
                </button>
                {flags.as === "out" && (
                  <button type="button" className="app-command" onClick={() => { setOpen(false); navigate(signInRoute(location)) }}>
                    <span className="app-command-kbd">/sign-in</span> <span className="app-command-label">Sign in with GitHub</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ComposerContext.Provider>
  )
}
