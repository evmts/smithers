# Benchmarks

`pnpm bench` measures the chat app against `alchemy dev` or any deployment, in real Chromium and over plain HTTP from Node. Nothing is mocked: it uses the real app, ChatApi Worker, Postgres, Electric and model. It checks every answer and compares the run with a baseline.

## Run it

| Where | Command |
|---|---|
| Local | Start `pnpm db:up` and `pnpm dev` (`alchemy dev`, http://localhost:1337), then run `pnpm bench`. |
| Live | `BASE_URL=https://<host> pnpm bench` |

- The bench never starts or restarts the server. It waits up to 120 s for `<BASE_URL>/app`, then exits. If `GET /api/shapes/messages?offset=now` fails, it exits at once.
- A default run asks the model 24 questions (1 + 3 × 5 + 4 × 2) in the shared conversation that everyone sees, on the deployment's model key. Locally, the baseline run took 55 s and spent 65K input tokens.

| Option | Environment | Default | |
|---|---|---|---|
| `--n <count>` | `BENCH_N` | `10` | Iterations of the suites that don't ask the model: `load`, `cmdk` and `shape`. |
| `--n-answer <count>` | `BENCH_N_ANSWER` | `5` | Iterations of the suites that ask the model: `question`, `answer` and `sync`. |
| `--concurrency <P>` | `BENCH_CONCURRENCY` | `4` | Asks sent at once by the `concurrent` suite. |
| `--bursts <count>` | `BENCH_BURSTS` | `2` | How many times `concurrent` sends P asks at once. |
| `--only <suites>` | | `load,cmdk,shape,question,answer,sync,concurrent` | Suites to run, comma-separated. |
| `--threshold <fraction>` | `BENCH_THRESHOLD` | `0.25` | Slowdown that counts as a regression. |
| `--floor-ms <ms>` | `BENCH_FLOOR_MS` | `5` | A regression must also be this many ms slower. |
| `--update-baseline` | | off | Make this run the baseline for its `BASE_URL`. |
| | `BASE_URL` | `http://localhost:1337` | Where the app runs. |

| Exit code | Meaning |
|---|---|
| 0 | Every check passed and nothing regressed, or the baseline was updated. |
| 1 | A correctness check failed, or a p50 or p95 regressed. |
| 2 | Bad option, or the server or its shape never answered. |

The bench's own tests: `node --test bench/`. Typecheck: `tsc -p bench`.

## Method

A run starts one headless Chromium and one **follower**. The follower is a Node client that follows the `messages` shape live through ChatApi's proxy for the whole run, from `offset=now`. It records when Electric delivers each row, each change to it and each transaction id (`txid`). The run asks a seed question, then runs the suites in order: `load`, `cmdk`, `shape`, `question`, `answer`, `sync` and `concurrent`. Nothing records video or traces.

**Seed.** A throwaway page asks one question (`bench-<run>-seed`) and its timings are discarded. This warms the dev server's module transforms, the model connection and Electric. It also gives the `load` and `shape` suites a newest message to look for. If the seed's answer fails its check, no suite runs.

**No browser storage.** A page keeps the conversation in an in-memory TanStack DB collection and syncs it from Electric's shape on every load. Nothing is stored in OPFS and no worker is shared, so "cold" and "warm" differ only in the HTTP cache. Both sync from Electric.

| Metric | Suite, where | Start | End |
|---|---|---|---|
| **Cold load** | `load`, page | Navigation start in a new browser context, with no HTTP cache or cookies | |
| TTFB | | | `responseStart` of the navigation entry |
| FCP | | | Chromium's `first-contentful-paint` entry |
| LCP | | | The last `largest-contentful-paint` entry, read once chat is usable |
| Chat usable | | | The Chat ⌘K button is in the DOM. The `/app` route suspends until the conversation's first snapshot from Electric, so this is when the synced conversation renders. |
| Newest message shown | | | The seed question is in the conversation |
| **Warm load** | `load`, page | A reload of the same context. The page syncs from Electric again. The HTTP cache may hold the app's modules and Electric's non-live shape responses. | The same five marks |
| **⌘K** | `cmdk`, page | `timeStamp` of the ⌘K `keydown` | The composer receives `focusin`. Esc hides it between presses. |
| **Shape initial sync** | `shape`, Node | `GET /api/shapes/messages?offset=-1`, with no handle | The response that ends with `up-to-date`, after following `electric-offset` and `electric-handle` |
| **API: POST to 202** | `question`, Node | `POST /api/questions` sent | Its response headers |
| **API: POST to txid** | | Same | The follower receives a change carrying the 202's `txid`: the question's row, confirmed by Electric |
| **API: POST to first answer text / to done** | | Same | The follower sees the answer row's first non-empty `text`, and its `status` leave `streaming` |
| **UI: ask to question shown** | `answer`, page | `timeStamp` of the Enter `keydown` | The question is in the asking page's DOM: TanStack DB's optimistic insert |
| **UI: ask to first answer text / to done** | | Same | The answer shows its first text, and its `data-streaming` turns `false`. ChatApi writes both; Electric delivers them. |
| **Fan-out: question, A to B** | `sync`, two pages | A's Enter `keydown` | The question is in B's DOM |
| **Fan-out: answer done on B** | | Same | B's answer turns `data-streaming="false"` |
| **Concurrent asks: POST to 202 / to txid / to done** | `concurrent`, Node | P `POST /api/questions` sent at once | As for the API metrics. Each burst starts after the last burst's answers settle. |

`concurrent` also counts each HTTP status, each 429, and each failure.

- **Two devices.** A and B are separate browser contexts. Each holds its own collection and its own Electric long-poll. Neither writes the answer: both receive it from Electric.
- **Clocks.** Every time is compared as `performance.timeOrigin + performance.now()`, both in the pages and in Node. Everything runs on one machine and shares its clock.
- **"Shown"** means the element reached the DOM. A `MutationObserver` callback runs right after React commits, and the frame paints within one frame after that.
- **Event timestamps.** `event.timeStamp` is when the browser created the input event, so input delay counts.
- **Unique words.** The conversation is shared and persistent, so every question asks for a unique word: `bench-<run id>-<suite letter><i>`, as in `-a3`, `-s0`, `-q1` or `-c0x2`.
- **Statistics.** p50 and p95 use linear interpolation between the closest ranks (NumPy's default) and are reported with min and max. At N=10, p95 lies between the 9th and 10th slowest samples. At N=5 it lies between the 4th and 5th, which is nearly the max.

The code:

| File | Holds |
|---|---|
| `bench/probe.ts` | The in-page instrumentation |
| `bench/chatapi.ts` | The Node side: `POST /api/questions`, the initial sync and the follower |
| `bench/suites.ts` | The suites |
| `bench/stats.ts` | The statistics and the baseline comparison |

The bench relies on these contracts. A change that breaks one fails a check or times out:

- **UI:**
  - the `Conversation` region;
  - `article[data-role]` messages, with the answer right after its question;
  - `[data-slot="message-response"][data-streaming]`;
  - the composer form's `data-status`;
  - the "Message Smithers" textbox;
  - the Chat button with `aria-keyshortcuts`.
- **HTTP** ([chat.md](features/chat.md#contract)):
  - `POST /api/questions` answers `202 { txid: number }`.
  - `GET /api/shapes/messages` speaks Electric's protocol: `offset=-1`, `offset=now`, `live`, `handle` and `cursor` in the request, and `electric-offset` and `electric-handle` in the response.
  - Each change message carries `headers.txids`.

## Correctness checks

Every iteration checks its result, and any failed check fails the run.

- Every answer contains the word it was asked for, on the page and in the answer row Electric delivered.
- The question appears exactly as asked: on the asking page, on B in `sync`, and in its row in `question`.
- B's finished answer equals A's.
- Every answer row settles `done`.
- ChatApi answers 202 with a numeric `txid`, and Electric delivers that `txid`.
- The shape's initial sync holds the run's newest question.
- After ⌘K, the composer has focus.
- Each load reports TTFB, chat usable and newest message shown.

**429s.** An answer the model refused with 429 (`failure: rate_limited`) is not a latency sample.

- **`seed`, `question`, `answer` and `sync`:** the follower reads the answer's `failure`. On a 429, the iteration backs off 30 s and asks again with a new word (`…r1`). On a second 429 it backs off 60 s, and a third fails the check. The summary reports the 429s.
- **`concurrent`:** a 429 from ChatApi or from the model is counted, not failed, and the next burst backs off 30 s. Any other failure fails the check: a status other than 202, a `txid` Electric didn't deliver within 15 s, an answer that failed, or an answer without its word.

A failed run still writes its results file, with `"ok": false` and the failures. It isn't compared with the baseline, and it exits 1. Chromium decides what counts as a contentful paint, so a missing FCP or LCP doesn't fail the run; the summary reports how often each was missing.

## Output

- **The terminal** shows:
  - a Markdown table with n, p50, p95, min and max per metric, and the change from the baseline;
  - the `concurrent` counts;
  - the checks and any regressions.
- **`bench/results/<timestamp>.json`** holds:
  - `env`: the jj commit (`jj log -r @ -T commit_id --no-graph`), base URL, server build (`vite-dev` or `built`), machine, OS, Chromium, Playwright, Node, date, every option, and the conversation's size: `conversationMessages` on the page, and `shape` (rows, operations, requests and bytes of its initial sync). It also records `follower` (`refetches` after an Electric 409, and request `errors`).
  - `metrics` (the summaries), `notReported`, `counts`, `checks` and `comparison`.
  - `samples`: every raw sample.
  - `details`, per iteration: each word, answer text, status and `txid`. For `load`, each page's shape requests and how many came from the HTTP cache.
- **Version control** ignores runs, except those listed in `bench/results/.gitignore`. `--update-baseline` adds the run it makes the baseline.

## Baseline and regressions

`bench/baseline.json` holds one baseline per `BASE_URL`: the p50 and p95 of every metric, plus the source run, commit, machine and server build.

- **Matching.** A run is compared only with the baseline for its own `BASE_URL`. If the baseline ran on another machine or server build, the summary warns.
- **Regression.** A statistic regresses when `current > baseline × (1 + threshold)` and `current − baseline > floor`. The floor keeps a 2 ms metric that moves to 3 ms from counting. Any regression exits 1.
- **Setting a baseline.** `pnpm bench --update-baseline` replaces the baseline for its `BASE_URL`, and only when every check passed.

**Rerun.** `results/2026-10-20T00-40-21Z.json` ran 15 minutes after the baseline on the same machine. All 84 checks passed and nothing regressed. It isn't a clean noise measure: by then another agent's work in progress had changed two things in the working copy. The browser synced on demand, loading a window of the latest 50 messages, and answering ran in a Workflow. Against the baseline:

- **Loads, ⌘K, shape sync and `POST` to 202:** p50 within ±8%, except warm TTFB (+13%, or 1.2 ms). The largest p95 increase was the shape sync's +23% (4.3 ms).
- **Fan-out of the question, and concurrent `POST` to 202 or to txid:** p50 between +15% and +20%, each under 8 ms.
- **Answer metrics:** p50 22 to 80% faster, for example UI first text at 500 ms against 1912 ms. The bench can't tell the model's variance from the Workflow change.

Treat a flagged regression as a lead, not a verdict. Before acting on it, rerun on a quiet machine with `--n 30 --n-answer 15`.

## First local results

The baseline is `results/2026-10-20T00-25-19Z.json`. It ran at commit `7f41caf1ab2f`, on 2026-10-19 at 17:25 PDT. The machine was an Apple M3 Max (Mac15,8, 64 GiB) on macOS 26.2, with headless Chromium 151 against `alchemy dev` (`vite-dev`) and the compose Postgres and Electric. The run used N=10, 5 for answering, and 4 asks at once × 2.

- **Conversation:** 42 messages. The shape synced 42 rows from 106 operations: 206 KiB in 2 requests.
- **Checks:** all 84 passed.
- **429s and failures:** none, and every concurrent ask got a 202.
- **Model use:** 24 calls and 65K input tokens. The median call was 873 input tokens.

| Metric (ms) | p50 | p95 | LiveStore p50 | LiveStore p95 |
|---|--:|--:|--:|--:|
| Cold load: TTFB / FCP | 9.0 / 284 | 11.8 / 290 | 7.2 / 230 | 13.2 / 242 |
| Cold load: chat usable = newest message shown | 598 | 604 | 707 / 998 | 717 / 1031 |
| Warm load: TTFB / FCP | 9.1 / 136 | 11.7 / 142 | 6.9 / 108 | 8.0 / 114 |
| Warm load: chat usable = newest message shown | 448 | 452 | 425 | 428 |
| ⌘K to composer focused | 1.2 | 5.5 | 1.6 | 3.8 |
| Shape initial sync, offset -1 to up-to-date | 15.5 | 18.4 | | |
| API: POST /api/questions to 202 | 26.3 | 39.8 | | |
| API: POST to the question's txid from Electric | 30.1 | 51.0 | | |
| API: POST to first answer text / to done | 2534 / 2541 | 8892 / 8914 | | |
| UI: ask to question shown | 10.2 | 15.6 | 25.1 | 27.3 |
| UI: ask to first answer text / to done | 1912 / 1931 | 2686 / 2707 | 618 | 1488 |
| Fan-out: ask on A to question on B | 40.2 | 57.3 | 70.6 | 88.7 |
| Fan-out: ask on A to answer done on B | 687 | 1326 | | |
| Concurrent asks (4 at once): POST to 202 | 39.5 | 72.8 | | |
| Concurrent asks: POST to txid from Electric | 40.4 | 74.3 | | |
| Concurrent asks: POST to answer done | 2107 | 4531 | | |

Chromium reported no LCP in any of the 20 loads (see below).

**LiveStore columns.** They come from the last LiveStore baseline, `results/2026-10-19T23-04-36Z.json`, kept as history with its rerun `23-05-21Z`. Read them as context, not as a like-for-like comparison:

- That conversation held 306 messages. LiveStore's cold "newest message shown" replayed the whole event log, so it grew with the conversation.
- Its "complete" is this table's "done".
- Its answer delta between devices has no successor: A wrote the answer then, and now neither device does.
- Two metrics moved for reasons the conversation size doesn't explain. Asking now shows the question in 10 ms, not 25 ms, and B sees it in 40 ms, not 71 ms. FCP rose by 54 ms cold and 28 ms warm, which the comparison flags as a regression. That has not been investigated: the module graph changed, and these are dev-server numbers.

## Reading the results

- **Chat usable equals newest message shown, cold and warm.** The `/app` route suspends until the conversation has loaded, so the Chat button and the conversation render in one commit.
- **The network sync is a small part of a load.** Node syncs the whole shape in 15 ms, against 598 ms to a usable page. The rest is the app's modules on Vite's dev server, booting the runtime, TanStack DB and rendering.
- **Cold minus warm (150 ms) is mostly the module cache.** The `load` details count each page's shape requests, and how many came from the HTTP cache. In the rerun, each load made 4 shape requests, and a warm reload got 1 of them from the cache. Electric marks its non-live responses as cacheable: `max-age=604800` at `offset=-1`, and 60 s after that. The baseline's counts read 0, because Vite's modules filled Chromium's 250-entry resource buffer; the probe now raises the buffer.
- **The shape replays Electric's log, not the table.**
  - 42 rows holding 43 KB of text took 206 KiB to sync, because each write ChatApi makes to a streaming answer (every 150 ms) is one more update in the shape.
  - Each update carries the whole `text` so far, so a long answer costs about its length times its number of writes.
  - Every answer streamed since Electric created the shape adds to this, so a full sync grows faster than the conversation. When Electric recreates the shape, the log starts again from a snapshot: in the rerun, 152 rows took 170 operations and 132 KiB.
- **Electric confirms a question about 4 ms after its 202** (30.1 ms against 26.3 ms at p50), so Postgres' commit reaches a live long-poll almost at once.
- **First text and done are 10 to 20 ms apart.** A one-word answer is written once and then settled: two transactions, delivered separately.
- **Answer times are the model's.** One answer took 1.0 s and another 10.0 s in the same suite.
- **Fan-out is the same for every device.** B sees A's question 40 ms after A's Enter: the POST, the commit, Electric's live response, TanStack DB and the render. A and B see the answer done within a few milliseconds of each other (687.5 against 687.2 ms in the first `sync` iteration), because both receive it from Electric.
- **Concurrent asks queue on Postgres.** Four at once reach their 202 in 40 ms at p50 and 73 ms at p95, against 26 and 40 ms one at a time. Each ask holds a transaction lock (`pg_advisory_xact_lock`) so that positions follow commit order.
- **FCP is the loading screen**: `AppLoading`'s Wordmark.
- **LCP is not reported.**
  - The Wordmark is an SVG, which isn't an LCP candidate.
  - Every message fades in from `opacity: 0` (`sui-chat-message-in` in `@smthrs/ui`), and Chromium doesn't take an element that first paints invisible.
  - The Chat button sits below the fold: with 40 messages the page is 38,700 px tall and opens at the top.
  - "Newest message shown" is the content metric.

## Limitations

- **Model and network variance dominate answer times.** Compare answer metrics over many runs.
- **The model's input depends on others.** ChatApi sends the last 19 finished exchanges of the shared conversation, up to 24,000 characters, so input size and time to first text depend on what anyone asked before. A call made after long answers carried about 5,000 input tokens; one after the bench's own short exchanges carried 873. The bench asks for one word to keep each call small. A run can still take a large share of a tokens-per-minute limit that other users of the key share.
- **A dev-server reload abandons answers.** `alchemy dev` restarts the Worker when its code changes, which stops answers being written in the background. The sweep settles them `failed`/`abandoned` after 60 s. This happened during the rebaseline, when another agent edited the Worker: the run failed its seed check, as it should.
- **One-word answers are written once.** First text and done are one write and a settle, so the bench doesn't measure a long answer streaming.
- **The browser's sync is changing.** The baseline's build synced the whole shape eagerly. Work in progress moves it to on-demand sync of the latest 50 messages, with "Load earlier" for more, so a page no longer fetches the whole shape. `conversationMessages` counts what the page shows, which can be that window. The `shape` suite still measures a full sync from `offset=-1`: what any client of the whole shape does.
- **N for the shape sync is not a parameter.** ChatApi's proxy fixes the shape to the whole `messages` table, so the bench syncs the conversation as it stands. To see scaling, compare runs as the conversation grows; `env.shape` records its size.
- **The conversation grows with every run.** A default run adds 48 messages, and every write to them adds to Electric's shape log, so loads and shape syncs slow down run over run.
- **The shape sync runs in Node.** It excludes the browser's parsing, TanStack DB and rendering; the load metrics include them. Its bytes are decoded JSON.
- **Local is not production.**
  - `alchemy dev` serves Vite's dev server: unbundled modules, React's development build and the HMR client.
  - The Worker runs in local workerd, and Hyperdrive passes straight through to the compose Postgres.
  - Electric runs in Docker on loopback.
  - Results record `server: vite-dev` or `built`.
- **One machine runs everything locally.** The browser, dev server, Postgres, Electric and other agents' e2e runs share it, and the model key too.
- **Live runs are public.** They write to the deployment's shared conversation and spend its model key.
- **The follower starts at `offset=now`.** It sees only rows written after it started. If Electric answers 409 (`must-refetch`), it starts again from `offset=now`, and a row written in between is missed and times out its check. `env.follower` counts both 409s and request errors.
- **"Shown" is DOM time, not pixel time.** The paint follows within a frame.
- **Chromium only.** FCP and LCP follow Chromium's rules, and WebKit and Firefox don't report LCP.
- **The browser is already running.** A cold load excludes browser start-up.
- **The recorded commit is the local working copy's.** On a live run, it may not be the deployed build.
- **The machine is unthrottled.** Local numbers come from an M3 Max on loopback.
- **Small N makes p95 noisy.** At N=5, p95 is nearly the slowest sample.
