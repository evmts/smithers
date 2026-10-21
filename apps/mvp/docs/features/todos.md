# TODOs and the stack

A person asks Smithers for a TODO, or makes one from an issue, edits the draft and commits it to the repository's stack; every Member sees it numbered on every device, and a person drops it. The stack looks like GitHub's issue list, and one TODO like GitHub's issue page. This is decision [0016](../decisions/0016-todos-and-the-stack.md)'s slice 1, Track A, and Track B's durable `todo` run ([the run](#the-run)), which takes a TODO to a pull request a person merges. The run is on wherever the GitHub App is configured; `TODO_RUNS=false` switches it off, and every TODO then stays Queued.

## How it works

```
the device                                      ChatApi (Cloudflare)
"make a TODO …" ─▶ the agent ─▶ todo/draft
  step ─▶ the tab that asked keeps a private draft (todo-drafts), shown under the answer
Commit on the draft card, or on the stack page
  FlowDispatch ─▶ todo/commit (client flow, never the agent's)
    step: op id = UUIDv5(execution id) ─▶ the tab that asked ─▶ the device's one outbox (todo-op)
  outbox ─ POST /api/repos/<o>/<n>/stack ─▶ sign-in, Member, bounds; who acts from the session
            202 { txid, opId, outcome, number } ◀── worker/stack/Stack.ts: one transaction,
  todo-requested: "T–  Requested"                     stacks row FOR UPDATE, no network or model call
todos, todo_requests ◀── Electric ◀── Postgres ◀──┘
Drop ─▶ todo/drop ─▶ the same outbox and route
```

- **One writer.** `worker/stack/Stack.ts` `apply` is the only code that writes `stacks`, `todos`, `todo_requests`, `todo_attempts` and `stack_ops`. Each change is one transaction that locks the repository's `stacks` row first, applies the stack's rules (`src/features/todos/stack.ts`), writes back what changed in one statement, and keeps a receipt under the op id. Writers racing on the same repository queue on the lock, so none loses another's change.
- **The rules are one pure function.** `stack.ts` `apply(stack, op)`: a commit takes the next number, which is never reused, and the last position; a drop clears the TODO's position and closes the gap; a full stack (`max_open`) refuses a commit; a merged TODO refuses a drop; dropping a dropped TODO changes nothing. Property tests prove them over random histories.
- **A person commits; the agent drafts** (0016 §3). `todo/draft` is the agent's; `todo/commit` and `todo/drop` are a person's only. The agent's catalog lists neither, the step refuses a run that is the agent's call before it asks any tab, and the route takes who acts from the session (`Actor.act`), never from the request: a body that claims a door claims nothing.
- **One route.** Buttons, slash commands, the agent's drafts once a person commits them, and the API all change a stack through `POST /api/repos/<owner>/<name>/stack`.
- **The run starts from the writer.** The writer starts an attempt only when the host provides `TodoRuns` (`worker/stack/Stack.ts`): `start(attempt)` and `stop(attempt)`, idempotent by attempt id. ChatApi provides it when the GitHub App is configured and `TODO_RUNS` isn't `false`: each attempt runs `todo` on its own Durable Object, `todo:<attempt id>`. Without it the writer works with no lanes and every TODO stays Queued.
- **Libraries** (`docs/libraries.md`): `@smthrs/flow` (the flows), `@smthrs/effect-electric` (`ShapeProxy` with its default `no-store`, `ElectricCollection`), `@smthrs/effect-tanstack-db` (`Outbox`, collections, live queries, `Persistence`), `@smthrs/crypto` (`Uuid.v5`, `digestSync`), `@smthrs/ui` (`IssuesView`, `ItemConversation`, `ItemAsideSection`, `ItemStatus.live`, `ConfirmButton`, `TodoDraftCard`, `Breadcrumbs`), `@smthrs/engine-store` (`RunInspection`, watching the run), and Effect's own `Arbitrary` for the property tests.

## Who reads, who writes

| Act | Who |
|---|---|
| Read a repository's TODOs and prompts | a signed-in Member or above (like a branch's live workspace, 0013); signed out `401`, a Guest `403` |
| Draft a TODO | the agent, for a Member who asked; a Member with New TODO or `/todo.new`. A draft lives on that person's device only |
| Commit, Drop | a Member or above, in person (`repo:todo-commit`, `repo:todo-drop`); never the agent |

## Routes

`worker/stack/Api.ts`; ChatApi routes these paths to it before RepoApi (`StackApi.handles`).

| Route | Answers |
|---|---|
| `POST /api/repos/<owner>/<name>/stack` | `202 { txid, opId, outcome, number }` for a new change, `200 { txid: null, … }` for a repeated op id. Refusals below |
| `GET /api/shapes/todos?repo=<owner>/<name>` | the repository's `todos`, `TODO_COLUMNS`; never cached |
| `GET /api/shapes/todo-requests?repo=<owner>/<name>` | their `todo_requests`, `TODO_REQUEST_COLUMNS`; never cached |

The stack route's body is `{ opId, op: "commit", title, prompt, acceptance?, issue? }` or `{ opId, op: "drop", number }`: a UUID op id (a commit's is its TODO's id), a title of 1 to 120 characters not blank, a prompt not blank of at most 16,384 bytes, at most 20 criteria of 1 to 300 characters, the number of the issue it was made from, and a number of 1 to 2,147,483,647. Its refusals are `{ code }`, `Cache-Control: no-store`:

| Status | `code` | When |
|---|---|---|
| 400 | `invalid` | not that body |
| 401 | `authentication` | signed out |
| 403 | `forbidden` | not a Member, or an agent, flow or sandbox acting for the person |
| 404 | `not_found` | a drop of a number the stack never had |
| 409 | `conflict` | the op id was used for another change |
| 409 | `stack_full` | `max_open` TODOs are open |
| 409 | `merged` | a drop of a merged TODO |
| 413 | `too_large` | a body over `MAX_STACK_BODY_BYTES` |
| 503 | `unavailable` | Postgres, sessions or the run host couldn't answer; the device sends again |

A shape request whose `repo` names no repository reads no repository's rows; sessions that can't be read are `503` with `Retry-After: 5`, so a device keeps its rows.

## Flows

| Flow | Payload | Doors | Agent |
|---|---|---|---|
| `todo/draft` | `{ repo, prompt, title?, acceptance? }` | the agent; `/todo.new owner/repo <prompt>` (Member) | yes: it answers `{ draftId, status: "drafted", path }` |
| `todo/issue` | `{ repo, issue, title?, prompt?, acceptance? }` | Make TODO in an issue's menu or on its page, and its key `t`; `/todo.issue owner/repo <n>` (Member) | yes: with a better title and prompt than the issue's, if it has them |
| `todo/commit` | `{ repo, title, prompt, acceptance?, issue? }` | Commit on a draft card | never |
| `todo/drop` | `{ repo, number }` | Drop on a row or the TODO's card; `/todo.drop owner/repo <n>` (Member) | never |

Each is one step (`src/features/todos/steps.ts`) that asks, over the engine's todos channel, the tab that started the request (`TabTodos`, `src/flows/askingTab.ts`) to keep the draft or queue the change. `todo/issue` fails `issue_not_found` when the device doesn't have the issue. The draft's and the change's ids are UUIDv5s of the execution id, so a step run again names the same draft or change, and the tab keeps it once. A draft without a title takes the prompt's first line.

## The browser

`src/features/todos/`, framework-free logic beside React views ([state.md](../state.md#todos-2026-10-20)).

| Piece | What it is |
|---|---|
| `stack.ts` | the stack's rules, pure; the writer applies them |
| `writes.ts` | `todo-sending` (the outbox's optimistic rows) and `todo-requested` (kept on the device: taken with the stack's number, or refused with why); the outbox's `todo-op` mutation posts to the stack route and never waits for Electric |
| `store.ts` | per repository, Electric collections `todos:<repo id>` and `todo-requests:<repo id>`, kept on the device and opened by the route; `todo-drafts`, kept on the device; `todo-view`, `todo-access`; followers that drop a requested change once Electric shows what it did, and read the shape's refusal |
| `view.ts` | the stack's rows (`todos ∪ (pending commits − todos by op id)`, a pending drop on its TODO), the TODO at full size, the drafts, Not sent changes, access and who may change a stack |
| `actions.ts`, `todos.ts` | `open` (the routes), `warm` (a link's hover: opens the stack's sync), New TODO, a draft's text, Commit, Discard, Drop, and Edit and Discard on a change Not sent |
| `components/` | `DraftCard` (`TodoDraftCard`, with its issue `#12` when it has one), `AnswerDrafts` (the drafts under the answer that made them) |

Screens (`src/screens/stack/`), and a Stack link beside Issues in the repository's header:

```
octocat/Spoon-Knife / Stack                      octocat/Spoon-Knife / Stack / T4
┌ ◯ 2 Open  ✓ 1 Closed           [New TODO] ┐    Retry webhook delivery T4
│ ◔ Retry webhook delivery               ⋯  │    (◯ Queued) ann · 2m ago
│   T4 · ann · 2m ago · #12 · smithers/t4…  │    ┌ prompt, then its acceptance criteria ┐   Issue  #12
│ ◯ Add rate limit headers               ⋯  │    ◯ ann committed · 2m ago                  Branch smithers/t4-…
│   T5 · ben · 1m ago                       │                                              [Drop]
└───────────────────────────────────────────┘
```

- **`/$owner/$repo/stack`** is `IssuesView`, as GitHub's issue list. Open (the stack in merge order, then this device's commits the stack hasn't numbered) and Closed (merged and dropped, latest first) are tabs with counts, `?state=closed` in the URL. Each row has its state icon (Requested, Queued, Working, In review, Merged, Dropped, Failed; Working's blinks), its title, `T<n>`, who committed it and when, its issue, branch and pull request, Watch while it runs ([watching the run](#watching-the-run)), and Drop in its `⋯` menu, which asks `Drop T4?` first. ArrowUp and ArrowDown move between rows. This device's drafts show above the list, and its changes that weren't sent below, with Edit and Discard.
- **`/$owner/$repo/stack/$number`** is `ItemConversation`, as GitHub's issue page: the title and `T<n>`, the state pill, who committed it and when, the prompt and its acceptance criteria, a timeline (committed, then the state it is in), and a side column with its issue, branch and pull request, its Run while it runs, and Drop.
- The page's frame (breadcrumbs, tabs, New TODO) paints at once. Until the device restored or synced the stack, the list shows no rows and no counts: never the empty state, and never a loading state. Commit on a draft opens its stack, where it shows `T–` and Requested until the stack numbers it. A commit the stack refused shows Not sent with why, Edit (back to a draft) and Discard.

## From an issue

Make TODO drafts a TODO from an issue, linked to it (Will, 2026-10-20). Everything that makes one runs `todo/issue`: Make TODO in an open issue's `⋯` menu on `/$owner/$repo/issues`, Make TODO on the issue's page with its key `t` (`aria-keyshortcuts`, `src/features/keys/keys.ts`), `/todo.issue owner/repo <n>`, and the agent.

- The step asks the tab that started it to keep the draft. A title or prompt the call left out is the issue's title, or its body (its title when the body is blank), cut to a TODO's limits (`draftFromIssue`); the agent may pass better ones. The press opens the stack, where the draft shows with its issue `#12`.
- The person commits it like any TODO. The commit carries `issue`, and the writer stores it in `todos.issue_number` (migration `0027_todo_issue`), set once.
- The TODO shows its issue, on its row and its page. The issue shows its TODOs, on its row and in its page's side column, and offers Make TODO only while none of them is open (`todosByIssue`, `mayMakeTodo`). The issue routes open the repository's stack for this.
- Its pull request's body ends "Fixes #n" from `issue_number`, so GitHub closes the issue when a person merges it ([the run](#the-run)).

## The run

`todo` (`worker/flows/Todo.ts`, decision 0016's factory simplified): one durable run per attempt, on the `FlowExecution` Durable Object.

```
todo/Begin      the TODO and its prompt; its branch smithers/t<n>-<slug> made on GitHub at the default branch's head, as
                the App; a name someone else holds takes -2 to -5 ─▶ writer: branch, step implement
todo/Implement  the agent (AgentAction, the `agent` role) writes the change on the attempt's branch machine with the sandbox
                tools (worker/flows/TodoAgent.ts), and runs the repository's checks there
todo/Collect    the files it changed, read whole from the machine (50 files, 1 MiB at most); none ─▶ failed empty_change
todo/Publish    one commit, createCommitOnBranch fenced by the base ("T<n>: <title>", "Smithers for @maya"); the pull
                request into the default branch, its body the prompt, "Fixes #n" for a TODO from an issue, and whom the
                App acted for ─▶ writer: in review; the head's checks start (checks/Run, docs/features/pulls.md)
todo/Await      re-reads the pull request, 5 s doubling to a minute, until a person merges or closes it; a TODO dropped
                in Smithers meanwhile closes the pull request its run opened
todo/Settle     writer: merged, or dropped (closed_on_github); the next Queued TODO starts
todo/Fail       any step that gave up ─▶ writer: failed with its code (implement, empty_change, publish_refused,
                pr_refused, app_not_installed); the next TODO starts
```

- **States** (decision 0016's factory simplified): Queued, Working, In review, Merged, Dropped, Failed. Steps: implement, publish, await.
- **Every writer call is fenced** by the TODO and the attempt (`Stack.report`): a dropped TODO's run, or an earlier attempt's, is stale and stops.
- **Terminal reports keep their receipt.** The attempt stores the exact terminal event and successor attempt ids in the same Postgres transaction as the lane change. Replaying that event returns `repeated` with those same starts; another event or attempt stays stale. `todo/Settle` and `todo/Fail` retry admission through the durable engine without expiring. The host propagates a refused or lost admission acknowledgment, including when the successor already accepted its intent, so a restart can admit that same execution again. No retry allocates another successor.
- **Every GitHub write adopts its own earlier attempt** after a lost answer: the branch by its head, the commit by its parent and message, the pull request by its head and the attempt's marker. Nothing here merges, approves or forces a ref: a person merges ([pull requests](pulls.md#merge)).
- **The machine** is the attempt's own branch machine, `todo-<attempt id>`, checking out the attempt's branch, its tools running as the person who committed the TODO (`worker/flows/TodoMachine.ts`).
- **The agent's sandbox on Cloudflare** (`worker/AgentSandbox.ts`): `Agent.layerDefaultsWithVariant` over QuickJS's separate-`.wasm` build. workerd compiles no WebAssembly from bytes, so the single-file build `Agent.layerDefaults` uses fails there ("Wasm code generation disallowed by embedder"). The `.wasm` file arrives as `#quickjs.wasm`, a package.json `imports` name ending in `.wasm`, which Alchemy's bundler uploads as a CompiledWasm module and hands the Worker as a `WebAssembly.Module`. The import is dynamic, inside the layer: `alchemy dev` imports the stack in Node, where a static `.wasm` import fails ("Cannot find package 'a'").

### Watching the run

A TODO starts the work through to a mergeable pull request; while it runs, it shows that it is working and links to its run, so a person can watch the agent (ruling TODO-3, decision [0026](../decisions/0026-watching-a-todo-run.md)).

```
◔ Retry webhook delivery                ⋯        Retry webhook delivery T4
  T4 · ann · 2m ago · smithers/t4-… · Watch      (◔ Working) ann · 2m ago        Run    Watch
```

- **The indicator.** A Working TODO's icon blinks slowly, one calm 2-second cycle, on its row and in its page's state pill (`ItemStatus.live`, `@smthrs/ui`). It holds steady for a person who prefers reduced motion. In review stays steady: the run waits on a person's merge, not on work.
- **The link.** A Working or In review TODO links to its run: Watch at the end of its row, and a Run section in its page's side column. It opens the run's page, `/app/runs/todo:<attempt id>`, which reads the run from Cloudflare and follows it live ([a run on Cloudflare](runs.md#a-run-on-cloudflare)). Queued, Merged, Dropped and Failed TODOs link to none.
- **How the link knows the run.** The writer records each attempt's run on its TODO, `todos.run_id` = `todo:<attempt id>`, in the transaction that records the attempt (migration `0036_todo_run`). It syncs with the rest of the row, to Members, as everything of a TODO does; `todo_attempts` still never syncs. A run started before the column existed got it from its attempt.
- **Who watches.** A Member or above, as the TODO itself: the run's routes refuse anyone else, and a run no TODO started.

| Test | Proves |
|---|---|
| `worker/flows/Todo.test.ts` | on the Node host's engine with the scripted GitHub, a test machine and a scripted agent: a TODO from an issue to a squash-merged pull request with "Fixes #n" and the next TODO started; closed on GitHub; an empty change; an agent that never answers; no App; dropped before and while waiting; a name taken; a lost commit and a lost pull request adopted; each step's refusals and retries |
| `worker/flows/TodoHost.test.ts` | the Durable Object's handlers with `withTodos`: `checks/Run` driven to the end |
| `worker/flows/TodoRecovery.test.ts` | merged, dropped and failed reports recover from admission failure in the same process and after a Durable Object host restart; report committed before launch; target accepted before acknowledgment lost; repeated execution stays singular |
| `worker/AgentSandbox.workerd.test.ts` | in local workerd, bundled with Alchemy's own bundler and Cloudflare plugins as ChatApi is: the bundle carries QuickJS as one compiled WebAssembly module, and an agent's cell lists, reads and writes the checkout through the run's sandbox tools as the TODO's committer. Fails on `Agent.layerDefaults` with workerd's refusal |
| `e2e/factory.spec.ts` | live: against an instance with the GitHub App on a scratch repository the test account administers (`E2E_FACTORY_REPOSITORY`, `E2E_SESSION_COOKIE`, `BASE_URL`; it skips without them), a person asks Smithers for a TODO and commits it; the run branches on GitHub, the agent writes the change on the branch's machine with the deployment's model, and the TODO reaches In review with an open, mergeable pull request on its `smithers/t<n>-` branch. On the way: the Working TODO blinks, Watch opens its run read from Cloudflare (`Cloud`, `todo/Implement`), and the pull request's page shows Squash and merge with `Merging into main deploys it.`, its checks and the README line in Files. It never merges. Over HTTPS (`https://localhost:1445` for a live dev instance): over plain HTTP/1.1 the browser's six connections fill with Electric's long polls |
| `worker/stack/Stack.test.ts` | the writer's reports: step, branch, published, finished; stale reports; the next TODO started; each attempt's run recorded on its TODO |
| `src/features/todos/view.test.ts` | a Working TODO's icon live; Watch on a Working or In review TODO's row and page, and none on any other |
| `src/features/runs/remote.test.ts`, `worker/RemoteRuns.test.ts` | watching a TODO's run ([a run on Cloudflare](runs.md#a-run-on-cloudflare)) |
| `src/features/todos/stack.test.ts` | the rules' `finish`: merged and dropped leave the stack, failed keeps its place, a stale finish changes nothing |

## Postgres

Migrations `0022_todos`, `0027_todo_issue`, `0035_todo_report_receipts` and `0036_todo_run`. Synced tables are `REPLICA IDENTITY FULL`.

| Table | | |
|---|---|---|
| `stacks` | `repo_id`, `next_number`, `version`, `lanes` (1), `max_open` (50), `updated_at` | never synced; the row the writer locks |
| `todos` | `id`, `repo_id`, `number`, `title`, `state`, `step`, `position`, `revision`, `attempt`, `branch`, SHAs, `pr_number`, `pr_draft`, `failure`, `note`, `created_by`, `created_login`, `settled_by`, times, `issue_number` (`0027_todo_issue`), `run_id` (`0036_todo_run`: its latest attempt's run, `todo:<attempt id>`) | `(repo_id, number)` unique; `(repo_id, position)` unique at each statement's end; settled exactly when merged or dropped, and then unplaced |
| `todo_requests` | `todo_id`, `revision`, `repo_id`, `prompt`, `acceptance`, `by_login`, `created_at` | each revision of a prompt, never changed |
| `todo_attempts` | `id` (the run's id), `todo_id`, `ordinal`, `revision`, `base_sha`, `status` (`running`, `published`, `settled`, `failed`), `finished_report` (terminal event and starts) | the run's; written only when a host runs TODOs; terminal receipt never synced |
| `stack_ops` | `id` (the op id), `repo_id`, `actor_id`, `via` (from the session), `op`, `payload_hash`, `outcome`, `result` | never synced: the receipt a repeated op answers from |

## Observability

No record carries a title, a prompt, a criterion or a login ([observability.md](../observability.md#todos)).

| Record | Kind | Fields |
|---|---|---|
| `stack.request` | log, span | `op`, `via`, `opId`, `outcome` (the change's outcome, `repeated`, or the refusal's code), `number`, `status`, `bytes`, `durationMs`, `errorCode` |
| `stack.apply` | log, span | `repoId`, `opId`, `op`, `via`, `outcome`, `number`, `version`, `durationMs` |
| `stack.report`; `smithers_todo_reports{kind,outcome}` | log, span, counter | attempt and TODO ids, kind, `applied` / `repeated` / `stale`, successor count; a repeated report counts no state transition |
| `todo.start`; `smithers_todo_admissions{flow,outcome}` | log, span, counter | flow, execution id, `started` / `not_started`, error code; records admission acknowledgment, not execution completion |
| `stack.shape.todos`, `stack.shape.todo_requests` | log, span | Electric's request records |
| `smithers_stack_requests{op,outcome}`, `smithers_stack_ops{op,outcome}`, `smithers_todo_transitions{from,to}`, `smithers_todo_shape_requests`, `smithers_todo_request_shape_requests` | counters | |
| `todos.draft`, `todos.queue`, `todos.send`, `todos.pending`; `smithers_todo_drafts`, `smithers_todo_queued`, `smithers_todo_sends`, `smithers_todo_pending_actions` | browser logs, spans, counters | `op`, `door`, `via`, `outcome` (a draft's `issue_not_found` too), `fromIssue`, `status`, `code`, `opId`, `draftId`, `action` |
| `keys.press`; `smithers_web_shortcut_presses{key}` | browser log, counter | `key`: a one-key shortcut pressed a button |

## Tests

Run with the compose Postgres and Electric up (`pnpm db:up`).

| Test | Proves |
|---|---|
| `src/features/todos/stack.test.ts` | property tests over random histories of commits, drops and run failures: the rules hold after every change; order is the model's, a permutation of 1 to n; numbers count up and are never reused; Drop is idempotent; a refusal changes nothing; no lane idles while a TODO waits; each start is the first Queued TODO |
| `worker/stack/Stack.test.ts` | the writer on real Postgres: what each change writes, receipts, repeated ops and conflicts, refusals, attempts when the host runs TODOs; twelve writers committing at once and random races of commits and drops on connections of their own: no change lost, the rules hold |
| `worker/stack/Api.test.ts` | every route and refusal through the real handler; who acts from the session, never the body (the agent's door can't commit or drop); the run host's seam; the shapes' access and columns; no title or prompt in any record |
| `src/features/todos/todos.test.ts` | Node devices against the real routes and Electric: a commit Requested at once then numbered on every device; offline then numbered once; a lost answer resent once; Drop; refusals Not sent with Edit and Discard; a Guest and a visitor refused; the agent drafts under its answer and can't commit or drop; the slash commands |
| `src/features/todos/steps.test.ts`, `api.test.ts`, `view.test.ts` | the steps' refusals, the agent's door refused before any tab, a draft from an issue and `issue_not_found`; the client against a local server; the views as GitHub's list and page, the issue links both ways, Make TODO's rule, and the contract |
| `src/features/todos/todos.test.ts` "from an issue" | Make TODO drafts from a real issue row, Commit stores `issue_number` and syncs it to another device, which lists the issue's TODO; the agent's own title and prompt; `issue_not_found`; `/todo.issue` |
| `src/features/keys/keys.test.ts` | a one-key shortcut presses the shown, enabled button that declares it; never with ⌘, Ctrl or Alt, in a field, a dialog or a menu, or once handled |
| `e2e/todos.spec.ts` | real browsers, two people: Ann asks Smithers for a TODO, edits the draft and commits; Ben sees it numbered and opens its page; both reload; Ann drops it from its page and both see Dropped; it has left Open and shows under Closed. New TODO, Commit and Drop from the row's menu with the keyboard only. Make TODO from an issue's menu, the link both ways, and `t` on the issue's page, with `E2E_ISSUES_REPOSITORY` and a Member's `E2E_SESSION_COOKIE` (it skips without either). GIFs: `todos-todo-commit-drop.gif`, `todos-todo-new-keyboard.gif`, `todos-todo-from-issue.gif` |

## Not built yet

- The run's step strip on a TODO's page.
- Steering the running agent from the run's page (ruling TODO-3): its messages kept in Postgres, and the todo agent's `Steering.Source` reading them at its next boundary.
- Slice 2: Before Tn and Amend, Move, two lanes, forward updates, out-of-order merges.
