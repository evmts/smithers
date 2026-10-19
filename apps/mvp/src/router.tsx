import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router"
import { AppShell } from "./screens/app/AppShell"
import { AppFailed, AppLoading } from "./screens/app/AppStatus"
import { Landing } from "./screens/landing/Landing"

const rootRoute = createRootRoute({ component: Outlet })

const landingRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Landing })

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  component: AppShell,
  pendingComponent: AppLoading,
  errorComponent: AppFailed,
})

export const router = createRouter({ routeTree: rootRoute.addChildren([landingRoute, appRoute]) })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
