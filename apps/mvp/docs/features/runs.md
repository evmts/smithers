# Runs

Every flow this device runs is a run of its durable engine. `/app/runs` lists them, and a run's page shows what it did: its steps with each one's input and output, its timeline and its journal, with Stop, Retry and Resume. Decision: [0014](../decisions/0014-flows-authoring-debugging-and-home-view.md) §3, §5 and §6.

## Where a run is read

```
/app/runs/<runId> ─ loader ─▶ openRun ─▶ BrowserEngine.inspect(runId, { limit: 500 })
   the leader tab's engine worker ─▶ RunInspection (@smthrs/engine-store) over SQLite on OPFS
   every value: Redaction, Schema.Redacted as <redacted>, a value its schema won't read as <withheld>, cut at 16 KiB
BrowserEngine.events ─ debounced 200 ms ─▶ the open run, and the list while it shows, read again
```

- **The engine holds the journal.** No journal is copied into Postgres: the page reads this device's engine through `BrowserEngine.inspect` and `list`, which `@smthrs/platform-browser` answers from the leader's `RunInspection`. A run the engine doesn't hold reads `On another device`; an engine that can't be reached, `Couldn't read this run`.
- **Values are content.** The leader releases every value through `@smthrs/journal`'s `Redaction`, renders it through its flow's or step's own schema so a `Schema.Redacted` value reads as `<redacted>` at any depth, withholds one its schema no longer decodes (`<withheld>`), reduces a failure to its closed code, and cuts it to 16 KiB. The page shows values as text, collapsed. The engine records no input for an action step; a child run's input is its step's input.
- **Live.** Every event the leader commits reads the open run, and the list while it shows, again, at most once per 200 ms. Nothing polls.
- **Not built in this slice:** runs of other devices and of Cloudflare (0009's `runs` rows, `GET /api/runs/:id/trace`), a repository's runs at `/$owner/$repo/actions`, the read-only scrubber, and Answer in place: a run waiting on a person links to the conversation, where the agent's question is (decision 0015).

## The run page

| Part | What it shows |
|---|---|
| Header | The flow, its state in 0009's words (`Queued`, `Working`, `Waiting`, `Stopping`, `Stopped`, `Failed`, `Done`), the time it took, `This device`, and the acts |
| Input, Result | The run's payload and its answer |
| Steps | The plan's action calls and child boundaries, and the runs this run started (an agent's cell calls, a person's flow's pinned child), in the order they started. The selected one's input, output, attempts (`1 ✕ FlowsUnavailable · 2 ✓`) and wait; a child links to its own page |
| Timeline | One bar per step on a shared axis |
| Journal | Sequence, type and time of each event, its payload on demand, and More for the next 500 |

The pure model of the page is `src/features/runs/page.ts`; the components come from `@smthrs/ui` (`RunHeader`, `SpanTree`, `SpanDetail`, `RunWaterfall`, `RunJournal`, `JsonValue`, `RunList`).

## Acts

Each act is a registered flow on this device's engine, model-invocable, so a person's button and the agent's cell run the same declaration (`src/features/runs/flows.ts`). A refusal is `RunActRefused { code }`, and the page says it in a line.

| Act | Shown | Does |
|---|---|---|
| `run/cancel { runId, seq }` | Stop: while the run hasn't settled and no stop was asked | Records the cancellation and interrupts the run (`FlowRuntime.interrupt`). A run that settled meanwhile answers its final status, `{ outcome: "settled" }`; a `seq` past the run's journal is `stale` |
| `run/retry { runId, version }` | Retry, and Retry latest for a person's flow: once the run settled | Runs the same flow with the same payload as a new run of its own: `pinned` keeps the revision the run ran, `current` drops it. The act runs as `retry:<runId>:<n>`, the n-th retry from this device, and its new run is `<act>/run`, so a second press starts no second run. Its page opens. `not_settled`, and `not_retryable` for a flow only a person or the app starts (an answer, a draft's answers, a pinned child) or an act |
| `run/resume { runId, seq }` | Resume: while it waits, or runs and has recorded nothing for a minute | Drives it again (`FlowRuntime.resume`); a durable timer is never skipped. A run that moved since the page read it is `stale`; a settled one, `settled` |
| `run/list {}`, `run/inspect { runId }` | the agent | The newest runs, acts left out; one run's status, steps and result text |

`seq` is the run's last journal sequence the page read (`RunSummary.lastSeq`). Every act is refused `not_found` for a run this engine never held and `not_here` for a flow it doesn't run. A store that can't be read, or can't record a cancellation, fails the act's step instead, and the page says `Couldn't reach the engine.` A retried run, and a draft's next round, start without the step's `FlowInstance` in their context (`startRoot`, `src/features/runs/start.ts`), so the engine records no parent: each outlives the act that started it and lists among the person's runs.

## The browser

`src/features/runs/` follows the [state rules](../state.md): `RunsStore` holds the list (`runs`), each open run's read (`run-pages`) and the run view (`run-view`: the run shown, the step selected, the tab, an act in flight and why one was refused), all local collections; `Runs` binds them for frontends. The routes' loaders call `openList` and `openRun`; Stop, Retry and Resume dispatch through `FlowDispatch`, door `button`. Nothing is kept on the device: a reload reads the engine again.

## Observability

| Record | Kind | Fields |
|---|---|---|
| `run.inspect` | log, span (engine worker) | `host` (`local`), `outcome` (`read`, `not_found`, `failed`), `events`, `bytes`, `clipped`, `durationMs` |
| `run.read` | log (tab) | `act` (`run`, `list`), `outcome`, `events`, `durationMs` |
| `smithers_run_reads` | counter (tab) | `read`, `outcome` |
| `run.act` | log (engine worker) | `act` (`cancel`, `retry`, `resume`), `runId`, `outcome` (`requested`, `settled`, `retried`, `resumed`, or the refusal's code) |
| `smithers_run_acts` | counter | `act`, `host`, `outcome` |

No record carries a value of a run.

## Tests

| Test | Proves |
|---|---|
| `packages/smithers/flows/engine-store/test/RunInspection.test.ts` | One read on SQLite and Postgres: redaction, the 16 KiB cut, no `Schema.Redacted` value at any depth (a sentinel), `<withheld>` for a value its schema won't read, closed failure codes, gap-free paging while the run appends, `RunNotFound`, and the list |
| `packages/smithers/flows/platform-browser/test/RunReads.test.ts` | `inspect` and `list` through the real worker protocol, the sentinel never on the wire |
| `src/features/runs/runs.test.ts` | Every act on the Node host's engine: Stop on a live run and on a settled one, a stale fence, Retry once per act, pinned and current, every refusal, Resume of a run whose engine died, and runs of a flow the engine doesn't run |
| `src/features/runs/page.test.ts` | The steps, the selected step, the journal with More, the acts a run offers, and the list's rows |
| `src/features/flows-ui/tab.test.ts` | The run page from a tab following a run to its answer, Retry opening the new run, the list, Stop, and Resume refused |
| `e2e/flows.spec.ts` | In a real browser: create a flow, run it, watch its run page, stop a run and retry it; open a drafted flow's code, run it, relabel its step, and see Run refused with `Needs a sandbox` |

Run them with the compose Postgres and Electric up (`pnpm db:up`): `pnpm exec vitest run src/features/runs src/features/flows-ui`.
