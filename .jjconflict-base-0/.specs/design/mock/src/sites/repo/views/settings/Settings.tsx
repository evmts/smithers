import { useMock } from "../../../core/mock"
import { Link, navigate, type RouteContext } from "../../../core/router"
import { repo, to } from "../../fixtures"
import { Denied, Empty, Failed, Loading, SignInWall, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { EnvironmentsReady } from "./Environments"
import { GeneralReady } from "./General"
import { MembersReady } from "./Members"
import { ModelsReady } from "./Models"
import { ReportingReady } from "./Reporting"
import { SandboxesReady } from "./Sandboxes"
import { SecretsReady } from "./Secrets"
import { sections, type Section } from "./shared"
import { SyncError, SyncReady } from "./Sync"
import { TriggersReady } from "./Triggers"
import { WebhooksReady } from "./Webhooks"

export const SettingsLoading = () => <Loading variant="detail" rows={5} />
export const SettingsError = () => (
  <Failed what="settings" reason="The repository host didn't respond. Your settings haven't loaded." />
)
export const SettingsSignedOut = () => <SignInWall act="open repository settings" />
export const SettingsDenied = () => <Denied act="change its settings" />
export const SettingsEmpty = () => (
  <Empty title="Setting not found." action={<Link to={to("settings/general")}>Open General settings</Link>} />
)

export const SettingsReady = ({ section, query, empty = false }: {
  section: Section
  query: URLSearchParams
  empty?: boolean
}) => {
  switch (section) {
    case "general": return <GeneralReady />
    case "members": return <MembersReady empty={empty} emptyInvites={query.get("invites") === "empty"} />
    case "models": return (
      <ModelsReady
        empty={empty}
        connect={query.get("connect") === "claude" || query.get("connect") === "codex" ? query.get("connect") as "claude" | "codex" : undefined}
        codexConnected={query.get("connected") === "codex"}
      />
    )
    case "secrets": return <SecretsReady empty={empty} />
    case "environments": return <EnvironmentsReady empty={empty} />
    case "sandboxes": return <SandboxesReady empty={empty} />
    case "triggers": return <TriggersReady empty={empty} />
    case "webhooks": return <WebhooksReady empty={empty} />
    case "sync": return empty ? <Empty title="No sync history." /> : <SyncReady />
    case "reporting": return <ReportingReady empty={empty} />
  }
}

const SettingsNavigation = ({ section }: { section: string }) => (
  <aside className="repo-settings-navigation">
    <label className="repo-settings-mobile-nav">
      <span className="repo-ui-sr">Settings section</span>
      <select
        className="repo-ui-input"
        value={section}
        onChange={event => navigate(to(`settings/${event.target.value}`))}
      >
        {sections.map(([path, label]) => <option key={path} value={path}>{label}</option>)}
      </select>
    </label>
    <nav className="repo-settings-nav" aria-label="Repository settings">
      {sections.map(([path, label]) => (
        <Link key={path} to={to(`settings/${path}`)} aria-current={section === path ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  </aside>
)

export const SettingsPage = ({ context }: { context: RouteContext }) => {
  const { flags } = useMock()
  const requested = context.params.section ?? "general"
  const section = sections.find(([path]) => path === requested)?.[0]
  const label = sections.find(([path]) => path === requested)?.[1] ?? "Settings"
  const state = useView(`settings:${repo.slug}:${requested}`)
  const key = [repo.slug, section, flags.data, flags.host, flags.landing,
    context.query.get("connect"), context.query.get("connected"), context.query.get("invites")].join(":")
  return (
    <RepoFrame
      tab="settings"
      title={`${label} · ${repo.slug}`}
      askView={`settings/${requested}`}
      askContext={`${repo.slug} settings · ${label}`}
    >
      {flags.as === "out" ? <SettingsSignedOut /> : flags.role !== "member" ? <SettingsDenied /> : (
        <div className="repo-settings-layout">
          <SettingsNavigation section={requested} />
          <div className="repo-settings-content">
            {!section ? <SettingsEmpty /> : state === "loading" ? <SettingsLoading />
              : state === "error" ? section === "sync" ? <SyncError /> : <SettingsError />
              : <SettingsReady key={key} section={section} query={context.query} empty={state === "empty"} />}
          </div>
        </div>
      )}
    </RepoFrame>
  )
}
