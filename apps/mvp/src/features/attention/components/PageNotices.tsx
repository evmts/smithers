import { useRouterState } from "@tanstack/react-router"
import { surfaceOf } from "../contract"
import { Notices } from "./Notices"

// Page notices take document space above the routed screen, so a card cannot cover its controls (decision 0036).
// The home conversation (`/app`) and a branch's page show it under their headers, where their composers can't cover it.
export function PageNotices() {
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId })
  return routeId === undefined || surfaceOf(routeId) === "conversation" ? null : (
    <div className="root-notices">
      <Notices surface="page" placement="inline" />
    </div>
  )
}
