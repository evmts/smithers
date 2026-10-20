import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router"
import type { BranchView } from "./features/branch/branch"
import type { FlowsUiView } from "./features/flows-ui/flowsUi"
import { issueNumberOf } from "./features/issues/contract"
import type { IssuesLayer } from "./features/issues/issues"
import { lineSearch } from "./features/repo/paths"
import type { RepoView } from "./features/repo/repo"
import type { RunsView } from "./features/runs/runs"
import type { TerminalView } from "./features/terminal/terminal"
import type { ViewsView } from "./features/views/views"
import { AppScreen } from "./screens/app/AppScreen"
import { BranchScreen } from "./screens/branch/BranchScreen"
import { DraftScreen } from "./screens/flows/DraftScreen"
import { FlowsScreen } from "./screens/flows/FlowsScreen"
import { NewFlowScreen } from "./screens/flows/NewFlowScreen"
import { IssueScreen } from "./screens/issues/IssueScreen"
import { IssuesScreen } from "./screens/issues/IssuesScreen"
import { NewIssueScreen } from "./screens/issues/NewIssueScreen"
import { Landing } from "./screens/landing/Landing"
import { RepoScreen } from "./screens/repo/RepoScreen"
import { RunScreen } from "./screens/runs/RunScreen"
import { RunsScreen } from "./screens/runs/RunsScreen"
import { ViewScreen } from "./screens/view/ViewScreen"

// The app's routes. A repository's are GitHub's paths (decision 0006 §2): swapping github.com for the app's domain
// opens the same view. Each repository route's loader opens its location through the repository layer main.tsx hands
// the router (`openRoute`), so nothing loads from a component. `?L=` is a loader dependency: a new line anchor opens
// the location again.

/**
 * What every route's loader gets: the repository, views, branch, terminal, issues, runs and flows layers, from
 * main.tsx's `RouterProvider`.
 */
export interface RouterContext {
  readonly repo: RepoView
  readonly views: ViewsView
  readonly branch: BranchView
  readonly terminal: TerminalView
  readonly issues: IssuesLayer
  readonly runs: RunsView
  readonly flows: FlowsUiView
}

/**
 * A branch page's search: `?L=` as any repository page's, and `?terminal`, which shows the branch's terminal: `me` for
 * the person's own, or a terminal's id to watch (decision 0013 §5).
 */
const branchSearch = (search: Record<string, unknown>): { readonly L?: unknown; readonly terminal?: string } => ({
  ...lineSearch(search),
  ...(typeof search.terminal === "string" && search.terminal !== "" ? { terminal: search.terminal } : {}),
})

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet })

const landingRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Landing })

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  component: AppScreen,
  // The home conversation (decision 0013 §5): a tab that showed a branch asks here again.
  loader: ({ context }) => Promise.all([context.branch.actions.leave(), context.terminal.actions.show(null)]),
})

/**
 * `/app/views/$viewId`: one view of a conversation at its full size (decision 0004 §6); `?conversation=` names the
 * branch conversation it belongs to (decision 0013 §1), none the home conversation's.
 */
const viewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/views/$viewId",
  component: ViewScreen,
  validateSearch: (search: Record<string, unknown>): { readonly conversation?: string } =>
    typeof search.conversation === "string" && /^[0-9a-f-]{36}$/i.test(search.conversation)
      ? { conversation: search.conversation.toLowerCase() }
      : {},
  loaderDeps: ({ search }) => ({ conversation: search.conversation }),
  loader: ({ context, params, deps }) => context.views.actions.show(params.viewId, deps.conversation),
})

/** `/app/flows`: your own flows and drafts (decision 0014 §5). `app` is a reserved owner, so no repository matches. */
const flowsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/app/flows", component: FlowsScreen })

/** `/app/flows/new`: a new flow of your own; `?name=` drafts the next revision of the flow by that name. */
const newFlowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/flows/new",
  component: NewFlowScreen,
  validateSearch: (search: Record<string, unknown>): { readonly name?: string } =>
    typeof search.name === "string" && search.name !== "" ? { name: search.name } : {},
  loaderDeps: ({ search }) => ({ name: search.name }),
  loader: ({ context, deps }) => context.flows.actions.openNew(deps.name),
})

/** `/app/flows/drafts/$draftId`: one draft at its full size. */
const draftRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/flows/drafts/$draftId",
  component: DraftScreen,
  loader: ({ context, params }) => context.flows.actions.openDraft(params.draftId),
})

/** `/app/runs`: every run on this device (decision 0014 §5). */
const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/runs",
  component: RunsScreen,
  loader: ({ context }) => context.runs.actions.openList(),
})

/** `/app/runs/$runId`: one run's page, read from this device's engine. */
const runRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/runs/$runId",
  component: RunScreen,
  loader: ({ context, params }) => context.runs.actions.openRun(params.runId),
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

/**
 * `/$owner/$repo/tree/$ref/$`: a directory at a branch or commit, and the branch's workspace (decision 0013 §5): its
 * conversation, and its terminal under `?terminal`. The loader opens the location and tracks the branch at once.
 */
const treeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo/tree/$ref/$",
  component: BranchScreen,
  validateSearch: branchSearch,
  loaderDeps: ({ search }) => ({ L: search.L, terminal: search.terminal }),
  loader: ({ context, params, deps }) =>
    Promise.all([
      context.repo.actions.openRoute("tree", params, { L: deps.L }),
      context.branch.actions.open(params.owner, params.repo, params.ref).then((branchId) =>
        context.terminal.actions.show(deps.terminal === undefined ? null : branchId ?? null, deps.terminal === "me" ? undefined : deps.terminal)
      ),
    ]),
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

/**
 * `/$owner/$repo/raw/$ref/$`: GitHub's raw path. Once the ref resolves, the page loads RepoApi's raw route of the file
 * at its commit in place of the app (a full document load, `reloadDocument`); until then, or when there is nothing to
 * load, it shows the file's view, which says why.
 */
const rawRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo/raw/$ref/$",
  component: RepoScreen,
  loader: async ({ context, params }) => {
    const href = await context.repo.actions.rawRoute(params)
    if (href !== undefined) throw redirect({ href, reloadDocument: true })
  },
})

/** `/$owner/$repo/issues`: the repository's issues (decision 0012 §6). */
const issuesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo/issues",
  component: IssuesScreen,
  loader: ({ context, params }) => context.issues.actions.open(params.owner, params.repo),
})

/** `/$owner/$repo/issues/new`: the new-issue form. */
const newIssueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo/issues/new",
  component: NewIssueScreen,
  loader: ({ context, params }) => context.issues.actions.open(params.owner, params.repo),
})

/** `/$owner/$repo/issues/$number`: one issue; any other `$number` matches no route. */
const issueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo/issues/$number",
  component: IssueScreen,
  params: {
    parse: (params) => {
      const number = issueNumberOf(params.number)
      return number === undefined ? false : { ...params, number }
    },
    stringify: (params) => ({ ...params, number: String(params.number) }),
  },
  loader: ({ context, params }) => context.issues.actions.open(params.owner, params.repo, params.number),
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    landingRoute,
    appRoute,
    viewRoute,
    flowsRoute,
    newFlowRoute,
    draftRoute,
    runsRoute,
    runRoute,
    repoRoute,
    treeRoute,
    blobRoute,
    rawRoute,
    issuesRoute,
    newIssueRoute,
    issueRoute,
  ]),
  // main.tsx's `RouterProvider` gives the real one before the first load.
  context: {
    repo: undefined!,
    views: undefined!,
    branch: undefined!,
    terminal: undefined!,
    issues: undefined!,
    runs: undefined!,
    flows: undefined!,
  },
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
