import { Outlet } from "@tanstack/react-router"
import { PageNotices } from "../../features/attention/components/PageNotices"

// Every route's frame: the route's screen, and the toast stack where the screen doesn't place its own (decision 0009).
export function Root() {
  return (
    <>
      <Outlet />
      <PageNotices />
    </>
  )
}
