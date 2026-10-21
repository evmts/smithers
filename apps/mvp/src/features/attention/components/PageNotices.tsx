import { useRouterState } from "@tanstack/react-router"
import { surfaceOf } from "../contract"
import { Notices } from "./Notices"

// The toast stack on every page but the two that place their own (decision 0009 §4): it floats at the bottom-left.
// The home conversation (`/app`) and a branch's page show it under their headers, where their composers can't cover it.
export function PageNotices() {
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId })
  return routeId === undefined || surfaceOf(routeId) === "conversation" ? null : <Notices surface="page" placement="fixed" />
}
