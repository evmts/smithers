import { useState } from "react"
import { fmtDate, MOCK_NOW, repo, settings } from "../../fixtures"
import { Failed } from "../../frame"
import { Box, Icon, RelTime, Row, StateIcon, toast } from "../../ui"
import { SettingsHeading, useSettingsCommands } from "./shared"
import { useGitHubSync } from "../../frame/githubSync"

const InstallationLink = ({ reinstall = false }: { reinstall?: boolean }) => (
  <a
    className={`repo-settings-external${reinstall ? " repo-ui-btn repo-ui-btn-primary" : ""}`}
    href="https://github.com/settings/installations"
    target="_blank"
    rel="noopener noreferrer"
  >
    {reinstall ? "Reinstall the GitHub App" : "Manage GitHub App installation"}
    <Icon name="external" size={13} />
  </a>
)

export const SyncError = () => (
  <>
    <SettingsHeading title="GitHub sync" />
    <InstallationLink reinstall />
    <Failed
      primary={false}
      what="GitHub sync"
      reason={useGitHubSync().failure}
    />
  </>
)

export const SyncReady = () => {
  const [sync, setSync] = useState({ ...settings.sync.github })
  const syncNow = () => {
    setSync(current => ({ ...current, state: "ok", lastSync: MOCK_NOW, detail: undefined }))
    toast("Repository synced with GitHub.")
  }
  useSettingsCommands({
    "sync.now": { purpose: "Sync with GitHub", fields: [], confirm: false, run: syncNow }
  })
  return (
    <>
      <SettingsHeading title="GitHub sync">
        <button
          className="repo-ui-btn repo-ui-btn-primary"
          title="/sync.now"
          onClick={syncNow}
        >
          Sync now
        </button>
      </SettingsHeading>
      <Box>
        <Row className="repo-settings-row">
          <span className="repo-settings-grow">Status</span>
          <span className={`repo-settings-sync-state repo-settings-sync-${sync.state}`}>
            <StateIcon state={sync.state === "ok" ? "success" : sync.state === "error" ? "failure" : "waiting"} />
            {sync.state === "ok" ? "In sync" : sync.state === "stale" ? "Behind GitHub" : "Sync failed"}
          </span>
        </Row>
        <Row className="repo-settings-row">
          <span className="repo-settings-grow">Last sync</span>
          <span className="repo-settings-inline">
            <time dateTime={sync.lastSync}>{fmtDate(sync.lastSync)}</time>
            <RelTime date={sync.lastSync} />
          </span>
        </Row>
        <Row className="repo-settings-row">
          <span className="repo-settings-grow">GitHub App</span>
          <span>{sync.app}</span>
        </Row>
        {repo.github && (
          <Row className="repo-settings-row">
            <span className="repo-settings-grow">Repository</span>
            <a className="repo-settings-external" href={repo.github} target="_blank" rel="noopener noreferrer">
              {repo.slug}
              <Icon name="external" size={13} />
            </a>
          </Row>
        )}
      </Box>
      {sync.detail && <div className="repo-settings-banner" role="status">{sync.detail}</div>}
      <InstallationLink reinstall={sync.state === "error"} />
    </>
  )
}
