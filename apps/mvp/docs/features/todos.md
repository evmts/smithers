# TODOs and the stack

A person asks Smithers for a TODO, edits the draft and commits it to the repository's stack; every Member sees it numbered on every device, and a person drops it. This is decision [0016](../decisions/0016-todos-and-the-stack.md)'s slice 1, Track A. Track B, the durable `todo` run that writes the change and opens the pull request, starts where this ends: until a host runs TODOs, every TODO stays Queued.

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
- **Nothing runs a TODO yet.** The writer starts an attempt only when the host provides `TodoRuns` (`worker/stack/Stack.ts`), Track B's seam: `start(attempt)` and `stop(attempt)`, idempotent by attempt id. ChatApi provides none, so the writer works with no lanes and every TODO stays Queued.
- **Libraries** (`docs/libraries.md`): `@smthrs/flow` (the flows), `@smthrs/effect-electric` (`ShapeProxy` with its default `no-store`, `ElectricCollection`), `@smthrs/effect-tanstack-db` (`Outbox`, collections, live queries, `Persistence`), `@smthrs/crypto` (`Uuid.v5`, `digestSync`), `@smthrs/ui` (`StackList`, `TodoCard`, `TodoDraftCard`), and Effect's own `Arbitrary` for the property tests.

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

The stack route's body is `{ opId, op: "commit", title, prompt, acceptance? }` or `{ opId, op: "drop", number }`: a UUID op id (a commit's is its TODO's id), a title of 1 to 120 characters not blank, a prompt not blank of at most 16,384 bytes, at most 20 criteria of 1 to 300 characters, and a number of 1 to 2,147,483,647. Its refusals are `{ code }`, `Cache-Control: no-store`:

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
| `todo/commit` | `{ repo, title, prompt, acceptance? }` | Commit on a draft card | never |
| `todo/drop` | `{ repo, number }` | Drop on a row or the TODO's card; `/todo.drop owner/repo <n>` (Member) | never |

Each is one step (`src/features/todos/steps.ts`) that asks, over the engine's todos channel, the tab that started the request (`TabTodos`, `src/flows/askingTab.ts`) to keep the draft or queue the change. The draft's and the change's ids are UUIDv5s of the execution id, so a step run again names the same draft or change, and the tab keeps it once. A draft without a title takes the prompt's first line.

## The browser

`src/features/todos/`, framework-free logic beside React views ([state.md](../state.md#todos-2026-10-20)).

| Piece | What it is |
|---|---|
| `stack.ts` | the stack's rules, pure; the writer applies them |
| `writes.ts` | `todo-sending` (the outbox's optimistic rows) and `todo-requested` (kept on the device: taken with the stack's number, or refused with why); the outbox's `todo-op` mutation posts to the stack route and never waits for Electric |
| `store.ts` | per repository, Electric collections `todos:<repo id>` and `todo-requests:<repo id>`, kept on the device and opened by the route; `todo-drafts`, kept on the device; `todo-view`, `todo-access`; followers that drop a requested change once Electric shows what it did, and read the shape's refusal |
| `view.ts` | the stack's rows (`todos ∪ (pending commits − todos by op id)`, a pending drop on its TODO), the TODO at full size, the drafts, Not sent changes, access and who may change a stack |
| `actions.ts`, `todos.ts` | `open` (route loaders), New TODO, a draft's text, Commit, Discard, Drop, and Edit and Discard on a change Not sent |
| `components/` | `DraftCard` (`TodoDraftCard`), `AnswerDrafts` (the drafts under the answer that made them) |

Screens: `/$owner/$repo/stack` and `/$owner/$repo/stack/$number` (`src/screens/stack/`), and a Stack link beside Issues in the repository's header. Until the device restored or synced a stack, the list is blank: never the empty state, and never a loading state. Commit on a draft opens its stack, where it shows `T–` and Requested until the stack numbers it. A commit the stack refused shows Not sent with why, Edit (back to a draft) and Discard.

## Postgres

Migration `0022_todos`. Synced tables are `REPLICA IDENTITY FULL`.

| Table | | |
|---|---|---|
| `stacks` | `repo_id`, `next_number`, `version`, `lanes` (1), `max_open` (50), `updated_at` | never synced; the row the writer locks |
| `todos` | `id`, `repo_id`, `number`, `title`, `state`, `step`, `position`, `revision`, `attempt`, `branch`, SHAs, `pr_number`, `pr_draft`, `failure`, `note`, `created_by`, `created_login`, `settled_by`, times | `(repo_id, number)` unique; `(repo_id, position)` unique at each statement's end; settled exactly when merged or dropped, and then unplaced |
| `todo_requests` | `todo_id`, `revision`, `repo_id`, `prompt`, `acceptance`, `by_login`, `created_at` | each revision of a prompt, never changed |
| `todo_attempts` | `id` (the run's execution id), `todo_id`, `ordinal`, `revision`, `status`, … | Track B's; written only when a host runs TODOs |
| `stack_ops` | `id` (the op id), `repo_id`, `actor_id`, `via` (from the session), `op`, `payload_hash`, `outcome`, `result` | never synced: the receipt a repeated op answers from |

## Observability

No record carries a title, a prompt, a criterion or a login ([observability.md](../observability.md#todos)).

| Record | Kind | Fields |
|---|---|---|
| `stack.request` | log, span | `op`, `via`, `opId`, `outcome` (the change's outcome, `repeated`, or the refusal's code), `number`, `status`, `bytes`, `durationMs`, `errorCode` |
| `stack.apply` | log, span | `repoId`, `opId`, `op`, `via`, `outcome`, `number`, `version`, `durationMs` |
| `stack.shape.todos`, `stack.shape.todo_requests` | log, span | Electric's request records |
| `smithers_stack_requests{op,outcome}`, `smithers_stack_ops{op,outcome}`, `smithers_todo_transitions{from,to}`, `smithers_todo_shape_requests`, `smithers_todo_request_shape_requests` | counters | |
| `todos.draft`, `todos.queue`, `todos.send`, `todos.pending`; `smithers_todo_drafts`, `smithers_todo_queued`, `smithers_todo_sends`, `smithers_todo_pending_actions` | browser logs, spans, counters | `op`, `door`, `via`, `outcome`, `status`, `code`, `opId`, `draftId`, `action` |

## Tests

Run with the compose Postgres and Electric up (`pnpm db:up`).

| Test | Proves |
|---|---|
| `src/features/todos/stack.test.ts` | property tests over random histories of commits, drops and run failures: the rules hold after every change; order is the model's, a permutation of 1 to n; numbers count up and are never reused; Drop is idempotent; a refusal changes nothing; no lane idles while a TODO waits; each start is the first Queued TODO |
| `worker/stack/Stack.test.ts` | the writer on real Postgres: what each change writes, receipts, repeated ops and conflicts, refusals, attempts when the host runs TODOs; twelve writers committing at once and random races of commits and drops on connections of their own: no change lost, the rules hold |
| `worker/stack/Api.test.ts` | every route and refusal through the real handler; who acts from the session, never the body (the agent's door can't commit or drop); the run host's seam; the shapes' access and columns; no title or prompt in any record |
| `src/features/todos/todos.test.ts` | Node devices against the real routes and Electric: a commit Requested at once then numbered on every device; offline then numbered once; a lost answer resent once; Drop; refusals Not sent with Edit and Discard; a Guest and a visitor refused; the agent drafts under its answer and can't commit or drop; the slash commands |
| `src/features/todos/steps.test.ts`, `api.test.ts`, `view.test.ts` | the steps' refusals, the agent's door refused before any tab; the client against a local server; the views and the contract |
| `e2e/todos.spec.ts` | real browsers, two people: Ann asks Smithers for a TODO, edits the draft and commits; Ben sees it numbered and its prompt; both reload; Ann drops it and both see Dropped. And New TODO, Commit and Drop with the keyboard only. GIFs: `todos-todo-commit-drop.gif`, `todos-todo-new-keyboard.gif` |

## Not built yet

- Track B: the `todo` run (Plan, Implement, Publish, Propose, Await, Settle) on Cloudflare, its branch and pull request on GitHub, its step strip, and Merged and Failed from it. The writer's `TodoRuns` seam and `todo_attempts` are ready for it.
- Slice 2: Before Tn and Amend, Move, two lanes, forward updates, out-of-order merges.
