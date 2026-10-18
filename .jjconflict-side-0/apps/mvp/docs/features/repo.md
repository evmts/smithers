# Repositories: clone and view

A signed-in person clones a public GitHub repository into Code Storage, and anyone browses a cloned one: its file tree, a directory with its README, and a file as highlighted code or rendered Markdown. The URLs are GitHub's: swapping `github.com` for the app's domain opens the same repository. Decision: [0006](../decisions/0006-repo-clone-and-view.md).

## How it works

```
browser                         ChatApi (Cloudflare)                              Code Storage / GitHub
Clone ── POST /api/repos ─────▶ RepoApi: sign-in, bounds, REPO_MAX_REPOSITORIES
            202 {txid} ◀──────── INSERT repositories 'cloning' ── FlowStarter ─┐
                                 FlowExecution Durable Object (alarm) ◀────────┘
                                   repo/Clone: Inspect ── HEAD (git smart HTTP) + size (REST) ──▶ GitHub
                                                  └── admission (Postgres, one row lock)
                                               Import ── POST /api/repos {upstream: public} ────▶ Code Storage
                                               Pull ──── POST /upstream/pull
                                               AwaitSync GET /commits?limit=1 until synced or the deadline
                                               Settle ── UPDATE repositories … WHERE clone_id = $2 AND status = 'cloning'
repositories ◀── GET /api/shapes/repositories (ShapeProxy) ◀── Electric ◀── Postgres
tree, file   ◀── GET /api/repos/<o>/<n>/tree/<sha> · /blob/<sha>/<path> ◀── immutable cache ◀── Code Storage
```

- **Cloning runs remotely** because it needs the Code Storage organization key, which a person must not hold ([0011](../decisions/0011-the-agent-runs-in-the-browser.md) §2). It is the durable flow `repo/Clone` on the per-execution Durable Object ([remote flows](remote-flows.md)).
- **Reading runs anywhere.** The tree and file bodies stay in Code Storage and are read at a commit SHA, so an answer never changes: RepoApi keeps it in the immutable cache, and the browser's HTTP cache keeps it too (`Cache-Control: public, max-age=31536000, immutable`).
- **Libraries** (`docs/libraries.md`): `@smthrs/effect-code-storage` (`CodeStorage`, `GitRemote`), `@smthrs/artifacts` (`ImmutableCache`) with `@smthrs/platform-cloudflare`'s `EdgeCache.layer`, `@smthrs/integrations` (`GitHub.GitHubClient`) for the size call, `@smthrs/flow` for the flows, `@smthrs/effect-electric` (`ShapeProxy`, `ElectricCollection`), `@smthrs/effect-tanstack-db`, and `@smthrs/ui`'s `RepoView` (`@smthrs/ui/adapters/repo-view`, the app's one deep import; [rules](../rules.md#sdkroot-imports-only)).

## RepoApi

`worker/RepoApi.ts`. ChatApi routes `/api/repos`, `/api/repos/*` and `/api/shapes/repositories` to it, with sign-in's `Sessions`, the `FlowStarter` that starts a Durable Object, and the Workers Cache API as `ImmutableCache` (`EdgeCache.layer({ name: "repo" })`).

| Route | Who | Answers |
|---|---|---|
| `POST /api/repos` `{ owner, name }` | signed in | `202 { txid, id, attempt }` for a new clone or Try again on a `failed` or `capacity` row; `200 { txid: null, id, status }` for a row already `cloning` or `ready` (a `cloning` row's execution is started again under its own [execution id](#execution-ids), which changes nothing) |
| `GET /api/shapes/repositories` | anyone | Electric's `repositories`, whole: `ShapeProxy` with the table fixed and no subset requests |
| `GET /api/repos/<owner>/<name>/tree/<sha>` | anyone | `{ paths, truncated }`: every file's path, in pages of 5,000, up to `REPO_TREE_MAX_PATHS` |
| `GET /api/repos/<owner>/<name>/blob/<sha>/<path>` | anyone | the file's bytes (`application/octet-stream`, `x-blob-sha`) |

Refusals are `{ code }` JSON with `Cache-Control: no-store`:

| Status | `code` | When |
|---|---|---|
| 400 | `invalid` | not `{ owner, name }` JSON, a name GitHub couldn't have, a reserved owner (`app`, `api`, `assets`), a SHA that isn't 40 hex, a path with an empty, `.` or `..` segment or over 1,024 characters or 64 segments |
| 401 | `authentication` | cloning while signed out ([0008](../decisions/0008-auth.md): importing needs sign-in) |
| 404 | `not_found` | no such route, repository, commit or file |
| 405 | none | a method the route doesn't take (`allow` names it) |
| 413 | `too_large` | a body over 1 KiB; a file over 512 KiB, with its `size` when Code Storage declared it, never reading the body |
| 429 | `repository_limit` | `REPO_MAX_REPOSITORIES` rows are already `cloning` or `ready` |
| 503 | `capacity` | this month's read budget is spent and the answer isn't cached |
| 503 | `unavailable` | Postgres, sessions, the Durable Object or Code Storage couldn't answer; `retry-after` (seconds) when Code Storage said when. Also a clone whose start conflicted: its attempt is settled `failed` `unavailable` ([execution ids](#execution-ids)) |
| 503 | `not_configured` | this deployment has no Code Storage organization |

## Postgres

Migrations `0007_repositories` and `0009_clone_ids`.

| Table | Columns | |
|---|---|---|
| `repositories` | `id` (key: `github/<owner>/<name>`, lowercased; also the Code Storage name), `owner`, `name`, `status` (`cloning`, `ready`, `failed`, `capacity`), `failure` (`not_found`, `empty`, `unavailable`, `timed_out`), `capacity` (`paused`, `storage`, `reads`, `too_large`, `size_unknown`), `stored_bytes`, `retry_at`, `default_branch`, `head_sha`, `head_message`, `head_author`, `head_at`, `attempt` (1, then 2 after Try again), `clone_id` (the attempt's own id, a UUID drawn when the attempt is created), `requested_at`, `settled_at` | synced to every device by Electric; `REPLICA IDENTITY FULL` |
| `repo_imports` | `id` (always 1), `paused`, `changed_at` | the pause switch admission reads; its row lock serializes requests and admission |
| `code_storage_usage` | `month` (key), `bytes_read`, `bytes_imported`, `alerted_pct` | what Code Storage served and imported each UTC month, and the highest spend alert raised |

## The clone

`repo/Clone { id, owner, name, cloneId, requestedAt }` (`worker/flows/RepoClone.ts`), execution id `repo-clone:<id>:<cloneId>`. Every step is sealed: a resumed run never repeats one that finished.

| Step | Does | Retry policy |
|---|---|---|
| `repo/Inspect` | `GitRemote.head` over git's smart HTTP (no key, no REST quota): 401, 403 or 404 is `not_found`, no commits is `empty`, a detached HEAD is `unavailable`. Then GitHub's size (`GET /repos/<o>/<n>`, with `GITHUB_TOKEN` when set) and [admission](#admission) | 1 s doubling to 30 s, 2 minutes |
| `repo/Import` | `CodeStorage.createRepo` with the public GitHub upstream; one that exists is fine, one with another upstream is refused | the same |
| `repo/Pull` | `CodeStorage.pullUpstream`; `sync_in_progress` is fine | the same |
| `repo/AwaitSync` | `CodeStorage.listCommits(id, { ref: defaultBranch, limit: 1 })`: the head commit once synced; `timed_out` once `REPO_CLONE_DEADLINE` has passed since the request; otherwise `SyncPending`, retried | 2 s doubling to 30 s, after Code Storage's `Retry-After` when it sends one; an hour at most |
| `repo/Settle` | writes the outcome only while this attempt owns a `cloning` row (`clone_id` is its `cloneId`); a `ready` clone adds its size to this month's imported bytes | 1 s doubling to a minute, 30 minutes |

- Inspect's failure past its retries settles `failed` `unavailable`; so does any failure of Import, Pull or AwaitSync. A refusal by a budget skips straight to Settle as `capacity`. A stale attempt's Settle changes nothing.
- AwaitSync is a step with a retry policy rather than `Poll.make` (0006 named a poll): a poll's backoff can't cap at 30 s, and a step's attempts and expiration are persisted the same way.
- The flow runs on the Node host in its tests and on the Durable Object when deployed: the host injects Postgres, Code Storage and GitHub (`RepoClone.registration`, `ExecutionHost.withRepoClone`).

### Execution ids

Each attempt has an id of its own, `clone_id`: Postgres draws a UUID when `POST /api/repos` inserts the row or Try again starts a new attempt (`gen_random_uuid()`), and a request on a `cloning` row reuses it. It names the attempt's execution, `repo-clone:<id>:<clone_id>` (`cloneExecutionId`), so the attempt's Durable Object is its own, and it fences admission's and Settle's writes (`WHERE id = $1 AND clone_id = $2 AND status = 'cloning'`).

- **Never the `attempt` counter.** It restarts when `repositories` is reset or restored while the Durable Objects keep their executions. A new attempt 1 then named the old execution, whose intent holds another payload: the start failed (`StartConflict`), RepoApi answered 503, and the row stayed `cloning` with every request colliding again. An old run fenced by the counter could also settle the new row. `attempt` stays as the count of tries, in the `202` answer and the request's log line.
- **A start that still conflicts is a bug,** since an id never repeats. RepoApi settles that attempt `failed` `unavailable`, logs `repo.clone.request` at Error with `outcome` and `errorCode` `conflict`, and answers `503 unavailable`. The browser shows "Couldn't clone" and Try again, which starts a new attempt, rather than a spinner forever.
- **Migration `0009_clone_ids`** adds the column, with its own UUID for every row, and settles each row still `cloning` as `failed` `unavailable`: its execution was named by the counter, and none carries the new id to settle it.

### Admission

In Inspect, after the size, one transaction holds `repo_imports`' row, so two imports can't both take the last headroom. The first rule that holds decides: imports `paused`; GitHub rate limited the size call (`size_unknown`, with `retry_at` at GitHub's reset); the size is over `REPO_MAX_SIZE_MB` (`too_large`); the stored bytes of the other `cloning` and `ready` rows plus this one are over `REPO_MAX_STORED_GB` (`storage`); this month's reads have reached `REPO_MAX_READ_GB_PER_MONTH` (`reads`); otherwise it writes `stored_bytes` and admits.

### Spend

Every write to `code_storage_usage` recomputes this month's estimate in its transaction: stored GB × $3.60 + read GB × $0.15 + imported GB × $0.06. Crossing 50%, 80% or 100% of `REPO_BUDGET_USD` above `alerted_pct` raises it and logs `repo.spend.alert` at Error once a month per threshold; the gauges `repo_stored_bytes` and `repo_spend_estimate_usd` follow every write. Delivering that line to Will is the token-spend alert's job ([todo.md](../todo.md#alerts-on-token-spend)).

## Reads

`worker/RepoReads.ts` answers the GET routes and the agent's flows alike. A read checks the immutable cache under `repo.tree` (`id`, `sha`) or `repo.blob` (`id`, `sha`, `path`); a hit costs Code Storage nothing and is served over budget too. A miss checks this month's read budget, reads Code Storage, meters its bytes into `code_storage_usage`, and stores the answer. A failed read is never cached. A meter Postgres refuses is logged (`repo.meter`) and the read still answers.

## The agent's reads

`repo/tree { repo, revision }` and `repo/read { repo, revision, path }` (`src/features/repo/flows.ts`): model-invocable, one step each, `repo` as `owner/name` and `revision` a full SHA. `repo/read` answers `{ state: "text", contents, size }`, or `{ state, size }` for a binary file or one over 512 KiB. They run on the device: a step reads through the injected `RepoReader`, which in the browser's engine is RepoApi's GET routes (`src/features/repo/reader.ts`) and on the server and the Node host is `RepoReads` itself. Failures: `RepoNotFound`, `RepoReadsPaused` and `RepoReadUnavailable` (retried 1 s doubling to 15 s for 2 minutes, after RepoApi's `Retry-After`).

Both are in the app's flow registry with no needs, so they run on this device's engine and are in the agent's catalog ([flows](flows.md#the-registry)). The engine worker registers them with `repoReads(origin)` (`src/flows/registrations.ts`): `RepoReader` over `RepoClient` on the page's origin, through the worker's own `HttpClient`, with `REQUEST_WITHIN` (15 s) for each whole request.

## The browser

`src/features/repo/`, framework-free logic beside React views ([state.md](../state.md#repositories)).

| Piece | What it is |
|---|---|
| `repositories` | Electric collection over `/api/shapes/repositories`, decoded by `schema.ts` `Repository`, kept on the device (`schemaVersion` 2 since `cloneId`) |
| `trees`, `blobs` | local-only collections keyed `<id>@<sha>` and `<id>@<sha>:<path>`, in the states `RepoView` takes |
| `clones` | this tab's clone requests while they are on their way or were refused |
| `clone(owner, name)`, `retryClone` | validate, show `cloning` at once, `POST /api/repos`, wait for Electric to deliver the row. A plain request, not chat's outbox: the server takes a clone idempotently, and it needs the network and sign-in anyway |
| `openRoute(kind, params, search)` | the route loaders' action: loads the tree at the head commit, the file, or the directory's README, each once |
| `copyPermalink` | the location's link with the ref replaced by `head_sha`, through the injected `Clipboard` |

Screens: `/$owner/$repo`, `/$owner/$repo/tree/$ref/$` and `/$owner/$repo/blob/$ref/$` (`src/screens/repo/RepoScreen.tsx`), with `?L=<n>` or `?L=<a>-<b>` marking lines. `src/router.tsx` keeps only `?L=` in each route's search (`validateSearch: lineSearch`, `paths.ts`), makes it the route's `loaderDeps`, and gives it a loader that calls `openRoute("tree" | "blob", params, deps)` on the repository layer in the router's context (`createRootRouteWithContext<{ repo: RepoView }>`), which main.tsx passes to `RouterProvider`; preloading is off. In `appLayer` (`src/boot.ts`) the repository layer sits beside chat, sign-in and the theme: `Repo.layer` over `RepoStore.layer({ origin })`, which reads sign-in's own `AuthStore` row, `RepoClient.layer({ origin, within: REQUEST_WITHIN })` and `Clipboard.layer(host.clipboard)`; main.tsx's clipboard is `navigator.clipboard.writeText`. The header shows `owner / name` and Clone; one spinner while cloning; "Sign in to clone" for a signed-out person; or why a clone failed or was refused, with Try again. A missing repository or file shows "Not found".

## Configuration

| Variable | Default | |
|---|---|---|
| `CODE_STORAGE_ORG` | none | the Code Storage organization (`smithers`); without it, or without the key, the deployment clones nothing (`503 not_configured`) |
| `CODE_STORAGE_KEY` | none | the organization's ES256 key, a PKCS#8 PEM; a redacted secret |
| `CODE_STORAGE_API_URL` | `https://api.<org>.code.storage` | |
| `GITHUB_TOKEN` | none | a GitHub App or bot token for the size call: 5,000 calls an hour instead of 60 per IP address |
| `REPO_MAX_REPOSITORIES` | `100` | `cloning` and `ready` rows |
| `REPO_MAX_STORED_GB` | `3` | their stored bytes together |
| `REPO_MAX_READ_GB_PER_MONTH` | `40` | Code Storage reads this UTC month |
| `REPO_MAX_SIZE_MB` | `1000` | one repository's size on GitHub |
| `REPO_BUDGET_USD` | `20` | the base of the spend alerts |
| `REPO_TREE_MAX_PATHS` | `50000` | paths a tree lists before it answers `truncated` |
| `REPO_CLONE_DEADLINE` | `10 minutes` | how long after the request the sync may take |

ChatApi and the Durable Object read them with Effect `Config` (`worker/RepoConfig.ts`, `worker/Repos.ts`, `worker/RepoReads.ts`), so Alchemy binds each one that is set. On this Mac the key is `CODE_STORAGE_API_KEY` in `~/.zshrc`: map it to `CODE_STORAGE_KEY` and set `CODE_STORAGE_ORG=smithers`.

## Tests

| Test | Proves |
|---|---|
| `worker/RepoApi.test.ts` | every route and refusal through RepoApi's real handler over the compose Postgres and Electric, with each clone's intent on an in-memory Durable Object storage and its run on the Node host: 202 then `ready`, a second request starting nothing, Try again's attempt 2 under a new id, a database reset that kept the Durable Objects (attempt 1 again starts and settles), a conflicting start settling its attempt `failed`, sign-in, bounds, `repository_limit`, Postgres down and a start refused; trees page by page and truncated; files, binaries, 413 with and without a size, 404; the cache serving repeats and reads over budget; `Retry-After`; the meter; spend alerts once per threshold; the agent's flows over the server reads; the shape; and no file content, commit message or Code Storage text in telemetry |
| `worker/flows/RepoClone.test.ts` | `repo/Clone` on the Node host: ready with its head and metered import; `not_found` and `empty` with no Code Storage call; each budget's `capacity`; two imports for the last headroom; `timed_out`; a conflicting upstream; a stale attempt; a run from before a reset, also attempt 1, writing nothing to the new row; a run killed mid-step resumed by a new engine with no second create; each step's transient and refused failures |
| `db/Database.test.ts` | `0009_clone_ids`: every row gets its own UUID, a `cloning` row settles `failed` `unavailable`, the others keep their status |
| `worker/ExecutionHost.test.ts` | the Durable Object's handlers run `repo/Clone` to the end over the app's tables (`withRepoClone`) |
| `worker/RepoUpstream.test.ts` | HEAD and size from the real GitHub; the token sent only when configured; rate limits as `size_unknown` until GitHub's reset; 404 and 5xx |
| `worker/RepoConfig.test.ts` | no organization or key clones nothing; a bad key is logged by code, never printed; the clone's services from `Config` |
| `worker/RepoClone.live.test.ts` | the whole clone of `octocat/Spoon-Knife` into the real organization, then its tree and README through the GET routes; skips without `CODE_STORAGE_ORG` and `CODE_STORAGE_KEY` |
| `src/features/repo/*.test.ts` | the browser's machine through its actions and queries against RepoApi's real handler and Electric on two tabs; faults through a faulty `RepoClient`; the agent's flows as the engine worker registers them (`repoReads`), over the browser reader |
| `src/boot.test.ts` | the app's own layer: `boot` renders the repository layer; a route opened through it syncs `repositories` from the app's RepoApi and Electric, shows "Sign in to clone" from sign-in's own row, and Copy permalink writes to the host's clipboard |
| `src/flows/registry.test.ts` | `repo/tree` and `repo/read` are client flows in the agent's catalog |
| `e2e/repo.spec.ts` | in real browsers: two devices see the cloned repository; a file from the listing, a line anchor across a reload, Copy permalink at the head commit; Not found for a missing repository and file. It skips locally without `CODE_STORAGE_*` |

Code Storage and GitHub are third-party providers, scripted like the model (`worker/test/codeStorage.ts`); the live tests use the real ones.

## Not built yet

- `repo/SetImports`, the operator's pause switch as a flow (`repo_imports.paused` is read; nothing writes it yet).
- Delivering `repo.spend.alert` to Will, with the token-spend alert.
- The chat embed (0006 §2, feature 3's `repo` template) and range highlights.
- Stopping showing a repository made private or deleted after cloning ([repo open states](../work/repo-open-states.md)).
