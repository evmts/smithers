---
title: Host-agnostic flows and local-first placement
status: in-progress
area: app
owner: lead (rules and lint, done); W5 (c) (the Node and Miniflare proof, done 23:39); B1 (the browser host, done about 23:41); F5 agent of decision 0003 (the agent flow on the Node host, done about 01:16 on 2026-10-20); flows-root agent (the SDK root, done 00:39 on 2026-10-20); sandbox host-boundary agent (Codex Astra review 3's finding 5, since about 01:19; done 02:26:57 on 2026-10-20); agent-root SDK agent (`@smthrs/agent` and `@smthrs/std`, since about 02:05; its real-Chromium test passed 02:30:57)
updated: 2026-10-20
links: [agent-root-browser-safe.md, cloudflare-flow-host.md, ../rules.md, ../decisions/0003-flows-and-the-agent.md, ../decisions/0010-web-first-desktop-later.md, flows-and-agent.md, durable-answering.md, design-questions.md, web-first-desktop-later.md, everything-is-a-durable-flow.md, infrastructure-as-code.md, import-rules-and-jev-lint.md, ../decisions/0011-the-agent-runs-in-the-browser.md, durable-browser-engine.md, model-endpoint.md, pwa.md, integrations-browser-safe-root.md, one-sqlite-one-leader.md, flows-root-platform-neutral.md, code-reviews.md, app-wiring.md, known-host-access-burn-down.md]
---

## Current specification — 2026-10-20, 18:26 PDT

**What:** Keep SDK execution portable and make model-call persistence durable across host restarts.

**Why:** Latitude review identified an older model host whose call storage needs a design decision.

**Current state:** At 18:21 the lead reports one review-fix lane stopped because legacy model-host persistence needs design. This is not evidence that the whole portable-host workstream is complete.

**Next step:** Inspect the retained finding and design the shared durable storage seam before resuming that fix; preserve compatibility and use the existing flow runtime.

**Open questions for Will:** No new question until engineering establishes which product tradeoff needs Will.

Evidence: latest two session hours extracted by script as human text/lead replies; queue answers through 2026-10-21 01:24:15 UTC, current rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Latest rulings override historical proposals. Product results are reported receipts; this pass verifies the maintainer-site build only.

## Earlier tracker history (retained)


## What

The agent and every flow are host-agnostic Effect programs. Cloudflare reaches them only as injected layers, wired in four places: `worker/ChatApi.ts`, `worker/index.ts`, `alchemy.run.ts` and `infra/`. The same flow code then runs on Cloudflare, in the native app on `@smthrs/platform-bun` or `@smthrs/platform-node`, or in a sandbox.

Since 22:31 the browser is one more host: `@smthrs/platform-browser` runs the agent and local flows ([durable browser engine](durable-browser-engine.md)). A second rule, `flows.local-first-placement`, says where a flow runs: locally, unless it needs a key the person must not hold, a machine to run code on, or work while every device is off. How long it takes never decides.

## Why

Will, 22:22 on 2026-10-19, answering design question 0003.1: "sure let's do it on cloudflare but make sure our cloudflare code is decoupled from cloudflare via dependency injection because our native app version later will just run the cloudflare code locally". The native app is decision [0010](../decisions/0010-web-first-desktop-later.md)'s later Electrobun build.

Will, 22:29: "Long work isn't what decides if it's remote or not. We prefer things to be local first actaully" and "If smithers doesn't work in browser yet that's a bug it should work in browser via platform-browser".

## State

- 22:22: the lead recorded the answer in decision 0003 under Q1, with Will's words.
- Rule `sdk.host-agnostic-flows` is in `rules.md`, with a Jev question for Cloudflare-only assumptions such as a Worker `env` binding, a Durable Object or `ExecutionContext` reaching flow code.
- `ImportRules` in `apps/mvp/PACKAGE.ts` (22:22) forbids `alchemy`, `alchemy/**`, `cloudflare:*`, `@cloudflare/**` and `@smthrs/platform-cloudflare` in `src/**`, `db/**`, `worker/` files other than `ChatApi.ts` and `index.ts`, `worker/*/**`, `e2e/**` and `bench/**`. A probe file confirmed the lint catches an import.
- At 22:24 only `worker/ChatApi.ts`, an allowed entry, imports Cloudflare or Alchemy, so the current code passes. Uncommitted.
- The Cloudflare host itself, `@smthrs/platform-cloudflare` (W4 of [durable answering](durable-answering.md)), is already a separate host package that provides layers.
- Not built: the test that runs each flow on a non-Cloudflare host. No agent flow exists yet ([flows and the agent](flows-and-agent.md) F5).
- 22:30: `rules.md` adds `flows.local-first-placement` (scope: every flow `apps/mvp` defines or starts; enforced by Jev). Both rules are Jev rubrics in `apps/mvp/PACKAGE.ts`, beside the existing `ImportRules` forbid.
- 22:31: decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md) §6: the same agent and flows run in the browser, in the native app, on Cloudflare or in a sandbox; only the injected host layers change.
- The non-Cloudflare host test is still unbuilt. B1's tracer bullet on the browser host will be the first.

- 22:42: decision 0005 Q2 applies the same separation to sandboxes. Will: "This is a great question! So we want the sandbox to only expose the sandbox and it's tool and the agent to be independent of that. We want as modular/durable an architecture as possible." A sandbox exposes only its machine and tools as durable steps; the agent binds them from whichever host it runs on ([connecting it all](connect-agents-sandboxes-forge.md)).
- 22:42: the 0011 docs agent names W5 (c) as who wires `@smthrs/platform-cloudflare`'s flow host into `worker/`, the entry files this rule allows to import Cloudflare ([durable answering](durable-answering.md)).
- 22:59: **W5 (c) started** ([Cloudflare flow host](cloudflare-flow-host.md)). Its proof is the first non-Cloudflare host test: the same 2-step flow with a durable sleep runs in local workerd and on the Node host in a unit test. Only the Worker entry files and `alchemy.run.ts` may import Cloudflare.
- 23:01: V1+V2 must render the same generated view in Node and in local workerd and bundle it for the browser ([agent UI](agent-ui-rendering.md)); the integrations agent makes `@smthrs/integrations`' root run on every host ([integrations root](integrations-browser-safe-root.md)).

- 23:19: W5 widened the mvp `ImportRules` in `apps/mvp/PACKAGE.ts`: `worker/Executions.ts` and `worker/ExecutionHost.ts` join `ChatApi.ts` and `index.ts` as Worker entries that may import Cloudflare, and the Jev rubric names all four. Its remote flow, `probe/Pause`, runs in local workerd and on the Node host (`worker/test/flowHost.ts`) ([Cloudflare flow host](cloudflare-flow-host.md)). Unreported.

- 23:27: **`@smthrs/integrations`' root runs on every host**, reported: WebCrypto instead of `node:crypto`, no `Buffer` or `process.env`, and a sandboxed bundle test with only web globals ([integrations root](integrations-browser-safe-root.md)).
- 23:31 to 23:37: the child-flow agent's workerd tests run nested flows and lineages of handoffs, each execution on its own object, unreported ([Cloudflare flow host](cloudflare-flow-host.md)).

- 23:39: **W5 (c) reported**: `probe/Pause` runs on the Node host and in a Miniflare kill-and-resume, the first flow proven on both a non-Cloudflare host and Cloudflare ([Cloudflare flow host](cloudflare-flow-host.md)). The Miniflare run used a stand-in Durable Object, not the real Alchemy class. The worker tsconfigs gained the DOM lib, an open item.
- 23:39: W5 found the same rule broken in the SDK: the `@smthrs/flows` root pulls Node-only jj code into Worker and browser bundles. A new agent makes the root platform-neutral, moving host code to the platform packages with no shims ([flows root](flows-root-platform-neutral.md)).
- About 23:41: **B1 is done**: flows run durably on the browser host in real Chromium ([durable browser engine](durable-browser-engine.md)). F5 started at 23:41; the agent-flow test on the Node host is in its row of 0003's build plan ([flows and the agent](flows-and-agent.md)).

- 23:46 on 2026-10-19 to 00:05 on 2026-10-20, on disk, unreported: the [flows root](flows-root-platform-neutral.md) agent moved `NodeRuntime`, `NativeRuntime`, `SandboxedFlow` and `TestNodeRuntime` to `@smthrs/platform-node`, and `BunRuntime` to `@smthrs/platform-bun`. It also removed the sandbox's hidden `import()` of Node jj. The browser gate now catches that kind of hidden host access, and at 00:05 `@smthrs/flows` bundles for a browser and a Worker under it.
- 00:04: S1's `auth/RecheckRole` is registered on the Cloudflare host. Its header says it "runs on any host; the host injects Postgres and GitHub through `registration`" ([sign-in](sign-in.md)).

- 00:18 to 00:24 on 2026-10-20, on disk, unreported: the [flows root](flows-root-platform-neutral.md) agent's changeset makes the move major for five packages, the catalog now sends Node and Bun programs to the platform packages, and the stale `SandboxedFlow` paths in `flows/sandbox/PACKAGE.ts` are fixed. `@smthrs/flows` is one branch short of its 100% coverage gate.
- 00:21: the Cloudflare host runs child flows and handoffs on their own Durable Objects ([Cloudflare flow host](cloudflare-flow-host.md)).


- 00:39 on 2026-10-20: **the flows root is platform-neutral** ([flows root](flows-root-platform-neutral.md)). `@smthrs/flows` bundles for a browser and a Worker with no Node code, and Node and Bun programs take `NodeRuntime` and `BunRuntime` from `@smthrs/platform-node` and `@smthrs/platform-bun`. The browser gate now bundles every entry for both targets and fails on hidden host access, so a leak like this one can't pass it again. Left for this note: F5's agent flow on the Node host.

- About 01:16 on 2026-10-20: **F5's Node-host proof is in** ([flows and the agent](flows-and-agent.md)). Per `docs/features/agent.md` and `docs/features/flows.md`:
  - `src/features/agent/agent.test.ts` runs `chat/Answer` on the Node host (`@smthrs/platform-node`) over the compose Postgres, against ChatApi's real model endpoint and answer routes, with a scripted model.
  - `src/flows/dispatch.test.ts` runs the theme on the Node host's engine, and `probe/Pause` through the real remote door.
  - One composition, `AgentHost.layer({ origin })`, serves every host; the host supplies its engine, `Crypto` and an `HttpClient`.
- By 01:19: Codex Astra review 3's finding 5, ambient Node and Bun code in `@smthrs/sandbox`, is assigned to its own agent ([flows root](flows-root-platform-neutral.md)).

- About 02:05 on 2026-10-20: **the agent flow's own root isn't host-agnostic yet.** `@smthrs/agent`'s root reaches `node:dns` through the `@smthrs/std` root, so the app didn't open in a real browser. An SDK agent moves `std`'s host code behind injected services in `platform-node` and `platform-bun`, with a real-Chromium test of an `AgentAction` through `ModelStep` in a `BrowserRuntime` worker ([agent root in the browser](agent-root-browser-safe.md)).
- **02:26:57 on 2026-10-20: the sandbox fix is done.** `@smthrs/sandbox` takes garbage collection from a host `GarbageCollector` service, with Node, Bun and no-op layers, and the stricter browser gate holds 10 other library modules on a list that can only shrink ([flows root](flows-root-platform-neutral.md), [known host access](known-host-access-burn-down.md)).
- **02:30:57: the same agent flow runs in real Chromium.** A `platform-browser` browser test runs an `AgentAction` to completion on `BrowserRuntime` in a dedicated worker, and after a SIGKILL mid-call the relaunched browser resumes and replays the sealed first model call ([agent root in the browser](agent-root-browser-safe.md)). The app's own engine worker still fails at load with `document is not defined` ([app wiring](app-wiring.md)).

## Next

- From about 02:05 on 2026-10-20: the [agent root](agent-root-browser-safe.md) agent's fix: `@smthrs/agent` and `@smthrs/std` import and run in a browser and a Worker, with host code injected from `platform-node` and `platform-bun`.
- The sandbox agent's fix for finding 5: `@smthrs/sandbox` reaches Node and Bun only through a host service ([flows root](flows-root-platform-neutral.md)). (Done 02:26:57 on 2026-10-20.)
- The 10 modules on `KNOWN_HOST_ACCESS` ([known host access](known-host-access-burn-down.md)).
- The same agent flow in a real browser, in the wiring agent's e2e ([app wiring](app-wiring.md)).
- Run the Jev question over `worker/`, now that W5 has landed.

Until about 01:16 on 2026-10-20 the next steps were:

- F5: `chat/Respond` runs on the Node host against real Postgres and a scripted model. (Done about 01:16.)
- The [flows root](flows-root-platform-neutral.md) fix: no Node code in the browser or Worker bundle. (Done 00:39; reopened by 01:19 for finding 5.)
- Run the Jev question over `worker/`, now that W5 has landed.

Until 23:39 the next steps were:

- W5 (c)'s report: the 2-step flow passing on workerd and on Node.
- W5 moves answering into `chat/Answer`: its body stays free of Cloudflare imports, and only `worker/ChatApi.ts` wires the Cloudflare layer.
- F5: the first agent-flow test runs `chat/Respond` on the Node host against real Postgres and a scripted model.
- Run the Jev question over `worker/` once W5 lands.
- B1's tracer bullet runs a flow on the browser host ([durable browser engine](durable-browser-engine.md)).
- Since 22:31 the first bullet is superseded: answering moves to the browser agent, and W5 (c) wires the Cloudflare host into `worker/` for remote flows only.

## Questions for Will

- "Run the cloudflare code locally": the lead reads this as the same Effect flows on the Bun or Node host with injected local services, not a bundled local workerd. Correct? Recommended: yes; dependency injection is what makes the Bun host possible. (Settled 22:31 by decision 0011 §6, accepted by Will: only the injected host layers change.)
