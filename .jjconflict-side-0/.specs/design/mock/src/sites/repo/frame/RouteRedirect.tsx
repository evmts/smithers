import { useEffect } from "react"
import { navigate } from "../../core/router"
export const RouteRedirect = ({ target }: { target: string }) => {
  useEffect(() => navigate(target, { replace: true }), [target])
  return null
}
