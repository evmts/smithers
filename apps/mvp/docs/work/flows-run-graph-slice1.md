---
title: Read-only run graph, slice 1
status: done
area: app
owner: Codex flows slice 1 builder
updated: 2026-10-20
links: [../design/flows/PLAN.md, ../decisions/0017-everything-is-a-plugin.md]
---

Build the journal-derived run graph, inspector, scrubber and timeline in public SDK components. Existing run actions stay unchanged. No new engine event or table. Library catalog: `@smthrs/ui` for views and `@smthrs/gateway` for the canonical journal fold; graph layout follows the approved plan's small-DAG exception.

Implementation: public graph/inspector/scrubber, canonical inspection forest, read-only replay with a frozen snapshot, child execution provenance, nested agent cells and recorded waits in the waterfall. Removed the old app step-list adapter. Stop, Retry and Resume retain their existing flows.

Validation: 25 targeted app tests and 160 canonical gateway tests passed on mini-run; graph derivation and inspection adapter reached 100% V8 coverage, and new UI components reached 100% Bun functions/lines with 38 UI tests passing. A real completed personal-flow journal also passes the canonical graph integration test. Astra and Fable findings received regression tests. Docs sync and checks passed. All 9 real run-actions integration tests passed. The recorded browser e2e passed live nodes, replay removing later nodes, return to live, keyboard inspector, both themes and phone overflow. GIF: `/Users/williamcory/Desktop/smithers-mvp/gifs/run-graph-run-graph.gif`. Desktop replay and phone dark captures reviewed. No commit; lander owns landing.

Fable review fixes: step logs now join real `runId`/validated `stepKey` annotations and recorded cell output by execution, generation and digest; clock renders reuse the evidence projection; descendant tails are retained and unrelated descendants reused; time-windowed engine batches continue refreshing during sustained activity. A shared loading migration left two removed `Spinner` imports blocking app startup; those consumers now use the existing `LoadingBar`.
