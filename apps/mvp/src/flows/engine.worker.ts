import wasmUrl from "@journeyapps/wa-sqlite/dist/wa-sqlite.wasm?url"
import { Migrations } from "@smthrs/effect-tanstack-db"
import type { Model } from "@smthrs/model"
import { BrowserRuntime } from "@smthrs/platform-browser"
import { Effect } from "effect"
import { FetchHttpClient } from "effect/http"
import { answer, authorizeDevice, boundFetch, IDENTITY_MESSAGE, type Receipt, sessionNow } from "../device/identity"
import { deviceRegistry } from "../device/registry"
import { getSession } from "../features/auth/api"
import { NO_DEVICE_DATA, SESSION_ROUTE } from "../features/auth/contract"
import { ENGINE_NAME } from "./contract"
import { clientFlows } from "./declarations"
import { engineTelemetry } from "./engine"
import { workerRegistrations } from "./registrations"

// The engine worker each tab starts (src/flows/engine.ts `tabEngine`): a program boundary, like src/main.tsx, which
// hands the host's capabilities to the program. It, not the tab, imports every client flow's declaration and steps, the
// agent's included. The worker whose tab holds the engine's Web Lock runs every client flow over SQLite in OPFS
// (decision 0011); the others wait their turn. It reaches ChatApi on the page's origin, and this device's collections
// through its own tab. Its logs, spans and metrics go to ChatApi's relay, as the tab's do.

// Whose data the device holds (src/device/identity.ts): checked before the engine starts and sent to this worker's tab
// and every waiting tab. While this worker leads, a tab about to follow it asks, and gets the receipt checked against
// the browser's session now. A refused check stops the engine, so this worker never leads and answers no one. Every
// request this worker makes to ChatApi carries the owner.
let receipt: Receipt | undefined
const identity = new BroadcastChannel(IDENTITY_MESSAGE)
const unbound = self.fetch.bind(self)
identity.onmessage = (event: MessageEvent) => {
  const opened = receipt
  if (event.data?.request !== true || opened?.owner === undefined) return
  void unbound(`${self.location.origin}${SESSION_ROUTE}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) })
    .then(sessionNow, () => "unreachable" as const)
    .then((session) => identity.postMessage(answer(opened, session)))
}
self.fetch = boundFetch(unbound, { origin: self.location.origin, principal: () => receipt?.owner ?? NO_DEVICE_DATA })

const run = (model?: Model.Model, summaryModel?: Model.Model) =>
  BrowserRuntime.run({
    name: ENGINE_NAME,
    // The SQLite build loads only once this worker leads, and only in this worker's bundle.
    sqlite: {
      module: () => import("@journeyapps/wa-sqlite/dist/wa-sqlite.mjs"),
      wasm: () => fetch(wasmUrl).then((response) => response.arrayBuffer()),
    },
    flows: clientFlows,
    // Before it serves the device store to any tab, the leader brings it to this build's versions, once per epoch, as
    // the durable flow `device/prepare` (decision 0021).
    prepare: Migrations.prepare(deviceRegistry),
    // Before the engine exists, every time this worker is about to lead, whose data the device holds.
    authorize: (database) =>
      authorizeDevice({
        database,
        session: getSession(self.location.origin, "10 seconds").pipe(
          Effect.provide(FetchHttpClient.layer),
          Effect.provideService(FetchHttpClient.Fetch, unbound),
        ),
        report: (owner, outcome, continuous) => {
          receipt = { _tag: IDENTITY_MESSAGE, owner, outcome, ...(continuous ? { continuous: true } : {}) }
          self.postMessage(receipt)
          identity.postMessage(receipt)
        },
      }),
    // `http:` pages on this machine open only under the dev server (src/features/web/url.ts).
    registerFlows: workerRegistrations(self, {
      origin: self.location.origin,
      name: ENGINE_NAME,
      localHttp: import.meta.env.DEV,
      ...(model === undefined ? {} : { model }),
      ...(summaryModel === undefined ? {} : { summaryModel }),
    }),
    telemetry: engineTelemetry(self.location.origin),
  })

// Under the dev server, a worker named `agent:<script>` (main.tsx, from `?agent=<script>`) answers with a scripted model
// for the end-to-end tests (src/test/scriptedAgent.ts). A production build drops this branch, and the module with it.
const scripted = import.meta.env.DEV && self.name.startsWith("agent:") ? self.name.slice("agent:".length) : undefined
if (scripted === undefined) run()
else void Promise.all([import("../test/scriptedAgent"), import("../test/scriptedSummary")]).then(([agent, summary]) => run(agent.scriptedModel(scripted), summary.scriptedSummary))
