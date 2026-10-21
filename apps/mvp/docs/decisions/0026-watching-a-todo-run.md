# 0026: Watching a TODO's run from the browser

Status: implemented (2026-10-21) for ruling TODO-3's watching; steering is not built. Builds on [0016](0016-todos-and-the-stack.md) (the `todo` run), [0014](0014-flows-authoring-debugging-and-home-view.md) (the run page) and [0001](0001-electric-postgres-tanstack-db.md) (Electric).

A TODO starts a durable `todo` run on Cloudflare, one per attempt, `todo:<attempt id>`. Its journal lives in the engine's Postgres schema, `smithers_flows`, never on a device, and the browser's run page read only its own engine. Will asked that a running TODO link to its run, show that it is working, and let a person watch the agent (TODO-3).

## Decisions

1. **Working blinks; In review doesn't.** A Working TODO's state icon blinks slowly, one 2-second cycle, through `@smthrs/ui`'s `ItemStatus.live`, and holds steady under reduced motion through the house motion policy. In review links to its run too, steady: it waits on a person's merge, not on work.
2. **The TODO row names its run.** The writer records each attempt's execution id on its TODO, `todos.run_id`, in the transaction that records the attempt, and the row syncs to Members as before. Rejected: a route that resolves a TODO to its run (an extra round trip and a redirect before every link, and no link offline), and deriving the attempt id from the TODO (attempts are random UUIDs, and a derived id would need a hash in a pure view).
3. **The browser reads the engine's own read.** ChatApi serves `GET /api/remote-runs/<run id>` with `@smthrs/engine-store`'s `RunInspection` over the engine's schema, read-only, so the page gets the redaction, schema rendering, failure codes and 16 KiB cut a device's run page gets, and the browser decodes it with `BrowserEngine.Inspection`. Only a run a TODO's attempt started is served, to a Member or above. No journal is copied into the app's tables.
4. **Live from the engine's change feed, through Electric.** The engine already keeps `flows_run_changes`, one row per run whose revision moves whenever the run's row is written: about once per step attempt, so once per model turn and tool call. The tab follows that one row through ChatApi's shape proxy and reads the run again on each change, as it follows every synced table. Rejected: polling from the tab, a server loop, and a projection the run would write into the app's tables per event. Electric sets the table's replica identity itself, as owner of the engine's tables; the live end-to-end run on Cloudflare confirms it.
5. **No acts on a run on Cloudflare.** Stop, Retry and Resume act on this device's engine; a TODO's run stops when its TODO is dropped.

## Consequences

- One more synced column on `todos` (device store `todos` version 3: synced rows drop and sync again).
- Each run page a tab opens on a TODO's run keeps one Electric long poll for the life of the tab.
- Steering, the second half of TODO-3, is not built: a person's message kept in Postgres, sent by a client flow through a Member-only route, and read by the todo agent's own `Steering.Source` at its next boundary, the same answer each time a boundary drains again. That source is composed with the agent's cell sandbox (`TodoAgent.registration` over `worker/AgentSandbox.ts`), which is changing now for the agent's QuickJS build on workerd, so it follows that change.

Verification: `worker/RemoteRuns.test.ts` (the routes over a real engine and Electric, refusals, a sentinel, a live request answered when the run moves), `src/features/runs/remote.test.ts` (a tab watching a run go from Not started to done, read again only on change), `worker/stack/Stack.test.ts` (the run recorded on its TODO), `src/features/todos/view.test.ts`, and `@smthrs/ui`'s `browser/live-state.browser.test.ts` (the blink and the reduced-motion hold in Chromium).
