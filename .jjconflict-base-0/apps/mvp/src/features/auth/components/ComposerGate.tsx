import { EmptyState } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import type { ReactNode } from "react"
import { composerAccess, MEMBERS_ASK, SIGN_IN_TO_ASK } from "../contract"
import { useAuth } from "./AuthContext"
import { SignInButton } from "./SignInButton"

// Asking Smithers is for Members and above (decision 0007 §2, `repo:ask`; decision 0008 §11): the composer for them,
// even offline after a reload; a short line for a signed-in Guest or a person with no role; and the sign-in prompt for
// anyone signed out, so nothing they type leaves the browser. `composerAccess` decides.
export function ComposerGate({ children }: { readonly children: ReactNode }) {
  const { queries } = useAuth()
  const { data: session } = useLiveQuery(queries.session)
  const { data: confirmed } = useLiveQuery(queries.confirmed)
  if (session === undefined) return null
  switch (composerAccess(session, confirmed)) {
    case "ask":
      return children
    case "members_only":
      return <EmptyState title={MEMBERS_ASK} />
    case "sign_in":
      return <EmptyState title={SIGN_IN_TO_ASK} action={<SignInButton />} />
    case "wait":
      return null
  }
}
