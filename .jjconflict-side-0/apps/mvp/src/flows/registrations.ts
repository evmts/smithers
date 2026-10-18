import { Action } from "@smthrs/flow"
import { Layer } from "effect"
import * as AgentHost from "../features/agent/host"
import { RepoClient, REQUEST_WITHIN } from "../features/repo/api"
import * as Repo from "../features/repo/flows"
import { readerLayer } from "../features/repo/reader"
import * as Theme from "../features/theme/flows"
import { type Endpoint, TabPort } from "./tabPort"

// Every client flow's registration (docs/features/flows.md#the-engine-and-the-tab-port): what the leader tab's engine
// worker (src/flows/engine.worker.ts) and a Node or Bun host register alike. It imports the agent's implementation, so
// only an engine's host imports this module, never the tab (src/flows/tab.test.ts).

/**
 * The repository reads, `repo/tree` and `repo/read`, reading RepoApi's GET routes on `origin` through the host's
 * `HttpClient` (src/features/repo/reader.ts): the device never holds the Code Storage key.
 */
export const repoReads = (origin: string) =>
  Repo.registration.pipe(
    Layer.provide(readerLayer),
    Layer.provide(RepoClient.layer({ origin, within: REQUEST_WITHIN })),
  )

/**
 * Every client flow, registered with its steps: the theme's, the agent's and the repository reads'. Needs the host's
 * `FlowRuntime`, `Crypto` and `HttpClient`, and the theme's `Preferences`.
 */
export const registrations = (options: AgentHost.HostOptions) =>
  Layer.mergeAll(Theme.registration, AgentHost.layer(options), repoReads(options.origin)).pipe(
    Layer.provideMerge(Action.layerImplementations),
  )

/**
 * What the engine worker registers: every client flow, with this device's preferences written by the tab that started
 * the worker, reached through the worker's own global `scope` (src/flows/tabPort.ts). Needs the host's `FlowRuntime`,
 * `Crypto` and `HttpClient`, which `BrowserRuntime` provides.
 */
export const workerRegistrations = (scope: Endpoint, options: AgentHost.HostOptions) =>
  registrations(options).pipe(Layer.provide(Theme.workerPreferences), Layer.provide(TabPort.layer(scope)))
