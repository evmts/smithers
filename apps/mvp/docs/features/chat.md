# Chat with Smithers

## What the user does

1. Opens the app (`/app`) and presses ⌘K (Ctrl+K), or clicks Chat ⌘K.
2. Types a message and presses Enter or Send.
3. Hides the chat with ⌘K again, Esc, or the Hide button.
4. Sees their message at once, then Smithers' answer growing as it streams.
5. Sees the same conversation, live, on every other device that has the app open. Closing or reloading a tab mid-answer doesn't stop the answer.
6. Sees the most recent 50 messages, and clicks Load earlier for the 50 before them, while there may be more.

If Smithers can't answer, the answer says "Smithers couldn't answer. Try again."

If sync stops, the app says "Smithers lost its connection." with Try again, above the conversation it has, or alone when the conversation hasn't opened yet. It clears by itself once sync is back, and Try again or the browser coming back online syncs at once.

## How it works

```
browser ── TanStack DB collection "messages" ◀── Electric shape ◀── GET /api/shapes/messages ◀── Electric ◀── Postgres
        └─ ask: optimistic insert ── POST /api/questions ── ChatApi ── INSERT question + answer ──▶ Postgres
                                                              └─ waitUntil: load ─ stream (HostModel) ─ settle ── UPDATE answer ──▶ Postgres
```

- **Postgres** holds the conversation (`messages`). It is the only source of truth, and its `position` column orders it.
- **Electric** streams the `messages` table to every device. Browsers reach it only through ChatApi's shape proxy, so the Electric URL and secret stay on the server.
- **ChatApi** (`worker/ChatApi.ts`) is an Alchemy Effect-native Worker. It reaches Postgres through Hyperdrive.
  - It inserts the question and an empty streaming answer in one transaction, starts answering, then answers 202 with the transaction id.
  - It answers in the background (`WorkerExecutionContext.waitUntil`), whether or not the asking tab stays. See [Answering](#answering).
  - It writes the answer as it grows, then settles it.
  - A sweep, once a minute (a Cron Trigger), starts answering again for stuck answers, and settles those past their attempts or age as abandoned.
  - Its code: `Chat.ts` (routes, dispatch, sweep), `Answer.ts` (answering), `Messages.ts` (every SQL statement), `ShapeProxy.ts`.
- **The browser** (`src/features/chat/`) holds the conversation in a TanStack DB collection backed by Electric. Its state machine, the Effect boundary and the wrappers are in [state.md](../state.md).
  - **History is paged.** The collection syncs on demand: Electric sends only the rows the window query asks for, the most recent 50 by `position` (`subset__order_by`, `subset__limit` through the shape proxy), plus every change after the tab opened. Load earlier widens the window by 50 and Electric sends the next page (`subset__where` on `position`). A browser never downloads the whole conversation.
  - **Asking** inserts both rows optimistically, then the collection's `onInsert` posts `POST /api/questions`. One 15 s deadline covers the whole request, reading the body included; past it the request is aborted. On 202, or 200 for a question already there (a retry), it waits up to 15 s until Electric delivers both rows. TanStack DB keeps the optimistic rows until then, so they never vanish before the synced ones arrive.
  - If ChatApi doesn't answer in 15 s, answers anything but 200 or 202 (409 included), or Electric doesn't deliver the rows in time, the rows roll back. The tab keeps the question and a failed answer in memory, where they were shown, so the answer reads the failure copy. They never reach Postgres or another device. If the question reached Postgres after all, its synced rows replace them.
  - **Sync health** is part of the state machine: `syncing` until a shape request succeeds, `ready`, or `failed` with a reason. Shape requests that fail on the network or with 5xx retry after a backoff (1 s, doubling to 10 s) forever. When none has succeeded for 10 s, at open or once one failed, sync is `failed` (`unreachable`) and recovers by itself when a request succeeds. A 4xx is `failed` (`refused`) and waits for Try again. Try again, and the browser's `online` event, retry every waiting request at once.
  - The composer's open state and draft, which answers this tab asked for, sync health and the history window are local-only collections for that tab. While one of this tab's answers is streaming, the composer doesn't send.
  - Every TanStack DB and Electric API is used through an Effect wrapper (`src/lib/collections.ts`).

## Contract

### `messages` (Postgres)

| Column | Type | |
|---|---|---|
| `id` | `uuid` primary key | chosen by the browser, so asking is idempotent |
| `role` | `text` | `user` or `assistant` |
| `text` | `text`, default `''` | |
| `status` | `text` | `done`, `streaming` or `failed` |
| `question_id` | `uuid` | an answer's question; null for a question |
| `failure` | `text` | when failed: `rate_limited`, `model_error`, `empty` or `abandoned` (see below) |
| `model_id`, `stop_reason` | `text` | set when an answer settles; `stop_reason` when the model gave one |
| `input_tokens`, `output_tokens` | `integer` | set when an answer settles, when the model reported them |
| `attempts` | `integer`, default `0` | how many times streaming the answer has started; each attempt takes the next number |
| `position` | `bigint` identity | the conversation's order |
| `created_at`, `updated_at` | `timestamptz` | display and diagnostics only |

Failures:

| `failure` | When |
|---|---|
| `rate_limited` | the model answered 429 |
| `model_error` | any other model failure |
| `empty` | the model finished with no text |
| `abandoned` | the sweep found it stuck (`streaming`, no write for 60 s) after 3 attempts, or 10 minutes after it was asked |

A question ChatApi didn't take has no row and no `failure`: the asking tab shows it failed from its own memory (above).

Rules:
- An answer only changes while `streaming`, and only by its latest streaming attempt. A streaming attempt starts by emptying `text` and taking the next `attempts`; every later write is fenced on `status = 'streaming'` and that number, so a late writer, or an earlier attempt still running, changes nothing.
- Settling is one update to `done` or `failed`.
- An answer still `streaming` with `updated_at` older than 60 s is stuck. ChatApi's sweep settles it `failed`/`abandoned` once `attempts` reaches 3 or it was asked over 10 minutes ago, and otherwise starts answering it again.
- A question's answer takes the next `position`: asks hold a transaction lock, so they also commit in `position` order.
- Ids are stored lowercase, as Postgres prints a `uuid`.
- `db/migrations/0001_messages.ts` creates the table, with these values as `CHECK` constraints; `0002_answer_attempts.ts` adds `attempts`.

### `POST /api/questions`

- **Body:** `{ "id": uuid, "answerId": uuid, "text": string }`, two different UUIDs, where `text` is 1 to 8,000 characters after trimming. The question is stored trimmed.
- **Responses:**

  | Status | Body | When |
  |---|---|---|
  | `202` | `{ "txid": number }` | both rows inserted; answering has started |
  | `200` | `{ "txid": null, "existing": true }` | a retry: this question is already stored, with the same text and `answerId`; nothing is written, and answering starts again if the answer is still `streaming` and isn't running in this isolate |
  | `400` | `{ "message" }` | invalid body, malformed UTF-8 included |
  | `405` | | another method |
  | `409` | `{ "message": "id belongs to another message." }` | `id` is taken by another message: a different question, the same text with another `answerId`, or an answer; nothing is written |
  | `409` | `{ "message": "answerId belongs to another message." }` | `answerId` is taken; nothing is written |
  | `413` | | body over 64 KB, declared or streamed |
  | `503` | `{ "message" }` | Postgres can't be reached; nothing is written |

  `txid` is the inserting transaction's id (`pg_current_xact_id()`), the one Electric reports for both rows. A retry has no transaction to wait for: the client reconciles from the rows Electric already has, or delivers next. Ids compare case-insensitively, and the text after trimming.
- **What the model sees:** Smithers' instructions, then the most recent finished (`done`) exchanges before the answer, oldest first, then the question. Going back from the newest, the exchanges stop at the first one that would pass 19 exchanges, or 24,000 characters of questions and answers in all. A failed or still-streaming exchange is left out.
- **Writing the answer:** the first text is written as soon as it arrives, then at most every 150 ms (`text = text || $delta WHERE status = 'streaming' AND attempts = $attempt`).
- **Budgets:** the model writes at most `CHAT_MAX_OUTPUT_TOKENS` tokens (2,000) per answer, sent as `GenerationParams.maxTokens`. One isolate streams at most `CHAT_MAX_CONCURRENT_ANSWERS` answers (8) at once; the rest wait their turn. Neither bounds the deployment as a whole: a global admission budget, per person or overall, needs sign-in to know who is asking.

### Answering

ChatApi answers after its response, in `WorkerExecutionContext.waitUntil` (`Chat.Background`), whether or not the asking tab stays. Cloudflare keeps that work alive for about 30 seconds after the response, so the sweep finishes what it cuts off.

- **Dispatch** (`Chat.ts`) starts a run of `Answer.run` in `Background`, at most once per answer at a time in an isolate: a dispatch while the answer runs there is `running`. ChatApi dispatches on a new question (`ask`), on a retry whose answer is still `streaming` (`retry`), and from the sweep (`sweep`).
- **A run** (`Answer.ts`) loads the question and its history, then claims a streaming attempt: it empties `text` and takes the next `attempts`. It streams the model, writes its text every 150 ms, then settles the answer, each write fenced on that attempt. A model failure settles the answer `failed`; a Postgres failure ends the run with the answer still `streaming`. A later run starts the text over, so it never appends to an earlier run's text, and an earlier run still streaming in another isolate is fenced out at its next write.
- **The sweep** (`Chat.ts`, once a minute) finds stuck answers: `streaming`, with no write for 60 s. Those with 3 attempts, or asked over 10 minutes ago, are settled `abandoned`; the rest are dispatched again.

### `GET /api/shapes/messages`

- **Request:** the Electric client's shape protocol, passed through to Electric with `table=messages` fixed on the server. Only the Electric client's protocol parameters (`ELECTRIC_PROTOCOL_QUERY_PARAMS` in `@electric-sql/client`) are forwarded: `offset`, `handle`, `live`, `cursor`, `live_sse`, `experimental_live_sse`, `expired_handle`, `log`, `cache-buster` and the `subset__*` parameters. `table`, `where`, `params`, `columns` and `replica` are dropped, so the browser can't change the shape. ChatApi adds `secret` when `ELECTRIC_SECRET` is set, and Electric Cloud's `source_id` when `ELECTRIC_SOURCE_ID` is.
- **Response:** Electric's, streamed through: status, body and headers. `content-encoding` and `content-length` are dropped, as Electric's proxy guide says, because `fetch` has already decoded the body. `access-control-*` are dropped too, since the app calls ChatApi from its own origin.
- **Errors:** `405` for another method; `502` when Electric can't be reached.

### `POST /api/telemetry/v1/{logs,traces,metrics}`

The browser's OTLP/HTTP JSON exports. `OtlpRelay.serve` (`@smthrs/observability`) re-emits each record as one ChatApi log line; see [observability.md](../observability.md).

## Configuration

| Variable | Default | |
|---|---|---|
| `CHAT_MODEL` | Cerebras `qwen-3.8-27b` (see `worker/ChatApi.ts`) | a Smithers configured-model record, as JSON |
| `CHAT_REASONING_EFFORT` | `low` | |
| `CHAT_MAX_OUTPUT_TOKENS` | `2000` | a positive integer: the most tokens the model writes per answer |
| `CHAT_MAX_CONCURRENT_ANSWERS` | `8` | a positive integer: the most answers one isolate streams at once |
| the record's credential | none | for example `CEREBRAS_API_KEY` |
| `DATABASE_URL` | the compose Postgres, `postgresql://smithers:smithers@localhost:54321/smithers` | `pnpm db:migrate` and the tests connect to it; ChatApi reaches it through Hyperdrive, which `alchemy dev` passes straight through |
| `ELECTRIC_URL` | `http://localhost:30001` | |
| `ELECTRIC_SECRET` | none | required in production; sent as `secret` |
| `ELECTRIC_SOURCE_ID` | none | Electric Cloud's source id; sent as `source_id` |

ChatApi reads these with Effect `Config` while Alchemy plans it, and Alchemy binds each one that is set to the Worker as a secret. See [infrastructure.md](../infrastructure.md) for production.

## Run it

- `pnpm db:up` starts Postgres and Electric (`docker-compose.yml`); `pnpm db:down` stops them.
- `pnpm db:migrate` applies `db/migrations`.
- `pnpm dev` runs `alchemy dev`, serving the app and both Workers at http://localhost:1337, with the sweep's cron in local workerd.

## Tests

- **Unit (`pnpm test`):**
  - The browser's Effect wrappers (`src/lib/collections.test.ts`) against real local-only collections and real Electric shapes.
  - The browser's state machine (`src/features/chat/chat.test.ts`, `src/boot.test.ts`), built by the same `appLayer` the browser uses, against ChatApi's real handler (`src/test/chatApi.ts`), with a scripted model as above. Each test gets its own schema in the database Electric replicates, made by `db/migrations` and dropped after, so it never touches the dev conversation: ChatApi reaches it through the connection's `search_path`, and its Electric requests name it in `table`. Faults are injected only on the network: `POST /api/questions` dropped, answered 503, delivered twice, beaten by a conflicting writer or stalled after its headers; shape requests dropped or answered 400; and Electric held back or unreachable from ChatApi. They need `pnpm db:up`.
  - `POST /api/questions` from the browser's side (`src/features/chat/api.test.ts`) against a local HTTP server: a body that stalls after 202 fails at the deadline and the server sees the request aborted.
  - ChatApi's handlers (`worker/ChatApi.test.ts`) against the compose Postgres and Electric, with a scripted model through `HostModel`. Answers run in a fiber where ChatApi uses `waitUntil`; a run cut off mid-stream and two overlapping runs are driven through `Answer.run`. They use the database `<name>_test` beside `DATABASE_URL`'s, never the dev conversation. They skip with a message only when Postgres or Electric refuses the connection or can't be reached; any other setup or migration failure fails them.
- **End to end (`pnpm e2e`):**
  - Real browsers, Worker, Postgres, Electric and model; no mocks. Every test records video.
  - Coverage includes ⌘K, asking, two devices, a reload mid-answer (the answer still completes), offline asking, late joiners, concurrent asks, and sync down at boot (the lost-connection view, then Try again).
- **Benchmarks (`pnpm bench`):** see [benchmarks.md](../benchmarks.md).
- **Observability:** see [observability.md](../observability.md).
