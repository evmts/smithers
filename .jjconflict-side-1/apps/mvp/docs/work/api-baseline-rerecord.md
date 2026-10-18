---
title: Record the API baseline again after the SDK agents land
status: todo
area: sdk
owner: unassigned; raised by the repo-checks agent's report (about 02:06 on 2026-10-20)
updated: 2026-10-20
links: [repo-checks-green.md, agent-root-browser-safe.md, code-reviews.md, one-sqlite-one-leader.md, app-wiring.md, flows-root-platform-neutral.md, land-and-deploy-mvp.md, observability.md]
---

## What

Record the release fixture `.smithers/flows/release/fixtures/public-api-baseline.json` again, through the release `api-baseline` flow, once the SDK agents still running have landed. The check asks for each package's declaration diff, consumer type tests and release notes to be reviewed before the baseline is updated.

## Why

The [repo checks](repo-checks-green.md) agent recorded the baseline for 50 public packages at 01:52 on 2026-10-20, and the check matched at 01:57. SDK packages changed after that, so the check goes red again until it is recorded with a review of each diff.

## State

- About 02:06 on 2026-10-20: the repo-checks agent's report says the baseline needs recording again after the remaining SDK agents land.
- Public API changes since 01:57, on disk, unreported:
  - `@smthrs/platform-browser`: `BrowserEngine`'s `start`, `result`, `cancel` and `signal` take a `BrowserEngine.FlowReference` (changeset `browser-engine-flow-reference.md`, 02:14, minor), from the wiring agent ([app wiring](app-wiring.md)).
- Still running and likely to change declarations: the [agent root](agent-root-browser-safe.md) agent (`@smthrs/agent`, `@smthrs/std`, `platform-node`, `platform-bun`), the fix agent for Astra findings 1 and 4 (`@smthrs/model`'s `ModelProxy`), and the sandbox agent for finding 5 (`@smthrs/sandbox`) ([code reviews](code-reviews.md)).
- 02:18 to 02:35 on 2026-10-20, more public API changes, uncommitted:
  - `@smthrs/sandbox`: `MicrosandboxSandbox.make` requires a `collector`, the new `MicrosandboxSandbox.GarbageCollector` service; `platform-node` exports `NodeGarbageCollector` and `platform-bun` `BunGarbageCollector` (reported 02:26:57, [flows root](flows-root-platform-neutral.md)).
  - `@smthrs/std` loses its `NodeLanguageServer` subpath, recorded as an explicit `null` denial in the export-map contract; `platform-node` exports `NodeLanguageServer`. The fixture still lists the old subpath ([agent root in the browser](agent-root-browser-safe.md)).
  - `@smthrs/observability`'s `Otlp.Options` gains `spans`; `platform-browser`'s `BrowserRuntime.RunOptions` gains `telemetry`; `@smthrs/effect-electric` drops `SubsetPolicy` (changeset `electric-proxy-drops-subsets`, minor, breaking) ([observability](observability.md)).
  - Findings 1 and 4 are reported (about 02:16), so `@smthrs/model`'s `ModelProxy` changes are settled ([code reviews](code-reviews.md)).
- Still running at 02:35: the agent-root agent. Not assigned.

- **03:15:18 on 2026-10-20: the agent-root SDK agent reported done and left the baseline stale on purpose.** Recording it with `check-api-baseline.mjs --build-declarations --update` would also record other agents' pending API changes ([agent root in the browser](agent-root-browser-safe.md)). Its own changes, from changeset `agent-root-browser-safe.md` (02:56): majors for `@smthrs/std`, `@smthrs/platform-node` and `@smthrs/registry`, a minor for `@smthrs/kernel`, patches for `@smthrs/agent` and `@smthrs/cli`. The declaration changes: `NodeLanguageServer` moves from a std subpath to the `platform-node` root, `platform-node` now depends on std, `Prompt.compile` returns an Effect, and the kernel gains `HttpClient.ResolveHost` and `ambientEnvironment()`. The export-map contract already passes with the new `Prompt.compile` (39 of 39, 03:08).
- Every SDK agent this note waited on has now reported. The wiring agent, which changed `platform-browser`'s `BrowserEngine` at 02:14, is still running.

## Next

From 03:15 on 2026-10-20: once the wiring agent reports, so no package is still changing, run the `api-baseline` check, review each package's declaration diff against its changeset, then record. Proof: "Declaration baseline matches" every public package, and `pnpm docs:check` passes.

Until 03:15 on 2026-10-20 the next step was: after those agents report: run the `api-baseline` check, review each package's declaration diff against its changeset, then record. Proof: "Declaration baseline matches" every public package, and `pnpm docs:check` passes.

## Questions for Will

None. Open for the lead, carried from [repo checks](repo-checks-green.md): was each of the five packages' diffs reviewed with its changeset before the 01:52 recording?
