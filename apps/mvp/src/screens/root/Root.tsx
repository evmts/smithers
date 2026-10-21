import { LoadingBar } from "@smthrs/ui"
import { Outlet, useRouterState } from "@tanstack/react-router"
import { NotificationsBell } from "../../features/attention/components/NotificationsBell"
import { NotificationsPanel } from "../../features/attention/components/NotificationsPanel"
import { PageNotices } from "../../features/attention/components/PageNotices"
import { floatsBell } from "../../features/attention/contract"
import { IntentPreload } from "../../features/navigation/components/IntentPreload"
import "./root.css"

// Every route's frame: the page's LoadingBar, the route's screen, the top bar's bell where the screen's header doesn't hold
// it, the toast stack where the screen doesn't place its own, and the notifications panel, which opens on any page
// (decision 0009). While a navigation warms the next page the
// router keeps this one on screen, and the bar shows only once that has taken LOADING_DELAY_MS
// (docs/features/navigation.md). A plain link's hover or focus preloads its page (IntentPreload).
export function Root() {
  const loading = useRouterState({ select: (state) => state.status === "pending" })
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId })
  return (
    <>
      <LoadingBar loading={loading} label="Loading page" />
      <IntentPreload>
        <Outlet />
        {floatsBell(routeId) ? (
          <div className="root-bell">
            <NotificationsBell />
          </div>
        ) : null}
        <PageNotices />
        <NotificationsPanel />
      </IntentPreload>
    </>
  )
}
