---
title: "@smthrs/agent's root in the browser"
status: done
area: sdk
owner: agent-root SDK agent (started about 02:05 on 2026-10-20), reported done 03:15:18 on 2026-10-20, nothing committed; leftovers go to [the API baseline](api-baseline-rerecord.md) and [engine worker load failure](browser-engine-worker-load-hang.md). Until 03:15: agent-root SDK agent, still running at 03:05 on 2026-10-20 (changeset 02:56, `Prompt.ts` 02:57, `std` coverage work 03:04, unreported); since about 02:58 the lead calls it the only blocker left before the app runs end to end. Until 02:58: agent-root SDK agent (started about 02:05 on 2026-10-20): `@smthrs/agent` and `@smthrs/std` in the browser contract, host code behind injected services; since about 02:35 also the engine worker's `document is not defined` (MDX off the agent root's path, a dedicated-web-worker target in the browser gate), after first fixing `std`'s stale `PACKAGE.ts` path (told 02:40); with two sub-agents, a real-Chromium test (reported 02:30:57) and a docs pass (started 02:31:52); the wiring agent keeps the agent out of the tab (told about 02:05); found at 01:50 on 2026-10-20 in the wiring agent's dev-server log; told about 02:50 to remove `Prompt.ts`' leftover eager MDX import and prove the worker gate fails with it in place (fix on disk 02:52:43, unreported)
updated: 2026-10-20
links: [known-host-access-burn-down.md, api-baseline-rerecord.md, repo-clone-and-view.md, one-sqlite-one-leader.md, host-agnostic-flows.md, app-wiring.md, flows-and-agent.md, durable-browser-engine.md, flows-root-platform-neutral.md, library-catalog.md, repo-checks-green.md, model-step.md, local-first.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../../../../docs/libraries.md, ../../../../AGENTS.md, browser-engine-worker-load-hang.md, land-and-deploy-mvp.md]
---

## What

`@smthrs/agent`'s root entry has to import and run in a browser. Root `AGENTS.md` says every library except the host packages runs in a browser, a Cloudflare Worker, Node and Bun. Today the root reaches Node:

```
@smthrs/agent  src/index.ts
  └─ FlowEngineLike.ts          import { Checkpoints } from "@smthrs/std"
       └─ @smthrs/std root
            └─ src/internal/HttpNetwork.ts   import { lookup } from "node:dns/promises"
                                              import { BlockList, isIP } from "node:net"
```

## Why

The browser agent is an `@smthrs/agent` flow on the device's engine (decision 0011), so the app's engine worker imports this root. Vite's dev server replaces `node:` modules in client code with a stub that throws when code reads an export, so the module fails while it loads.

No gate caught it:
- `docs/libraries.md` marks `@smthrs/agent` as running on "All" platforms ("standard tools need host `FileSystem` and `ChildProcessSpawner`"), but lists the `@smthrs/std` root under "Known violations". The `@smthrs/agent` row is wrong.
- The browser contract (`packages/repo-targets/browser/browser-contract.mjs`) checks `@smthrs/std`'s `Grep`, `Glob`, `Search` and `PortableSearch` subpaths, `@smthrs/model` and `@smthrs/model-host`, but not the `@smthrs/agent` root.
- F4+F5's agent tests ran on the Node host. Nothing had run in a real browser before the wiring step ([flows and the agent](flows-and-agent.md)).

## State

- 01:50:20 on 2026-10-20, scratchpad `alchemy-dev.log` (the wiring agent's dev server): the first `[Unhandled error] Error: Module "node:dns/promises" has been externalized for browser compatibility. Cannot access "node:dns/promises.lookup" in client code`, at `packages/smithers/agent/std/src/internal/HttpNetwork.ts`. It repeats 42 times by 01:55.
- 01:55 to 01:57: every local-first real-browser e2e case so far fails at "the app opens", and the page renders nothing. Best guess this error is the cause ([app wiring](app-wiring.md)).
- No one has touched the code: `HttpNetwork.ts` dates from 2026-10-14, and `@smthrs/agent`'s `index.ts` and `FlowEngineLike.ts` from 20:21 and 20:44 on 2026-10-19. No agent has reported it or been assigned it.

- **About 02:05 on 2026-10-20: two fixes started.** The [`platform-browser` agent](one-sqlite-one-leader.md)'s report named this the blocker. The lead to Will: "since the wiring edit, the app doesn't open in a real browser. The page imports the agent library, and its root pulls in Node-only code (`node:dns`). Our tests missed it because they ran the agent on Node."
  - **The SDK fix, its own agent:**
    - add `@smthrs/agent` and `@smthrs/std` to the browser contract;
    - move `std`'s `node:dns` and other host code behind injected services in `@smthrs/platform-node` and `@smthrs/platform-bun`;
    - bind the filesystem tools only when a host provides them;
    - proof: a real-Chromium test runs an `AgentAction` through `ModelStep` in a `BrowserRuntime` worker.
  - **The app fix, the wiring agent:** keep the agent out of the tab entirely. Only `src/flows/engine.worker.ts` reaches `@smthrs/agent` ([app wiring](app-wiring.md)).
- 02:00 on 2026-10-20, scratchpad `browser-check.log`: "browser contract holds: 38 browser entry points"; `@smthrs/agent` isn't among them.
- 02:05 to 02:16 on 2026-10-20, on disk, unreported:
  - **The tab holds a reference, not the agent.** `@smthrs/platform-browser`'s `BrowserEngine` `start`, `result`, `cancel` and `signal` take a `BrowserEngine.FlowReference`: a flow's `_tag` and its schemas (changeset `browser-engine-flow-reference.md`, 02:14, minor). The app's `src/features/agent/reference.ts` (02:14) holds `chat/Answer`'s reference, and `src/flows/registry.ts` (02:14) imports it instead of the flow: "Only an engine's host imports that, so the tab never loads @smthrs/agent."
  - **Test first:** `packages/repo-targets/browser/browser-contract.mjs` (02:16) lists the `@smthrs/agent` and `@smthrs/std` roots.
  - **Not touched yet:** `std`'s `src/internal/HttpNetwork.ts` (2026-10-14), `@smthrs/agent`'s `src/FlowEngineLike.ts` (20:44 on 2026-10-19), and the `platform-node` and `platform-bun` sources.
  - **Dev server** (scratchpad `alchemy-dev.log`): the last `node:dns/promises` error is at 02:06:43, 104 in all, and none follows through 02:16. Best guess the tab stopped loading the agent. Whether the engine worker still trips on it isn't on record.
- 02:16 to 02:25 on 2026-10-20, on disk, unreported:
  - **`NodeLanguageServer` moved to `platform-node`:** `packages/smithers/flows/platform-node/src/NodeLanguageServer.ts` (02:23) binds `@smthrs/std`'s `LanguageServer` to host language-server processes, and `platform-node`'s root exports it (`index.ts` and `package.json`, 02:23). `@smthrs/std`'s `src/` no longer has `NodeLanguageServer.ts`, and its `index.ts` (02:24:36) exports only `LanguageServer`. `platform-browser`'s `package.json` changed at 02:19.
  - **`@smthrs/std` tests:** `test/IpAddress.test.ts` (02:20) and `test/LanguageServerSync.test.ts` (02:24). Scratchpad `ipsweep.ts` and `ipprobe.mjs` (02:18 to 02:21), best guess this agent's checks of `HttpNetwork`'s address rules.
  - **A mid-move window broke the dev app:** from 02:24:13 the dev server couldn't resolve `./NodeLanguageServer.ts` from `std`'s `index.ts`, so the wiring agent's real-browser probe hit a Vite error overlay ([app wiring](app-wiring.md)). `std`'s `index.ts` was rewritten at 02:24:36; no later dev-server load is on record.
  - `node:dns/promises`: still no error after 02:06:43.
- 02:16 to 02:35 on 2026-10-20, in the agent's transcript, unreported to the lead:
  - **DNS and addresses:** `std`'s `internal/HttpNetwork.ts` (02:30) now uses a portable `IpAddress` module and the kernel's `ResolveHost` service in place of `node:dns/promises` and `node:net`. A parity sweep of one million random addresses against Node's parser found zero divergences. `platform-node`'s `EgressHttpClient` provides the Node resolver, and a new `platform-node` test checks it. `kernel/src/HttpClient.ts` changed at 02:25.
  - **Environment:** `std`'s `internal/Exec.ts` and `GitWorktree.ts` read the environment through a kernel accessor.
  - **`NodeLanguageServer`:** moved to `platform-node` with its tests; a std-side sync test against a fake server stays in `std`. `@smthrs/cli`'s LSP test passes, 8 of 8.
  - **Gates:** the browser gate at 02:29: "browser contract holds: 36 browser entry points, each for a browser and a Worker, 6 Node-only". `kernel`: 863 tests at 100%. The export-map contract records `@smthrs/std/NodeLanguageServer` as an explicit `null` denial, like `@smthrs/flows/NodeRuntime`, and passes 39 of 39 (02:34). The dependency-boundary gate passes for 72 packages.
  - **`std` reds:** 2 of 1,476 tests fail (02:30); one is `Readme.test.ts`, which still names `NodeLanguageServer.MAX_QUEUED_FRAMES`. Coverage is 99.46% of branches, with gaps in `Checkpoints.ts`, `Exec.ts` and `GitWorktree.ts` that predate this change (#3480). The agent is adding scripted fault tests to close them.
  - **Collateral break:** `packages/smithers/agent/std/PACKAGE.ts` still names `src/NodeLanguageServer.ts` three times, and `.smithers/target-index.json` once. Every `smithers-build` target fails while evaluating declarations: the R3 to R5 agent's `//apps/mvp:importRules` run at 02:32 failed with `security check child-env-secret-leak path "packages/smithers/agent/std/src/NodeLanguageServer.ts" matches no file`, and the sandbox agent reported the same block ([repo clone and view](repo-clone-and-view.md), [flows root](flows-root-platform-neutral.md)). The same class of break as `flows/sandbox/PACKAGE.ts` at 00:03.
  - **API fixture:** `public-api-baseline.json` still lists `@smthrs/std`'s `NodeLanguageServer` subpath ([API baseline](api-baseline-rerecord.md)).
- **02:30:57: the agent runs in real Chromium.** The test sub-agent's report: `platform-browser/test/browser/Agent.test.ts` passes 2 of 2. The `@smthrs/agent` root loads in a dedicated engine worker and runs an `AgentAction` to completion on `BrowserRuntime`, with a scripted model.
  - **Case 1:** the run settles with `{ name: "Paris", population: 2102650 }`, decoded from the model's answer; the model log is exactly `["model:first", "model:second"]`.
  - **Case 2:** the browser is killed with SIGKILL during the second model call and relaunched. The run resumes and settles with the same value, and the relaunched browser makes only `["model:second"]`: the first call was sealed and replayed from the record.
  - The full `platform-browser` browser suite passes 11 of 11. `platform-browser` gains dev dependencies on `@smthrs/agent`, `@smthrs/model` and `@smthrs/registry`; pnpm warns about a dev-only cycle (agent → testing → platform-browser → agent).
- **The next blocker, also 02:30:57:** with the fix in, the worker still failed to load with `ReferenceError: document is not defined`. The agent's markdown parser pulls in `decode-named-character-reference`, whose `browser` export uses the DOM; its `worker` export doesn't. The test bundles its worker with esbuild `conditions: ["worker"]`. The app's Vite engine worker (`apps/mvp/src/flows/engine.worker.ts`) fails the same way ([app wiring](app-wiring.md)). At 02:35 the agent was reading that package's exports.
- 02:31:52: a docs sub-agent started on the `NodeLanguageServer` move: `std` and `platform-node` docs, in Google developer-doc prose.

- **About 02:35 on 2026-10-20: the `document is not defined` chain, and the lead's ruling.**
  - The chain: `@smthrs/agent` → harness → `@smthrs/registry`'s `Prompt.ts` → `@mdx-js/mdx` → `decode-named-character-reference`'s `browser` build, which reads `document` while it loads.
  - The fix, in this SDK agent: keep MDX off the agent root's import path, and add a dedicated-web-worker target to the browser gate.
  - **The lead ruled out an app-side alias.** The fix goes at the source, not in the app's Vite config.
  - The lead to Will (02:35): "the agent's worker dies at startup: a Markdown library inside the agent package loads browser page code, and a worker has no page. The SDK agent is fixing that at the source, and adding a gate check that would have caught it."
- **02:40 on 2026-10-20: the stale path goes first.** The lead told this agent to fix `std/PACKAGE.ts`'s `NodeLanguageServer.ts` path before anything else, since it blocks every `smithers-build` target. The lead to Will: "I also told the SDK agent to fix a stale file path that is breaking every build target first."
- 02:39 to 02:43 on 2026-10-20, on disk, unreported:
  - **The stale path is gone.** `packages/smithers/agent/std/PACKAGE.ts` (02:40:41) no longer names `NodeLanguageServer`, and `.smithers/target-index.json` (02:41:30) points at `packages/smithers/flows/platform-node/src/NodeLanguageServer.ts`. `platform-node`'s `PACKAGE.ts` changed at 02:40:48 and `std`'s README at 02:40:30. No `smithers-build` run after the fix is on record.
  - **The worker gate:** `packages/repo-targets/browser/browser-check.mjs` (02:39:53) bundles each browser-safe entry the ways a dedicated worker resolves it (`worker` and `browser` conditions, and `browser` alone as Vite builds a worker), imports it in a Node worker thread with no DOM, and fails a load that throws or names a DOM global.
  - **MDX loads lazily, mid-edit:** `@smthrs/registry`'s `src/Prompt.ts` (02:42:37) now loads the MDX compiler with `import("@mdx-js/mdx")` the first time `compile` runs. Its doc: "A host that only runs flows, such as an agent in a browser's dedicated worker, never loads it". But line 14 still has a bare `import "@mdx-js/mdx"`, which loads it eagerly. Best guess the edit is unfinished.

- **About 02:50 on 2026-10-20: the lead told this agent** about `Prompt.ts`' leftover `import "@mdx-js/mdx"` on line 14, and asked it to prove the new dedicated-web-worker gate fails with that line in place.
- 02:40 to 02:55 on 2026-10-20, in the scratchpad and on disk, unreported:
  - **The gate failed on the old code:** scratchpad `gate-webworker-before.log` (02:40:31), "browser contract violated": `@smthrs/chain` and `@smthrs/agent` touch the DOM "while it loads in a web worker, browser condition only (Vite), which has none", `ReferenceError: document is not defined`. That run predates the lazy-load edit, so it shows the static import, not the line-14 version.
  - **The gate passes:** `gate-final.log` (02:52:13): "browser contract holds: 36 browser entry points, each for a browser and a Worker and loaded in a web worker, 6 Node-only", with `@smthrs/agent`, `@smthrs/std` and `@smthrs/chain` loading in a web worker under both condition sets.
  - **Line 14 is gone:** `Prompt.ts` (02:52:43) reaches MDX only through `import("@mdx-js/mdx")` inside `compile`. The agent saved that version first as scratchpad `Prompt.fixed.ts` (02:52:39, the same 3,692 bytes).
  - **Real Chromium, with and without the line:** `chromium-before.log` (02:52:40): `Agent.test.ts` 2 of 2 fail, "the engine worker did not load: Uncaught ReferenceError: document is not defined". `chromium-after.log` (02:52:43): 2 of 2 pass. `test/browser/app/agent.ts` (02:52:39) now races each harness call against the worker's load error, so a worker that dies while it loads fails the test with its cause instead of hanging.
  - **Not on record:** a browser-gate run with the line-14 version in place, the proof the lead asked for. The real-Chromium test fails with it, so best guess the gate does too.
  - **Coverage and docs:** `@smthrs/std` 1,476 passed, 4 skipped; 100% of statements, 99.62% of branches, with `GitWorktree.ts` at 89.53% (scratchpad `std-cov2.log`, 02:54:47; at 02:30 2 tests failed and three files had gaps). `@smthrs/platform-node` 1,280 passed, 100% on all four measures (`pn-cov.log`, 02:54:19). `docs-check2.log` (02:52:35): "50 published package tarballs passed" and the docs-sync check flow accepted; `docs-check3.log` (02:54:59) started the Go price check and the docs-sync check again. `docs/api.md` regenerated for `registry`, `kernel`, `platform-browser` and `platform-cloudflare` (02:53).

- **About 02:58 on 2026-10-20: the last blocker.** With the `SharedSqlite` refusal fixed ([one SQLite, one leader](one-sqlite-one-leader.md)), the lead to Will: "One blocker is left before the app runs end to end: the agent library loading page code in the worker. Its fix is in progress."
- 02:56 to 03:05 on 2026-10-20, on disk and in the scratchpad, unreported:
  - **Changeset** `.changeset/agent-root-browser-safe.md` (02:56): majors for `@smthrs/std`, `@smthrs/platform-node` and `@smthrs/registry`, a minor for `@smthrs/kernel`, patches for `@smthrs/agent` and `@smthrs/cli`. The roots "import no platform code and touch no DOM while they load". `NodeLanguageServer` moves to `@smthrs/platform-node`. The web tools resolve names through the kernel's new `HttpClient.ResolveHost`, whose default refuses every name (`ResolveHostUnavailable`, reported as `unsupported`); `EgressHttpClient.layer` provides the system resolver for Node and Bun. `Prompt.compile(source)` now returns an `Effect` and loads the MDX compiler on its first call.
  - **`Prompt.ts` again** (02:57:05): only `import type * as Mdx from "@mdx-js/mdx"` and the lazy `import("@mdx-js/mdx")` inside `compile` remain. `registry/test/ExecutionSnapshotBoundaries.test.ts` changed with it (02:57:08).
  - **Coverage:** `std/src/internal/GitWorktree.ts` and `std/test/Checkpoints.test.ts` changed at 03:04:33, best guess the `GitWorktree.ts` branch gap. Scratchpad `cov1` to `cov3` (02:57 to 03:00) hold coverage runs.
  - **Docs:** scratchpad `docs-check.log` (03:04): all 50 published package tarballs pass and the docs-sync check flow is accepted.
  - **In the app:** the wiring agent's real-browser e2e run (scratchpad `wiring/e2e-1.log`, from 02:56:58) has the engine worker loading `@smthrs/agent`. "ask: the browser's agent answers through the model endpoint" and "theme by the agent" pass, and the dev log shows `browser.runtime.elect` from `smithers-mvp-engine`. No `document is not defined` in the saved browser logs. Best guess the 02:52 fix works in the app ([app wiring](app-wiring.md)).
  - **Not on record:** the browser-gate run with line 14 back in place, and a `smithers-build` target run with the fixed `std/PACKAGE.ts`.

- 03:04 to 03:15 on 2026-10-20, on disk and in the scratchpad: **the last proof runs.**
  - `@smthrs/std` reaches 100% on all four measures, 1,482 tests. A sub-agent ("Close GitWorktree branch coverage", finished) and this agent covered `GitWorktree.ts`' last branch arms (#3480) and deleted two branches that could never run (`GitWorktree.ts` and `test/Checkpoints.test.ts`, 03:04).
  - `smthrs docs` passes for all six touched packages (`kernel`, `std`, `registry`, `platform-node`, `platform-browser`, `platform-cloudflare`), about 03:07. Best guess this is also the `smithers-build` target run on the fixed `std/PACKAGE.ts` that wasn't on record.
  - The export-map contract (`packages/repo-targets/contracts/public-export-maps.test.mjs`) called the published `Prompt.compile` synchronously. Updated for the Effect-returning API, it passes 39 of 39 (03:08). Snapshot consumers pass in the CLI (42) and `engine-store` (48).
  - Scratchpad `agent-tests.log` (03:14): the `@smthrs/agent` suite, 2,071 passed, 3 skipped, exit 0 (started 03:05:28, 536 s).
  - Scratchpad `gate-final.log` (03:15): "browser contract holds: 36 browser entry points, each for a browser and a Worker and loaded in a web worker, 6 Node-only."
- **03:15:18 on 2026-10-20: the agent reported done** to the lead: "The `@smthrs/agent` root now imports and runs in a browser, a dedicated web worker and a Cloudflare Worker: the gate passes and an `AgentAction` with a scripted model runs to completion in real Chromium. Nothing is committed."
  - **Gate:** `browser-contract.mjs` lists the `@smthrs/agent` and `@smthrs/std` roots; std's four subpaths are dropped because the root covers them. The dedicated-worker check bundles each entry two ways (`worker`+`browser`, and `browser` alone as Vite builds a worker) and imports it in a worker with no DOM. With the old static MDX import put back, it fails `@smthrs/agent` and `@smthrs/chain` with `document is not defined`; without it, all 36 entries load. This is the proof the lead asked for at 02:50.
  - **DNS:** `@smthrs/kernel`'s `HttpClient.ResolveHost` refuses every name by default, which std reports as `unsupported`, the documented behaviour for browsers and Workers. `platform-node`'s `EgressHttpClient.layer` supplies the Node resolver, and `NodeHost` and `BunHost` get it through that layer. IP rules are plain TypeScript and match `node:net` over 1M random addresses. One deliberate difference: an IPv6 address with a zone suffix is never public.
  - **Language server:** `NodeLanguageServer` moved to the `platform-node` root with its tests, fixtures and scripts, with no shim; the old std subpath is blocked. std reads `process.env` through the kernel's new `ambientEnvironment()`, so the [known host access](known-host-access-burn-down.md) list didn't grow.
  - **MDX:** `Prompt.compile` loads `@mdx-js/mdx` on first use and returns an Effect.
  - **Real Chromium:** the agent worker, bundled the way Vite serves one, passes 2 of 2 with the fix and fails in under a second without it, naming `document is not defined`. All 12 Chromium tests pass.
  - **Proof:** 100% coverage in kernel, std, registry and platform-node. The agent suite (2,071), the Bun pinning test, the export-map and dependency-boundary checks, typecheck and lint pass. `pnpm docs:sync`, `pnpm docs:check` and `smthrs docs` pass for the six packages; `docs/libraries.md` and a changeset are updated.
  - **Coordination:** it edited std's and platform-node's `PACKAGE.ts` on the lead's go-ahead (the language-server security checks moved to platform-node), regenerated `.smithers/target-index.json`, and left `boot.ts`, `main.tsx` and the app worker alone.
  - **Left open:**
    - The release API baseline is stale. Recording it would also record other agents' pending API changes, so the agent left it ([API baseline](api-baseline-rerecord.md)).
    - `platform-browser`'s devDependency on the agent adds a dev-only pnpm cycle warning. No owner.
    - `BrowserEngine` only logs a worker that dies while loading, so a request already sent waits forever ([engine worker load failure](browser-engine-worker-load-hang.md)).

## Next

From 03:15 on 2026-10-20, this item is done; nothing is committed. What's left is elsewhere:
- The app's proof is the wiring agent's e2e rerun ([app wiring](app-wiring.md)). The engine worker already loads `@smthrs/agent` in its 02:56 run.
- Record the API baseline once the SDK agents have landed ([API baseline](api-baseline-rerecord.md)).
- A request to an engine worker that died while loading waits forever ([engine worker load failure](browser-engine-worker-load-hang.md)). Done for the SDK, reported about 03:26 on 2026-10-20 by the `platform-browser` agent; the app half is on disk 03:27.
- The dev-only pnpm cycle warning from `platform-browser`'s devDependency on the agent. No owner.
- Landing waits on Will's review ([land and deploy](land-and-deploy-mvp.md)).

Until 03:15 on 2026-10-20 the next step was, from about 03:05: this agent's report, with the proof listed under "Until 02:35" plus the browser-gate run that fails with `Prompt.ts`' old eager import, `GitWorktree.ts` branches at 100%, and a `smithers-build` target evaluating with the fixed `std/PACKAGE.ts`. The app side already looks unblocked (engine worker loads in the 02:56 e2e run). Then this item is done, and the wiring agent's report follows ([app wiring](app-wiring.md)).

Until about 03:05 on 2026-10-20 the next step was, from about 02:55, in order:
1. The browser gate run with `Prompt.ts`' line 14 back in place, failing, as the lead asked; real Chromium already fails with it (02:52:40).
2. Confirm a `smithers-build` target evaluates again with the fixed `std/PACKAGE.ts` (on disk 02:40:41; no run on record).
3. `GitWorktree.ts` branches to 100%, and `pnpm docs:check` passes in full.
4. This agent's report, with the proof listed below under "Until 02:35". Then the app's engine worker loads in a real browser ([app wiring](app-wiring.md)).

Until about 02:55 on 2026-10-20 the next step was, from about 02:43, in order:
1. Confirm a `smithers-build` target evaluates again with the fixed `std/PACKAGE.ts` (on disk 02:40:41, unreported).
2. MDX leaves the agent root's load path, with no bare `@mdx-js/mdx` import left in `Prompt.ts`, and the new dedicated-web-worker gate fails on the old code and passes on the new.
3. The app's engine worker loads in a real browser without `document is not defined` and with no app-side alias ([app wiring](app-wiring.md)).
4. This agent's report, with the proof listed below under "Until 02:35".

Until about 02:43 on 2026-10-20 the next step was, from 02:35, first: `@smthrs/std`'s `PACKAGE.ts` stops naming `src/NodeLanguageServer.ts`, so `smithers-build` targets evaluate again. Then the engine worker loads without `document is not defined`, either through the `worker` export condition in the app's Vite worker build or by keeping the DOM-using parser out of the agent's worker graph. Then the agent-root SDK agent's report, with the proof below. The real-Chromium `AgentAction` test already passes (02:30:57).

Until 02:35 on 2026-10-20 the next step was, from about 02:05: the agent-root SDK agent's report. Proof:
- the browser contract lists the `@smthrs/agent` and `@smthrs/std` roots and fails on today's code, checked before the fix;
- `std`'s DNS and other host code reach it as injected services, with Node and Bun layers in `platform-node` and `platform-bun`;
- the filesystem tools bind only when a host provides `FileSystem` and `ChildProcessSpawner`;
- a real-Chromium test runs an `AgentAction` through `ModelStep` in a `BrowserRuntime` worker;
- the [catalog](library-catalog.md) row for `@smthrs/agent` is corrected; 100% coverage, `pnpm docs:sync` and `pnpm docs:check`.

With it, the wiring agent's proof that the tab never loads `@smthrs/agent` and the app opens in the real-browser e2e ([app wiring](app-wiring.md)).

Until about 02:05 on 2026-10-20 the next step was:

Best guess, test first:
1. Add the `@smthrs/agent` root to the browser contract, and see the check fail on today's code.
2. Cut the root's path to Node. Either `FlowEngineLike` stops importing the `@smthrs/std` root (it takes `Checkpoints` from a browser-safe subpath, or `Checkpoints` moves), or the `@smthrs/std` root stops reaching `HttpNetwork` and `NodeLanguageServer`, and their Node code moves to `@smthrs/platform-node` as injected services.
3. Correct the catalog row.

Proof: the browser check passes with `@smthrs/agent` listed, and the app opens in the real-browser e2e.

## Questions for Will

None. (Answered about 02:35 on 2026-10-20 by the lead: fix `document is not defined` in the app's Vite worker build or at the source? At the source; no app-side alias.) Open for the lead: should the browser contract cover every package the app's browser bundles import, instead of a list kept by hand? (Answered about 02:05 on 2026-10-20: does the wiring agent fix this inside its step, or does it go to its own SDK agent? Both: the SDK fix goes to its own agent, and the wiring agent keeps the agent out of the tab.)
