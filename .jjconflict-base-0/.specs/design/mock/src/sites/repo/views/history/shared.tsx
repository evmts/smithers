import { useEffect, useRef, type ReactNode } from "react"
import { EXTERNAL, MAYA } from "../../../core/catalog"
import { navigate } from "../../../core/router"
import { registerSlash } from "../../frame"
import { MOCK_NOW, repo, to } from "../../fixtures"
import { Icon as RepoIcon } from "../../ui"

/* These small glyphs are missing from the shared Icon's current path map. */
export const HistoryIcon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const paths: Record<string, ReactNode> = {
    terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3m6 0h4" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    tag: <><path d="M3 4h8l10 10-7 7L3 10Z" /><circle cx="7" cy="8" r="1" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" /></>,
    "arrow-left": <path d="M20 12H4m6-6-6 6 6 6" />,
    "arrow-up": <path d="M12 20V4m-6 6 6-6 6 6" />
  }
  if (!paths[name]) return <RepoIcon name={name} size={size} />
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

export const useHistoryCommands = () => {
  useEffect(() => registerSlash("code.browse", {
    purpose: "Browse files at a commit", access: "public", confirm: false,
    fields: [{ name: "ref", label: "Commit, branch or tag" }],
    run: ({ ref }) => navigate(to("tree/" + encodeURIComponent(ref)))
  }), [repo.slug])
}

export const uptime = (since: string) => {
  const minutes = Math.max(0, Math.floor((Date.parse(MOCK_NOW) - Date.parse(since)) / 60000))
  return minutes < 1 ? "<1 min" : minutes < 60 ? minutes + "m" : Math.floor(minutes / 60) + "h " + minutes % 60 + "m"
}

export const viewer = () => MAYA.login

export const LocalInstall = () => {
  useEffect(() => registerSlash("docs.open", {
    purpose: "Run Smithers locally", access: "public", confirm: false, fields: [],
    run: () => { window.open(EXTERNAL.smithersQuickstart, "_blank", "noopener,noreferrer") }
  }), [])
  return <a
    className="repo-ui-btn"
    title="/docs.open quickstart"
    href={EXTERNAL.smithersQuickstart}
    target="_blank"
    rel="noopener noreferrer"
  >
    Run locally
  </a>
}

export const HistoryDialog = ({ title, children, onClose }: {
  title: string
  children: ReactNode
  onClose: () => void
}) => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>("input, select, button, a[href]")?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose() }
    }
    window.addEventListener("keydown", escape)
    return () => {
      window.removeEventListener("keydown", escape)
      previous?.focus()
    }
  }, [])
  return (
    <div
      className="repo-history-backdrop"
      onClick={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        className="repo-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        onKeyDown={event => {
          if (event.key !== "Tab") return
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input, select, textarea'
          )]
          if (event.shiftKey && document.activeElement === controls[0]) {
            event.preventDefault()
            controls.at(-1)?.focus()
          } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
            event.preventDefault()
            controls[0]?.focus()
          }
        }}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

export const Cancel = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className="repo-ui-btn repo-ui-btn-quiet" title="/cancel" onClick={onClick}>
    Cancel
  </button>
)
