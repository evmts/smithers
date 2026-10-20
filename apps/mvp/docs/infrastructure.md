# Infrastructure

The app is two Cloudflare Workers beside Postgres and Electric ([decision 0001](decisions/0001-electric-postgres-tanstack-db.md)). In production, `alchemy.run.ts` declares all of it: a Neon Postgres project, the migrations, Hyperdrive, Electric in a Cloudflare Container behind its gateway Worker, and the two Workers (`infra/`). Locally, Postgres and Electric are Docker Compose services.

```
browser ── site Worker ── service binding ── ChatApi Worker ── Hyperdrive ──────────────────────────▶ Postgres
                                                 │                                          (logical replication)
                                                 └─ GET /api/shapes/messages ── Electric gateway ── Electric ─┘
```

| Piece | Local (`pnpm db:up`, `pnpm dev`) | Production (`pnpm deploy`) |
|---|---|---|
| Postgres 14 or later, `wal_level=logical` | `postgres:17.11-alpine` at `localhost:54321` | the `ChatPostgres` Neon project: Postgres 17, logical replication on (`infra/Postgres.ts`) |
| Migrations | `pnpm db:migrate` | the `ChatMigrations` deploy step (`infra/ChatDatabase.ts`) |
| Electric | `electricsql/electric:1.8.1` at `localhost:30001`, no secret | `electricsql/electric:1.8.1` in a Cloudflare Container behind the `ElectricGateway` Worker, with a generated secret (`infra/ElectricGateway.ts`) |
| Hyperdrive | `alchemy dev` passes the binding straight through to `DATABASE_URL` | the `ChatDatabase` config in front of Neon's direct host, query cache off |
| Workers | local workerd at http://localhost:1337 | Cloudflare, Workers Logs and Traces persisted |
| Remote flows | the `FlowExecution` Durable Object in local workerd, its engine in the schema `smithers_flows` of the compose Postgres | the `FlowExecution` Durable Object, hosted by ChatApi, its engine in the schema `smithers_flows` of the Neon project through `ChatDatabase` ([remote-flows.md](features/remote-flows.md)) |

## Local

You need Docker with Compose v2, Node 26 (it runs the TypeScript scripts directly) and pnpm.

1. `pnpm install` in the repository root.
2. `pnpm db:up` starts Postgres and Electric from `docker-compose.yml` and waits until both are healthy.
3. `pnpm db:migrate` applies `db/migrations` to `DATABASE_URL`, the compose Postgres by default.
4. Give ChatApi a model key. The default model needs `CEREBRAS_API_KEY` in the environment; `CHAT_MODEL` selects another ([chat.md](features/chat.md#configuration)).
5. `pnpm dev` runs `alchemy dev`: the app at http://localhost:1337/app and both Workers in local workerd. Without the GitHub App's credentials, a local developer is signed in as an Admin, and can sign out and in again ([sign-in.md](features/sign-in.md#local-development)).
6. Open http://localhost:1337/app. Answers come from the browser's agent: it runs in the tab's engine worker and reaches the model through `POST /api/model/agent` ([agent.md](features/agent.md)).

| Task | Command |
|---|---|
| Tests (`worker/` and `db/` need Postgres and Electric up) | `pnpm test` |
| End to end | `pnpm e2e` |
| Stop Postgres and Electric, keeping the data | `pnpm db:down` |
| Delete the data too | `docker compose down -v` |
| Query the conversation | `docker compose exec postgres psql -U smithers -c 'select * from messages order by position'` |
| Is Electric up? | `curl localhost:30001/v1/health` |
| ChatApi's logs | `.alchemy/log/dev_<user>/ChatApi/` |

### Tests

ChatApi's tests (`worker/`, `db/`) use the compose Postgres and Electric and nothing else (`db/TestDatabase.ts`):

- They refuse a `DATABASE_URL` that names another host or port, before connecting to it. Unset it to run them.
- Each test file works in a schema of its own on the compose Postgres, which `db/migrations` builds and which is dropped after the file. A test migrates only schemas of its own: it never migrates the dev database, touches the dev conversation, or sees another file's rows.
- With Postgres or Electric down, a test file fails with `No Postgres answers at localhost:54321. Start it with pnpm db:up.` (or Electric at `localhost:30001`). Any other setup failure fails it as it is.

## Production

`alchemy.run.ts` declares every production dependency, in the stage `prod`. Under `alchemy dev` it declares none of them: the stack checks `ALCHEMY_DEV` and keeps the compose services.

### Postgres

- `ChatPostgres` (`infra/Postgres.ts`) is a Neon project on Postgres 17 in `aws-us-east-1`, with logical replication on, which sets `wal_level=logical`. Its region and version can't change after creation.
- The project's owner role has the `REPLICATION` attribute Electric needs and owns `messages`.
- Electric works only on tables with `REPLICA IDENTITY FULL`: Electric 1.8 refuses any other ("Electric cannot function with replica identity mode set to something other than FULL"). The first migration sets it.
- `pnpm destroy` keeps the project: its removal policy is `retain`. Delete it in Neon's console.

### Migrations

`ChatMigrations` is an Alchemy action that applies `db/migrations` with `Database.migrate`, the same migrations `pnpm db:migrate` applies locally. It runs from the deploying machine against the project's direct host during `pnpm deploy`, whenever the database or the list of migration files changed. The Hyperdrive config waits for it, so ChatApi never deploys against an unmigrated database. `pnpm plan` lists it as `run` when it will run.

### Electric

- `ElectricGateway` (`infra/ElectricGateway.ts`) is a Worker at its `workers.dev` URL. It answers only `GET /v1/shape` with `authorization: Bearer <secret>`, compared in constant time (`infra/ElectricAccess.ts`), by forwarding the request without that header to one Durable Object, which starts the `Electric` container and forwards it to Electric's port. Any other path is 404 and a wrong or missing token is 401, before the container starts. The secret is never in a URL: the gateway's invocation logs and both Workers' traces record each request's URL (`url.full`, `url.query`), and neither records an `authorization` header.
- The container runs `electricsql/electric:1.8.1` on the `basic` instance type (1/4 vCPU, 1 GiB of memory, 4 GB of disk), at most one instance, with `DATABASE_URL` set to the project's direct host and `ELECTRIC_INSECURE` set. Electric takes its own secret only as a URL parameter, so it runs without one: the container has no way in but its Durable Object, which only the gateway reaches.
- `ElectricSecret` is a random secret Alchemy generates once and keeps in the stack's state, encrypted with `ALCHEMY_PASSWORD`. The gateway and ChatApi hold it; browsers reach Electric only through ChatApi's shape routes, which fix the table ([chat.md](features/chat.md#get-apishapesmessages)).
- ChatApi gets the gateway's URL as `ELECTRIC_URL`, the secret as `ELECTRIC_SECRET` and `ELECTRIC_SECRET_AS=bearer` from `bind` in `infra/Electric.ts`, which its init calls; `ShapeProxy` then sends the secret as the bearer token.

### Hyperdrive and the Workers

`pnpm deploy` creates or updates:
- the `ChatDatabase` Hyperdrive config, whose origin is the project's direct host, with its query cache off so an answer's history sees the latest writes;
- ChatApi, bound to Hyperdrive, with Workers Logs and Traces persisted. It has no Cron Trigger: nothing answers on the server;
- the `FlowExecution` Durable Object class, hosted by ChatApi with SQLite storage, one object per remote flow execution. Its engine keeps its runs in the schema `smithers_flows` of the same Postgres, through the same `ChatDatabase` Hyperdrive config, and migrates that schema on its first alarm ([remote-flows.md](features/remote-flows.md));
- the site Worker with the app's assets, bound to ChatApi, with Workers Logs and Traces persisted.

### Credentials

Set these in the environment of `pnpm plan`, `pnpm deploy` and `pnpm destroy`. Alchemy also loads `apps/mvp/.env`, which git ignores: keep identifiers such as `CLOUDFLARE_ACCOUNT_ID` and `NEON_ORG_ID` there, and secrets in your shell or a secret manager, never in a file in the repository. ChatApi reads its settings with Effect `Config` while Alchemy plans it, and Alchemy binds each one that is set to the Worker as a secret.

| Variable | Required | Used by | Notes |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | yes | Alchemy | at least Workers Scripts, Containers and Hyperdrive edit, and Secrets Store edit for Alchemy's state store. `pnpm exec alchemy profile edit` instead sets up a profile through OAuth, in an interactive terminal. |
| `CLOUDFLARE_ACCOUNT_ID` | yes, with the token | Alchemy | |
| `ALCHEMY_PASSWORD` | yes | Alchemy | encrypts the database URL and Electric's secret in the stack's state |
| `NEON_API_KEY` | yes | Alchemy | creates the Neon project |
| `NEON_ORG_ID` | with a personal API key | Alchemy | the Neon organization that owns the project; an organization API key implies it. It can't change after creation. |
| `CEREBRAS_API_KEY` | yes | ChatApi | or the credential `CHAT_MODEL` names |
| `CHAT_MODEL` | no | ChatApi | the model endpoint's default model ([model-endpoint.md](features/model-endpoint.md#configuration)) |
| `MODEL_DAILY_TOKEN_BUDGET`, `MODEL_MAX_OUTPUT_TOKENS`, `MODEL_MAX_MESSAGES`, `MODEL_MAX_REQUEST_BYTES`, `MODEL_RESERVATION_EXPIRY` | no | ChatApi | [model-endpoint.md](features/model-endpoint.md#configuration) |
| `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` | for sign-in | ChatApi | the Smithers GitHub App's client; without them nobody can sign in, so nobody can ask ([sign-in.md](features/sign-in.md#configuration)) |
| `GITHUB_REPOSITORY`, `SESSION_MAX_AGE_DAYS`, `ROLE_RECHECK_MINUTES` | no | ChatApi | [sign-in.md](features/sign-in.md#configuration) |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` | for issues | ChatApi, FlowExecution | the Smithers GitHub App's ID and private key; without them nothing syncs or writes to GitHub ([issues.md](features/issues.md#configuration)) |
| `GITHUB_WEBHOOK_SECRET`, `GITHUB_API_URL` | no | ChatApi, FlowExecution | the webhook's secret (without it Reconcile alone keeps issues fresh) and GitHub's API ([issues.md](features/issues.md#configuration)) |
| `CODE_STORAGE_ORG`, `CODE_STORAGE_KEY` | for cloning | ChatApi, FlowExecution | the Code Storage organization (`smithers`) and its ES256 key; without them the deployment clones nothing and browses only what was cloned ([repo.md](features/repo.md#configuration)) |
| `GITHUB_TOKEN`, `CODE_STORAGE_API_URL`, `REPO_MAX_REPOSITORIES`, `REPO_MAX_STORED_GB`, `REPO_MAX_READ_GB_PER_MONTH`, `REPO_MAX_SIZE_MB`, `REPO_BUDGET_USD`, `REPO_TREE_MAX_PATHS`, `REPO_CLONE_DEADLINE` | no | ChatApi, FlowExecution | [repo.md](features/repo.md#configuration) |

Leave `SESSION_SECRET` unset: Alchemy generates it once (`infra/SignIn.ts`) and binds it to ChatApi. Leave `DATABASE_URL`, `ELECTRIC_URL`, `ELECTRIC_SECRET`, `ELECTRIC_SECRET_AS` and `ELECTRIC_SOURCE_ID` unset for a deploy: the stack provides the database and Electric, and a set `ELECTRIC_URL` or `ELECTRIC_SECRET` replaces the binding ChatApi gets from the stack. They are for local runs.

### Deploy

1. Set the credentials above.
2. `pnpm plan` shows what `pnpm deploy` would create, update or run, and changes nothing.
3. `pnpm deploy` creates the Neon project, runs the migrations, then creates Hyperdrive, Electric's container and gateway, ChatApi and the site. It prints the site's URL.
4. Check it:

   ```sh
   curl -i https://<site>/api/auth/session                                       # 200 {"signedIn":false,"available":true}
   curl -i -X POST https://<site>/api/questions -H 'content-type: application/json' \
     -d "{\"id\":\"$(uuidgen)\",\"answerId\":\"$(uuidgen)\",\"text\":\"Say hi.\"}"     # 401: asking needs a Member
   curl -i 'https://<site>/api/shapes/messages?offset=-1'                         # 200 with electric-handle
   ```

   Then sign in at `<site>/app` as a Member of `GITHUB_REPOSITORY` and ask: the browser's agent answers.

5. Watch ChatApi in the Cloudflare dashboard: Workers Logs (`message = chat.answer.write` for answers the browsers' agents settle, `model.proxy.serve` for their model calls) and Traces. [observability.md](observability.md) lists every record.

`pnpm destroy` removes the Workers, the container, Hyperdrive and Electric's secret, and keeps the Neon project.

### Limits

- **Answers run in browsers.** ChatApi answers nothing itself: each answer is a run on the asking browser's engine ([agent.md](features/agent.md)), so an answer pauses while that browser has no tab of the app open and resumes when one opens. An answer whose browser never comes back stops holding up later answers once it has gone `ANSWER_TURN_LIVE_SECONDS` without a write, and the remote flow `chat/Expire`, which ChatApi starts for every question it takes, settles it `failed` (`abandoned`) once its queue (it, and the earlier answers in its conversation) has been still for `ANSWER_EXPIRY` (25 minutes) ([agent.md](features/agent.md#settling)).
- **Budgets.** The model endpoint refuses calls once the deployment's tokens for the UTC day reach `MODEL_DAILY_TOKEN_BUDGET`, and bounds each call's output tokens and messages; a call whose spend is unknown (cancelled, failed, or never reported) counts at its worst case ([model-endpoint.md](features/model-endpoint.md#budget)). There is no budget per person yet.
- **Connections.** ChatApi opens one Postgres connection per request, within Workers' limit of six open connections per invocation.
- **Shape log.** Electric logs each update of a row with the new value of every column it changed, and appending to an answer changes its `text`, so every write of a streaming answer logs the whole answer so far. An answer of `L` characters written in `n` appends adds about `L × n / 2` characters to the shape log: measured on the compose Electric, 20 appends of 40 characters logged 15 KB for an 800-character answer. The browser's agent writes an answer's text at most once a second while it streams (`partsEvery`), so an answer that streams for 40 seconds is written about 40 times and logs about 20 times its length (`L × n / 2`); a fast model's answer logs a few times its length ([agent.md](features/agent.md#streaming)). `REPLICA IDENTITY FULL` adds nothing to the shape log, since Electric logs only changed columns; it adds each row's old values to Postgres' WAL.
- **Electric's container.** One instance serves every shape request. It starts on the first request, which waits until Electric listens, and Cloudflare may stop it when it is idle. Its disk doesn't survive a stop: Electric then rebuilds its shapes from Postgres and clients refetch them. While Electric is stopped, Postgres keeps the WAL its replication slot hasn't read.
- **HTTP/1.1 locally.** Electric's client warns that plain `http://` limits a browser to about six connections per origin. Cloudflare serves the site over HTTP/2, so production doesn't have that limit.
