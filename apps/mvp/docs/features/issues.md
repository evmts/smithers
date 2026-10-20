# Issues

A person lists, reads, opens and comments on the issues of the repository this deployment syncs, on any device. GitHub is the truth: Postgres holds a projection that only the server's GitHub flows write, Electric syncs it to every device, and every write goes from the device's outbox to one route, then one remote flow, then GitHub. This is decision [0012](../decisions/0012-git-end-to-end.md)'s slice G0.

## How it works

```
the device                               ChatApi (Cloudflare)                                   GitHub
New issue / Comment, /issue, /comment, the agent
  FlowDispatch ─▶ issue/create, issue/comment (client flows, this device's engine)
    step: write id = UUIDv5(execution id) ─▶ the tab that asked ─▶ the device's one outbox (issue-write)
  outbox ─ POST /api/repos/<o>/<n>/writes ─▶ sign-in, role, App, repository, bounds, payload hash
            202 { txid, writeId } ◀───────── INSERT github_writes ─ FlowStarter ─┐
  issue-requested: "#–  Requested"         github/Write on its Durable Object ◀──┘
                                             token: the person's ghu_ (their own act) or the App's (the agent's)
                                             earlier attempt? find our marker first ─────────────▶ GET  /issues?since
                                             one POST with <!-- smithers:write=<id> --> ─────────▶ POST /issues, /comments
                                             read the issue back, settle row + projection ────────▶ GET  /issues/<n>
items, comments ◀── Electric ◀── Postgres ◀──┘
                                           POST /api/github/webhook ◀─ X-Hub-Signature-256 ──── issues, issue_comment
                                             github/Apply (one per delivery): re-read, upsert if newer
                                           a read of items finding the sync > 5 min old
                                             github/Reconcile: change-time listing from the cursor ─▶ GET /issues, /issues/comments
```

- **GitHub is the truth.** `items` and `comments` change only when a server flow read GitHub, and only under the newer-than guard: GitHub's `updated_at`, then the read's own time, must be newer, and the row must differ. A duplicate, reordered or repeated read writes nothing, so Electric sends nothing.
- **A webhook rings the bell.** A delivery only names its issue; `github/Apply` reads the issue and its comments and upserts them. It never takes state from the payload.
- **Reconcile covers what webhooks miss.** GitHub doesn't redeliver a failed delivery, so a read of the items shape that finds the sync older than 5 minutes starts `github/Reconcile`, one execution per repository and 5-minute bucket, without waiting.
- **Every write is one remote flow.** The device never calls GitHub and never holds a token. The settled `github_writes` row is the result; nothing waits on the remote run.
- **Libraries** (`docs/libraries.md`): `@smthrs/integrations` ("Touch GitHub": `GitHub.AppAuth`, `GitHub.Issues`, `GitHub.Sync`, `GitHub.GitHubClient`, `Core.Channel`, `Core.Signature`), `@smthrs/flow` (the flows), `@smthrs/effect-electric` (`ShapeProxy`, `ElectricCollection`), `@smthrs/effect-tanstack-db` (`Outbox`, collections, live queries), `@smthrs/crypto` (`Uuid.v5`, `digestSync`), `@smthrs/ui` (`IssuesView`, `ItemConversation`, `IssueForm`).

## Who reads, who writes

| Act | Who | Token on GitHub |
|---|---|---|
| Read the issues, comments and sync shapes | a signed-in person with a role on the repository; anyone, once GitHub said the repository is public | none |
| Open an issue, comment, as a person | a signed-in person with any role (Guest and above, decision 0007 `repo:issue-open`, `repo:comment`) | their own GitHub user token, so GitHub shows them |
| Open an issue, comment, through the agent | a person who may ask Smithers (Member and above, `repo:ask`) | the App's installation token; the text ends `Smithers for @<login>` |

- **Reading.** A signed-out request, or a person with no role, is refused (`401`, `403`) until `github/Reconcile` has recorded that GitHub says the repository is public (`github_repositories.private`). The read still starts the sync, so a public repository opens to visitors within one walk. Decision 0012 keeps private repositories to people GitHub lets see them until shapes are authorized per request (0007 phase 2).
- **A Guest never writes as the bot.** A Guest has no agent, so the route refuses `via: "agent"` from a Guest (`403`): their write goes as themselves, or not at all.
- **The device says which door.** A step whose execution is the agent's call (`requesterOf(executionId) !== executionId`) sends `via: "agent"`; every other door sends `via: "person"`.

## Routes

`worker/github/Api.ts`; ChatApi routes these paths to it before RepoApi (`GitHubApi.handles`).

| Route | Answers |
|---|---|
| `POST /api/github/webhook` | `200` once the delivery is verified, its `github/Apply` started (for an `issues` or `issue_comment` event naming the synced repository) and the delivery recorded; a repeat is counted `duplicate` and starts the same execution, which changes nothing. `401 { code: "invalid_signature" }`, `400 invalid` (no delivery id, no event, not JSON), `413 too_large` (over 5 MiB; Reconcile covers it), `405`, `503 not_configured` (no App or no webhook secret), `503 unavailable` |
| `POST /api/repos/<owner>/<name>/writes` | `202 { txid, writeId }` for a new write, `200 { txid: null, writeId, status }` for one already taken (a pending one's execution is started again, which changes nothing). Refusals below |
| `GET /api/shapes/items` | the synced repository's `items` with `ITEM_COLUMNS`; starts Reconcile when stale |
| `GET /api/shapes/comments` | its `comments` with `COMMENT_COLUMNS` |
| `GET /api/shapes/github-sync` | its `github_sync` rows with `SYNC_COLUMNS` (never the cursor) |
| `GET /api/shapes/github-writes` | the signed-in person's own `github_writes`, status only (`WRITE_COLUMNS`); signed out, none; sessions unreadable, `503` with `Retry-After: 5` |

The writes route's body is `{ writeId, via, op: "issue/create", title, body }` or `{ writeId, via, op: "issue/comment", number, body }`: a UUID write id, a title of 1 to 256 characters not blank, a body up to 65,000 characters (a comment's not blank), a number of 1 to 2,147,483,647, and at most `MAX_WRITE_BYTES`. Its refusals are `{ code }`, `Cache-Control: no-store`:

| Status | `code` | When |
|---|---|---|
| 400 | `invalid` | not that body |
| 401 | `authentication` | signed out, or a person's write without a session (local development's developer) |
| 403 | `forbidden` | no role on the repository, or the agent's write from a Guest |
| 404 | `not_found` | a repository this deployment doesn't sync |
| 409 | `conflict` | the write id was taken by another payload |
| 413 | `too_large` | a body over `MAX_WRITE_BYTES` |
| 503 | `not_configured` | no GitHub App |
| 503 | `unavailable` | Postgres, sessions or the Durable Object couldn't answer; the device sends again |

## Writes

`github/Write { writeId }` (`worker/github/Write.ts`), execution `github-write:<writeId>`.

| Step | Does | Retry policy |
|---|---|---|
| `github/Write/send` | reads the write; a settled one answers what it settled. Takes the token (below). Counts the attempt; after an earlier one, looks for `<!-- smithers:write=<id> -->` among issues, or the issue's comments, updated since a minute before admission, and adopts what it finds. Otherwise one `POST`. Reads the issue back, then settles the write `done` and upserts the issue and its comments in one transaction. GitHub's `401` (a person's token) is `sign_in_required`, `404`/`410` `not_found`, `422` `invalid`, `403` and the rest `not_allowed`: settled `refused`, never tried again | 1 s doubling to a minute, an hour at most; GitHub's `Retry-After` honored |
| `github/Write/give-up` | after the last attempt: settles the write `failed` `unavailable` | 1 s doubling to a minute, never giving up |

A lost answer (`outcomeUnknown`), a rate limit, a 5xx or Postgres failing fails the step for its policy; the next attempt finds the marker before writing again, so a write reaches GitHub once. The marker stays hidden: the projection stores the body without it and its write id in `write_id`.

### Tokens

`worker/github/Tokens.ts`. No token enters a journal, a step key, an error or a record.

- **A person's:** the session's sealed `ghu_`, opened with sign-in's keys. Within 5 minutes of expiry, the step starts the session's `auth/RecheckRole` (named after the check it replaces, the one redeemer of the single-use `ghr_`) and fails `refreshing`, so its retry policy waits 5 seconds and asks again. A session that ended, or a token that no longer opens, is `sign_in_required`.
- **The App's:** `GitHub.AppAuth` signs the App's RS256 JWT with WebCrypto, finds the installation on the repository once (`github_repositories.installation_id`), and mints a token for that repository with only `issues: read` (Apply, Reconcile) or `issues: write` (a write). GitHub's `404` forgets the installation (`app_not_installed`); `422` or `403` means the App wasn't granted the permission (`not_allowed`).

## Sync

- **`github/Apply { deliveryId, repo, number, event }`** (`worker/github/Apply.ts`), execution `github-apply:<deliveryId>`: one step that reads the issue and up to 10 pages of its comments with an installation token and projects them; a complete comment listing tombstones the comments it lacks, and GitHub's `404` or `410` tombstones the issue and its comments. The App not installed ends it `not_installed`; failing past its retries ends it `unavailable`, and Reconcile covers the issue.
- **`github/Reconcile { repo }`** (`worker/github/Reconcile.ts`), execution `github-reconcile:<repoId>:<5-minute bucket>`: records what GitHub says of the repository (its id, whether it is private), then walks `GitHub.Sync`'s change-time listings of issues, then comments, from the committed cursor, upserting each row and committing the cursor after each page. At most 50 pages a walk: one that stops there is `partial`, never complete, and the next stale read continues it. An item GitHub lists in a shape this app can't read is skipped and counted. After the first walk, the rows it changed are counted as `github_reconcile_changed`: what webhooks should have delivered.
- **Freshness.** The list is loading until a complete walk (never "No issues" before), and a page whose shape was refused shows sign-in or Not found instead.

## The browser

`src/features/issues/`, framework-free logic beside React views ([state.md](../state.md)).

| Piece | What it is |
|---|---|
| `issue/create { repo, title, body? }`, `issue/comment { repo, number, body }` (`flows.ts`) | client flows, model-invocable; slash `/issue owner/repo <title>` and `/comment owner/repo <n> <text>` (Guest and up). Each answers `{ writeId, status: "requested" }`: never done |
| `steps.ts`, `tab.ts` | the step asks, over the engine's issues channel, the tab that started the request (`TabRequests`) to queue the write; that tab takes the outbox's lead and puts the write in the device's one outbox |
| `writes.ts` | `issue-sending` (the outbox's optimistic rows) and `issue-requested` (kept on the device: taken, or refused with why); the outbox's `issue-write` mutation posts to the writes route and never waits for Electric, so chat's questions never queue behind it |
| `store.ts` | Electric collections `issue-items`, `issue-comments`, `issue-sync`, `issue-writes`, kept on the device; `issue-drafts`, `issue-view`, `issue-access`; followers that drop a requested write once GitHub's row carries its id, and read the shape's refusal (`401` sign in, `403` forbidden) |
| `queries.ts` | the list (`items ∪ (requested − items) ∪ (sending − requested − items)`), the issue, its conversation, the sync, the access |
| `actions.ts`, `issues.ts` | `open` (route loaders), drafts, Create issue and Comment (door `button`), Edit and Discard on a write Not sent |
| `view.ts` | the props of `IssuesView`, `ItemConversation` and `IssueForm` from the queries' rows |

Screens: `/$owner/$repo/issues`, `/$owner/$repo/issues/new` and `/$owner/$repo/issues/$number` (`src/screens/issues/`), and an Issues link in the repository's header. The device's outbox is chat's, extended by `OutboxWrites` (`src/outbox.ts`).

## Postgres

Migration `0016_github_issues`. Synced tables are `REPLICA IDENTITY FULL`.

| Table | Columns | |
|---|---|---|
| `items` | `id` (`<repoId>#<number>`), `repo_id`, `number`, `kind` (`issue`, `pull`), `github_id`, `title`, `body`, `state`, `state_reason`, `author_login`, `comments`, `created_at`, `updated_at`, `closed_at`, `deleted_at`, `write_id`, `source_updated_at`, `fetched_at` | synced without the last two |
| `comments` | `id` (`<repoId>/comment/<GitHub id>`), `repo_id`, `item_id`, `github_id`, `author_login`, `body`, `created_at`, `updated_at`, `deleted_at`, `write_id`, `source_updated_at`, `fetched_at` | synced without the last two |
| `github_writes` | `id` (the write id), `repo_id`, `actor_id`, `session_id`, `via`, `op`, `payload`, `payload_hash`, `status` (`pending`, `done`, `failed`, `refused`), `failure`, `attempts`, `item_number`, `github_id`, `created_at`, `settled_at` | each person syncs their own rows' status |
| `github_sync` | `repo_id`, `stream`, `cursor`, `synced_at`, `complete`, `failure` | synced without the cursor |
| `github_deliveries` | `delivery_id`, `event`, `action`, `repo_id`, `subject`, `received_at` | never synced, never the payload |
| `github_repositories` | `repo_id`, `github_id`, `private`, `installation_id`, `checked_at` | never synced |

## Configuration

| Variable | Default | |
|---|---|---|
| `GITHUB_APP_ID` | none | the Smithers GitHub App's ID; without it, or the key, nothing syncs or writes (`503 not_configured`) |
| `GITHUB_APP_PRIVATE_KEY` | none | its private key, PEM as GitHub downloads it (PKCS#1) or PKCS#8; `\n`-escaped newlines are fine. A redacted secret |
| `GITHUB_WEBHOOK_SECRET` | none | the webhook's secret; without it the webhook route refuses every delivery and Reconcile alone keeps the rows fresh |
| `GITHUB_REPOSITORY` | `smithersai/smithers` | the one repository G0 syncs, the one sign-in reads roles on |
| `GITHUB_API_URL` | `https://api.github.com` | an http(s) URL |

ChatApi and the `FlowExecution` Durable Object read them with Effect `Config`, so Alchemy binds each one set in the deploying environment ([infrastructure.md](../infrastructure.md#credentials)). A person's own writes also need sign-in configured ([sign-in.md](sign-in.md#configuration)).

### The GitHub App (decision 0012 question 2)

What the App needs, set by its owner in the App's settings on GitHub; each installation owner then accepts the new permissions:

- **Repository permissions:** Issues: Read and write. Metadata: Read-only (always on).
- **Webhook:** active, URL `<deployment url>/api/github/webhook` (for local development, a tunnel to `http://localhost:1337/api/github/webhook`), content type `application/json`, a secret that is also `GITHUB_WEBHOOK_SECRET`.
- **Subscribe to events:** Issues, Issue comment. (0012 §2's other events wait for pull requests and branches.)
- **Secrets:** the App ID as `GITHUB_APP_ID` and a generated private key as `GITHUB_APP_PRIVATE_KEY`.
- **Installation:** on `GITHUB_REPOSITORY`, and on the scratch repository the live tests use.

Spike S0 (0012 §10) isn't needed for this slice: it concerns Code Storage's App mode and pushing branches, which issues don't touch.

## Observability

Every route, step and token logs, traces and counts itself; no record carries a title, a body, a login, a payload, the webhook secret or a token ([observability.md](../observability.md#github)).

| Record | Kind | Fields |
|---|---|---|
| `github.webhook` | log, span | `event`, `deliveryId`, `number`, `outcome` (`applied`, `duplicate`, `ignored`, `refused`, `too_large`, `invalid`, `not_configured`, `unavailable`), `status`, `bytes`, `errorCode` |
| `github.write.request` | log, span | `op`, `via`, `writeId`, `outcome` (`started`, `existing`, or the refusal's code), `status`, `durationMs`, `errorCode` |
| `github.write`, `github.write.give_up` | log, span | `writeId`, `op`, `via`, `token` (`user`, `app`), `outcome`, `settled`, `number` or `failure`, `errorCode` |
| `github.apply` | log, span | `deliveryId`, `repoId`, `number`, `event`, `outcome`, `changed`, `lagMs` |
| `github.reconcile`, `github.reconcile.start` | log, span | `repoId`, `outcome`, `pages`, `issues`, `comments`, `skipped`, `failure`, `errorCode` |
| `github.token.mint` | log, span | `kind`, `outcome`, `access`, `status`, `reason` |
| `github.config` | log | `errorCode` (a private key that doesn't import) |
| `github.shape.<table>` | log, span | Electric's request records; a refused read: `status` |
| `github_webhooks{event,outcome}`, `github_delivery_lag_ms` | counter, histogram | |
| `github_write_requests{op,outcome}`, `github_writes{op,outcome,token}`, `github_write_ms{op}`, `github_write_unknown{op}` | counters, histogram | |
| `github_applies{outcome}`, `github_reconciles{outcome}`, `github_reconcile_changed{kind}`, `github_sync_age_seconds` | counters, gauge | |
| `github_token_mints{kind,outcome}`, `github_shape_requests{table,status,live}` | counters | |
| `issues.write.queue`, `issues.write.send`, `issues.pending`; `smithers_issue_writes`, `smithers_issue_write_sends`, `smithers_issue_pending_actions` | browser logs, spans, counters | `op`, `door`, `via`, `outcome`, `status`, `writeId`, `reason`, `action` |

## Tests

Run with the compose Postgres and Electric up (`pnpm db:up`). GitHub is a scripted provider on the `HttpClient` seam (`worker/github/test/scriptedGitHub.ts`), like the model: it keeps the App's JWT and installation rules, numbering, authorship, `since` and paging, and a test arms a status or a lost answer per request.

| Test | Proves |
|---|---|
| `worker/github/Flows.test.ts` | `github/Write`, `github/Apply` and `github/Reconcile` on the Node host: a person's issue shows as them and the agent's as the App with its attribution; a comment; a lost answer, and a run that died after GitHub took the write, adopt by marker with no second write; refusals by status; an ended session, a revoked token, sign-in off, an unopenable token; an expiring token starting the role check; the App not installed or not granted write; the installation remembered and forgotten; a rate limit's wait; settled writes left alone; giving up; re-reads, newer-than, tombstones, ghosts and empty bodies; walks, the cursor, partial walks, visibility, unreadable items; no title, body, login or token in any record |
| `worker/github/Api.test.ts` | every route and refusal through the real handler: verified, duplicate, ignored, forged and oversized deliveries; writes started, resent, conflicting, bounded, refused by role, and a Guest's agent write refused; end to end on the Node host from the route to GitHub and back; each shape's columns; the stale read starting Reconcile once per bucket; a signed-out read of a private or unknown repository refused, a public one served; no payload or secret in any record |
| `worker/github/Host.test.ts` | the App's settings from Config; a key that doesn't import logs its code only; the Durable Object's handlers running `github/Write` to the end through `ExecutionHost.withGitHub` |
| `worker/github/Calls.test.ts`, `Project.test.ts` | how a failed call is read; a cut-short comment listing tombstones nothing; a write settles once |
| `worker/github/Live.test.ts` | the real GitHub on a scratch repository (never `smithersai/*`): the App's token, Reconcile, the agent's issue and its re-read, and a person's write as that person. Skips naming `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_LIVE_REPOSITORY`, `GITHUB_LIVE_USER_TOKEN` |
| `src/features/issues/*.test.ts` | the browser on Node devices against the real routes: Requested at once as `#–`, GitHub's row replacing it on every device; comments; loading before the first complete sync; refusals Not sent with Edit and Discard; settled refusals; offline then sent once; a lost answer resent once; an outbox that can't store; the agent's door; the slash lines; a visitor refused until the repository is public; no title or body in any record |
| `e2e/issues.spec.ts` | in real browsers, two devices: a signed-out device asked to sign in on a repository GitHub hasn't said is public while a Member's device gets the list and the form ("who reads", runs on `alchemy dev`); and G1/G3, A opens an issue, B sees it numbered and comments, A sees the comment, which skips naming `E2E_ISSUES_REPOSITORY`, `E2E_SESSION_COOKIE` and, locally, `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` |

## Not built yet

- Pull requests, reviews, the Checks tab (Smithers flow runs on the head SHA; no GitHub Actions or checks, 0012 decision 12), labels, branches, merge, update branch and triage (0012 W3 to W8): the next slices. Triage's labels `smithers:accepted` and `smithers:not-accepted`, with a person's override, are the next step.
- `GITHUB_SYNC_MAX_ITEMS` and the 24-hour full listing that tombstones deleted issues GitHub stops listing; a webhook's `issues.deleted` re-read tombstones them today.
- The `installation` and `installation_repositories` events, and a cron for Reconcile (`@smthrs/triggers` on Cloudflare, W9).
- Per-request shape authorization (0007 phase 2): one repository, the one sign-in reads roles on.
