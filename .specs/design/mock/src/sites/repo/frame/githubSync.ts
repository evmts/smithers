import { useMock } from "../../core/mock"
import { useLocation } from "../../core/router"
import { MOCK_NOW, settings } from "../fixtures"

export const useGitHubSync = () => {
  const { flags } = useMock()
  const [path, raw] = useLocation().split("?")
  const query = new URLSearchParams(raw)
  // Issue reads and the sync settings error represent a failed GitHub sync.
  // Other page reads can fail independently of the last successful sync.
  const syncFailed = flags.net === "error" && /\/(?:issues(?:\/.*)?|settings\/sync)$/.test(path)
  const override = syncFailed ? "error" : query.get("sync")
  const sync = settings.sync.github
  const state = override === "stale" || override === "error" ? override : sync.state
  const lastSync = override === "stale" ? new Date(Date.parse(MOCK_NOW) - 3 * 3600_000).toISOString() : sync.lastSync
  const reason = override === "error" ? "GitHub returned 401 for the app installation." : sync.detail ?? "GitHub didn't respond."
  // The reason is a mirror run's raw git or GitHub error: members only (Spec Platform f-8x6skm).
  const member = flags.as === "in" && flags.role === "member"
  return { state, lastSync, failure: member ? `GitHub sync failed: ${reason}` : "GitHub sync failed" }
}
