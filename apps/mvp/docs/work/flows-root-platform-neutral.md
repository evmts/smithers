---
title: Platform-neutral root for @smthrs/flows
status: done
area: sdk
owner: sandbox host-boundary agent (assigned by 01:19 on 2026-10-20), Codex Astra review 3's finding 5: `execHandles`' Node and Bun code behind a host service, `HiddenHostAccess` tightened (reported done 02:26:57 on 2026-10-20); the 10 modules it listed are [their own item](known-host-access-burn-down.md); flows-root agent (started about 23:39 on 2026-10-19; widened at 23:58 to fix the browser gate that missed the leak; fixed the stale `SandboxedFlow` paths at 00:24; reported done 00:39 on 2026-10-20)
updated: 2026-10-20
links: [known-host-access-burn-down.md, cloudflare-flow-host.md, durable-answering.md, durable-browser-engine.md, host-agnostic-flows.md, flows-and-agent.md, integrations-browser-safe-root.md, library-catalog.md, b1-follow-ups.md, code-reviews.md, sdk-test-reds.md, disk-space.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../../../../docs/libraries.md, ../../../../AGENTS.md, repo-checks-green.md, agent-ui-rendering.md, agent-root-browser-safe.md, second-build-machine.md]
---

## What

Make the `@smthrs/flows` root entry import and run in a browser and a Cloudflare Worker. Host code moves to the platform packages (`@smthrs/platform-node`, `-bun`, `-browser` and `-cloudflare`), with no shims left behind.

## Why

W5 found that the root re-exports Node-only jj code into Worker and browser bundles. The browser agent (F5) and the remote flows on `FlowExecution` both load the flows runtime, so every app bundle would carry Node code.

Root `AGENTS.md`: every library except the host packages "must import and run in a browser, a Cloudflare Worker, Node and Bun", and "a package that breaks this has a bug". Will, 22:29 on 2026-10-19: "If smithers doesn't work in browser yet that's a bug it should work in browser via platform-browser". The [integrations root](integrations-browser-safe-root.md) was the same class of defect.

## State

- 23:39 on 2026-10-19: W5 reported the defect with its done report ([Cloudflare flow host](cloudflare-flow-host.md)). The lead started an agent to make the root platform-neutral, moving host code to the platform packages with no shims. It told Will: "the flow runtime's root pulls Node-only code into Worker and browser bundles. An agent is fixing it."
- The root, `packages/smithers/flows/src/index.ts`, re-exports 20 packages as namespaces, among them `Jj` from `@smthrs/jj` (line 68), plus `Runtime`. Its header comment already keeps `NodeRuntime` and `BunRuntime` off the root for this reason.
- Neither guard caught the leak. `packages/repo-targets/browser/browser-contract.mjs` lists the root (line 42), and `docs/libraries.md` lists it as clean, naming only the `NodeRuntime` and `SandboxedFlow` subpaths as known violations ([library catalog](library-catalog.md)).
- 23:46, on disk, unreported, likely this agent's first edits: `platform-node/src/NodeRuntime.ts`, `NativeRuntime.ts`, `SandboxedFlow.ts`, `TestNodeRuntime.ts` and `internal/SandboxedFlowGuest.ts`, and `platform-bun/src/BunRuntime.ts`. `flows/src/index.ts` is unchanged since 21:53.

- 23:46 to 23:51 on 2026-10-19, on disk, unreported: **the Node runtimes left `@smthrs/flows`.**
  - `@smthrs/platform-node`'s root now exports `NodeRuntime`, `NativeRuntime`, `SandboxedFlow` and `TestNodeRuntime`, and `@smthrs/platform-bun`'s exports `BunRuntime`. `@smthrs/flows` exports only its root and `./Runtime`.
  - Their tests moved to `platform-node/test` (23:48). `flows/src/index.ts`, `Runtime.ts` and two internal option files changed at 23:47.
  - At 23:51 one script (scratchpad `rewrite.py`) rewrote the old subpath imports to the platform roots in about 65 files: the flows and agent examples, agent tests, `packages/smithers` (`NativeControl`, `NodeControlHost`, `BunControl`, `History`) and the engine fault harnesses.
- By 23:58: **the lead widened the scope.** The agent must also find why the browser contract passed the root despite the leak, fix that gate, and prove it with a probe. That answers this note's open question.
- 23:58 on 2026-10-19 to 00:05 on 2026-10-20, on disk, unreported: **the gate's hole, its fix and the probe.**
  - **Why it passed:** `browser-check.mjs` failed only when esbuild couldn't resolve a `node:` built-in. `@smthrs/sandbox`'s `SandboxMerge/HostAdapter.ts` loaded `@smthrs/jj/node/NodeJj` with `import(adapter)`, and `internal/execHandles.ts` called `process.getBuiltinModule("node:v8")` and `("node:vm")`. A bundler leaves all three alone, so the root bundled cleanly while carrying Node code.
  - **The gate fix:** a new `packages/repo-targets/src/HiddenHostAccess.ts` (23:58) scans each bundle for an `import()` or `require()` with an expression specifier, and for a `getBuiltinModule` call that isn't feature detection. `browser-check.mjs` runs it on every browser and Worker bundle (00:03). `test/HiddenHostAccess.test.ts` has 7 cases; the first is named for this leak.
  - **The probe** (scratchpad `probe-gate-fails-on-leak.log`, 23:59): the new gate on the old code fails `@smthrs/flows` for exactly those three calls. It also flags stale `NODE_ONLY` rows: `@smthrs/platform-bun`, and the removed `@smthrs/flows/NodeRuntime` and `SandboxedFlow` subpaths.
  - **The code fix:** `HostAdapter.ts` is gone. `SandboxMerge.apply` now needs the host to provide jj's `RepositoryMutation` fence (`NodeJj.layerRepositoryMutation` on Node and Bun). `jj/src/Jj.ts`, `node/NodeJj.ts` and a new `NodeJjLock.test.ts` changed at 00:00, `execHandles.ts` and the sandbox tests at 00:01, and the sandbox and jj docs at 00:01.
  - **After the fix** (`gate-after-fix.log`, 00:05): "browser contract holds: 38 browser entry points, each for a browser and a Worker, 6 Node-only." `@smthrs/flows` bundles at 3,610 kB for both.
- 00:08: no coverage result or changeset on disk. `docs/libraries.md` still names `@smthrs/flows/NodeRuntime` and lists the removed subpaths as known violations ([library catalog](library-catalog.md)). No report.


- 00:11 to 00:15 on 2026-10-20, on disk, unreported:
  - **Export maps:** the public-export check (scratchpad `exportcheck.mjs`, 00:12) passes `@smthrs/flows`, `platform-browser`, `platform-bun` and `platform-node`, and fails `@smthrs/agent`, `harness`, `model`, `build-cli`, `observability` and `testing`. The fixture `public-export-surface.json` changed at 00:12.
  - `check-dependency-boundaries.mjs` crashed at 00:13 on a Playwright trace file that L1's e2e run deleted mid-scan; the agent is rerunning it.
  - **Docs:** `flows` `README.md`, `docs/api.md`, `installation.md`, `quickstart.md`, `docs/README.md` and `troubleshooting.md`, and the `platform-node` and `platform-bun` API pages. Install lines now add `@smthrs/platform-node`.
  - **Collateral break:** `flows/sandbox/PACKAGE.ts` (lines 49 and 60) still names `flows/src/SandboxedFlow.ts` and `src/internal/SandboxedFlowGuest.ts`, both moved to `platform-node`. Every `smthrs docs` target fails with "matches no file": the [integrations](integrations-effect-httpclient.md) agent hit it at 00:03 and F1 at 00:13 ([flows and the agent](flows-and-agent.md)). `flows/PACKAGE.ts` no longer names the old path.

- 00:16 to 00:25 on 2026-10-20, on disk, unreported:
  - **The catalog is corrected** (`docs/libraries.md`, 00:18). "Run flows in a Node or Bun program" names `@smthrs/platform-node` and `@smthrs/platform-bun`, and the `@smthrs/flows` row says a Node program calls `NodeRuntime.layerHost` from `@smthrs/platform-node` ([library catalog](library-catalog.md)).
  - **The changeset**, `.changeset/flows-host-runtimes-to-platform-packages.md` (00:19), marks `@smthrs/flows`, `platform-node`, `platform-bun`, `jj` and `sandbox` major. The native runtimes moved to the host packages with the same API, and `@smthrs/flows` no longer installs `@effect/sql-sqlite-node` or `esbuild`.
  - **The stale paths are fixed** (00:24). `flows/sandbox/PACKAGE.ts` now names `platform-node/src/SandboxedFlow.ts` and `platform-node/src/internal/SandboxedFlowGuest.ts`, so `smthrs docs` targets can run again. The lead had told the agent to fix this first.
  - A forked helper of this agent, started 00:11, moved the host sections of the flows docs into `platform-node`'s. `pnpm docs:sync` ran at 00:24, and `pnpm docs:check` started at 00:24, after the disk was freed ([disk space](disk-space.md)).
  - **Test runs in the scratchpad, best guess this agent's:** `jj` passes 434 tests at 100% (00:20) and `platform-bun` 126 at 100% (00:23). Three are red. `@smthrs/flows` is at 96.87% branches, one branch at `Runtime.ts` line 125 short of its 100% gate (00:24). `sandbox` fails 3 of 797 (00:20). `repo-targets` fails `CiSelection.test.ts`, whose `smthrs targets //packages/...` call errored (00:20).

- 00:26 to 00:29 on 2026-10-20, on disk, unreported, best guess this agent's:
  - `flows/test/Runtime.test.ts` changed at 00:26, best guess for the uncovered branch at `Runtime.ts` line 125.
  - **Docs pass:** `smthrs docs` for `//packages/smithers/flows:docs`, `platform-node:docs` and `platform-bun:docs` succeeded at 00:29 (scratchpad `smthrs-docs.log`). The full `pnpm docs:check`, Go half included, passed at 00:28 (`docs-check.log`, [disk space](disk-space.md)).
  - **`sandbox` is down to 1 red** of 797 tests, at 100% coverage (`t-sandbox.log`, 00:26 to 00:29): `RealExistingContainer.integration.test.ts`, "reads, edits and patches the container's files, never the host's", against a real container engine.
  - No new result for `repo-targets`' `CiSelection.test.ts` or `@smthrs/flows`' branch coverage.


- 00:39 on 2026-10-20: **done, reported**, uncommitted. The `@smthrs/flows` root bundles cleanly for a browser and for a Worker.
  - **Why the gate passed:** `@smthrs/sandbox`, which the flows root re-exports, loaded `@smthrs/jj/node/NodeJj` with `import(adapter)`, where `adapter` is a variable. esbuild leaves that unbundled without an error or warning. A second hidden path was an unguarded `process.getBuiltinModule("node:v8")` in the sandbox's garbage-collection helper.
  - **Gate fix:** `browser-check.mjs` bundles every browser entry twice, once for a browser and once with wrangler's Worker conditions. `packages/repo-targets/src/HiddenHostAccess.ts` fails the gate on a dynamic `import()` or `require()` with a variable specifier, or an unguarded `getBuiltinModule` call. On the leaky tree it failed `@smthrs/sandbox` and `@smthrs/flows` on both targets (scratchpad `probe-gate-fails-on-leak.log`). After the fix, all 38 entries pass on both.
  - **Leak fix:** the `@smthrs/jj` root gains a `RepositoryMutation` service and `retryGitIndexLock`. `SandboxMerge.apply` requires that service instead of importing NodeJj, and Node or Bun hosts provide it with `NodeJj.layerRepositoryMutation`. The garbage-collection helper checks for the built-in before calling it.
  - **The move:** `NodeRuntime`, `NativeRuntime`, `SandboxedFlow` and `TestNodeRuntime` come from the `@smthrs/platform-node` root. `BunRuntime` comes from the `@smthrs/platform-bun` root and loads `bun:sqlite` only when a database opens. The old flows subpaths are deleted with no re-export shims, and `@smthrs/flows` no longer depends on `platform-node`. About 90 consumers moved, plus tests, fixtures and security-review checks. `apps/mvp/worker` imports are unchanged, and `platform-browser` and `platform-cloudflare` are untouched.
  - **The stale paths** were in `sandbox/PACKAGE.ts` and `.smithers/coding-project.json`; both are fixed, and `smthrs docs //packages/smithers/flows:docs` passes.
  - **Proof:** flows, `platform-node`, `platform-bun`, `jj`, `sandbox` and `repo-targets` pass at 100% coverage. Typecheck, lint and dprint are clean for all six, plus typecheck for the CLI, agent, integrations, gateway, mcp, control, `.smithers/flows` and `platform-browser`. The browser gate, `pnpm docs:sync` and `pnpm docs:check` pass. Node smoke: `smthrs flow list` answered only "Could not determine repository", so the agent ran the documented quickstart, which goes through `NodeRuntime.layerHost` and printed "the note".
  - **Reds it didn't cause:** the sandbox suite's `RealExistingContainer` reads file mode 666 where it expects 644 (environment). `platform-cloudflare` tests named the removed `CloudflareHost.isAlive` ([B1 follow-ups](b1-follow-ups.md) item 2, in progress). The release tests pack 50 packages where 49 are expected, the export-map check fails on new subpaths in agent, model and other packages, and the dependency-boundary check fails on one `apps/app` import.
  - **Still stale:** `pnpm target-index` can't regenerate `.smithers/target-index.json`, because root `//:sdkJevRules` declared `packages/smithers/ui/test/**`, which doesn't exist. The release fixture `public-api-baseline.json` needs a refresh from the release api-baseline flow.
- 00:39 to 00:40: the lead fixed the root `sdkRuleTests` glob to `@smthrs/ui`'s `tests/` folder (`PACKAGE.ts`, 00:39) and started one agent for the repo-wide reds ([repo checks green](repo-checks-green.md)). The lead told Will: "The flow runtime's root is now platform-neutral, and the gate that missed the leak is fixed".

- 01:17:57 on 2026-10-20: **Codex Astra review 3's finding 5 (P2, source-verified)** says the move left ambient platform code in a library ([code reviews](code-reviews.md)):
  - `packages/smithers/flows/sandbox/src/internal/execHandles.ts:49` to `:63`, reachable through `@smthrs/sandbox` and the `@smthrs/flows` root, inspects ambient `process` and `Bun`, loads `node:v8` and `node:vm`, changes V8 flags and creates a VM context.
  - Making `getBuiltinModule` optional stops the browser crash but doesn't move the code into a host package. The new browser check exempts that optional-call shape, so a green check doesn't prove the boundary.
  - Codex's fix: a collector injected as a host Effect service, with Node and Bun versions in their platform packages and an explicit no-op elsewhere; `@smthrs/sandbox` keeps only the portable counter and policy.

- By 01:19 on 2026-10-20: **finding 5 is accepted and assigned** to its own agent. It moves `execHandles`' Node and Bun code behind a host service, and tightens `HiddenHostAccess` in `repo-targets` so the browser check stops exempting the optional `getBuiltinModule` shape ([code reviews](code-reviews.md)). Status moved from done to in-progress: the root still reaches platform code, so the rule this item proves isn't met.
- 01:40 to 01:43, on disk, unreported: `sandbox/test/ExecHandles.test.ts` (01:40) drives `collectEvery` and `started` against an injected `GarbageCollector` service with a counting collector, and `sandbox/src/MicrosandboxSandbox/GarbageCollector.ts` (01:43) has `layerGarbageCollectorNoop`, the no-op for hosts without one. `execHandles.ts` is unchanged since 00:21, and no `platform-node` or `platform-bun` file has changed.

- 01:43 to 01:53 on 2026-10-20, on disk, unreported: **finding 5's fix.**
  - **The library:** `sandbox/src/internal/execHandles.ts` (01:43) keeps only the counter and the policy. It takes a `GarbageCollector` service, and no longer reads `process` or `Bun` or loads `node:v8` or `node:vm`.
  - **The hosts:** `platform-node/src/NodeGarbageCollector.ts` (01:45) sets `--expose-gc` on its first collection and takes `gc` from a fresh VM context. `platform-bun/src/BunGarbageCollector.ts` (01:46) uses `Bun.gc`. Each has a test and a root export. `layerGarbageCollectorNoop` covers hosts without one.
  - **The gate:** in a governed module, `repo-targets/src/HiddenHostAccess.ts` (01:52) now reports every `getBuiltinModule` call. A new test: "reports a governed module's reads of the ambient process, Bun and Deno globals". `browser/browser-check.mjs` and `browser-contract.mjs` changed at 01:53; the check fails on a `KNOWN_HOST_ACCESS` entry that no bundle reports any more.
  - **With it:** the real-sandbox integration tests in `sandbox` and `platform-node` (01:47), the sandbox docs (`api.md`, `guides/choose-a-provider.md`), and `.smithers/flows/issue-sweep/vm.ts` (01:48), best guess providing the Node collector.
  - Not yet: the report, or proof that the tightened check fails on the old `execHandles.ts`.
- 01:50 on 2026-10-20, outside this item: **another root reaches Node.** In the app's dev server, `@smthrs/agent`'s root reaches `@smthrs/std`'s `node:dns/promises`. The browser contract doesn't list `@smthrs/agent` ([agent root in the browser](agent-root-browser-safe.md)).

- **02:26:57 on 2026-10-20: finding 5 is fixed, reported**, uncommitted. Status back to done.
  - **The library:** `@smthrs/sandbox` no longer reads `process` or `Bun`, loads `node:v8` or `node:vm`, or sets V8 flags. `MicrosandboxSandbox.make` requires a `collector`, the new `MicrosandboxSandbox.GarbageCollector` Effect service. The every-64th-start counter stays in `internal/execHandles.ts`, kept per collector instance.
  - **The hosts:** `NodeGarbageCollector.layer` in `platform-node`, `BunGarbageCollector.layer` in `platform-bun` (which now depends on `sandbox`), and `layerGarbageCollectorNoop` for hosts without one, so `platform-browser` needs no new layer. `.smithers/flows/issue-sweep/vm.ts` picks the collector by runtime.
  - **The gate:** in a workspace package outside the host packages, `HiddenHostAccess` now fails on any `getBuiltinModule` call, optional or not, on reads of the `process`, `Bun` or `Deno` globals, and on `node:` or `bun:` strings. A unit test and a probe that bundles the old `execHandles.ts` both fail with 4 findings; the old rules reported none.
  - **The list:** 10 other modules read the host directly. They go in a new `KNOWN_HOST_ACCESS` list in `browser-contract.mjs` and in `docs/libraries.md`, and the gate fails when an entry goes stale, so the list only shrinks ([known host access](known-host-access-burn-down.md)).
  - **Proof:** 100% coverage in `sandbox`, `platform-node`, `platform-bun` and `repo-targets`; the Bun lane is green; typecheck, eslint and dprint are clean; the browser gate passes for a browser and a Worker; `docs:sync` ran.
  - **Not proven:** `pnpm docs:check` and `smthrs docs` returned "Something went wrong on our side". `smithers-build` targets were blocked by `@smthrs/std`'s `PACKAGE.ts`, which still names the moved `NodeLanguageServer.ts` ([agent root in the browser](agent-root-browser-safe.md)). Two real-container sandbox tests were excluded to report coverage; they fail on a file mode, 666 where 644 is expected, as before.
- 02:27:02: the lead to Will: "Astra finding #5 is fixed. The sandbox library no longer touches Node or Bun directly; garbage collection now comes from a host service, with Node, Bun and no-op versions. The browser gate is also stricter: a probe of the old code fails it with 4 findings, where the old rules reported none."
- 14:20 on 2026-10-20: the Codex coordinator on the [Latitude server](second-build-machine.md) has finding 5 (`execHandles`' host code) as task (b), to fix if still open on `main@origin`. This note records it fixed at 02:26:57; if that fix never reached `main`, the lane redoes it and may collide with round 3 ([land to main](land-to-main.md)).

## Next

None for this note. The 10 listed modules are [known host access](known-host-access-burn-down.md). `docs:check` and `smthrs docs` rerun once `@smthrs/std`'s `PACKAGE.ts` stops naming `NodeLanguageServer.ts` ([agent root in the browser](agent-root-browser-safe.md)). The Fable review covers this fix ([code reviews](code-reviews.md)).

Until 02:26:57 on 2026-10-20 the next step was, from 01:19: the sandbox agent's report. Proof: `@smthrs/sandbox` has no ambient `process`, `Bun`, `node:v8` or `node:vm`; the collector comes from a host Effect service, with Node and Bun layers in `platform-node` and `platform-bun` and an explicit no-op elsewhere; and the tightened `HiddenHostAccess` fails on today's `execHandles.ts`, checked before the fix lands. Then the Fable review ([code reviews](code-reviews.md)).

Until about 01:19 on 2026-10-20 the next step was: the lead fixes or rejects review 3's finding 5, ambient Node and Bun code in `@smthrs/sandbox` that the browser check exempts ([code reviews](code-reviews.md)). Status stays done until the lead rules on it.

Until 01:18 on 2026-10-20: none for this note. Its leftovers moved: the repo-wide reds to [repo checks green](repo-checks-green.md), and item 3 of the [B1 follow-ups](b1-follow-ups.md), the one `Crypto` layer, which waited for this agent and can start now.

Until 00:39 on 2026-10-20 the next step was: the agent's report: `@smthrs/flows` back at 100% branches, `sandbox` and `repo-targets` green, every touched package at 100% coverage, and `smthrs docs` and `pnpm docs:check` passing. Then item 3 of the [B1 follow-ups](b1-follow-ups.md), the one `Crypto` layer, which waits for it.

Until 00:24 on 2026-10-20 the next step was: fix the stale `SandboxedFlow` paths in `flows/sandbox/PACKAGE.ts` first, since two other agents' docs checks wait on it. Then the agent's report: 100% coverage on every touched package, a changeset for the moved exports (`@smthrs/flows` loses its `NodeRuntime` and `SandboxedFlow` subpaths; consumers import them from `@smthrs/platform-node`), the docs and the [catalog](library-catalog.md) rows corrected, and the gate fix with its probe. The [B1 follow-ups](b1-follow-ups.md) wait for it.

Until 00:08 on 2026-10-20 the next step was: the agent's report: the root bundles for a browser and a Worker with no Node code, proven by a bundle test like the integrations root's `BrowserBundle.test.ts`; host code lives in the platform packages, and consumers provide it from there; 100% coverage, docs, and the catalog rows corrected. The [B1 follow-ups](b1-follow-ups.md) wait for it.

## Questions for Will

None. Open for the lead: why did the browser contract pass with the leak? If it checks only the root's own imports, it should bundle the root the way a browser and a Worker do. (Answered on disk by 00:05 on 2026-10-20: the gate did bundle the root, but it failed only on an unresolved `node:` import. The sandbox reached Node through an `import()` with an expression specifier and two `process.getBuiltinModule` calls, which a bundler leaves alone. See State.)
