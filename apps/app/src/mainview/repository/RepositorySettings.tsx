import { X } from "lucide-react"
import type { RunDynamicCommand } from "../cards/CardFamily"
import { flowAction } from "../flows/FlowAction"
import { hrefFor, navigate } from "../RepositoryRouter"
import type { GitHubSyncChip } from "./githubSync"
import { RepositoryFailed, RepositoryLoading } from "./RepositoryFlows"
import "./repository-automation.css"

export const MODELS_HELD = "Hosted coding runs on Cerebras Qwen; locally, smthrs uses your login."

/**
 * Monday's Settings sections, in the mock's order (views/settings/shared.tsx):
 * only Models (held) and GitHub sync are kept; the rest are cut and have no link.
 * The first kept section is the default, as General is in the mock.
 */
export const SETTINGS_SECTIONS = [["models", "Models"], ["sync", "GitHub sync"]] as const
export type SettingsSection = typeof SETTINGS_SECTIONS[number][0]
export const settingsSection = (section: string | undefined): SettingsSection | undefined =>
  section === undefined ? "models" : SETTINGS_SECTIONS.find(([path]) => path === section)?.[0]

/**
 * The GitHub sync state, worded exactly as the repo header's chip words it
 * (githubSync.ts `githubSyncChip`, the one rule both read). `null` is no sync
 * claim at all: the mock's empty sync state, never an invented "in sync".
 */
export function RepositorySyncStatus({ sync }: { sync: GitHubSyncChip | null }) {
  if (sync === null) return <section className="repo-frame-state"><h2>No sync history.</h2></section>
  return <div className="repo-ui-box"><div className="repo-ui-row repo-settings-row">
    <span className="repo-settings-grow">Status</span>
    <span className={`repo-settings-sync-state${sync.state === "failed" ? " repo-settings-sync-error" : sync.state === "stale" ? " repo-settings-sync-stale" : ""}`}>
      {sync.state === "failed" && <X size={16} aria-hidden="true" />}
      {sync.state === "failed" ? sync.failure : sync.state === "stale" ? `Synced ${sync.age}` : "Synced with GitHub"}
    </span>
  </div></div>
}

/** The viewer's access to Settings: the session's state plus the document's can_write. */
export type SettingsAccess = "member" | "reader" | "signed-out" | "loading" | "unavailable"

/**
 * Members only (the repository document's can_write). Signed out is the mock's
 * sign-in state; a signed-in reader gets the frame's not-found state, because
 * the reader screen's Request access has no backend on Monday. Until the session
 * read answers, membership is unknown: the mock's settings-loading skeleton,
 * never not-found and never a member's sections. When the session read fails or
 * this host has no sign-in, the mock's settings-error shape with the app's own
 * words for that state; no Retry, because no act re-reads the session.
 */
export function RepositorySettings({ repo, access, section, sync, onRunCommand }: {
  repo: string; access: SettingsAccess; section?: string; sync: GitHubSyncChip | null; onRunCommand: RunDynamicCommand
}) {
  if (access === "loading") return <RepositoryLoading detail />
  if (access === "unavailable") return <RepositoryFailed what="settings" reason="Sign-in is unavailable on this host." />
  if (access === "signed-out") return <section className="repo-frame-state" aria-label="Settings">
    <h2>Sign in to open repository settings.</h2>
    <button type="button" className="repo-ui-btn repo-ui-btn-primary" {...flowAction(onRunCommand, "sign-in")}>Sign in with GitHub</button>
  </section>
  if (access !== "member") return <section className="repo-frame-state" aria-label="Not found"><h2>Page not found.</h2></section>
  const current = settingsSection(section)
  const label = SETTINGS_SECTIONS.find(([path]) => path === current)?.[1]
  return <div className="repo-automation repo-settings-layout" data-keyboard-pane="Settings">
    <aside className="repo-settings-navigation">
      <label className="repo-settings-mobile-nav"><span className="repo-ui-sr">Settings section</span>
        <select className="repo-ui-input" value={current ?? ""} onChange={event => navigate({ repo, subject: { kind: "settings", section: event.target.value } })}>
          {current === undefined && <option value="" disabled>Settings</option>}
          {SETTINGS_SECTIONS.map(([path, name]) => <option key={path} value={path}>{name}</option>)}
        </select>
      </label>
      <nav className="repo-settings-nav" aria-label="Repository settings">{SETTINGS_SECTIONS.map(([path, name]) =>
        <a key={path} href={hrefFor({ repo, subject: { kind: "settings", section: path } })} aria-current={current === path ? "page" : undefined}>{name}</a>)}</nav>
    </aside>
    <section className="repo-settings-content" aria-label={label ?? "Settings"}>
      {current === undefined ? <section className="repo-frame-state"><h2>Setting not found.</h2></section> : <>
        <header className="repo-settings-heading"><h1>{label}</h1></header>
        {current === "models" ? <div className="repo-settings-banner" role="status">{MODELS_HELD}</div> : <RepositorySyncStatus sync={sync} />}
      </>}
    </section>
  </div>
}
