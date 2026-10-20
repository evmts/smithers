---
title: Library catalog for agents
status: done
area: process
owner: library catalog agent
updated: 2026-10-20
links: [agent-root-browser-safe.md, declared-import-exceptions.md, ../../../../docs/libraries.md, ../../../../AGENTS.md, web-standard-globals-rule.md, model-endpoint.md, integrations-browser-safe-root.md, durable-browser-engine.md, agent-ui-rendering.md, flows-root-platform-neutral.md, b1-follow-ups.md, platform-cloudflare-edge-cache.md, agent-root-browser-safe.md, known-host-access-burn-down.md, observability.md, land-to-main.md]
---

## What

`docs/libraries.md` lists every Smithers library by the job it does: call a model, run an agent loop, make a durable workflow, render UI, touch GitHub, sync local state. Root `AGENTS.md` tells every agent to find the job there before choosing a library and to name the entry in its change.

## Why

Will, after the lead called a model over raw HTTP: "We are the maintainers of smithers. We built an agent library and a bunch of agent workflows. And you are using none of them." Then: "you should understand the use case for every smithers library and have it in Agent md and claude md."

## State

- The catalog opens with the durable-flow rule and lists `HostModel`, `OtlpRelay`, `@smthrs/effect-tanstack-db` and `@smthrs/effect-electric`.
- `ModelProxy`'s row was removed with the module.
- Committed in part (`9169a9eb18e9`, local); later rows are uncommitted.
- Since, uncommitted: rows for `@smthrs/platform-cloudflare`, a "Local state and sync" section from the client package agent, and the `apps/mvp` row now describes Electric and TanStack DB instead of LiveStore. `ModelStep` has no row yet.
- 21:29 on 2026-10-19: the lead fixed the stale `apps/mvp` row (it had said LiveStore), and `pnpm docs:check` passes. `@smthrs/effect-code-storage` has no row yet; decision 0006 assigns that row to the lead.

- 21:39: the lead added `@smthrs/effect-code-storage` (private) in two places: the job table ("Import a public GitHub repository into git hosting and read its files and commits") and the package list. `pnpm docs:check` passes. Uncommitted.
- 21:44: `ModelStep` still has no row.
- About 21:44: W3 finished [`ModelStep`](model-step.md). At 21:54 `docs/libraries.md` (last changed 21:37) still has no `ModelStep` row. Infrastructure as code has no entry either; the IaC agent used the existing Alchemy and added no dependency.

- About 22:00: the lead added `ModelStep` in three places in `docs/libraries.md`: a job row ("Make one model call a durable flow step: replayed after a crash, retried on capacity errors, never paid for twice", `ModelStep.run({ name, request, model: host.model, route: host.route })` with `HostModel`), the `@smthrs/agent` package row, and the "Which to pick" paragraph (one model call is `ModelStep.run`). The catalog no longer lacks a `ModelStep` row. Uncommitted.

- By 23:12: the lead added a paragraph to the catalog's Platform rule: web-standard globals that a browser, a Worker, Node and Bun all ship (`fetch`, `crypto.subtle`, `crypto.getRandomValues`, `TextEncoder`, `URL`, streams, `AbortController`) aren't platform code, and a library may call them directly, preferring Effect's `HttpClient` and `Crypto` where they exist. It answers Codex review 2's finding 4 ([web-standard globals](web-standard-globals-rule.md)). Uncommitted.
- 23:15: `ModelProxy`, restored in `@smthrs/model` with a new guide, has no `docs/libraries.md` row yet; W5's brief lists the catalog among its docs.

- 23:18: `docs/libraries.md` changed, by B1 and the integrations agent, uncommitted:
  - `@smthrs/platform-browser`: a job row, "Run flows in a browser tab, durably: one leader worker per origin, SQLite on OPFS", and its package row now names `BrowserRuntime.run` and `BrowserEngine.layer` ([durable browser engine](durable-browser-engine.md)).
  - `@smthrs/integrations`: its row now says "All", and it left "Known violations: the root entry reaches platform code" ([integrations root](integrations-browser-safe-root.md)).
- 23:25: `ModelProxy` (restored in `@smthrs/model`) and `@smthrs/views` (new) still have no row.

- By 23:27: `ModelProxy` has rows: a job row ("Serve a model over HTTP so a browser calls it without the key, and meter it"), the `@smthrs/model` package row (`ModelProxy.serve`, `ModelProxy.layerClient`), and a paragraph saying a browser without the provider key calls a host that runs `ModelProxy.serve` ([model endpoint](model-endpoint.md)). The integrations agent reported its row change done at 23:27 ([integrations root](integrations-browser-safe-root.md)).
- 23:37: `@smthrs/views` still has no row. The `@smthrs/platform-browser` row doesn't name its SQLite build; B1 switches it to `@journeyapps/wa-sqlite` ([one SQLite, one leader](one-sqlite-one-leader.md)).

- 23:39: W5's report shows the catalog misstates `@smthrs/flows`. It lists the root as clean, with only the `NodeRuntime` and `SandboxedFlow` subpaths under "Known violations: platform code on a subpath outside a host package", but the root pulls Node-only jj code into Worker and browser bundles. The [flows root](flows-root-platform-neutral.md) agent fixes the code; the rows must match what it reports.
- About 23:41: B1 is done on `@journeyapps/wa-sqlite` 1.7.2 ([durable browser engine](durable-browser-engine.md)). Its follow-ups include the support matrix, which the catalog's hosts paragraph says "still lists browsers as bundle-only" ([B1 follow-ups](b1-follow-ups.md)).

- 23:57 on 2026-10-19, on disk: `docs/libraries.md` changed. It now has the `@smthrs/views` rows; the `@smthrs/platform-browser` rows describe the durable engine on SQLite in OPFS with a Web Locks leader; and `@smthrs/integrations` says HTTP goes through the Effect `HttpClient` the caller provides.
- 00:08 on 2026-10-20, still stale for the [flows root](flows-root-platform-neutral.md) agent to fix: "Run flows in a Node or Bun program" points at `@smthrs/flows` and `NodeRuntime.layerHost`, the package table names `@smthrs/flows/NodeRuntime`, and "Known violations" lists the `NodeRuntime` and `SandboxedFlow` subpaths. Those now live in `@smthrs/platform-node`'s root.

- 00:18 on 2026-10-20: **the `@smthrs/flows` rows are corrected** by the [flows root](flows-root-platform-neutral.md) agent. "Run flows in a Node or Bun program" names `@smthrs/platform-node` and `@smthrs/platform-bun`, and the `@smthrs/flows` and `@smthrs/platform-node` rows say where `NodeRuntime.layerHost`, `SandboxedFlow.execute` and `TestNodeRuntime.durableEngine` now live. The removed subpaths are gone from "Known violations". The hosts paragraph still says the support matrix "lists browsers as bundle-only"; the [B1 follow-ups](b1-follow-ups.md) agent fixes the matrix.
- 00:25: the integrations agent reported its row updated for the `HttpClient` move ([Effect HttpClient](integrations-effect-httpclient.md)).


- 00:35 on 2026-10-20: **the hosts paragraph is corrected.** It says durable execution runs "in a browser tab's dedicated worker over SQLite on OPFS through `@smthrs/platform-browser`", whose `browserTest` kills Chromium mid-run, and points to the support matrix, whose Browsers row changed at the same time ([B1 follow-ups](b1-follow-ups.md)).
- 00:39: the flows-root agent reported its rows done ([flows root](flows-root-platform-neutral.md)).
- 00:41 to 00:46: the [edge cache](platform-cloudflare-edge-cache.md)'s `ImmutableCache`, `EdgeCache` and `BrowserCache` are on disk with no catalog rows yet.

- 01:50 on 2026-10-20: **one row is wrong.** The catalog marks `@smthrs/agent` as running on "All" platforms, but its root reaches `@smthrs/std`'s `node:dns/promises` through `FlowEngineLike`, and the app's dev server shows it. The `@smthrs/std` root is already under "Known violations". The fix and the corrected row are [their own item](agent-root-browser-safe.md).

- About 02:05 on 2026-10-20: the `@smthrs/agent` row says "All" platforms, but its root reaches Node through the `@smthrs/std` root. The [agent root](agent-root-browser-safe.md) agent corrects the row with its fix.
- About 02:06 on 2026-10-20: the [repo checks](repo-checks-green.md) declared two deep-import exceptions, `model-host` → `@smthrs/cli/Catalog` and `rpc` → `@smthrs/canonical` subpaths ([declared import exceptions](declared-import-exceptions.md)).
- About 02:26 on 2026-10-20, the sandbox host-boundary agent: `docs/libraries.md` gained "Known violations: a library module reaches the host at run time", the 10 modules on the gate's `KNOWN_HOST_ACCESS` list, and its gate paragraph now describes the stricter `HiddenHostAccess` rules ([known host access](known-host-access-burn-down.md), [flows root](flows-root-platform-neutral.md)). A2b fixed a catalog row for the Electric subset removal (02:18, [observability](observability.md)).
- 02:35: the `@smthrs/std` row still says Node and lists `src/NodeLanguageServer.ts` and `src/internal/HttpNetwork.ts` under "Known violations", and the `@smthrs/agent` row still says "All". Both change with the [agent root](agent-root-browser-safe.md) agent's report: `NodeLanguageServer` has moved to `platform-node`, and `HttpNetwork` no longer imports `node:dns` or `node:net`.
- 13:04:55 on 2026-10-20: the `docs/libraries.md` rows for web pages and `ModelStep.model` landed on `main` in `c9d1e0c5ed` ([land to main](land-to-main.md)).

## Next

Keep rows current as packages land. The edge cache needs its rows when it reports: `ImmutableCache` in `@smthrs/artifacts`, `EdgeCache` in `@smthrs/platform-cloudflare` and `BrowserCache` in `@smthrs/platform-browser`. Infrastructure as code still has no entry; it uses Alchemy directly.

Until 00:35 on 2026-10-20 the next step was: keep rows current as packages land. The hosts paragraph changes with the B1 follow-ups' support-matrix fix. Infrastructure as code still has no entry; it uses Alchemy directly.

Until 00:18 on 2026-10-20 the next step was: (By 23:27 `ModelProxy` has its rows; `@smthrs/views` still needs one when V1 reports.)

Keep rows current as packages land. `@smthrs/views` has its row (on disk 23:57). The `@smthrs/flows` rows change with the [flows root](flows-root-platform-neutral.md) agent's report. Infrastructure as code still has no entry; it uses Alchemy directly.

Until 00:08 on 2026-10-20 the next step was: keep rows current as packages land; `ModelProxy` and `@smthrs/views` need rows when W5 and V1 report. Infrastructure as code still has no entry; it uses Alchemy directly. (Earlier: add `ModelStep` when W3 lands; done about 22:00.)

## Questions for Will

None.
