---
title: The agent talks through UI (feature 3)
status: in-progress
area: app
owner: views fix agent (assigned by 01:19 on 2026-10-20), Codex Astra review 3's finding 2: `@smthrs/views` spans through `SpanFailure`, with a sentinel test (reported fixed about 01:58; sent back to close the `ViewCodeError.message` leak; fully done about 02:08 on 2026-10-20, 116 tests at 100%); V1+V2 agent (started 23:01 on 2026-10-19), the SDK half, done (reported 00:36 on 2026-10-20); V3 to V5, the app half, wait on the wiring agent (since about 01:17), now that F5, the browser agent, is done (about 01:16); designed by Panel A (Opus lead, Sol)
updated: 2026-10-20
links: [review-round-4.md, app-wiring.md, ../decisions/0004-agent-ui-codemode-and-rendering.md, ../decisions/0004-agent-ui-codemode-and-rendering-comparison.md, ../decisions/0003-flows-and-the-agent.md, ../decisions/0006-repo-clone-and-view.md, design-questions.md, ../decisions/0011-the-agent-runs-in-the-browser.md, model-endpoint.md, agent-evals.md, agent-repo-navigation.md, flows-and-agent.md, disk-space.md, durable-browser-engine.md, sdk-test-reds.md, repo-checks-green.md, flows-root-platform-neutral.md, code-reviews.md, observability.md, repo-clone-and-view.md]
---

## What

The agent asks with forms and shows complex information as views, small inline in chat or full screen. Codemode is the existing cell loop (`ctx.call` over the flow catalog) in QuickJS. A render call carries a description; a renderer agent writes React. QuickJS renders it to HTML with the real `@smthrs/ui` components, and a locked-down frame shows it, so generated UI never runs in the browser's JavaScript engine. Templates (repo view, issues, form) need no model call. A form submission becomes the next question.

## Why

Will: "The agent has the ability to talk to us in forms. Note the agent uses codemode for everything." "if I ask for a tic tac toe board it shouldn't have issues doing that. This should be safe. Have a panel design this before implementing it and make it clean."

## State

- Decision 0004 is proposed. Nothing is built.
- Spike: React 19 rendered our components in QuickJS at 1.5 to 3 ms per render.
- Rendering in QuickJS closes the hole the old app documented. Repo pages embed in the chat shell with a full-screen view, not the standalone pages the CEO agent chose on Oct 18.
- 21:21 on 2026-10-19: the lead asked Will to accept the recommended answers below in one batch ([design questions](design-questions.md)). No answer yet.
- 22:32: **Q1 answered yes:** views are pure layouts with declared events. Will: "this makes sense go with your best judgement here I like yhow you are thinking".
- 22:34: **Q2 answered:** the renderer uses the same model as the agent, and Will wants it "super easy to configure by us as admins". Each model use is a named role (`agent`, `renderer`, `judge`) that the server's [model endpoint](model-endpoint.md) resolves from an admin setting. `admin/SetModel` changes it with no deploy; it is audited, admin-only and never run by an agent.
- 22:35: **Q3 answered yes:** "Yes it syncs this is what enables multiplayer to work". Views are conversation rows, synced to every device and every person in the conversation; scroll position and open tabs stay per device. **Decision 0004 is accepted.**
- 0004's status line says the agent's placement follows [0011](../decisions/0011-the-agent-runs-in-the-browser.md), in the browser where its body says Cloudflare. Its body isn't revised for 0011 yet.
- No build agent is assigned.
- 23:01: **V1 and V2 started**, the SDK half of 0004:
  - **V1, new package `@smthrs/views`** (`packages/smithers/ui/views`): `ViewCode`, `PresentationRealm`, `Bridge`, `Interactions` and `ViewCsp`, as 0004 §1 to §6 specify. The QuickJS spike becomes `PresentationRealm`'s tests. The same render must work in Node and in local workerd and bundle for the browser (added to `browser-contract.mjs`).
  - **V2, `@smthrs/ui`:** the renderer components (`presentation`, `generated-view`, `flow-form-view`), 0004 §3's templates (the GitHub repo view, issues and forms), and the small and full-screen sizes.
  - **Security:** sanitizer fuzzing with retained counterexamples, and browser probes for the parent DOM, storage, `fetch`, navigation and inline handlers.
  - **Placement:** wherever 0004 says the renderer or realm runs on Cloudflare, it now runs on the browser host (0011); the code stays host-agnostic.
  - Quality: 100% coverage, docs (README, guide, API) and a `docs/libraries.md` row.
  - **Not now:** V3 (app views in `apps/mvp`), V4 ([evals](agent-evals.md)) and V5 (e2e). They wait on the browser agent and the [model endpoint](model-endpoint.md).
- 23:02: the lead's board: "3 Agent UI: views SDK + renderer (new) → app views + evals, after the agent flow".
- 23:07: `packages/smithers/ui/views` doesn't exist yet; nothing under `packages/smithers/ui/src` has changed.
- 23:10 to 23:13: `packages/smithers/ui/views` now exists, unreported: `src/Bridge.ts`, `src/Interactions.ts`, `src/ViewCsp.ts` and `src/internal/bytes.ts`, plus three prototype scripts at the package root (`_p.mjs`, `_proto_entry.js`, `_proto_run.mjs`).

- 23:16 to 23:25: **V1 is writing `@smthrs/views`**, unreported:
  - `src/ViewCode.ts` (23:19), `src/PresentationRealm.ts` and `src/index.ts` (23:20), `src/Presentation.ts` (23:24), `src/internal/vocabulary.ts` and `src/internal/harden.ts` (23:23); `Bridge.ts` and `Interactions.ts` changed again at 23:25. All five modules 0004 names now exist.
  - `package.json` (23:21) adds QuickJS: `quickjs-emscripten-core` 0.32.0 with the synchronous `@jitl` release builds for Node and the browser.
  - Test fixtures for a bundle, QuickJS, a worker and workerd (23:21 to 23:22), toward the "same render in Node, workerd and the browser" proof. Two throwaway tests, `_smoke.test.ts` and `_workerd.test.ts`, appeared at 23:21 to 23:22 and are gone, as are the three prototype scripts.
  - Tests on disk: `test/Interactions.test.ts` and `test/ViewCsp.test.ts` (23:24 to 23:25). None yet for `PresentationRealm`, `ViewCode` or `Bridge`, and no sanitizer fuzzing.
  - Not yet: V2 (`packages/smithers/ui/src` is unchanged), docs, a `browser-contract.mjs` entry and a `docs/libraries.md` row.

- 23:24 to 23:37, on disk, unreported:
  - **V1 has tests for every module:** `Bridge`, `Interactions`, `ViewCsp`, `PresentationRealm`, `Presentation`, `ViewCode` and `markup`, plus `ViewCode.property.test.ts`, a property test over view code, and the three-host proof, `Workerd.test.ts` and `BrowserBundle.test.ts`. Every `src` module changed again at 23:37.
  - A first example, `examples/render-a-view.ts`, with `test/Examples.test.ts` (23:37).
  - **V2 has started** in `@smthrs/ui`: `src/flow-form-view` (`FlowFormView.tsx`, its CSS and index) and `src/issues-view` changed at 23:25, with `tests/flow-form-view.test.tsx` and `tests/issues-view.test.tsx` (23:27).
  - Two throwaway root scripts, `_t.mjs` and `_f.mjs`, appeared and were gone by 23:37.
  - Still not on disk: docs (`docs/` is empty), a `browser-contract.mjs` entry and a `docs/libraries.md` row.
- 23:33: the lead lists V1+V2 as still running.

- 23:37 to 23:44, on disk, unreported: V2's `@smthrs/ui` work grew. `src/generated-view/` (`GeneratedView.tsx`, `frame.ts`, `runtime.ts`, `sanitize.ts`, its CSS and a generated runtime) and `src/presentation/` (`components.ts`, `entry.ts`, `index.ts` and a generated bundle), built by `scripts/build-views.mjs`, with `tests/presentation-conformance.test.tsx`. `@smthrs/views`' `PACKAGE.ts` changed at 23:38.
- 23:39 and about 23:41: the [model endpoint](model-endpoint.md), with the `renderer` role, and the [durable browser engine](durable-browser-engine.md) are done, and F5 started the browser agent. V3 to V5 now wait on F5 alone ([flows and the agent](flows-and-agent.md)).

- 23:48 on 2026-10-19 to 00:01 on 2026-10-20, on disk, unreported:
  - **V2:** `@smthrs/ui`'s `generated-view/frame.ts` and its test (23:48), the generated runtime (23:49), `src/index.ts` and `uiCss.ts` (23:48), `tests/generated-view.test.tsx` (23:54), and a real-browser test, `browser/generated-view.browser.test.ts` (23:55), with its host fixture.
  - **V1:** `ViewCsp.ts` and its test changed again (23:54).
  - **Docs and changelogs, which agents write last:** `@smthrs/views` has `README.md`, `docs/README.md`, `render-a-view.md`, `security.md`, `api.md` and a changelog (23:58 to 23:59). `@smthrs/ui` has a new guide, `show-a-generated-view.md` (23:59), and updated `api.md`, `README.md` and changelog (00:00). `PACKAGE.ts` changed at 23:55 and a code-view snapshot at 00:01.
  - The [catalog](library-catalog.md) has the `@smthrs/views` row. At 00:05 the browser contract bundles `@smthrs/views` for a browser and a Worker ([flows root](flows-root-platform-neutral.md)). No report.


- 00:09 to 00:15 on 2026-10-20: **`pnpm docs:check` refused to run.** Its go-shim needs 5 GiB free and the Mac had 3 GiB. The agent deleted its coverage temp directories and ran the docs-sync check directly (00:10, no result on record). Free disk was 2.3 GiB at 00:15. No report.

- 00:24 on 2026-10-20, on disk, unreported: V1+V2 changed `@smthrs/views`' `PACKAGE.ts`, `docs/api.md` and `test/Examples.test.ts`. By 00:24 the lead had freed the disk to 8.5 GiB, so `pnpm docs:check` can run again ([disk space](disk-space.md)). No report.

- About 00:37 on 2026-10-20: still running. `@smthrs/views` (`packages/smithers/ui/views`) has no change after 00:24, and no app file changed for it. The full `pnpm docs:check` passed at 00:28 on the tree as it stood ([disk space](disk-space.md)). No report.


- 00:36 on 2026-10-20: **V1+V2 is done, reported**, uncommitted. The SDK half of 0004 is built.
  - **V1, `@smthrs/views`** (`packages/smithers/ui/views`): `ViewCode`, `PresentationRealm`, `Bridge`, `Interactions` and `ViewCsp` as 0004 §1 to §6 specify, plus `Presentation`, the part that runs inside the realm. 108 tests at 100% coverage. The same render matches byte for byte in Node and local workerd (Miniflare). It is in `browser-contract.mjs`, bundles without a Node import, and has its `docs/libraries.md` row.
  - **V2, `@smthrs/ui`:** `GeneratedView`, the frame script, the sanitizer, the 30-component subset with `loadPresentationBundle`, `FlowFormView`, `IssuesView`, both sizes, and root exports of `declaredInput` and `formFieldsFor`. The full suite passes, 2,097 tests, and every new file has 100% line and function coverage. All 30 subset components render in the realm as React renders them. The repo template is feature 2's `RepoView`, not wrapped.
  - **Security:** real-Chromium probes (`bun test browser`) show a hostile view can't reach the parent page, storage, the network, navigation or inline handlers. A second probe runs hostile script inside the frame to show the CSP and sandbox hold on their own. Fuzzing keeps its counterexamples as fixed cases, including one where the parser accepted code the compiler rejects; that now fails as a syntax error.
  - **Upstream change:** the harness root exports `QuickJSVariant`, so views use root imports only. The Node, browser and Worker hosts share one build setting and one compile.
  - **Committed build output:** the realm bundle (128 KB) and the frame script (6 KB) come from `scripts/build-views.mjs`. A staleness test fails until the script is rerun after a subset component changes.
  - `FlowFormView` submissions carry a `writeOnly` list, so the host can keep secret fields out of synced rows.
  - **A likely harness bug, not fixed here:** the harness cell sandbox sets no QuickJS stack limit, so deep recursion in model-written code overflows the host's own stack, and disposing that runtime then aborts. The views realm defaults to 128 KiB and abandons a broken runtime instead of disposing it. The lead gave the harness fix to the SDK reds agent ([SDK test reds](sdk-test-reds.md)).
  - **Checks:** `pnpm docs:sync` ran and `pnpm docs:check` passes. `smthrs docs //packages/smithers/ui/views:docs` and `smithers-build` couldn't run, because of the deleted `flows/src/SandboxedFlow.ts` path; the [flows root](flows-root-platform-neutral.md) agent reported both stale paths fixed at 00:39. Three repo checks were red on other lanes' changes: public export maps (`@smthrs/agent` `ModelStep`), the package contract (flows `package.json`) and dependency boundaries (`apps/app` `LauncherSeam`) ([repo checks green](repo-checks-green.md)).
  - Shared files touched: root `PACKAGE.ts` rule lists, one line in `apps/mvp/docs/rules.md`, `uiCss.ts`, and both lockfiles. Its `bun.lock` refresh also picked up other lanes' pending manifest changes.
  - Design and threat model: `packages/smithers/ui/views/docs/security.md` and `packages/smithers/ui/docs/guides/show-a-generated-view.md`.
- 00:36: the lead told Will the generated-views SDK is done, and that the harness bug "now goes to the agent already working in that package". The app half, V3 to V5, comes after the agent flow; the lead's wiring checklist (scratchpad `final/WIRING.md`, 00:44) lists it after F4+F5.
- **Migration number:** 0004's build plan gives V3 `db/migrations/0005_views.ts`, but `0005_sign_in.ts` and `0006_answer_parts.ts` now exist, so V3 takes the next free number, `0007` at 00:47.

- After 00:47 on 2026-10-20: V3 to V5 are in the lead's [app wiring](app-wiring.md) step, after the agent flow. `src/features/views` doesn't exist yet.
- About 00:55 on 2026-10-20: the harness bug V1+V2 found is fixed: the cell sandbox bounds QuickJS's stack at 128 KiB, the views realm's bound; an overflow that reaches the host becomes `limit_exceeded` (`"stack"`) and the runtime is abandoned, not disposed ([SDK test reds](sdk-test-reds.md)).

- 01:17:57 on 2026-10-20: **Codex Astra review 3's finding 2 (P1, reproduced) is in `@smthrs/views`** ([code reviews](code-reviews.md)). A generated view can export its private props through a failed span:
  - The realm copies a guest-thrown error's message into `RealmError` (`packages/smithers/ui/views/src/PresentationRealm.ts:287` to `:292`), and render and interaction use plain `Effect.withSpan` (`:433` to `:437`, `:456`), so the message becomes the span's failure.
  - A valid component that runs `throw new Error(props.secret)` sends view data to the tracing backend, despite the frame's network isolation. Accidental errors that quote content leak the same way, and credential redaction doesn't catch arbitrary content. It breaks `obs.content-free` ([observability](observability.md)).
  - Codex reproduced it through the real `ViewCode.check` and the QuickJS realm: the `PresentationRealm.render` span failed with `RealmError.message: "Error: PRIVATE_VIEW_SENTINEL"`.
  - Codex's fix: the existing content-safe `SpanFailure` boundary for render and interaction, exporting only a fixed reason or limit code, with a sentinel-props test over captured spans, reducer failures included.

- About 01:16 on 2026-10-20: **F4+F5 is done** ([flows and the agent](flows-and-agent.md)). The agent flow V3 to V5 wait on now runs on the device. It reaches the app in the wiring agent's step, started about 01:17 ([app wiring](app-wiring.md)).
- By 01:19: **finding 2 is accepted and assigned** to a views fix agent: spans through `SpanFailure`, with a sentinel test ([code reviews](code-reviews.md)).
- 01:23 to 01:24, on disk, unreported:
  - `PresentationRealm.ts` ends `PresentationRealm.render` and `PresentationRealm.interact` with `SpanFailure.withSpan` from `@smthrs/flow`, a new dependency in `package.json` and `PACKAGE.ts`.
  - The new `test/ContentFree.test.ts` makes a real checked view throw a sentinel from its props, state or event, inside a caller's span that also logs the failure. It exports traces, logs and metrics through Effect's OTLP exporters to a collector that keeps every body, and requires the sentinel in none of those bytes; the caller still reads it from the error's redacted `detail`.
  - `PresentationRealm.test.ts` changed at 01:24, and the package's `CHANGELOG.md`, `docs/api.md` and `docs/render-a-view.md` after it.
- **Migration number again:** `0007_repositories.ts` (01:09) belongs to the repo view ([repo clone and view](repo-clone-and-view.md)), so V3 takes the next free number when it starts.

- About 01:58 on 2026-10-20: **the views fix agent reported finding 2 fixed.**
  - `RealmError.message` is fixed text per reason and limit. The thrown text moved to a redacted `detail`, read with `Redacted.value`. Render and interact spans end through `SpanFailure.withSpan` and carry only `realm.reason` and `realm.limit`. The `@smthrs/ui` generated-view code has no spans or logs, so it needed no change.
  - `ContentFree.test.ts` has five cases: a render throwing its props, a reduce throwing its state and event, a re-render after reduce, a refused import, and the HTML limit. It failed first: `PRIVATE_VIEW_SENTINEL` appeared in the realm span, the caller's span and its log events.
  - The views suite passes 114 tests at 100% coverage, and workerd 4 of 4. Typecheck, lint, import rules, circular, the `@smthrs/ui` bundle check and its 35 generated-view tests, `pnpm docs:sync`, `pnpm docs:check` and `smthrs docs` pass too. `docs/api.md`, `docs/render-a-view.md`, `CHANGELOG.md` and a new security-review check in `PACKAGE.ts` changed with it. Nothing is committed.
  - **Left:** `ViewCodeError.message` quotes identifiers from the model-written module. The agent listed it under known limits in `docs/security.md` and didn't fix it. The lead sent the same agent back to close that leak too, "instead of leaving it as a known limit". `src/ViewCode.ts` and `test/ContentFree.test.ts` changed again at 01:59.
- **Migration number:** `0008_browser_answering.ts` (01:46) is the wiring agent's, so V3's migration is 0009 at the earliest.

- **About 02:08 on 2026-10-20: finding 2 is fully done.** The views fix agent's second report closes the `ViewCodeError` leak. The lead to Will: "compile errors no longer quote the model's code in traces, and a sentinel test proves it. Astra finding #2 is fully fixed, with 116 tests at 100% coverage." `docs/security.md` (01:59) lists `PresentationRealm`, `RealmError` and `ViewCodeError` under telemetry: "each error's `message` names only its reason and limit", and what the checker quotes stays in the redacted `detail`. Its known limits no longer list the `ViewCodeError` leak; they keep one rule for callers: "`detail` is the caller's to guard" ([code reviews](code-reviews.md), [observability](observability.md)).
- 02:00 on 2026-10-20: `ui/views/PACKAGE.ts` changed; 02:03 to 02:07: `pnpm docs:sync` and `pnpm docs:check` runs in the scratchpad's `views-f2/` folder, best guess this agent's.

- **11:04:02 on 2026-10-20: [review round 4](review-round-4.md)'s R4-9 (P1, Claude Opus P1-3, reproduced by a fork): the views presentation realm doesn't freeze what a view can reach.** `packages/smithers/ui/views/src/Presentation.ts:128-146` and `:181-185`: `install` hardens `globalThis`, but the module facades reached through the `require` closure get a shallow `Object.freeze`, so React's `Children`, every `@smthrs/ui` component function, `require` and `event` stay writable. A view that passes `ViewCode.check` sets `Children.toArray` to capture its argument; a later view rendered with `props.secret` passes children through Radix Slot (`Button asChild`); a third view reads the capture. The fork ran it on the shipped `bundle.generated.ts`. Contradicts `ui/views/docs/security.md:15`. The poison test (`test/PresentationRealm.test.ts:372`) replaces facade properties but never mutates the objects behind them. Fix: deep-harden the whole `InstallOptions` graph (React, the JSX runtime, every component), `require` and the `smithers:view` object before the first view runs; add the `Children.toArray` and `Card.x` cases. Unrouted by 11:07.
- Opus P3-11, unrouted: the sandboxed-frame handshake exists twice (`adapters/terminal-frame/TerminalFrame.tsx:122-161` and `GeneratedView.tsx:82-127`, plus `frame.ts`), a duplicate implementation; every `GeneratedView` reports the others' `ui/initialize` as `wrong_source` (`GeneratedView.tsx:87-95`); `framedPageTarget` accepts any `https:` URL when the host origin is unknown under SSR (`web-page/webPageUrl.ts:93`); OSC 8 terminal links can show one URL and open another (`frame.ts:60`); `jsonValueText` rounds int8 ids above 2^53.

## Next

From 11:07 on 2026-10-20: the lead rules on round 4's R4-9 (P1) and routes the fix, with the mutation cases added to the poison test ([review round 4](review-round-4.md)); the duplicate frame handshake goes with it.

Until 11:07 on 2026-10-20 the next step was: First, from about 02:08 on 2026-10-20: the Fable review of the fixed views code, after the other Astra fixes report ([code reviews](code-reviews.md)).

(Until about 02:08 the first step was, from about 01:58: the views fix agent's second report. `ViewCodeError.message` carries no identifier from the model's module, with a sentinel test that fails on today's code. Then the Fable review.)

(Until about 01:58 the first step was the views fix agent's first report, below.)

First, from 01:19 on 2026-10-20: the views fix agent's report, with `ContentFree.test.ts` failing on the old realm and passing on the fix, and `@smthrs/views` at 100% coverage. Then the Fable review ([code reviews](code-reviews.md)).

(Until about 01:19 the first step was: the lead fixes or rejects review 3's finding 2, view data leaking into failed spans, before V3 builds on the views SDK.)

V3 to V5, the app half, once the wiring agent puts F5's agent flow in the app ([app wiring](app-wiring.md); until 01:16, once F5's agent flow ran in the browser, [flows and the agent](flows-and-agent.md)): V3, the app views in `src/features/views`; V4, the [evals](agent-evals.md); V5, e2e with a GIF per flow and `docs/features/views.md`. Before landing, `smthrs docs //packages/smithers/ui/views:docs` must pass, and the [repo checks](repo-checks-green.md) must be green.

Until 00:36 on 2026-10-20 the next step was: V1+V2's report. Then V3 to V5 once the agent flow runs in the browser ([flows and the agent](flows-and-agent.md)).

Until 23:01 the next step was: the views SDK and the template path first, with tests proving a view can't reach the parent DOM, storage or the network.

The renderer's model comes from the `renderer` role on the [model endpoint](model-endpoint.md).

## Questions for Will

- Generated views are pure layouts with declared events: no timers, canvas, network or third-party widgets. Enough for now? Recommended: yes. (Answered 22:32: yes.)
- May the renderer move to a paid frontier model if evals show Qwen's views fail? Recommended: Qwen until then. (Answered 22:34: the same model, configurable by admins.)
- Should views sync across devices? Recommended: yes. (Answered 22:35: yes.)
- None open.
