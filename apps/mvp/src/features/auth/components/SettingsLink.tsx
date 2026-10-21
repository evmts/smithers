import { useLiveQuery } from "@tanstack/react-db"
import { Link } from "@tanstack/react-router"
import { useAuth } from "./AuthContext"

// The header's link to the deployment's settings, for an Admin only (docs/features/spend-alerts.md#channels).
export function SettingsLink() {
  const { queries } = useAuth()
  const { data: session } = useLiveQuery(queries.session)
  if (session?.status !== "signed_in" || session.role !== "admin") return null
  return <Link to="/app/settings">Settings</Link>
}
