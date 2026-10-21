# Notifications

Your feed: what needs you, what finished, what failed, live work on the branches you're on, and your repositories' `main` moving and new releases. It reads the one run index (`runs`), keeps one row per person per subject in Postgres, and shows on every device you have open: the toast stack, and `+N`, which opens your list in place. Read, Hide and Dismiss on one device reach the others. Decision: [0009](../decisions/0009-notifications-and-live-work.md), slice 1; Will's rulings in its §8: toasts follow the scope you're in, so you see other people's runs on your branch, and `main` changing and a new release belong to the repository.

```
run report (worker/Runs.ts) ── one transaction ──▶ runs ─▶ foldRun ─▶ notifications (launcher + branch watchers)
GitHub push / release (worker/github/Api.ts) ─────────────▶ recordRepoEvent ─▶ notifications (repository watchers)
a tab shows a conversation ─▶ watch/set ─▶ POST /api/watches ─▶ watches (branch:<id>, repo:<id>)
Read · Hide · Dismiss ─▶ notification/ack ─▶ POST /api/notifications/ack ─▶ greatest(read|dismissed|hidden_version)
notifications ─▶ Electric (/api/shapes/notifications, your rows) ─▶ every device ─▶ feedOf ─▶ the stack, the list
```

## Who hears what

| Subject | Raised by | Who | What they see |
|---|---|---|---|
| `run:<id>` | each report of an agent's answer | its launcher | every state: working, waiting, needs you (Answer), failed, done (Open) |
| | | everyone watching the run's branch who may open it | a quiet toast naming the launcher while it lives (`Waiting` while the launcher is asked), gone 4 s after it settles; never an entry |
| `main:<repo id>` | GitHub's `push` to the default branch | everyone watching the repository | `main · <commit> <first line>`, raised again for each newer push |
| `release:<repo id>:<tag>` | GitHub's `release` `published` | everyone watching the repository | `Release · <name>` |

- **You're on a branch** when a tab of yours shows its conversation: the tab runs `watch/set` once per conversation, which follows the branch and its repository at `attention`. A watch stays until you mute it (there is no Unwatch yet). `/app` is the deployment repository's `main`.
- **Routing** is `@smthrs/notifications`' `Inbox.route` and `Inbox.audience`: the launcher always; watchers at `attention` hear someone else's run quietly, at `all` as an entry; `muted` hears nothing. A watcher hears only of a branch they may open now (worker/branch/Access.ts), checked at each report.
- **Versions.** A row's `version` goes up when it needs attention again (`Inbox.raises`: a new row, a question, a failure, done; a second question while one is open). A row is open while `dismissed_version < version`, hidden while `hidden_version ≥ version`, unread while `read_version < version`. A new version shows again everywhere.

## The stack

| Entry | Toast | Its list entry |
|---|---|---|
| your question | `◆ Needs you · <question>` with Answer, until answered | stays while open; Answer focuses its card |
| your run, live, elsewhere | `◌ Working · <question>` with Open | stays while open |
| your run, done or failed | 4 s, with Open | done: 7 days; failed: until dismissed |
| someone else's run | `◌ Working · <who> · <question>`, then 4 s after it settles | none |
| `main`, a release | 4 s, with Open | 7 days |

- **Over a conversation**, its own runs show in it instead of as toasts, unless they need you. `/app` places the stack under its header beside the spend alerts (`src/screens/app/Toasts.tsx`); every other page floats it at the bottom-left (`src/screens/root/Root.tsx`, `PageNotices`); a branch's page doesn't show it yet.
- **Order:** needs you, failed, live, done, updates; the newest first within each. Three toasts show; `+N` counts the rest and your list, and opens them in place.
- **×** hides a toast (the entry stays in your list); in the list, × dismisses a settled entry.
- **Unread** entries carry a dot. Answer and Open record Read.
- **A failed run's toast** shows for 4 s like a finished one; the failure stays in its conversation with Retry and in your list until you dismiss it.
- Every toast fades in after 300 ms.

## Postgres

Migration `0020_notifications`:

| Table | |
|---|---|
| `runs` + `conversation_id`, `branch_id`, `repo_id` | where a run works: its answer's conversation, branch and repository, set by the report that creates the row (rows before it backfilled) |
| `watches (principal_id, subject, level)` | `branch:<id>` or `repo:<id>`, at `attention`, `all` or `muted`. Not synced |
| `notifications (recipient, subject)` | `kind`, `state`, `mine`, `quiet`, `run_id`, `repo_id`, `conversation_id`, `actor`, `title`, `ref`, `href`, the four versions, `occurred_at` (orders a repository's events, so a late older push changes nothing). `REPLICA IDENTITY FULL`; synced to its recipient only |

## The routes

`worker/Notifications.ts`, in ChatApi. A feed is a Member's or above's.

| Route | Answers |
|---|---|
| `POST /api/watches` `{ conversationId }` (`null`: home) | `200 { txid }`, or `{ txid: null }` when already followed; a level already chosen is kept. `403` for a branch you may not open; `404` for no such conversation |
| `POST /api/notifications/ack` `{ subject, version, act }` | `200 { txid }`; `{ txid: null }` when it changes nothing; `404` for a row that isn't yours. `act` is `read`, `dismiss` or `hide`, merged as `greatest(…, least(version, row version))` |
| `GET /api/shapes/notifications` | Electric's `notifications` where `recipient` is you; signed out or a Guest, no rows; sessions unreadable, `503` |
| all | `401` signed out; `403` below Member; `400` invalid; `405` another method; `413` over 2 KiB; `503 { code: "unavailable" }` when Postgres can't be reached |

The run report and answer routes (`worker/Runs.ts`) fold in their own transaction: a report that writes the run's row routes it (`foldRun`), and an answer closes the question for everyone. The answer's own settled status wins over the run's row, as in the conversation: settling an answer (`POST /api/answers/<id>`, `worker/Answers.ts`) folds it too, and `chat/Expire` abandoning one fails its run and folds it, so a run whose tab never came back doesn't read `Working` forever. GitHub's webhook (`worker/github/Api.ts`) records `main` and releases of the repository it syncs.

## Flows

`src/features/attention/flows.ts` (declarations) and `steps.ts`. Each step is one ChatApi request through `AttentionClient`, tried again for a day while ChatApi can't be reached (an act taken offline lands once the device is back); a 4xx is final.

| Flow | Door | |
|---|---|---|
| `watch/set { conversationId }` | `view` (the tab), the agent | follow a conversation's branch and repository |
| `notification/ack { subject, version, act }` | `button` | Read, Dismiss or Hide; one execution per subject, act and version. The person's only |

## The browser

`src/features/attention/` follows [state.md](../state.md):

| Piece | What it is |
|---|---|
| `notifications` | your rows, an Electric collection kept on the device (`persist: { schemaVersion: 1 }`) |
| `attention-pending` | acts this device took that the rows don't show yet, kept on the device until they do |
| `attention-entries` | what the views read, worked out by `feedOf` (`entries.ts`, pure) from the rows, the pending acts, the clock and the conversation the tab shows; again when a toast is due to hide |
| `stack`, `stackHere`, `list`, `listHere` | the toasts and the list, on a page and over a conversation |
| `open(subject, surface)`, `hide`, `dismiss` | the toast's action, its ×, and the list's × |
| followers | the feed (above), and the watch: `watch/set` for each conversation the tab shows, once per person, for a Member (or while sign-in can't say) |

The views are `@smthrs/ui`'s `ToastStack` (`more`, `+N` / `Less`) and `Toast` (`tone="update"`, `word`, `unread`, `hideLabel`), with `noticeDismissDelay` and `workNoticeVisible`. Agent status keeps the header's pill, the card and the tab's title; its toast is the feed's.

## Observability

| Record | Kind | Fields |
|---|---|---|
| `runs.fold` | span, ChatApi | `smithers.run.id`, `smithers.notifications.written` |
| `smithers_notifications_routed` | counter, ChatApi | `kind`, `state` |
| `notifications.repo_event` | log and span, ChatApi | `kind`, `repoId`, `watchers`, `written` |
| `notifications.watch`, `notifications.ack` | log, ChatApi | `conversationId` or `subject`, `act`, `version`, `status`, `existing`, `errorCode` |
| `notifications.request`; `smithers_notification_requests`, `smithers_notification_shape_requests` | span; counters, ChatApi | `route`, `status`; `status`, `live` |
| `notifications.watch`, `notifications.ack`; `smithers_notification_watches`, `smithers_notification_acks` | log and span; counters, engine | `outcome` (`sent`, `refused`, `unsent`), `act` |
| `notifications.shown`, `smithers_notifications_shown` | log and counter, tab | `subject`, `version`, `state`, `kind` |

No record carries a title, a question, a commit message or who pushed (the tests search the logs for them).

## Not built in this slice

- Live work of runs other than agents' answers (flows, Cloudflare, attached machines), `JournalPush`, `run_commands`, Stop and Retry from a toast, and the engine facts (`retry-scheduled`, beats, `Progress.report`) of 0009 §2.
- Unwatch and levels from the app; a branch's page placing the stack; the left edges for live work scrolled out of view; browser notifications; `notifications/Prune` (rows past 7 days are hidden, not deleted); repository policy (M-47).
- Repository events locally: GitHub's deliveries need the GitHub App and its webhook secret, which `alchemy dev` doesn't have unless you configure them.

## Tests

| Test | Proves |
|---|---|
| `worker/Notifications.test.ts` | On the real ChatApi and Postgres: routing to the launcher and the branch's watchers (quiet, `all`, muted, access), versions, a question answered, a second question, a settled run, an answer settled before its run reports, a run with no scope; every watch and ack answer; greatest() from two devices in either order; the shape's filter; signed GitHub `push` and `release` deliveries: newer, older, replayed, other branches and repositories; no record carries a title |
| `src/features/attention/entries.test.ts` | `feedOf`: every toast and list rule, pending acts, words, order; `timeOf`, `landed`, `follows` |
| `src/features/attention/attention.test.ts` | Two people on Node devices: Ann's run on both her devices and Ben's; Read, Hide and Dismiss across her devices; done hiding after 4 s; an act a device can't send; watching per conversation and per sign-in |
| `src/features/attention/api.test.ts` | `AttentionClient`'s answers and the steps' outcomes |
| `worker/flows/Expire.test.ts` | An abandoned answer's run fails, and its launcher's row says so |
| `@smthrs/notifications` `test/Inbox.test.ts`, `@smthrs/ui` `tests/agent-status-notices.test.tsx` | `Inbox`; the notices, `Toast` and `ToastStack` |
| `e2e/notifications.spec.ts` | In real browsers: Ann on two devices, Ben on one; Ben sees Ann's run on `main` from the Runs page, settling and hiding; Ann's question toasts on both her devices, Hide and Dismiss and Read reach both; `main` and a release reach both people (needs `E2E_GITHUB_WEBHOOK_SECRET`) |

Two people locally: `worker/DevChatApi.ts` signs in a browser with the cookie `smithers_dev_person=teammate` as `local-teammate`, a Member (`devices.openTeammate`).
