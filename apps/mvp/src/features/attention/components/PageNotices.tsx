import { useRouterState } from "@tanstack/react-router"
import { surfaceOf } from "../contract"
import { Notices } from "./Notices"

// The toast stack on every page but the two that place their own (decision 0009 §4): it floats at the bottom-left.
// The home conversation (`/app`) shows it under its header, where the composer can't cover it; a branch's page, whose
// composer sticks to the bottom, doesn't show it yet.
export function PageNotices() {
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId })
  return routeId === undefined || surfaceOf(routeId) === "conversation" ? null : <Notices surface="page" placement="fixed" />
}
