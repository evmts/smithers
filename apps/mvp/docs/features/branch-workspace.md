# Branch workspace

A branch is a workspace: it has one conversation for as long as it lives, and a terminal for each person on the branch's own machine. This page covers the first slice of [decision 0013](../decisions/0013-branch-workspace.md) (its §9, S1): open a repository's existing branch, ask in that branch's conversation, open the branch's terminal in a frame, run `git log` in a real container, reload and keep the same shell; another branch has its own conversation and terminal.

Sharing, presence, co-editing, `sandbox/Keep` and `sandbox/Sleep`, snapshots and branch creation come later ([What's not built](#whats-not-built)).

## The page

`/$owner/$repo/tree/$ref` opens the repository at `$ref` and, when `$ref` is a branch GitHub has, its workspace:

```
┌ octocat / Spoon-Knife                                         ┐
│ test-branch                                   Code   Terminal │
│ ┌ the Code view, or the Terminal view (?terminal=me) ───────┐ │
│ └────────────────────────────────────────────────────────────┘ │
│ the branch's conversation                                      │
│ Chat ⌘K                                                        │
└────────────────────────────────────────────────────────────────┘
```

- **Route** (`src/router.tsx`): the tree route's loader opens the location (`repo.actions.openRoute`), tracks the branch (`branch.actions.open`) and, under `?terminal`, shows its terminal (`terminal.actions.show`). `?terminal=me` is the person's own terminal; `?terminal=<id>` watches that terminal.
- **Screen**: `src/screens/branch/BranchScreen.tsx` composes `RepoHeader`, `BranchHeader` (the branch's name and the Code and Terminal links), `RepoPage` or `TerminalPanel`, chat's `Conversation` and the `Composer`.
- **`/app`** shows the home conversation: the deployment repository's (`GITHUB_REPOSITORY`) `main`. Its loader leaves the branch, so the composer asks there again.
- **A ref that isn't a branch** (a commit, a tag, a name GitHub doesn't have) shows the repository view alone.

## Tracking a branch

`branch/track { repo, branch }` is a client flow a person's page and the agent run alike (`src/features/branch/flows.ts`). Its one step posts `POST /api/branches { owner, name, ref }` (`worker/branch/Branches.ts`):

| Answer | When |
|---|---|
| `200 { branchId, conversationId, repoId, name, mode }` | the app tracks the branch already; nothing is read from GitHub |
| `201` with the same body | the branch was read from its forge and recorded, with its conversation, in one transaction |
| `404 not_found` | GitHub (or the mirror) has no such repository or branch, or the repository is private |
| `401`, `403` | signed out; not a Member (`mayWatch`) |
| `400`, `413` | not a repository's name, not a branch name git accepts, or a body over 2 KiB |
| `503 unavailable` | the forge or Postgres didn't answer; the step tries again for 30 s |

The repository's default branch is recorded `locked` (decision 0007 §5); every other tracked branch is `open`.

## Conversations

- **One per branch.** `conversations.id` is the version 5 UUID of the branch's id in `CONVERSATION_NAMESPACE` (`@smthrs/crypto`'s `Uuid.v5`), so a device that knows a branch knows its conversation.
- **Everything chat-scoped names it.** `POST /api/questions` and `POST /api/views` take `conversationId`; without one, the home conversation (for one release, so asks queued by the build before branches still land). An agent's view names its answer instead (`answerId`), and goes to that answer's conversation, only for the person who asked it.
- **Shapes are per conversation.** `GET /api/shapes/messages?conversation=<id>` and `GET /api/shapes/views?conversation=<id>` fix `where conversation_id = $1` on the server; no `conversation` means the home conversation. `messages` syncs `conversation_id` (`SYNCED_MESSAGE_COLUMNS` in `worker/Chat.ts`).
- **The agent's turn and history are per conversation** (`worker/Answers.ts`, `worker/Messages.ts`): two branches' answers proceed in parallel; one conversation's still take turns.
- **On the device** (`src/features/chat/store.ts`), the home conversation keeps its collection (`chat-messages`); each branch conversation opens its own (`chat-messages:<id>`, persisted) and views (`views:<id>`) when a page shows it. The `place` row says which conversation the tab shows and asks in. A question keeps the conversation it was asked in, whatever the tab shows when it sends.
- **Full-screen views** of a branch conversation are `/app/views/<id>?conversation=<conversation id>`.

## The terminal

```
 page                               ChatApi                     SandboxObject (one per branch)        container
 TerminalFrame (srcdoc, sandbox=allow-scripts)
   xterm ◀── MessagePort ──▶ TerminalSocket ── wss /api/terminals/<id> ──▶ Origin, session, row ──▶ attach ── tmux -t <id>
```

- **Opening** is `terminal/open` (client flow, the person's only: the agent runs commands as jobs instead), whose step posts `POST /api/terminals { terminalId, branchId, cols, rows }` (`worker/branch/Terminals.ts`). ChatApi admits it (signed in, a Member, a branch that isn't `locked`), records the `opening` row, and starts the remote flow `terminal/Open` (`worker/flows/TerminalOpen.ts`), one execution per terminal:

  ```
  sandbox/Wake ─▶ terminal/Session ─▶ terminal/Record (open, generation)
       └ failed ─▶ terminal/Failed ─────▶ terminal/Record (failed: unavailable | checkout)
  ```

- **One terminal per person per branch.** While theirs opens or is open, `POST /api/terminals` answers its id. An open that hasn't finished within `OPEN_DEADLINE_SECONDS` (180) settles `failed` (in `terminal/Record`, or at the person's next open), so it never locks them out.
- **The socket.** `GET /api/terminals/<id>` with `Upgrade: websocket` checks the `Origin` is the app's own, then the session: the terminal's owner attaches `write`, any other Member `read`. A terminal whose machine lost its session answers `410` and is ended `lost`. ChatApi strips any `x-smithers-*` header the browser sent and forwards its decision to the branch's `SandboxObject` (`worker/BranchSandboxes.ts`), which accepts the socket (no hibernation, which would drop the tmux client) and runs `@smthrs/platform-cloudflare`'s `ContainerTerminal.attach` in its own scope.
- **The wire protocol** is `@smthrs/sandbox`'s `TerminalProtocol`: binary frames are bytes; JSON text frames are control (`resize` from the owner, `ready` and `ended` from the host); frames over 64 KiB close with 1009; final close codes don't reconnect; `@smthrs/platform-browser`'s `TerminalSocket` reconnects after 1 s, doubling to 30 s, 10 times, and drops keystrokes typed while disconnected.
- **The frame** is `@smthrs/ui`'s `TerminalFrame` (`@smthrs/ui/adapters/terminal-frame`): our xterm in an opaque-origin `srcdoc` frame whose script is pinned by hash and whose CSP allows no network. ⌘K comes back to the page; links open only from a click.
- **Reload keeps the shell.** Each terminal is a tmux session; a socket is one tmux client. A new socket attaches to the same session, and tmux redraws the screen.

## The machine

- **One container per branch**, under the `durable_object` scheduling policy (`infra/BranchSandbox.ts`), from `infra/sandbox/Dockerfile`: Debian trixie with git, tmux, bash and CA certificates, no credentials. `SandboxObject` (named by the branch's id) starts it with internet off and re-arms its 30-minute inactivity timeout (`@smthrs/platform-cloudflare`'s `SandboxObject.wake`); its generation goes up each time it starts the box.
- **Checkout.** `sandbox/Wake` clones the one branch, 50 commits deep, into `/workspace` as `smithers` (`worker/branch/Checkout.ts`), unless a checkout is there.
- **Each person is their own user** (`worker/branch/Users.ts`): `p` and 16 hex digits of the SHA-256 of their person id, made on first use in the `workspace` group. Their tmux server's socket is theirs alone, so one person's shell can't attach to, type into or signal another's; `/workspace` is shared through the group (setgid, umask 002, `safe.directory`).

## The forge

The box has no credential and no internet. Its only way out is `http://forge.smithers.internal`, which `SandboxObject` intercepts (`interceptOutboundHttp`) and answers with `@smthrs/effect-code-storage`'s `GitProxy.uploadPack`: only `info/refs?service=git-upload-pack` and `git-upload-pack` (a push and anything else is 403), to the branch's own repository whatever the guest's path names, with the read credential added outside the box (`worker/branch/Forge.ts`):

| Forge | When | Credential |
|---|---|---|
| Code Storage | `CODE_STORAGE_ORG` and `CODE_STORAGE_KEY` are set; the repository must be cloned | a five-minute `git:read` token for that one repository (`CodeStorage.gitRemote`) |
| GitHub | otherwise | none: public repositories only. `GITHUB_TOKEN` is never used, because it would read every repository its owner can |

`branch/track` reads a branch through the same forge with git protocol v2's `ls-refs` for that one ref (`GitRemote.ref`): `octocat/Spoon-Knife`'s full ref list took 40 to 70 seconds to read from a Worker.

## Who may watch and write

`worker/branch/Access.ts` is the one place the policy lives:

- **Watch** (the conversation, the terminals): a Member or above. `LIVE_BRANCHES_PUBLIC` is `false`: the recommended answer to decision 0013's question 1, unanswered. A "no" from Will is that one line set to `true`, which opens a public repository's live branch to everyone.
- **Write** (open a terminal): a Member or above, on an `open` branch.
- A shape asked for by someone who may not watch is a shape with no rows.

## Postgres

`db/migrations/0014_branch_workspace.ts` adds `branches` (an immutable id per living branch; `(repo_id, name)` unique while not deleted; no foreign key to `repositories`, because a branch of a repository this deployment can't clone is read from GitHub), `conversations` (one per branch), `conversation_id` on `messages` and `views` (an answer's `(question_id, conversation_id)` references its question's own), and `terminal_sessions` (status `opening`, `open`, `ended` with why, `failed` with why; one live per person per branch). It binds every existing message and view to the home conversation. `branches.mode` allows `locked` beside 0013's `open` and `restricted`, for the default branch (decision 0007 §5).

## Observability

Content-free: ids, outcomes, statuses, close codes, byte counts by direction and durations; never a terminal's bytes, a branch's name, a token or anything asked.

| Where | Records |
|---|---|
| ChatApi | `branch.track` (log, span, `smithers_branch_tracks{outcome}`); `terminal.open` and `terminal.connect` (logs, spans, `smithers_terminal_requests{route,outcome}`); `terminal.shape` (`smithers_terminal_shape_requests`) |
| `terminal/Open` | `terminal.open.wake`, `terminal.open` (logs), `sandbox.wake`, `terminal.session`, `terminal.open` (spans), `smithers_terminal_opens{outcome}` |
| `SandboxObject` | `sandbox.object.wake`, `sandbox.checkout`, `sandbox.wake`; `@smthrs/platform-cloudflare`'s `smithers_cloudflare_terminal_{connects,sessions_open,bytes,sessions}` and `smithers_cloudflare_sandbox_wakes`; `git.proxy` with `git_proxy_requests{service,outcome}` |
| Browser (`BRANCH_TELEMETRY`, `TERMINAL_TELEMETRY` in `src/telemetry.ts`) | `branch.track`, `branch.open`, `smithers_web_branch_{tracks,opens}`, `terminal.open`, `terminal.connect`, `smithers_web_terminal_opens`, `terminal_open_ms`, `terminal_reconnects{code}`, `terminal_bytes{direction}`, `terminal_ended{reason}` |

## Tests

| Kind | Where |
|---|---|
| Unit | `worker/branch/*.test.ts`, `worker/flows/TerminalOpen.test.ts` and `worker/ExecutionHost.test.ts` (`terminal/Open` on the remote host), conversations in `worker/Chat.test.ts`, `worker/Views.test.ts` and `worker/ShapeProxy.test.ts`, `src/features/branch/*.test.ts`, `src/features/terminal/*.test.ts`; `@smthrs/effect-code-storage` (`GitProxy`, `GitRemote.ref`, `gitRemote`), `@smthrs/crypto` (`Uuid`), `@smthrs/sandbox` (`TerminalProtocol`), `@smthrs/platform-browser` (`TerminalSocket`), `@smthrs/ui` (`TerminalFrame`) |
| Real container | `@smthrs/platform-cloudflare`'s `test/ContainerTerminal.workerd.test.ts`: local workerd and Docker with this image |
| End to end | `e2e/branch-workspace.spec.ts` against `alchemy dev` (`pnpm e2e e2e/branch-workspace.spec.ts`, `pnpm e2e:gifs`) |

## Running it locally

`pnpm db:up`, `pnpm db:migrate`, `pnpm dev`, then open `http://localhost:1337/octocat/Spoon-Knife/tree/test-branch`. `alchemy dev` builds the sandbox image for `linux/amd64` through Docker on first start (a few minutes under emulation on Apple Silicon) and runs each branch's container in local workerd. A Worker reload restarts the objects and their containers, so an open terminal ends `lost` and Open terminal starts a new one.

## What's not built

- Sharing (`branch_shares`, links, `branch/Share`), presence (`RoomObject`), co-editing, `sandbox/Keep` and `sandbox/Sleep` with the last screen, snapshots, and creating branches (0012).
- Archive (`conversation_people`) and the branch picker.
- Private repositories: they wait for per-repository GitHub App installation tokens.
- The live half of the end-to-end test waits for Will's yes to deploy.
