import * as Timeline from "../features/timeline/steps"
import { Action } from "@smthrs/flow"
import { TabChannel } from "@smthrs/platform-browser"
import { Layer } from "effect"
import * as AgentHost from "../features/agent/host"
import * as Attention from "../features/attention/steps"
import * as BranchSteps from "../features/branch/steps"
import * as ChatSteps from "../features/chat/steps"
import * as PersonalFlows from "../features/flows-ui/steps"
import * as Issues from "../features/issues/steps"
import * as Jev from "../features/jev/steps"
import * as Navigation from "../features/navigation/flows"
import { RepoClient, REQUEST_WITHIN } from "../features/repo/api"
import { TabClipboard } from "../features/repo/copy"
import * as Repo from "../features/repo/steps"
import * as Runs from "../features/runs/steps"
import * as SharingSteps from "../features/sharing/steps"
import * as SpendSteps from "../features/spend/steps"
import { RunsClient } from "../features/status/api"
import * as Status from "../features/status/flows"
import * as TerminalSteps from "../features/terminal/steps"
import * as SandboxSteps from "../features/sandbox/steps"
import { RunReporter } from "../features/status/reporter"
import * as Theme from "../features/theme/flows"
import * as TodoSteps from "../features/todos/steps"
import { ViewsClient } from "../features/views/api"
import { PreviewClient } from "../features/web/api"
import * as WebPages from "../features/web/steps"
import * as RunCredentials from "./credentials"
import { clientFlows } from "./declarations"
import { type Endpoint, TabPort } from "./tabPort"

// Every client flow's registration (docs/features/flows.md#the-engine-and-the-tab-port): what the leader tab's engine
// worker (src/flows/engine.worker.ts) and a Node or Bun host register alike. It imports the agent's implementation, so
// only an engine's host imports this module, never the tab (src/flows/tab.test.ts).

/**
 * The repository flows: the reads (`repo/tree`, `repo/read`, `repo/refs`) over RepoApi's GET routes on `origin`
 * (src/features/repo/reader.ts), `repo/clone` asking RepoApi's `POST /api/repos`, and `repo/copy`, all through the
 * host's `HttpClient`: the device never holds the Code Storage key. Needs the host's `TabClipboard`, where a copy goes.
 */
export const repoFlows = (origin: string) =>
  Repo.registration.pipe(Layer.provide(RepoClient.layer({ origin, within: REQUEST_WITHIN })))

/**
 * `app/web/open`, checking each page and adding its views through ChatApi on `origin` (src/features/web/api.ts,
 * src/features/views/api.ts) and opening only what the policy allows: `http:` on this machine only when `localHttp`
 * (development), never the app's own origin.
 */
export const webPages = (origin: string, localHttp: boolean) =>
  WebPages.registration.pipe(
    Layer.provide(PreviewClient.layer({ origin })),
    Layer.provide(ViewsClient.layer({ origin })),
    Layer.provide(WebPages.WebPolicy.layer({ localHttp, appOrigin: origin })),
  )

/** What every host's registrations take: the agent's host options, and whether `http:` pages on this machine open. */
export interface HostOptions extends AgentHost.HostOptions {
  /** Whether `app/web/open` opens `http:` pages on this machine: development only. Default `false`. */
  readonly localHttp?: boolean
  readonly summaryModel?: import("@smthrs/model").Model.Model
}

/** Jev's flows, `app/jev/classify` and `app/jev/evaluate`, judging through the model endpoint's `judge` role on `origin`. */
export const jev = (origin: string) => Jev.registration.pipe(Layer.provide(Jev.JudgeSeat.layer(origin)))

/**
 * Every client flow, registered with its steps: the theme's, navigation's, web pages', the agent's, the repository's,
 * Jev's, agent status's, your own flows', the acts on runs, the issue writes, chat's Copy and Edit, the feed's, and
 * spend alerts' channels. Needs the
 * host's `FlowRuntime`, `Crypto`, `HttpClient` and `RunInspection`, the theme's `Preferences`, navigation's `Tabs`, the
 * repository's `TabClipboard`, the issues' `TabIssues`, the TODOs' `TabTodos` and chat's `TabChat`.
 */
export const registrations = (options: HostOptions) =>
  Layer.mergeAll(
    Timeline.registration.pipe(Layer.provide(Timeline.SummarySeat.layer(options.origin, options.summaryModel))),
    Theme.registration,
    Navigation.registration,
    webPages(options.origin, options.localHttp ?? false),
    AgentHost.layer(options),
    repoFlows(options.origin),
    jev(options.origin),
    Status.registration,
    PersonalFlows.layer(options.origin),
    Runs.registration,
    BranchSteps.registrationAt(options.origin),
    SharingSteps.registrationAt(options.origin),
    TerminalSteps.registrationAt(options.origin),
    SandboxSteps.registrationAt(options.origin),
    Issues.registration,
    TodoSteps.registration,
    ChatSteps.registration,
    Attention.registrationAt(options.origin),
    SpendSteps.registrationAt(options.origin),
  ).pipe(Layer.provide(statusReports(options.origin)), Layer.provideMerge(Action.layerImplementations))

/**
 * Where runs report their status and people's answers are recorded (docs/features/agent-status.md): ChatApi's runs
 * routes on `origin`, through the host's `HttpClient`. One reporter for every flow, so a run's repeated report is sent
 * once.
 */
export const statusReports = (origin: string) =>
  RunReporter.layer.pipe(Layer.provideMerge(RunsClient.layer({ origin })))

/** What the engine worker's registrations take: the host's options, and the engine's name. */
export interface WorkerOptions extends HostOptions {
  /** The engine's name (`ENGINE_NAME` in a browser): navigation asks its tabs on `<name>/navigate`. */
  readonly name: string
}

/**
 * What the engine worker registers: every client flow, its requests sent as the run that made them
 * (src/flows/credentials.ts), with this device's preferences written by the tab that started the worker, reached
 * through the worker's own global `scope` (src/flows/tabPort.ts), and navigation, copies, issue writes and chat's Copy
 * and Edit asking the tab that started each request over the engine's channels (src/flows/askingTab.ts). Needs
 * the host's `FlowRuntime`, `Crypto` and `HttpClient`, which `BrowserRuntime` provides.
 */
export const workerRegistrations = (scope: Endpoint, options: WorkerOptions) =>
  registrations(options).pipe(
    // Every request a run makes to ChatApi goes as that run: the person's session only for their own press, else the
    // run's credential (decision 0017 slice 0).
    Layer.provide(RunCredentials.layer({ origin: options.origin, name: options.name, flows: clientFlows })),
    Layer.provide(Theme.workerPreferences),
    Layer.provide(TabPort.layer(scope)),
    Layer.provide(Navigation.Tabs.layerChannel({ name: options.name, origin: options.origin })),
    Layer.provide(TabClipboard.layerChannel({ name: options.name, origin: options.origin })),
    Layer.provide(Issues.TabIssues.layerChannel({ name: options.name })),
    Layer.provide(TodoSteps.TabTodos.layerChannel({ name: options.name })),
    Layer.provide(ChatSteps.TabChat.layerChannel({ name: options.name })),
    Layer.provide(TabChannel.layer),
  )
