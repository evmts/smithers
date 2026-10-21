import { useLiveQuery } from "@tanstack/react-db"
import { Link } from "@tanstack/react-router"
import { useAuth } from "../../features/auth/components/AuthContext"
import { AlertSettings } from "../../features/spend/components/AlertSettings"
import "./settings-screen.css"

// /app/settings: the deployment's settings, for an Admin (docs/features/spend-alerts.md#channels). Its one section so
// far is where spend alerts go outside the app. Anyone else sees the page's header alone.
export function SettingsScreen() {
  const { queries } = useAuth()
  const { data: session } = useLiveQuery(queries.session)
  const admin = session?.status === "signed_in" && session.role === "admin"
  return (
    <main className="settings-screen" aria-label="Settings">
      <header className="settings-screen-header">
        <Link to="/app">Back to chat</Link>
        <h1>Settings</h1>
      </header>
      {admin ? <AlertSettings /> : null}
    </main>
  )
}
