import { createRootRouteWithContext, createRoute, createRouter, Outlet } from "@tanstack/react-router"
import { lineSearch } from "./features/repo/paths"
import type { RepoView } from "./features/repo/repo"
import { AppScreen } from "./screens/app/AppScreen"
import { Landing } from "./screens/landing/Landing"
import { RepoScreen } from "./screens/repo/RepoScreen"

// The app's routes. A repository's are GitHub's paths (decision 0006 §2): swapping github.com for the app's domain
// opens the same view. Each repository route's loader opens its location through the repository layer main.tsx hands
// the router (`openRoute`), so nothing loads from a component. `?L=` is a loader dependency: a new line anchor opens
// the location again.

/** What every route's loader gets: the repository layer, from main.tsx's `RouterProvider`. */
export interface RouterContext {
  readonly repo: RepoView
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet })

const landingRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Landing })

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  component: AppScreen,
})

/** `/$owner/$repo`: the repository's root at its default branch. */
const repoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo",
  component: RepoScreen,
  validateSearch: lineSearch,
  loaderDeps: ({ search }) => ({ L: search.L }),
  loader: ({ context, params, deps }) => context.repo.actions.openRoute("tree", params, deps),
})

/** `/$owner/$repo/tree/$ref/$`: a directory at a branch or commit. */
const treeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo/tree/$ref/$",
  component: RepoScreen,
  validateSearch: lineSearch,
  loaderDeps: ({ search }) => ({ L: search.L }),
  loader: ({ context, params, deps }) => context.repo.actions.openRoute("tree", params, deps),
})

/** `/$owner/$repo/blob/$ref/$`: a file at a branch or commit, `?L=<n>` or `?L=<a>-<b>` marking lines. */
const blobRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo/blob/$ref/$",
  component: RepoScreen,
  validateSearch: lineSearch,
  loaderDeps: ({ search }) => ({ L: search.L }),
  loader: ({ context, params, deps }) => context.repo.actions.openRoute("blob", params, deps),
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([landingRoute, appRoute, repoRoute, treeRoute, blobRoute]),
  // main.tsx's `RouterProvider` gives the real one before the first load.
  context: { repo: undefined! },
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
