# Flows

Every action a person or the agent takes is one `Flow.make` declaration, listed once in the app's registry. A button, a slash command, a view and the composer dispatch a registered name; the agent calls the same declarations from its cells. A flow runs on this device's durable engine unless it needs something the device doesn't have. Decisions: [0003](../decisions/0003-flows-and-the-agent.md), [0011](../decisions/0011-the-agent-runs-in-the-browser.md).

## How a dispatch runs

```
the tab: names, needs and references only (registry.ts)
  button · slash · view · composer ─▶ FlowDispatch.dispatch(name, payload, { door })
     client ─▶ ClientEngine ─▶ BrowserEngine.start(reference) ──┐ the reference's tag and schemas
     remote ─▶ RemoteFlows ─▶ POST /api/flows/<name> ─▶ FlowStarter (a Durable Object) ─▶ CloudflareRuntime
                                                                │
the engine worker: every declaration, the agent's included      ▼
  engine.worker.ts ─▶ declarations.ts (clientFlows) + registrations.ts (steps, AgentHost)
     the leader tab's worker runs the run (SQLite on OPFS)
        └─ a step that writes this device's state ─▶ tab port ─▶ tabAnswers ─▶ its tab's collection

agent cell: await ctx.call("app/theme/set", { mode: "dark" })
   ─▶ a child execution of the same declaration on the same engine; its result is the receipt
```

The tab never imports `@smthrs/agent`: it dispatches by each flow's reference (`BrowserEngine.FlowReference`, its tag and schemas), and only the engine worker and the Node host import the declarations and what their steps run on. `src/flows/tab.test.ts` holds the line.

| File | What it holds |
|---|---|
| `src/flows/registry.ts` | The registry the tab loads: each flow's reference (its tag and schemas), what it needs (`needs`), and why only a person runs it (`userOnlyReason`). `FlowName` is the only thing the UI dispatches. |
| `src/flows/declarations.ts` | Each registered flow's declaration, body and steps included, one per registry entry with the same schema objects: `clientFlows` for the engine, `remoteFlows` for the door, `modelInvocable`. Never loaded by the tab. |
| `src/features/agent/reference.ts` | `chat/Answer`'s reference: its tag and schemas, from which `src/features/agent/flows.ts` declares it. |
| `src/flows/placement.ts` | Placement by need: `server-key`, `machine` and `devices-off` run a flow remotely; no need runs it here. |
| `src/flows/dispatch.ts` | `FlowDispatch`, and the two ports it runs through: `ClientEngine` (the browser's `BrowserEngine`, or `layerRuntime(flows)`, a `FlowRuntime` running the declarations a reference names, for the Node host and the native app) and `RemoteFlows` (the remote door over Effect `HttpClient`). |
| `src/flows/catalog.ts` | The agent's catalog: the registry's model-invocable client flows, bound for `ctx.call`. |
| `src/flows/tabPort.ts` | The engine worker's line to its own tab. |
| `src/flows/engine.ts` | The tab's side: `tabEngine` (starts the worker; provides `BrowserEngine`, `ClientEngine` and `TabWorker`), `tabAnswers` (answers the worker's calls), and `engineTelemetry`, the worker's exporter. |
| `src/flows/registrations.ts` | Every client flow's registration with its steps, the agent's included (`registrations`, `workerRegistrations`), and the repository reads over RepoApi's GET routes (`repoReads`). |
| `src/flows/engine.worker.ts` | The engine worker each tab starts: `BrowserRuntime.run` over every client flow. A program boundary, like `src/main.tsx`. |
| `worker/Flows.ts` | The remote door. |
| `worker/Body.ts` | The bounded body reader every ChatApi route that takes a body uses. |

## The registry

| Name | Placement | Agent | Doors |
|---|---|---|---|
| `app/theme/set { mode }` | client | yes | the theme button, the agent |
| `chat/Answer { answerId }` | client | no: asking starts it, and the agent is what answers | the composer: chat's outbox, once ChatApi takes the question |
| `repo/tree { repo, revision }` | client | yes | the agent ([repo](repo.md#the-agents-reads)) |
| `repo/read { repo, revision, path }` | client | yes | the agent ([repo](repo.md#the-agents-reads)) |

Its laws, enforced by `src/flows/registry.test.ts`:
- **Anything a person can do, the agent can do.** A registered flow is model-invocable, or carries a `userOnlyReason` and declares `modelInvocable: false`.
- **The UI dispatches only registered names.** The test reads every `.dispatch("<name>"` in `src/` and finds each in the registry.
- **Placement by need.** A flow runs remotely only for a need in `NEEDS`, and its `Flow.Placement` annotation says where it runs. How long it takes never decides (`flows.local-first-placement` in [rules.md](../rules.md)).
- **One namespace.** App flows are named under `app/`, `chat/`, `repo/`, `ui/` and `view/`, and each is registered under its own tag.
- **One declaration per flow.** `declarations.ts` has exactly the registry's names, in its order, and each declaration carries the very tag and schema objects of its entry's reference.

## Dispatch

`FlowDispatch.dispatch(name, payload, { door, executionId? })` answers:
- `Done { value }`: a client flow's success;
- `Failed { error }`: a client flow's declared failure, as a value;
- `Started { executionId }`: a remote flow the door took; its result arrives through Postgres and Electric;
- or fails with `DispatchFailed { flow, reason }`: `refused` (the engine or the door refused it, or nothing answered), `unavailable` (this tab's engine worker failed), `invalid` (its payload doesn't encode), `defect` or `interrupted`.

The execution id is minted once per dispatch unless the caller passes one. A door is `button`, `slash`, `view`, `composer` or `agent`.

## The theme

`app/theme/set { mode: "light" | "dark" }` is a setter, never a toggle, so a repeated delivery can't flip the theme twice. Its one step, `app/theme/write`, writes this device's `preferences` collection through `Preferences`, which each host provides:

| Host | `Preferences` |
|---|---|
| a tab | the tab's `ThemeStore` (`tabPreferences`) |
| the engine worker | a call to the tab that started it (`workerPreferences`, over the tab port) |
| the Node host in tests | the `ThemeStore` in Node |

- **The store.** `ThemeStore` keeps `preferences` on the device (`Collection.persisted`, never synced), with one row, `{ id: "theme", mode }`.
- **The follower.** It paints each change onto `<html data-theme>`, the `@smthrs/ui` palette's attribute, and mirrors the mode into `localStorage` (`smithers.theme`). A deleted preference paints the system's mode again. No component owns the theme.
- **Before paint.** `index.html` paints from the mirror before the store opens.
- **The button.** `ThemeButton` (`src/features/theme/components/ThemeButton.tsx`) is an icon button labelled for assistive tech only. It reads the mode the page shows (the preference; before the device's row is restored, what index.html painted from the mirror; else the system's) and calls `toggle`, which dispatches `app/theme/set` with the other mode, door `button`.

## The agent's catalog

The agent's cells reach the registry's model-invocable client flows and nothing else: no file system, no shell. Today those are `app/theme/set`, `repo/tree` and `repo/read`. `ctx.call("app/theme/set", { mode })` runs the declaration as a child execution on the same engine, named by the call's replay-stable identity (`<session>/call/<frame>.<ordinal>`), so a resumed cell finds the child it started. The cell call is a journaled step of the agent's run. A flow's declared failure reaches the cell as a failed call naming the failure's kind (`PreferencesUnavailable`), never its message.

## The engine and the tab port

Each tab starts an engine worker (`src/flows/engine.worker.ts`); the one whose tab holds the engine's Web Lock runs every client flow over SQLite in OPFS, and the others wait their turn ([`@smthrs/platform-browser`](../../../../packages/smithers/flows/platform-browser/docs/guides/run-flows-in-a-tab.md)). The engine's name is `smithers` (`ENGINE_NAME`).

`appLayer` (`src/boot.ts`) builds every tab's dispatch over `tabEngine(host.engineWorker, host.engineName)` and `RemoteFlows.layerHttp(origin)`. `tabEngine` needs nothing of the tab, so it builds before the device store, since the leading tab's worker serves the store's SQLite; `tabAnswers` attaches the tab's answers once the theme's store is open. A call the worker makes before then goes unanswered and fails `timeout`; its step fails or runs again by its own retry policy. The host starts the worker: main.tsx with `new Worker(new URL("./flows/engine.worker.ts", import.meta.url), { type: "module" })`, a Node test with `nodeDevice` (src/test/chatApi.ts), whose worker never leads unless the device runs its `agent`.

This device's collections live in the tab, so a step that writes one asks the tab that started the worker, which is open for as long as its worker runs. A call is `postMessage` both ways (`TabPort` in the worker, `answer` in the tab). A call the tab doesn't answer within 10 seconds fails `TabCallFailed { reason: "timeout" }`; a handler's failure is answered as `refused`, and a method the tab lacks as `unknown_method`. Every handler is a setter, so a step run again after a crash is harmless.

## The remote door

`POST /api/flows/<name> { executionId, payload }` starts a registered remote flow. The device picks the execution id once and keeps it with its outbox entry, so a replayed start is byte-identical.

| Status | When |
|---|---|
| `202 { executionId }` | started, or the same start again: the Durable Object treats the same intent as a no-op |
| `400 { code: "invalid" }` | the body isn't `{ executionId: uuid, payload }`, or isn't UTF-8 |
| `400 { code: "invalid_payload" }` | the flow's own schema refuses the payload |
| `401 { code: "authentication" }` | nobody is signed in |
| `404 { code: "not_found" }` | the name isn't a registered remote flow |
| `405` | not a `POST` |
| `409 { code: "conflict" }` | the execution id already holds another payload |
| `413 { code: "too_large" }` | the body is over 64 KiB |
| `503 { code: "unavailable" }` | the remote host couldn't record the start |

Where an execution starts is injected (`FlowStarter`): in ChatApi, `ExecutionHost.intent` and the `FlowExecution` Durable Object's `start` ([remote flows](remote-flows.md)), which maps `IntentConflict` to `409` and any other failure to `503` with its code. ChatApi routes the door (`worker/Chat.ts`) over the registry's remote flows. The registry has none yet, so every name answers `404 not_found` until the first one, `repo/Clone`, is registered.

## Observability

Nothing records a flow's payload, a cell's code or a flow's result.

| Record | Kind | Fields |
|---|---|---|
| `flow.dispatch` | log, span | `flow`, `placement`, `door`, `outcome` (`done`, `failed`, `started`, `error`), `executionId`, `durationMs`, `reason` on an error |
| `smithers_flow_dispatches` | counter | `flow`, `placement`, `door`, `outcome` |
| `flow.door` | log, span | `flow`, `executionId`, `status`, `durationMs`, `errorCode` on a 503 |
| `smithers_flow_door_requests` | counter | `flow`, `status` |

## Tests

| Test | Proves |
|---|---|
| `src/flows/registry.test.ts` | The parity law, placement by need, the UI's dispatched names, the namespaces, one declaration per flow with its reference's schemas, and the agent's catalog |
| `src/flows/tab.test.ts` | The tab's module graph (esbuild, from `src/main.tsx`, the `?faults` entry included) reaches no `@smthrs/agent`, `@smthrs/std` or Node built-in; the engine worker's registrations do |
| `src/flows/dispatch.test.ts` | Both placements: the theme on the Node host's engine over the compose Postgres, `probe/Pause` through the real door; declared failures, defects, interrupts and refusals by injected faults; every record without the payload (a sentinel) |
| `src/flows/engine.test.ts` | The browser's architecture in Node: a tab's `BrowserEngine` and the leader's engine worker over Node's Web Locks and `BroadcastChannel`, the tab port over a `MessageChannel`. A person's button and the agent both set the theme through `app/theme/set`. `tabEngine` builds with nothing of the tab, and `tabAnswers` answers only while attached |
| `src/flows/tabPort.test.ts` | Calls, refusals, unknown methods, timeouts and stray messages over a real `MessageChannel` |
| `src/features/theme/theme.test.ts` | The store, the follower, the system's mode, both `Preferences`, and the toggle through dispatch |
| `worker/Flows.test.ts`, `worker/Body.test.ts` | Every status of the door over the Durable Object's `start`; every bound of the body reader |
| `worker/Chat.test.ts` "POST /api/flows/<name>" | ChatApi routes the door: an unregistered name is `404`, a remote flow is `401` signed out and starts through the injected `FlowStarter` for a Member, and a start it can't record is `503` with its code |

Run them with the compose Postgres up (`pnpm db:up`): `pnpm exec vitest run src/flows src/features/theme worker/Flows.test.ts worker/Body.test.ts`.

`src/features/chat/chat.test.ts` "the agent" runs the whole app on a Node device whose engine leads: the asking tab dispatches `chat/Answer`, the agent answers through ChatApi, and a resend dispatches the same execution without a second run. `e2e/agent.spec.ts` runs the engine in a real browser: the agent answering through the model endpoint, the theme set by its button and by the agent, and a killed tab whose answer resumes on the same device without paying again for a sealed model call.
