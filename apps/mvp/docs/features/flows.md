# Flows

Every action a person or the agent takes is one `Flow.make` declaration, listed once in the app's registry. A button, a slash command, a view and the composer dispatch a registered name; the agent calls the same declarations from its cells. Every registered flow runs on this device's durable engine; a flow that needs something the device lacks is a [remote flow](remote-flows.md), started by the route that admits it. Decisions: [0003](../decisions/0003-flows-and-the-agent.md), [0011](../decisions/0011-the-agent-runs-in-the-browser.md).

## How a dispatch runs

```
the tab: names and references only (registry.ts)
  button · slash · view · composer ─▶ FlowDispatch.dispatch(name, payload, { door })
     ─▶ ClientEngine ─▶ BrowserEngine.start(reference) ─────────┐ the reference's tag and schemas
                                                                │
the engine worker: every declaration, the agent's included      ▼
  engine.worker.ts ─▶ declarations.ts (clientFlows) + registrations.ts (steps, AgentHost)
     the leader tab's worker runs the run (SQLite on OPFS)
        └─ a step that writes this device's state ─▶ tab port ─▶ tabAnswers ─▶ its tab's collection
        └─ app/navigate's step ─▶ <name>/navigate (BroadcastChannel) ─▶ the tab that asked ─▶ its router

agent cell: await ctx.call("app/theme/set", { mode: "dark" })
   ─▶ a child execution of the same declaration on the same engine; its result is the receipt
```

The tab never imports `@smthrs/agent`: it dispatches by each flow's reference (`BrowserEngine.FlowReference`, its tag and schemas), and only the engine worker and the Node host import the declarations and what their steps run on. `src/flows/tab.test.ts` holds the line.

| File | What it holds |
|---|---|
| `src/flows/registry.ts` | The registry the tab loads: each flow's reference (its tag and schemas), and why only a person runs it (`userOnlyReason`). `FlowName` is the only thing the UI dispatches. |
| `src/flows/declarations.ts` | Each registered flow's declaration, body and steps included, one per registry entry with the same schema objects: `clientFlows` for the engine, and `modelInvocable`. Never loaded by the tab. |
| `src/features/agent/reference.ts` | `chat/Answer`'s reference: its tag and schemas, from which `src/features/agent/flows.ts` declares it. |
| `src/flows/dispatch.ts` | `FlowDispatch`, and the port it runs through: `ClientEngine` (the browser's `BrowserEngine`, or `layerRuntime(flows)`, a `FlowRuntime` running the declarations a reference names, for the Node host and the native app). |
| `src/flows/catalog.ts` | The agent's catalog: the registry's model-invocable client flows, bound for `ctx.call`. |
| `src/flows/tabPort.ts` | The engine worker's line to its own tab. |
| `src/flows/requests.ts` | Which tab a step reaches: `TabRequests`, the executions this tab dispatched with their doors, which `FlowDispatch` fills and provides, and `requesterOf`, the run an execution belongs to ([navigation](#navigation)). |
| `src/flows/engine.ts` | The tab's side: `tabEngine` (starts the worker; provides `BrowserEngine`, `ClientEngine` and `TabWorker`), `tabAnswers` (answers the worker's calls), and `engineTelemetry`, the worker's exporter. |
| `src/flows/registrations.ts` | Every client flow's registration with its steps, the agent's included (`registrations`, `workerRegistrations`), and the repository's flows over RepoApi's routes (`repoFlows`). |
| `src/flows/engine.worker.ts` | The engine worker each tab starts: `BrowserRuntime.run` over every client flow. A program boundary, like `src/main.tsx`. |
| `worker/Body.ts` | The bounded body reader every ChatApi route that takes a body uses. |

## The registry

`FlowRegistry` is an Effect service tag (`Context.Service` in Effect 4). The tab and engine hosts provide its default `layer`; dispatch, credentials and the agent catalog read it with `yield* FlowRegistry`. A host may inject another registry layer. The reference table remains the single declaration list used to derive static command metadata and types; flow bodies stay out of the tab.

| Name | Placement | Agent | Doors |
|---|---|---|---|
| `app/theme/set { mode }` | client | yes | the theme button, `/theme`, the agent |
| `app/navigate { to }` | client | yes | `/navigate`, the agent ([navigation](#navigation)) |
| `app/web/open { url, mode? }` | client | yes | `/web` (Member and up), the agent ([web pages](web-pages.md)) |
| `chat/Answer { answerId }` | client | no: asking starts it, and the agent is what answers | the composer: chat's outbox, once ChatApi takes the question |
| `chat/Close { answerId }` | client | no: the tab that asked settles an answer whose run can no longer finish | the composer: chat's outbox, when `chat/Answer` ended refused `plan_changed` ([agent](agent.md#settling)) |
| `repo/tree { repo, revision }` | client | yes | the agent ([repo](repo.md#flows)) |
| `repo/read { repo, revision, path }` | client | yes | the agent ([repo](repo.md#flows)) |
| `issue/create { repo, title, body? }` | client | yes | New issue, `/issue owner/repo <title>` (Guest and up), the agent ([issues](issues.md#the-browser)) |
| `issue/comment { repo, number, body }` | client | yes | Comment, `/comment owner/repo <n> <text>` (Guest and up), the agent ([issues](issues.md#the-browser)) |
| `issue/triage { repo, number, decision, reason? }` | client | no: overriding triage is a person's call | Accept, Not accepted, `/triage owner/repo <n> accept\|reject [reason]` (Member and up) ([triage](issues.md#triage)) |
| `triage/run { repo, number }` | client | no | Run triage again, `/triage.run owner/repo <n>` (Member and up) |
| `triage/enable { repo, dailyTokens? }`, `triage/pause { repo }` | client | no | Enable triage, Pause triage, `/triage.enable`, `/triage.pause` (Maintainer and up) |
| `todo/draft { repo, prompt, title?, acceptance? }` | client | yes | the agent, `/todo.new owner/repo <prompt>` (Member and up): a private draft on the device ([TODOs](todos.md#flows)) |
| `todo/commit { repo, title, prompt, acceptance? }`, `todo/drop { repo, number }` | client | no: a person commits and drops; the agent drafts | Commit on a draft card; Drop, `/todo.drop` (Member and up) |
| `repo/refs { repo }` | client | yes | the agent ([repo](repo.md#flows)) |
| `repo/about { repo }` | client | no: a repository's page loads it; the agent reads a repository with `repo/refs`, `repo/tree` and `repo/read` | opening or warming a repository's page ([repo](repo.md#about)) |
| `repo/clone { repo }` | client | yes | Clone and Try again, `/clone` for a Member or above, the agent ([repo](repo.md#cloning)) |
| `repo/copy { repo, what, … }` | client | yes | the repository view's Copy buttons, the agent ([repo](repo.md#copy)) |
| `app/jev/classify { question, items, labels? }` | client | yes | the agent ([Jev](jev.md)) |
| `app/jev/evaluate { text, criteria }` | client | yes | the agent ([Jev](jev.md)) |
| `app/agent/ask { kind, prompt, options? }` | client | yes | the agent, when it needs the person ([agent status](agent-status.md)) |
| `run/answer { runId, version, execution, value }` | client | no: only the person answers what the agent asks them | the question's card ([agent status](agent-status.md#flows)) |
| `run/deliver { execution, value }` | client | no: the device that holds a run delivers an answer already recorded | sync, when an answered question reaches the device ([agent status](agent-status.md#flows)) |

An entry's `slash` door (`{ command, minimum }`) puts it in the composer's slash menu for a person who is at least `minimum`, with the first sentence of its description and its payload as arguments ([slash commands](slash-commands.md)).

Its laws, enforced by `src/flows/registry.test.ts`:
- **Anything a person can do, the agent can do.** A registered flow is model-invocable, or carries a `userOnlyReason` and declares `modelInvocable: false`.
- **The UI dispatches only registered names.** The test reads every `.dispatch("<name>"` in `src/` and finds each in the registry.
- **Every flow runs here.** Each declaration's `Flow.Placement` annotation is `client`. A flow that needs something the device lacks is a remote flow, which the route that admits it starts ([no remote door](remote-flows.md#no-remote-door)). How long a flow takes never decides (`flows.local-first-placement` in [rules.md](../rules.md)).
- **One namespace.** App flows are named under `app/`, `chat/`, `repo/`, `ui/` and `view/`, and each is registered under its own tag.
- **One declaration per flow.** `declarations.ts` has exactly the registry's names, in its order, and each declaration carries the very tag and schema objects of its entry's reference.
- **One person-only list.** The server's person-only flows (`worker/Actor.ts` `PERSON_ONLY_FLOWS`) are exactly the entries with a `userOnlyReason`, and its agents (`AGENT_FLOWS`) exactly those marked `acts: "agent"`; the compiler and the test hold both.

## Dispatch

`FlowDispatch.dispatch(name, payload, { door, executionId?, admitted? })` starts the run on this device's engine (`ClientEngine.start`, which returns once the engine recorded it), then waits for it to end (`ClientEngine.result`), and answers:
- `Done { value }`: a client flow's success;
- `Failed { error }`: a client flow's declared failure, as a value;
- or fails with `DispatchFailed { flow, reason, refusal? }`: `refused` (the engine refused it, or nothing answered), `unavailable` (this tab's engine worker failed), `invalid` (its payload doesn't encode), `defect` or `interrupted`. A run the engine's interpreter refused died with its code as `refusal` (`Interpreter.refusalCode` from `@smthrs/flow`), such as `plan_changed` for a run parked under one build of the app and resumed under the next. An engine in this process (`ClientEngine.layerRuntime`) answers its own refusals as `refused` with their code, never as the flow's failure: a start of an execution again with another input is `refused` `execution_identity_conflict`, and a run that ends with a failure its flow doesn't declare is `refused` with that failure's code, such as `flow_cycle_detected`.

The execution id is minted once per dispatch unless the caller passes one. A door is `button`, `slash`, `view`, `composer`, `agent` or `sync`. The person's doors (`PERSON_DOORS`) are `button`, `slash` and `composer`: a root run of a person's flow started through one runs with the person's session, and every other run, nested ones included, with a credential the server mints for it, which the tab answers for on `<name>/door` ([run credentials](sign-in.md#run-credentials)). An entry's `acts` mark says who its run is when nobody pressed it: `agent` (`chat/Answer`, `flow/new`, `flow/run/prompt`) or `flow` (`run/deliver`); absent, the person's. `admitted`, a `Deferred`, completes once the engine recorded the run, or fails with the dispatch's `DispatchFailed` (`interrupted` when the dispatch was interrupted first), so a caller can wait for the run to exist without waiting for it to end: chat's outbox keeps a question until the run that answers it is recorded ([state.md](../state.md#chat-2026-10-20)).

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

## Navigation

`app/navigate { to }` takes the tab that asked to a page of the app. A person runs it with `/navigate <path>`; the agent runs it for "open octocat/Spoon-Knife", "show me README.md" or "go to line 12 of …", finding a file's path with `repo/tree` first. Its description teaches the agent the app's paths, which are GitHub's (decision [0006](../decisions/0006-repo-clone-and-view.md) §2): `/<owner>/<repo>`, `/<owner>/<repo>/tree/<ref>/<dir>`, `/<owner>/<repo>/blob/<ref>/<file>`, and `?L=12` or `?L=10-20` after a file for lines.

```
the tab (FlowDispatch, door slash) ─┐                 ┌─ the agent's cell: ctx.call("app/navigate", { to })
                                    ▼                 ▼
          app/navigate/go, in the leader tab's engine worker
             appPath(to, origin) ── another origin or scheme ─▶ NavigationRefused; no tab moves
             requesterOf(executionId) ─▶ <name>/navigate ─▶ every tab ─▶ only the tab whose TabRequests holds it
                                                                          ─▶ appPath again ─▶ router.navigate
             no answer within 5 s ─▶ { path, moved: false }: the tab that asked is gone
```

- **Where it may go.** `appPath` (`src/features/navigation/paths.ts`): an app path, with or without its leading slash, or a full URL on the app's own origin, reduced to its path, query and fragment kept. Leading slashes collapse to one. Any other origin, any other scheme (`javascript:`, `data:`, `mailto:`) and anything that isn't a URL fail `NavigationRefused { reason }` (`origin`, `scheme`, `invalid`), and the tab stays. An agent that a page or a file talked into a link never sends a person to an outside site; a person still follows ordinary links. `to` is 1 to 2,048 characters.
- **Which tab moves.** The step runs in the leader tab's engine worker, which may not be the tab that asked. It asks on the engine's navigation channel (`<name>/navigate`, a `BroadcastChannel`, through `Tabs`) for the tab that started the run its execution belongs to (`requesterOf`). A tab's own dispatch is its own requester; the agent's call (`<answerId>/chat/Respond@…/call/<frame>.<ordinal>`) belongs to its answer, which the asking tab's composer dispatched. Each tab remembers the executions it dispatched (`TabRequests`, its latest 1,024), so only that tab answers (`tabNavigation`, `src/features/navigation/tab.ts`). It checks the path once more and moves through TanStack Router's `navigate` (`Host.navigate`: main.tsx's router, outside React), never `history` or `location`. Every other tab, and every other device, stays.
- **Completion.** The tab awaits the router before answering `moved: true`; synchronous throws and Promise rejections answer `moved: false` and record `failed`. The tab call independently bounds a supplied path to 2,048 characters.
- **What it answers.** `{ path, moved }`: the app path, and whether the tab moved. A tab that doesn't answer within 5 seconds (`NAVIGATE_WITHIN`) is gone, closed or reloaded: the step settles `moved: false` without error and moves no other tab. A router that throws leaves the tab where it was, also `moved: false`.
- **Durability.** One local action, durable as the theme is: the step's result is journaled, and a step run again after a crash asks for the same path, a setter. A run resumed in another tab after the asking tab closed finds no tab and settles.

## The tab that asked

A step that acts on the tab whose request started its run asks over one of the engine's channels through `src/flows/askingTab.ts`: `app/navigate` (`<name>/navigate`), `repo/copy` (`<name>/clipboard`), the issue writes (`<name>/issues`), and chat's `chat/copy` and `chat/edit` (`<name>/chat-copy`, `<name>/chat-edit`, [chat](chat.md#message-controls)). Each feature declares only its input and answer schemas.

```
step (engine worker) ── asker({ channel, output, within }) ── { requester, input } ─▶ every tab on the channel
tab ── answerAskingTab({ channel, input, answer }) ── TabRequests.doorOf(requester)? ── answer(input, door)
     ◀── { door, output } ── only the tab that started the requester; nothing within `within` ─▶ none: the tab is gone
```

- The step subscribes before it asks, so the answer can't come first, and takes only the answer with its own call id whose output its schema accepts.
- A tab answers only a call whose input its schema accepts, for a requester it started, one call at a time, until its scope closes.

## The agent's catalog

The agent's cells reach the registry's model-invocable client flows and nothing else: no file system, no shell. The catalog is scoped to the run whose agent asks (`scopeOf` and `scopeFor`, `src/flows/catalog.ts`): `flow/new`'s drafting agent sees only `repo/tree` and `repo/read`, and an agent running one of [your own flows](#your-own-flows) sees only the flows that revision lists, read from its pinned payload; a call to any other is refused as unknown. Every other agent sees the whole catalog. Today those are `app/theme/set`, `app/navigate`, `app/web/open`, `chat/copy`, `repo/tree`, `repo/read`, `repo/refs`, `repo/clone`, `repo/copy`, `app/jev/classify`, `app/jev/evaluate` and `app/agent/ask`. `ctx.call("app/theme/set", { mode })` runs the declaration as a child execution on the same engine, named by the call's replay-stable identity (`<session>/call/<frame>.<ordinal>`), so a resumed cell finds the child it started. The cell call is a journaled step of the agent's run. A flow's declared failure reaches the cell as a failed call naming the failure's kind (`PreferencesUnavailable`), never its message.

Each flow the catalog binds says whether it changes something (`catalogDescription`): a registry entry that changes something declares what in product words (`changes`, such as "clones the repository, which spends the deployment's storage"), and the agent reads its description followed by `Side effect: <changes>; only when the person asks for that.` A read declares nothing and reads its description alone. `src/flows/registry.test.ts` holds every model-invocable flow to one or the other, so a new flow is classified on purpose. A flow whose side effect only the person decides on also declares `confirm`, the question they Approve or Deny: the agent's call to it first asks through `app/agent/ask`, as a child of the answer's run (`<call>/confirm`), and runs the flow only on Approve; a Deny, or no answer in time, fails the call `NotApproved` before the flow runs. A person's own button or slash command doesn't ask. Today `flow/save` ("Save this draft as your flow?") and `flow/delete` ("Delete this flow?") ask. Before 2026-10-20 nothing told the agent a flow had a side effect, and the [agent evals](agent-evals.md) caught it cloning a repository it was only asked to open, and saving and running a flow it was only asked to create.

## The engine and the tab port

Each tab starts an engine worker (`src/flows/engine.worker.ts`); the one whose tab holds the engine's Web Lock runs every client flow over SQLite in OPFS, and the others wait their turn ([`@smthrs/platform-browser`](../../../../packages/smithers/flows/platform-browser/docs/guides/run-flows-in-a-tab.md)). The engine's name is `smithers` (`ENGINE_NAME`).

`appLayer` (`src/boot.ts`) builds every tab's dispatch over `tabEngine(host.engineWorker, host.engineName)`. `tabEngine` needs nothing of the tab, so it builds before the device store, since the leading tab's worker serves the store's SQLite; `tabAnswers` attaches the tab's answers once the theme's store is open. A call the worker makes before then goes unanswered and fails `timeout`; its step fails or runs again by its own retry policy. The host starts the worker: main.tsx with `new Worker(new URL("./flows/engine.worker.ts", import.meta.url), { type: "module" })`, a Node test with `nodeDevice` (src/test/chatApi.ts), whose worker never leads unless the device runs its `agent`.

This device's collections live in the tab, so a step that writes one asks the tab that started the worker, which is open for as long as its worker runs. A call is `postMessage` both ways (`TabPort` in the worker, `answer` in the tab). A call the tab doesn't answer within 10 seconds fails `TabCallFailed { reason: "timeout" }`; a handler's failure is answered as `refused`, and a method the tab lacks as `unknown_method`. Every handler is a setter, so a step run again after a crash is harmless.

## Your own flows

Everything is a flow, and a person's own flow is flow source: one `flow.ts` module whose default export is `Flow.make("<name>", { ... })` from `@smthrs/flow`, the shape a repository's `.smithers/flows/<name>/flow.ts` has. A flow drafted from a prompt is that same kind of module, written by the system, never a second kind. Will, 2026-10-20: "No everything is a flow this ruling is clear prompt flows are just a type of code flow" ([decision 0014](../decisions/0014-flows-authoring-debugging-and-home-view.md) §1). A person's flows and a repository's differ only in where they live and who may run them. Yours are stored in Postgres and synced to every device you sign in on; a repository's aren't built yet.

**A drafted flow's module** (`renderSource`, `src/features/flows-ui/source.ts`): its instructions, one typed agent step (`<name>/agent`, seat `agent`) that follows them with the run's input, and the `Flow.make` declaration with its description, `flows` (what it may call), payload `{ input }`, success `string`, error and body. `src/features/flows-ui/source.test.ts` type-checks it against `@smthrs/flow` and `@smthrs/agent`.

```ts
const Agent = AgentAction.make("release-notes/agent", { payload: { input: Schema.String }, output: Schema.String,
  seat: "agent", prompt: ({ input }) => (input === "" ? instructions : `${instructions}\n\nInput: ${input}`) })

export default Flow.make("release-notes", { description: "…", capabilities: [], flows: ["repo/read"],
  payload: { input: Schema.String }, success: Schema.String, error: Agent.errorSchema,
  body: ({ input }) => Agent.call({ input }) })
```

**Where a revision runs** is its placement, read from its source (`placementOf`):

| Placement | Source | Runs |
|---|---|---|
| `client` | exactly the module `renderSource` writes for its name, description, instructions and calls | on your device's engine. The body is the system's own agent step, and only its data came from the draft, so `flow/run/load` pins that data and `flow/run/prompt` runs the step as this engine declares it |
| `sandbox` | any other code, a hand edit included, even one that keeps the behavior | only on a host that runs untrusted code (decision [0005](../decisions/0005-sandboxes-secrets-and-the-forge.md)). None exists yet, so its run fails `FlowNeedsSandbox` before anything runs, and the Flows page turns Run off and says `Needs a sandbox` |

Editing a drafted flow's instructions, description or calls in code still makes other code, because the comparison is byte for byte. Drafting again (`Edit`) writes a drafted module, which runs here again.

```
/app/flows/new: Name + What it should do ─ Draft ─▶ flow/new { name, request }   execution <draftId>:<round>
  flow/new/open   the draft row (drafting); a name you have edits that flow, from its latest source
  flow/new/draft  AgentAction, role agent: description, instructions, flows, questions ≤ 5 (corrected twice at most)
  flow/new/write  the flow.ts it makes, the static checks, the row: ready, needs_you (a blocking question) or failed
/app/flows/drafts/<id>: the draft card ─ Answer ─▶ flow/answer ─▶ records them, starts <draftId>:<round + 1>
                                       ─ Save ───▶ flow/save ─▶ POST /api/flows/save ─▶ flows + flow_revisions
/app/flows: Code ─▶ /app/flows/code/<name> ─ beforeLoad ─▶ flow/read { name } ─▶ GET /api/flows/source
                    the flow.ts to edit; Needs a sandbox once it isn't the drafted module
                  ─ Save ─▶ flow/write { name, revision, source } ─▶ POST /api/flows/write ─▶ next revision
/app/flows: Run ─▶ flow/run { name, input?, revision } ─▶ /app/runs/<runId>
  flow/run/load   the revision's flow.ts through GET /api/flows/source: digest, checks, then placement
                  (sandbox ─▶ FlowNeedsSandbox; client ─▶ its instructions and calls, pinned)
  flow/run/prompt a child run whose payload pins the revision and its list; its agent follows the instructions
```

| Flow | Doors | What it does |
|---|---|---|
| `flow/new { name, request }` | `/flow.new <name> <what>`, Draft, the agent | One draft round. The execution id `<draftId>:<round>` names the draft; any other id starts round 0 of a new draft |
| `flow/answer { draftId, round, answers }` | Answer (user only) | Records the answers on the draft and starts the next round as a run of its own |
| `flow/save { draftId }` | Save, the agent | A ready draft whose checks all pass becomes your flow, or its next revision; `NameTaken`, `DraftNotReady { code }`. Save stays busy until this device has the saved revision, then opens the list; one Electric doesn't deliver within `confirmWithin` (15 s) opens the list anyway, logged `flow.save.unconfirmed` |
| `flow/read { name, revision? }` | Code, the agent | A revision's source, the latest unless set, and its placement; `FlowNotFound` |
| `flow/write { name, revision, source }` | Save on the code page, the agent | Checks the source as every revision is checked, then saves it as the next revision while `revision` is still the latest; `FlowInvalid { check }`, `FlowsRefused { code: "stale" }`, `FlowNotFound`. Answers the new revision and its placement |
| `flow/run { name, input?, revision? }` | `/flow.run <name> <input>`, Run, the agent | Runs your flow at `revision`, the latest unless set; `FlowNotFound`, `FlowInvalid { check }`, `FlowNeedsSandbox`, `FlowAgentFailed` |
| `flow/run/prompt` | none (user only) | The pinned child `flow/run` starts |
| `flow/delete { flowId }`, `flow/list {}` | Delete, the agent | Deletes one; lists them, each with its placement |

**The static checks** run when a round writes its draft, when Save or a write admits a revision, and when a run loads one (`checkSource`, `src/features/flows-ui/checks.ts`, over `@smthrs/registry`'s `ModuleFlow`, which reads a repository's `flow.ts` the same way, without importing it): it `parses` (a `Flow.make` default export, no warning); its `name`, the tag `Flow.make` declares, follows the pattern, stays outside the app's names (`RESERVED_NAMES`) and is the flow's name; its `description` is 1 to 1,024 characters; its `calls` (`flows`) are at most 20 of the flows a person's flow may call (the agent's catalog minus `flow/*` and `run/*`, `PROMPT_CALLABLE`); its `model` is absent or `agent`, with no placement directive of its own; its `size` is at most 64 KiB. A failing check keeps a draft `ready` with the check named and Save off, and refuses a write.

**ChatApi's routes** (`worker/PersonalFlows.ts`) are the person's own: signed out is 401, a Guest 403, and another person's draft or flow is 403 or 404. `POST /api/flow-drafts/<id>` takes a round and refuses an older round (`409 stale_round`) or a saved draft (`409 settled`); `POST /api/flow-drafts/<id>/answers` lands answers on the round's questions; `POST /api/flows/save` admits only the draft's own file, unchanged, with its SHA-256, under a free name (`409 name_taken`); `POST /api/flows/write` admits source with its SHA-256 as the next revision of a live flow while `revision` is its latest (`409 stale`, `404 not_found`, `409 name`, `409 digest`, `413 too_large`), and the same bytes again answer the revision they made, so a step tried again after its answer was lost isn't refused; both record the revision's placement on `flows`, read from the source; `GET /api/flows/source` reads a revision, of a deleted flow too, so a pinned run can be retried; `GET /api/shapes/flows` and `/api/shapes/flow-drafts` sync the person's rows without the owner's id; when sessions can't be read they answer `503` with `Retry-After: 5`, never another scope under the device's handle.

**Tables** (migrations `0015_flows` and `0025_flow_source`): `flows` (one live name per person, with the latest revision's `placement`), `flow_revisions` (append-only source, each with its digest) and `flow_drafts`. 0025 converted every `SKILL.md` the first slice stored into the module drafting writes, with its new digest. On the device, `flows` and `flow_drafts` are Electric collections kept on the device (`flows` at schema version 2, for `placement`); the form, the unsent answers, the shown draft and the shown code are local (`src/features/flows-ui/store.ts`).

**Not built yet:** a host that runs a person's own code (a job sandbox, decision 0005), a repository's flows (`flow_bindings`, `flow/refresh`, `flow/propose`), Try, a draft card in the conversation (the card has its own page), and personal flows as their own slash commands (`/<name>`). A repository's home view is [its own feature](home.md).

## Observability

Nothing records a flow's payload, a cell's code or a flow's result.

| Record | Kind | Fields |
|---|---|---|
| `flow.dispatch` | log, span | `flow`, `door`, `outcome` (`done`, `failed`, `error`), `executionId`, `durationMs`, `reason` on an error, and `refusal` when the engine refused the run, with the refusal's code (such as `plan_changed` or `execution_identity_conflict`) |
| `smithers_flow_dispatches` | counter | `flow`, `door`, `outcome` |
| `web.navigate` | log, span | `door`, `outcome`, `executionId`, `durationMs`, `reason` on a refusal; the span's `smithers.navigation.door` and `smithers.navigation.outcome`. Info, Warn for `refused`, Error for `failed` |
| `smithers_web_navigations` | counter | `door` (the dispatch's; `agent` for the agent's call; `unknown` when the tab that dispatched it is gone), `outcome` (`navigated`, `refused`, `gone`, `failed`) |

| `flow.author` | log | `draftId`, `round`, `scope`, `target`, `outcome` (`ready`, `needs_you`, `failed`), `checks` (failing codes), `questions` (a count), `durationMs` |
| `smithers_flow_author_rounds` | counter | `scope`, `outcome` |
| `flow.save` | log | `draftId`, `outcome` (`saved`, or the refusal's code) |
| `smithers_flow_saves` | counter | `outcome` |
| `flow.save.unconfirmed` | log, Warn | `feature`: Save's flow is saved, but Electric didn't deliver it to this device within `confirmWithin` |
| `flow.write` | log | `outcome` (`written`, `check:<check>`, or ChatApi's code), `placement` |
| `smithers_flow_writes` | counter | `outcome`, `placement` |
| `flow.run.load` | log | `outcome` (`loaded`, the failing check, or `sandbox`) |
| `flow.client.*` | span | one per route a `flow/*` step calls, with its status |
| `flow.route` | log, span (ChatApi) | `route`, `status`, `draftId`, `flowId`, `round`, `code`, `durationMs`; never a request, a file, a question, an answer, a description or a name |
| `smithers_flow_route_requests` | counter (ChatApi) | `route`, `status` |

Navigation's records come from the engine worker, where its step runs, and never carry the path, which can carry content; the agent's call is also its own `execute_tool app/navigate` span (`NAVIGATION_TELEMETRY`, `src/features/navigation/contract.ts`). `app/web/open` records `web.page.open` and `smithers_web_pages_opened` by mode, door and outcome, never the page ([web pages](web-pages.md#observability)).

## Tests

| Test | Proves |
|---|---|
| `src/flows/registry.test.ts` | The parity law, every flow on this device, the UI's dispatched names, the namespaces, one declaration per flow with its reference's schemas, and the agent's catalog |
| `src/flows/tab.test.ts` | The tab's module graph (esbuild, from `src/main.tsx`, the `?faults` entry included) reaches no `@smthrs/agent` or Node built-in, and `@smthrs/std` only through code intelligence's `LanguageServer` seam; the engine worker's registrations reach the agent |
| `src/flows/dispatch.test.ts` | The theme on the Node host's engine over the compose Postgres; declared failures, defects, interrupts and refusals by injected faults; every record without the payload (a sentinel) |
| `src/flows/engine.test.ts` | The browser's architecture in Node: a tab's `BrowserEngine` and the leader's engine worker over Node's Web Locks and `BroadcastChannel`, the tab port over a `MessageChannel`. A person's button and the agent both set the theme through `app/theme/set`. `tabEngine` builds with nothing of the tab, and `tabAnswers` answers only while attached |
| `src/flows/tabPort.test.ts` | Calls, refusals, unknown methods, timeouts and stray messages over a real `MessageChannel` |
| `src/flows/askingTab.test.ts` | The channel to the tab that asked, over Node's `BroadcastChannel`: only that tab answers, with its door; a request no tab started, a call with another input, stray messages and other calls' answers, and a tab whose scope closed |
| `src/features/theme/theme.test.ts` | The store, the follower, the system's mode, both `Preferences`, and the toggle through dispatch |
| `src/features/navigation/navigation.test.ts` | `appPath` for paths, same-origin URLs, other origins however written, other schemes and non-URLs; the step on the Node host's engine with real tabs on Node's `BroadcastChannel`: only the tab that asked moves (a person's door and the agent's call), a gone tab settles `moved: false`, a router that throws, refusals, a rogue call the tab checks again, and records without the path (a sentinel); then the whole device: a second tab's dispatch moves only it, and the agent's call moves the tab whose composer asked |
| `src/flows/requests.test.ts` | A tab's requests: their doors, its latest only, one per tab; an execution's requester |
| `worker/Body.test.ts` | Every bound of the body reader |
| `src/flows/catalog.test.ts` | The catalog's scope: reads while drafting, a person's flow's own list, and nothing when its list can't be read |
| `src/flows/registry.test.ts` "side effects" | Every model-invocable flow is a read or says what it changes, and no person-only flow does; only `flow/save` and `flow/delete` ask first; the catalog shows a side effect after the description and nothing more for a read |
| `src/features/agent/agent.test.ts` "a call the person must approve" | The agent's `flow/save` asks the person first: denied, the flow never runs and the cell reads `NotApproved`; approved, it runs |
| `src/features/flows-ui/source.test.ts` | A drafted flow's module written and read back exactly, quotes, newlines and line separators included; any edit, a step label or a space, reads as other code (`sandbox`); the module type-checks against `@smthrs/flow` and `@smthrs/agent` |
| `src/features/flows-ui/checks.test.ts` | Reading a flow's source through `ModuleFlow`, and every static check's refusal, for a drafted module and one written by hand |
| `src/features/flows-ui/flows.test.ts` | Every `flow/*` flow on the Node host's engine against ChatApi with a scripted model: a round, a new draft from any id, a blocking question answered into round 1, a draft that never decodes, a failing check, an edit into revision 2, Save and `NameTaken`, a run that calls its list, a call outside it refused, an agent that never finishes, a missing or tampered revision, `flow/read`, `flow/write` (a hand edit saved as `sandbox` whose run fails `FlowNeedsSandbox` before any model call, the drafted module running again, a failed check, a stale revision, a missing flow), list and delete, and the whole catalog outside a run |
| `src/features/flows-ui/api.test.ts` | `FlowsClient` against every kind of answer: refusals, 404s, 5xx, an unreadable body, no network and the deadline |
| `worker/PersonalFlows.test.ts` | Every route and refusal, `POST /api/flows/write` and the placement it records, the shapes, and no content in any record (a sentinel) |
| `e2e/flows.spec.ts` | In a real browser with the real model: draft from a prompt, open the flow's code (a `Flow.make` module), run it to Done, relabel its step in code and save, and Run is off with `Needs a sandbox`. GIF: `flows-flows-draft-a-flow-from-a-prompt-open-its-code-run-it-relabe.gif` |
| `db/Database.test.ts` "0025_flow_source" | Every stored `SKILL.md` revision and draft becomes the drafted module with its new digest; a draft that doesn't read fails `migrated` unless saved; a revision that doesn't read fails the migration by id, never by text |
| `src/features/flows-ui/tab.test.ts` | The whole app on a Node device whose engine leads: Draft, Save, Run, the run page following the run, Retry, the list, Edit and Delete; an answer into the next round; `Name taken`; Stop on a live run, and Resume refused once it settled; Code: a failed check, a relabelled step saved as `sandbox` whose run fails before the model, the drafted module again, a flow not found, and a read that ends after the tab moved on |

Run them with the compose Postgres up (`pnpm db:up`): `pnpm exec vitest run src/flows src/features/theme src/features/navigation worker/Body.test.ts`.

`src/features/chat/chat.test.ts` "the agent" runs the whole app on a Node device whose engine leads: the asking tab dispatches `chat/Answer`, the agent answers through ChatApi, and a resend dispatches the same execution without a second run. `e2e/agent.spec.ts` runs the engine in a real browser: the agent answering through the model endpoint, the theme set by its button and by the agent, and a killed tab whose answer resumes on the same device without paying again for a sealed model call. `e2e/navigate.spec.ts` asks the agent to open `octocat/Spoon-Knife`, which takes the asking tab there while the device's other tab stays, and never clones (`e2e/repo-clone.spec.ts` asks it to clone, and it does); sends `/navigate /octocat/Spoon-Knife` from the composer, which does the same without the model; and asks the agent to open an outside site, which is refused while the page stays put. Locally it reads the agent's `web.navigate` lines from ChatApi's relay.
