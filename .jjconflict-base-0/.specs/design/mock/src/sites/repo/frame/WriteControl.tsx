import type { ReactNode } from "react"
import { signInRoute } from "../../core/catalog"
import { useMock } from "../../core/mock"
import { Link, useLocation } from "../../core/router"
export const SignInAction = ({ primary = true }: { primary?: boolean }) => {
  const location = useLocation()
  return <Link className={`repo-ui-btn${primary ? " repo-ui-btn-primary" : ""}`} title="/signin" to={signInRoute(location)}>Sign in</Link>
}
export const WriteControl = ({ primary = false, quiet = false, act, access = "member", children }: { primary?: boolean; quiet?: boolean; act?: string; access?: "member" | "signed-in"; children: ReactNode }) => {
  const { flags } = useMock()
  if (flags.as === "out") return primary ? <SignInAction primary={!quiet} /> : null
  if (flags.role !== "member" && access === "member") return primary && act ? <span className="repo-ui-muted">Members can {act}.</span> : null
  return <>{children}</>
}
