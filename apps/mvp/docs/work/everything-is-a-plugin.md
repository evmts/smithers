---
title: Everything is a plugin (P2 public interface design)
status: in-progress
area: design
owner: slice 0 credential builder; later plugin slice owners to be assigned
updated: 2026-10-20
links: [../rulings.md, ../decisions/0017-everything-is-a-plugin.md, ../design/plugins/plugins.html, will-decision-queue.md, maintainer-site.md, flow-authoring.md, prompt-flows-are-code-flows.md, maintainer-app-plugins.md, plugin-design-extra-review.md]
---

## Current specification — 2026-10-20, 18:04 PDT

**What:** Build the reviewed public plugin interface on Flow.make and the existing SDK.

**Why:** First-party and external features share one public interface (PLUGIN-1).

**Current state:** Will’s design approval and additional Astra/Fable review are recorded in 0017. At 17:56 the lead started core slice 0, server-issued credentials. No completed plugin runtime or first proving-plugin receipt exists.

**Next step:** Finish slice 0 before needs-you production use; then prove needs-you through the public interface and as a sandboxed app. QuickJS hosts authored flow code, sandboxed frames host React apps and containers host machine work.

**Open questions for Will:** None.

Evidence: lead text replies extracted by script from the latest two transcript hours through 2026-10-21 01:03:57 UTC; queue rulings through 00:42:06 UTC; current rulings and decision 0017 override historical panel proposals. Product checks and landing receipts are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 17:56 PDT

**What:** A core of 16 primitives plus plugins. Every plugin is a `plugin.json` binding `Flow.make` flows to contribution points; anything not compiled in runs in a sandbox (QuickJS realm for code, a sandboxed frame for React apps, a container for machine work).

**Why:** PLUGIN-1 to PLUGIN-3 and M-55; Will approved [decision 0017](../decisions/0017-everything-is-a-plugin.md) at 17:03.

**Current state:** Approved by Will 17:03; Astra and Fable reviews applied; ready to build slice 0. Not built. Fable's verdict was "ready to build slices 0 and 1" once two contracts were written in, and both now are: the host draws and keys every person-only action in an action strip (`select` and `propose` on the host contract and bridge, a `$key` grammar for keybindings, the slice 1 Queue built that way), and every run except a person's root press gets a server-minted credential whose `act` the server sets from the registry, with the person-only route list generated from `userOnlyReason` and `app` added to `Actor.act`. Before slice 3: host-drawn attribution on every frame and realm view, no inline credential prompts, password inputs refused at admission, a views-origin wrapper with `frame-src 'self'` and a zero-foreign-requests test, and `src/pwa.ts:34` narrowed. All nine citation drifts are fixed; one sub-point (the agent's cells and QuickJS) is rejected with `packages/smithers/agent/src/Agent.ts:53`.

**Next step:** Build slice 0 (the registry's `acts` mark, the run credential, the generated person-only list, refusal tests including `chat/Answer` → `run/answer`), then slice 1 (`needs-you` with the host's action strip).

**Open questions for Will:** None.

Evidence: decision 0017's review-fixes tables (Astra and Fable), each citation read in the current code (`src/flows/registry.ts:137`, `:181`, `:185`; `worker/Actor.ts:20`; `src/pwa.ts:26-34`; `worker/Runs.ts:251`; `ui/views/src/PresentationRealm.ts:86-93, 237-240`; `docs/features/flows.md:162`, `:199`; 0005:208; 0004:138, :157). Design only; no runtime enforcement is proved.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 17:44 PDT

**What:** Expose features through one public plugin interface, including React apps and flows over flows.

**Why:** Will requires first-party and external plugins to use the same interface.

**Current state:** Will approved the design at 17:03, clarified arbitrary React apps, QuickJS as a sandbox and dogfooded queue workflows. Astra fixes are recorded; Fable final additions were being written at 17:40. Construction has not been reported started.

**Next step:** Finish the reviewed decision, build credential slice 0, then the small needs-you queue and later sandboxed parity proof.

**Open questions for Will:** None for this update.

Evidence: queue answers through 2026-10-21 00:42:06 UTC and script-filtered human text/lead replies from 22:43–00:43 UTC; current rulings and decision 0017 supersede historical briefs. Product checks are reported evidence; this tracker validates the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:26 PDT

**What:** A core of 16 primitives plus plugins. Every plugin is a `plugin.json` that binds `Flow.make` flows to contribution points; anything not compiled in runs in a sandbox (QuickJS realm for code, sandboxed frame for React apps, container for machine work).

**Why:** PLUGIN-1 to PLUGIN-3 and M-55. Will approved [decision 0017](../decisions/0017-everything-is-a-plugin.md) at 17:03: "Looks good but you should have fable and astra review this one extra time".

**Current state:** Approved by Will 2026-10-20 17:03; Astra review fixed; Fable review pending. Not built. Will's three answers are recorded verbatim and each changed the design: every plugin and the agent can ship a React app in a sandboxed frame; the QuickJS realm is a sandbox, so repository and personal code (hand-edited personal flows included) runs there; flows over flows are first-class, and the product queue becomes one after dogfooding. Astra's 4 P1s and 9 P2s are all fixed in the design, none rejected (0017, "Review fixes"). The review page is [design/plugins/plugins.html](../design/plugins/plugins.html).

**Next step:** Fable reviews 0017. Then slice 0 (a server-minted run credential with `act`; person-only routes refuse it; a production prerequisite that can start now) and slice 1 (`needs-you`: `Plugin.Manifest`, `Load`, `PluginHost`, `core/waits`, five contribution points, no Later, no Pack conversion).

**Open questions for Will:** None.

Evidence: decision 0017 and its review fixes, each Astra citation checked against the code (`worker/Actor.ts:20`, `worker/Runs.ts:220-223`, `agent/plugin/src/Plugins.ts:152-164`, `status/contract.ts:30`, `registry/src/Pack.ts:260-281, 307, 436-475`, `worker/secrets/SandboxEgress.ts:22-50`, `flows-ui/source.ts:42-109`). Design only; no runtime enforcement is proved.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 17:24 PDT

**What:** Expose one public manifest, durable flows and UI contributions to every plugin.

**Why:** Keep first-party and external features on the same interface.

**Current state:** Decision 0017 now records Will’s approval and all three answers. Its Astra review-fixes table accepts and addresses all four serious and nine medium findings in the design. Fable review remains pending; nothing is built. The design now specifies server-minted invocation authority, per-installation secret grants and fail-closed hook semantics.

**Next step:** Obtain Fable review of the corrected design, reconcile findings, then implement the small needs-you skeleton. Run credentials are slice 0 and a production prerequisite; external React apps and parity are slice 3, the QuickJS flow host slice 5. Design fixes do not prove runtime enforcement.

**Open questions for Will:** None.

Evidence: script-extracted user-typed text and lead replies from session 6253ecf2, latest two hours through 2026-10-21 00:23:43 UTC; queue answers through 00:06:34 UTC; current rulings and decision 0017, including its Astra fixes. Older briefs and proposals yield to these rulings. Completion and tests are reported evidence; this tracker validates the site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:14 PDT

**What:** Expose the same manifest, flows and UI contributions to first-party, repository and personal plugins.

**Why:** Every feature uses the public plugin interface.

**Current state:** Will approved the design at 17:03 and requested extra Astra/Fable review. His separate answers allow arbitrary React apps for every plugin, embedded in chat or full screen; QuickJS counts as a sandbox; the maintainer queue graduates after quality dogfooding as a workflow over other workflows. At 17:13 Astra reported four serious and nine medium findings; the design fix pass is active. No plugin implementation is reported.

**Next step:** Reconcile every Astra finding and all answers in 0017, then obtain Fable review before the first needs-you slice. Built-in React runs directly; external React uses an isolated frame, QuickJS handles safe code, containers serve machine needs. These placements are the lead’s implementation interpretation, subject to review.

**Open questions for Will:** None.

Evidence: script-extracted human text and lead replies from session 6253ecf2, latest two hours through 2026-10-21 00:13:56 UTC; queue answers through 00:06:34 UTC; current rulings, decisions, proposals and shared briefs. Queue answers supersede older design proposals. Test results are lead-reported; this tracker runs the site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:05 PDT

**What:** Public plugin manifests bind durable flows to the app’s shared contribution points.

**Why:** PLUGIN-1–3 require the same interface for first-party and external features.

**Current state:** Will approved the merged design: “Looks good but you should have fable and astra review this one extra time”. The lead prepared the extra-review brief at 17:05. Design review remains active; no completed extra reviews or implementation receipt is available.

**Next step:** Complete the requested Fable and Astra reviews, reconcile findings, then build the reviewed first slice through @smthrs/plugin. Track that follow-up in [plugin-design-extra-review.md](plugin-design-extra-review.md).

**Open questions for Will:** No fresh approval request. The three individual design-choice queue items have no separate answers; retain their detail without treating the overall design as unapproved.

Evidence: queue answer `design:plugins-merged@1f45`, 2026-10-21 00:03:52 UTC, and the lead's 17:05 PDT `PLUGIN-REVIEW-BRIEF.md`. Will's latest answer outranks the older proposed-status wording in decision 0017. Review and implementation completion are not inferred.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 15:33 PDT

**What:** A core of 16 primitives plus plugins. Every feature, ours included, is a `plugin.json` manifest that binds `Flow.make` flows to contribution points.

**Why:** PLUGIN-1 to PLUGIN-3 and M-55: first-party and external features share one public interface.

**Current state:** Merged. The four panel designs (Opus, Fable, Sol, Astra) are synthesized into [decision 0017](../decisions/0017-everything-is-a-plugin.md), status proposed, with the review page [design/plugins/plugins.html](../design/plugins/plugins.html). Not built. Not approved.

**Next step:** Will reviews 0017 and answers its three questions. Then slice 1: the manifest in `@smthrs/plugin` and the `needs-you` plugin over 0015's waits and `run/answer`.

**Open questions for Will:** (1) Built-in plugins may draw with React through the public kit (recommended), or must use the views realm? (2) Repository and personal code runs only in a sandbox for now (recommended), or also in a QuickJS realm on the device? (3) The queue is a product feature, `needs-you`, for every person (recommended), or a maintainer tool?

Evidence: the four designs in the session scratchpad (`final/panel-p-{opus,fable,sol,astra}.md`), the brief, rulings and M-55; each adopted claim was checked against the code cited in 0017. No product test was run; this is a design.

## Earlier tracker history

## Current specification — 2026-10-20, 15:24 PDT

**What:** Design the public plugin interface and minimal core.

**Why:** First-party and external features must share public flow and UI contracts (PLUGIN-1–3).

**Current state:** At 15:16:33 PDT all four independent designs were reported complete and synthesis started. Opus/Fable allow compiled React contributions; Sol/Astra favor the views contract. Neither synthesis completion nor Will approval is evidenced.

**Next step:** Reconcile disagreements against code, produce the proposed decision and one-page visual summary, and queue them for Will. Build only after his review.

**Open questions for Will:** Review the merged design; individual panel proposals remain proposals.

Evidence: Will’s typed messages and lead text replies, extracted from session `6253ecf2` for its latest two hours through 15:23:55 PDT; [rulings](../rulings.md), queue answers through 14:36 PDT, shared briefs/designs and current decisions, proposals, TODOs and rules. Receipts above are reported, not fresh product tests run by this tracker.

## Current specification — 2026-10-20, 15:10 PDT

**What:** Design the public plugin interface and minimal host before implementing the P2 migration.

**Why:** PLUGIN-1 to PLUGIN-3 require first-party and external features to share the public interface.

**Current state:** Sol, Astra and Fable designs are available; the lead confirmed three of four at 14:55. No Opus design or merged approval is evidenced. A real panel disagreement remains: Fable permits bundled first-party React entries, while Sol/Astra put feature UI through the shared views contract. Package names and activation models are still proposals.

**Next step:** Obtain the fourth design, reconcile trust/UI and activation differences, synthesize a single decision and present it to Will. Implementation waits for his review.

**Open questions for Will:** Review the merged design before building; panel proposals are not accepted decisions.

Evidence: recent user text and lead replies from session `6253ecf2`, extracted through 15:10 PDT; [rulings](../rulings.md) and queue answers through 14:36 PDT. Reported completion is distinguished from a test run by this tracker.

## What

The app is a core of primitives (the plugin host, flows and dispatch, the catalog, runs, identity, access, sync, the shell and its slots, commands and keys, the UI kit with blocks and the views realm, attention, models, secrets, system flows, telemetry and host services) plus plugins. Every other feature, Smithers' own included, is a plugin: a folder with a `plugin.json` manifest, decoded by `Plugin.Manifest` in `@smthrs/plugin`, that binds `Flow.make` flows to views, slots, commands, keys, cards, settings, triggers, hooks and model roles. A plugin acts only through flows and draws with blocks, a realm view, or, when compiled into the build, React from the public kit. Trust comes from where a plugin came from; a merge activates a repository plugin, and an Admin binds any secret it names.

## Why

Will's 14:40 message makes this a strong product rule, at P2, running alongside release work. See [PLUGIN-1 to PLUGIN-3](../rulings.md#0-everything-is-a-plugin-strong-rule) and mvp.md M-55. Today each feature costs about ten hand edits across the registry, declarations, registrations, boot, providers, router, shell and telemetry; [0017](../decisions/0017-everything-is-a-plugin.md#why) lists them.

## Current state

Design merged, not built, awaiting Will's review. The biggest differences and their resolution:
- **Package:** extend `@smthrs/plugin` and drop the registry's `Pack.Manifest`, rather than a new `@smthrs/app-plugin` or `@smthrs/plugins`.
- **Renderers:** blocks and realm views for every plugin; React components only for plugins compiled into the build (Will's question 1).
- **Slice 1:** `needs-you`, a view of the waits 0015 already records, answered with `run/answer`; no new table. The curator, external asks, review plugins and repository plugins follow in slices 2 to 4.
- **Manifest:** `plugin.json` for every tier; a repository plugin's flows stay in `.smithers/flows/` (M-49).

## Next step

On Will's approval: write the spec text in 0017 into root `AGENTS.md`, mvp.md (§2 rule 8, the §3 Plugin row, M-55 amended) and rulings.md; then build slice 1 (`Plugin.Manifest`, `check` and `Load` in `@smthrs/plugin`; the app's adapters; the `needs-you` plugin; Flows and Runs links as slot entries). Library entries used: `@smthrs/plugin`, `@smthrs/registry`, `@smthrs/flow`, `@smthrs/views` and `@smthrs/ui` from the library catalog; no second runtime.

## Open questions for Will

The three in [0017](../decisions/0017-everything-is-a-plugin.md#open-questions-for-will), each with a recommendation.
