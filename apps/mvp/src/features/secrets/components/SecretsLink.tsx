import { Button } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { Link } from "@tanstack/react-router"
import { useAuth } from "../../auth/components/AuthContext"
import { SECRETS } from "../copy"
import { accessOf, showsLink } from "../view"

// The repository header's Secrets link, shown to a Member or above (docs/features/secrets.md#the-secrets-page).
export function SecretsLink({ owner, repo }: { readonly owner: string; readonly repo: string }) {
  const { queries } = useAuth()
  const { data: session } = useLiveQuery(queries.session)
  if (!showsLink(accessOf(session))) return null
  return (
    <Button asChild variant="ghost">
      <Link to="/$owner/$repo/settings/secrets" params={{ owner, repo }}>{SECRETS}</Link>
    </Button>
  )
}
