import { createRootRouteWithContext, createRoute, createRouter, redirect } from "@tanstack/react-router"
import type { BranchView } from "./features/branch/branch"
import type { FlowsUiView } from "./features/flows-ui/flowsUi"
import type { HomeView } from "./features/home/home"
import { issueNumberOf } from "./features/issues/contract"
import type { IssuesLayer } from "./features/issues/issues"
import { type StackFilter, stackFilterOf, todoNumberOf } from "./features/todos/contract"
import type { TodosView } from "./features/todos/todos"
import { lineSearch } from "./features/repo/paths"
import type { RepoView } from "./features/repo/repo"
import type { RunsView } from "./features/runs/runs"
import type { TerminalView } from "./features/terminal/terminal"
import type { ViewsView } from "./features/views/views"
import { AppScreen } from "./screens/app/AppScreen"
import { BranchScreen } from "./screens/branch/BranchScreen"
import { CodeScreen } from "./screens/flows/CodeScreen"
import { DraftScreen } from "./screens/flows/DraftScreen"
import { FlowsScreen } from "./screens/flows/FlowsScreen"
import { NewFlowScreen } from "./screens/flows/NewFlowScreen"
import { IssueScreen } from "./screens/issues/IssueScreen"
import { StackScreen } from "./screens/stack/StackScreen"
import { TodoScreen } from "./screens/stack/TodoScreen"
import { commitmentSearch } from "./features/issues/lifecycle"
import { IssuesScreen } from "./screens/issues/IssuesScreen"
import { NewIssueScreen } from "./screens/issues/NewIssueScreen"
import { Landing } from "./screens/landing/Landing"
import { RepoHomeScreen } from "./screens/repo/RepoHomeScreen"
import { RepoScreen } from "./screens/repo/RepoScreen"
import { Root } from "./screens/root/Root"
import { RunScreen } from "./screens/runs/RunScreen"
import { RunsScreen } from "./screens/runs/RunsScreen"
import { SettingsScreen } from "./screens/settings/SettingsScreen"
import { ViewScreen } from "./screens/view/ViewScreen"

// The app's routes. A repository's are GitHub's paths (decision 0006 §2): swapping github.com for the app's domain
// opens the same view. Each route opens what it shows through the layers main.tsx hands the router, so nothing loads
// from a component; a new `?L=` line anchor opens the location again.
//
// Loading (docs/features/navigation.md): a link's hover or focus preloads its page (`defaultPreload: "intent"`), which
// warms what the page shows into the device; a navigation warms it too, then opens it. The router keeps the previous
// page on screen until then, and Root's LoadingBar shows only if that takes longer than LOADING_DELAY_MS. A page whose
// files are still on their way after a second shows with skeletons in their place, never blank.

/**
 * What every route gets: the repository, its home, views, branch, terminal, issues, runs and flows layers, from
 * main.tsx's `RouterProvider`.
 */
export interface RouterContext {
  readonly repo: RepoView
  readonly home: HomeView
  readonly views: ViewsView
  readonly branch: BranchView
  readonly terminal: TerminalView
  readonly issues: IssuesLayer
  readonly todos: TodosView
  readonly runs: RunsView
  readonly flows: FlowsUiView
}

/**
 * A branch page's search: `?L=` as any repository page's; `?terminal`, which shows the branch's terminal: `me` for the
 * person's own, or a terminal's id to watch (decision 0013 §5); and `?edit`, a file of the branch's working copy in the
 * live editor (docs/features/coedit.md#files).
 */
const branchSearch = (
  search: Record<string, unknown>,
): { readonly L?: unknown; readonly terminal?: string; readonly edit?: string } => ({
  ...lineSearch(search),
  ...(typeof search.terminal === "string" && search.terminal !== "" ? { terminal: search.terminal } : {}),
  ...(typeof search.edit === "string" && search.edit !== "" ? { edit: search.edit } : {}),
})

/** How long a link must be hovered before its page preloads, so a pointer sweeping over a list preloads nothing. */
export const PRELOAD_DELAY_MS = 50

/** What a route's `beforeLoad` knows of the load it is part of. */
interface Load {
  /** A link's hover or focus, not a navigation. */
  readonly preload: boolean
  /** Aborted once a newer navigation takes over. */
  readonly abortController: AbortController
}

/**
 * Every route opens what it shows in `beforeLoad`, never a loader: the router runs `beforeLoad` afresh for each
 * navigation and each preload, while a navigation adopts a loader a preload left in flight (router-core's flights), so
 * a loader can't tell a preload from the click that follows it. A preload only warms what the page shows; a navigation
 * warms it, then opens it, unless a newer navigation took over.
 */
const enter = async (load: Load, warm: () => unknown, open: () => unknown): Promise<void> => {
  await warm()
  if (load.preload || load.abortController.signal.aborted) return
  await open()
}

/** A page whose data is on the device already: nothing to warm. */
const local = () => undefined

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Root })

const landingRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Landing })

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  component: AppScreen,
  // The home conversation (decision 0013 §5): a tab that showed a branch asks here again.
  beforeLoad: (load) =>
    enter(load, local, () =>
      Promise.all([
        load.context.branch.actions.leave(),
        load.context.branch.presence.actions.leave(),
        load.context.terminal.actions.show(null),
      ])),
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
  beforeLoad: (load) =>
    enter(load, local, () => load.context.views.actions.show(load.params.viewId, load.search.conversation)),
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
  beforeLoad: (load) => enter(load, local, () => load.context.flows.actions.openNew(load.search.name)),
})

/** `/app/flows/drafts/$draftId`: one draft at its full size. */
const draftRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/flows/drafts/$draftId",
  component: DraftScreen,
  beforeLoad: (load) => enter(load, local, () => load.context.flows.actions.openDraft(load.params.draftId)),
})

/** `/app/flows/code/$name`: a flow's code, to read and edit. */
const codeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/flows/code/$name",
  component: CodeScreen,
  beforeLoad: (load) => enter(load, local, () => load.context.flows.actions.openCode(load.params.name)),
})

/** `/app/runs`: every run on this device (decision 0014 §5). */
const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/runs",
  component: RunsScreen,
  beforeLoad: (load) => enter(load, local, () => load.context.runs.actions.openList()),
})

/** `/app/settings`: the deployment's settings, for an Admin; their rows sync to an Admin's devices. */
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/app/settings", component: SettingsScreen })

/** `/app/runs/$runId`: one run's page, read from this device's engine. */
const runRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/runs/$runId",
  component: RunScreen,
  beforeLoad: (load) => enter(load, local, () => load.context.runs.actions.openRun(load.params.runId)),
})

/**
 * `/$owner/$repo`: the repository's own home when it declares one (decision 0014 §4), else its root at its default
 * branch. Both the location and the home are warmed, then opened.
 */
const repoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo",
  component: RepoHomeScreen,
  validateSearch: lineSearch,
  beforeLoad: ({ context, params, search, ...load }) =>
    enter(
      load,
      () =>
        Promise.all([
          context.repo.actions.warmRoute("tree", params, search),
          context.home.actions.warm(params.owner, params.repo),
        ]),
      () => {
        context.repo.actions.openRoute("tree", params, search)
        context.home.actions.open(params.owner, params.repo)
      },
    ),
})

/**
 * `/$owner/$repo/tree/$ref/$`: a directory at a branch or commit, and the branch's workspace (decision 0013 §5): its
 * conversation, its room, and its terminal under `?terminal`. The location is warmed; then the route opens it and
 * tracks the branch at once, joins the branch's room and says where on the page this person is; leaving the route
 * leaves the room. A preload only warms the files: it joins no room.
 */
const treeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo/tree/$ref/$",
  component: BranchScreen,
  validateSearch: branchSearch,
  beforeLoad: ({ context, params, search, ...load }) =>
    enter(load, () => context.repo.actions.warmRoute("tree", params, { L: search.L }), () =>
      Promise.all([
        context.repo.actions.openRoute("tree", params, { L: search.L }),
        context.branch.actions.open(params.owner, params.repo, params.ref).then(async (branchId) => {
          const { presence, coedit } = context.branch
          if (branchId === undefined) {
            await context.terminal.actions.show(null)
            return presence.actions.leave()
          }
          await presence.actions.join(branchId)
          // The file in the live editor under `?edit`, or none: its room is left with the editor.
          const editing = search.terminal === undefined ? search.edit : undefined
          await coedit.actions.showFile(branchId, editing)
          if (search.terminal === undefined) {
            await context.terminal.actions.show(null)
            return presence.actions.at(editing === undefined ? { view: "code", path: params._splat ?? "" } : { view: "edit", path: editing })
          }
          const terminalId = await context.terminal.actions.show(
            branchId,
            search.terminal === "me" ? undefined : search.terminal,
          )
          return presence.actions.at({ view: "terminal", terminalId })
        }),
      ])),
  onLeave: ({ context }) => {
    void context.branch.presence.actions.leave()
    void context.branch.coedit.actions.hideFiles()
  },
})

/**
 * `/$owner/$repo/blob/$ref/$`: a file at a branch or commit, `?L=<n>` or `?L=<a>-<b>` marking lines; the home is
 * opened for its tabs.
 */
const blobRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo/blob/$ref/$",
  component: RepoScreen,
  validateSearch: lineSearch,
  beforeLoad: ({ context, params, search, ...load }) =>
    enter(load, () => context.repo.actions.warmRoute("blob", params, search), () => {
      context.repo.actions.openRoute("blob", params, search)
      context.home.actions.open(params.owner, params.repo)
    }),
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
  // Nothing to warm: a preload would load the raw file in place of the app.
  beforeLoad: ({ context, params, ...load }) =>
    enter(load, local, async () => {
      context.home.actions.open(params.owner, params.repo)
      const href = await context.repo.actions.rawRoute(params)
      if (href !== undefined) throw redirect({ href, reloadDocument: true })
    }),
})

/**
 * `/$owner/$repo/issues`: the repository's issues (decision 0012 §6). The route opens its stack too, so each issue shows
 * the TODOs made from it; a preload starts both syncs.
 */
const issuesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo/issues",
  component: IssuesScreen,
  validateSearch: commitmentSearch,
  beforeLoad: ({ context, params, ...load }) =>
    enter(
      load,
      () => Promise.all([context.issues.actions.warm(), context.todos.actions.warm(params.owner, params.repo)]),
      () =>
        Promise.all([
          context.issues.actions.open(params.owner, params.repo),
          context.todos.actions.open(params.owner, params.repo),
        ]),
    ),
})

/** `/$owner/$repo/issues/new`: the new-issue form. */
const newIssueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo/issues/new",
  component: NewIssueScreen,
  beforeLoad: ({ context, params, ...load }) =>
    enter(load, () => context.issues.actions.warm(), () => context.issues.actions.open(params.owner, params.repo)),
})

/** `/$owner/$repo/issues/$number`: one issue, and the TODOs made from it; any other `$number` matches no route. */
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
  beforeLoad: ({ context, params, ...load }) =>
    enter(
      load,
      () => Promise.all([context.issues.actions.warm(), context.todos.actions.warm(params.owner, params.repo)]),
      () =>
        Promise.all([
          context.issues.actions.open(params.owner, params.repo, params.number),
          context.todos.actions.open(params.owner, params.repo),
        ]),
    ),
})

/**
 * `/$owner/$repo/stack`: the repository's stack of TODOs (decision 0016 §4), as GitHub's issue list: the open TODOs in
 * merge order, or with `?state=closed` the merged and dropped ones.
 */
const stackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo/stack",
  component: StackScreen,
  validateSearch: (search: Record<string, unknown>): { readonly state?: StackFilter } =>
    stackFilterOf(search.state) === "closed" ? { state: "closed" } : {},
  beforeLoad: ({ context, params, ...load }) =>
    enter(
      load,
      () => context.todos.actions.warm(params.owner, params.repo),
      () => context.todos.actions.open(params.owner, params.repo),
    ),
})

/** `/$owner/$repo/stack/$number`: TODO `T<number>`'s page, as GitHub's issue page; any other `$number` matches no route. */
const todoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$owner/$repo/stack/$number",
  component: TodoScreen,
  params: {
    parse: (params) => {
      const number = todoNumberOf(params.number)
      return number === undefined ? false : { ...params, number }
    },
    stringify: (params) => ({ ...params, number: String(params.number) }),
  },
  beforeLoad: ({ context, params, ...load }) =>
    enter(
      load,
      () => context.todos.actions.warm(params.owner, params.repo),
      () => context.todos.actions.open(params.owner, params.repo, params.number),
    ),
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    landingRoute,
    appRoute,
    viewRoute,
    flowsRoute,
    newFlowRoute,
    draftRoute,
    codeRoute,
    runsRoute,
    runRoute,
    settingsRoute,
    repoRoute,
    treeRoute,
    blobRoute,
    rawRoute,
    issuesRoute,
    newIssueRoute,
    issueRoute,
    stackRoute,
    todoRoute,
  ]),
  // A link's hover or focus preloads its page: its route's `beforeLoad` warms what it shows (`enter`).
  defaultPreload: "intent",
  defaultPreloadDelay: PRELOAD_DELAY_MS,
  // main.tsx's `RouterProvider` gives the real one before the first load.
  context: {
    repo: undefined!,
    home: undefined!,
    views: undefined!,
    branch: undefined!,
    terminal: undefined!,
    issues: undefined!,
    todos: undefined!,
    runs: undefined!,
    flows: undefined!,
  },
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
