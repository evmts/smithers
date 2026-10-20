# Infrastructure

The app is two Cloudflare Workers beside Postgres and Electric ([decision 0001](decisions/0001-electric-postgres-tanstack-db.md)). Alchemy (`alchemy.run.ts`) deploys the Workers and the Hyperdrive config; Postgres and Electric run as their own services.

```
browser ── site Worker ── service binding ── ChatApi Worker ── Hyperdrive ──────────────▶ Postgres
                                                 │                                (logical replication)
                                                 └─ GET /api/shapes/messages ── Electric ─────┘
```

| Piece | Local (`pnpm db:up`, `pnpm dev`) | Production |
|---|---|---|
| Postgres 14 or later, `wal_level=logical` | `postgres:17.11-alpine` at `localhost:54321` | a managed Postgres with logical replication, for example Neon |
| Electric | `electricsql/electric:1.8.1` at `localhost:30001`, no secret | Electric Cloud, or self-hosted Electric with a secret |
| Hyperdrive | `alchemy dev` passes the binding straight through to `DATABASE_URL` | the `ChatDatabase` config `pnpm deploy` creates, query cache off |
| Workers | local workerd at http://localhost:1337 | Cloudflare, Workers Logs and Traces persisted |

## Local

You need Docker with Compose v2, Node 26 (it runs the TypeScript scripts directly) and pnpm.

1. `pnpm install` in the repository root.
2. `pnpm db:up` starts Postgres and Electric from `docker-compose.yml` and waits until both are healthy.
3. `pnpm db:migrate` applies `db/migrations` to `DATABASE_URL`, the compose Postgres by default.
4. Give ChatApi a model key. The default model needs `CEREBRAS_API_KEY` in the environment; `CHAT_MODEL` selects another ([chat.md](features/chat.md#configuration)).
5. `pnpm dev` runs `alchemy dev`: the app at http://localhost:1337/app, both Workers in local workerd, and ChatApi's once-a-minute sweep.

| Task | Command |
|---|---|
| Tests (ChatApi's need Postgres and Electric up) | `pnpm test` |
| End to end | `pnpm e2e` |
| Stop Postgres and Electric, keeping the data | `pnpm db:down` |
| Delete the data too | `docker compose down -v` |
| Query the conversation | `docker compose exec postgres psql -U smithers -c 'select * from messages order by position'` |
| Is Electric up? | `curl localhost:30001/v1/health` |
| ChatApi's logs | `.alchemy/log/dev_<user>/ChatApi/` |

The tests use a database named `smithers_test` on the same server, which they create and migrate; they never touch the dev conversation.

## Production

### Postgres

- Use Postgres 14 or later with logical replication on. On Neon, turn on logical replication in the project's settings; it sets `wal_level=logical` for the project.
- Use the direct host, not a connection pooler, in `DATABASE_URL`: Electric's replication needs it, and Hyperdrive pools connections itself.
- Electric's role needs the `REPLICATION` attribute and must own `messages` or be able to add it to a publication. Neon's project owner role has both once logical replication is on. The migration sets `REPLICA IDENTITY FULL` on `messages`, so Electric doesn't need to.

### Electric

- **Electric Cloud:** add the database as a source, using the direct `DATABASE_URL`. Set `ELECTRIC_URL=https://api.electric-sql.cloud`, and the source's id and secret as `ELECTRIC_SOURCE_ID` and `ELECTRIC_SECRET`.
- **Self-hosted:** run `electricsql/electric:1.8.1` with `DATABASE_URL` (direct), `ELECTRIC_SECRET`, and a persistent `ELECTRIC_STORAGE_DIR`, behind HTTPS. Set `ELECTRIC_URL` to its origin.

Only ChatApi holds the secret. Browsers reach Electric through `GET /api/shapes/messages`, which fixes the table ([chat.md](features/chat.md#get-apishapesmessages)).

### Hyperdrive and the Workers

`pnpm deploy` plans `alchemy.run.ts` and creates or updates:
- the `ChatDatabase` Hyperdrive config, whose origin is `DATABASE_URL`, with its query cache off so an answer's history sees the latest writes;
- ChatApi, bound to Hyperdrive, with a Cron Trigger every minute for the sweep and Workers Logs and Traces persisted;
- the site Worker with the app's assets, bound to ChatApi, with Workers Logs and Traces persisted.

### Secrets

Set these in the environment of `pnpm db:migrate` and `pnpm deploy`. ChatApi reads its settings with Effect `Config` while Alchemy plans it, and Alchemy binds each one that is set to the Worker as a secret. That includes `DATABASE_URL`, although ChatApi connects only through Hyperdrive.

| Variable | Used by | Notes |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `pnpm deploy` | |
| `ALCHEMY_PASSWORD` | `pnpm deploy` | encrypts secrets in Alchemy's state |
| `DATABASE_URL` | `pnpm db:migrate`; Hyperdrive's origin | the direct host, with `?sslmode=require` |
| `CEREBRAS_API_KEY` | ChatApi | or the credential `CHAT_MODEL` names |
| `CHAT_MODEL`, `CHAT_REASONING_EFFORT`, `CHAT_MAX_OUTPUT_TOKENS`, `CHAT_MAX_CONCURRENT_ANSWERS` | ChatApi | optional ([chat.md](features/chat.md#configuration)) |
| `ELECTRIC_URL` | ChatApi | |
| `ELECTRIC_SECRET` | ChatApi | required in production |
| `ELECTRIC_SOURCE_ID` | ChatApi | Electric Cloud only |

### Deploy

1. Create the database, with logical replication on.
2. `DATABASE_URL=<direct url> pnpm db:migrate`. Run it again before deploying code that needs a new migration.
3. Connect Electric to the database.
4. `pnpm deploy`. It prints the site's URL.
5. Check it:

   ```sh
   curl -X POST https://<site>/api/questions -H 'content-type: application/json' \
     -d "{\"id\":\"$(uuidgen)\",\"answerId\":\"$(uuidgen)\",\"text\":\"Say hi.\"}"     # 202 {"txid":…}
   curl -i 'https://<site>/api/shapes/messages?offset=-1'                         # 200 with electric-handle
   ```

6. Watch ChatApi in the Cloudflare dashboard: Workers Logs (`message = chat.answer`) and Traces. [observability.md](observability.md) lists every record.

`pnpm destroy` removes the Workers and the Hyperdrive config. Postgres and Electric are yours to remove.

### Limits

- **Background answers.** Cloudflare keeps a Worker running for about 30 seconds after its response for `waitUntil` work. An answer still streaming then is cut off; the sweep starts it again within two minutes (60 seconds without a write, then the next cron), and settles it `abandoned` after 3 streaming attempts or 10 minutes. A long answer can therefore fail where a durable runner would finish it.
- **Budgets.** One answer writes at most `CHAT_MAX_OUTPUT_TOKENS` tokens, and one isolate streams at most `CHAT_MAX_CONCURRENT_ANSWERS` answers at once. There is no budget across isolates or per person yet: that needs sign-in.
- **Connections.** ChatApi opens one Postgres connection per request, and one each for loading, streaming and settling a background answer, one at a time, within Workers' limit of six open connections per invocation.
- **HTTP/1.1 locally.** Electric's client warns that plain `http://` limits a browser to about six connections per origin. Cloudflare serves the site over HTTP/2, so production doesn't have that limit.
