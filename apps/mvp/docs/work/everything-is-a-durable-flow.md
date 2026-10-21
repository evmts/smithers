---
title: Everything is a durable flow (rule and guardrails)
status: done
area: process
owner: lead (smithers-b3), SDK cleanup agent
updated: 2026-10-20
links: [integrations-durable-retries.md, issue-sync-ingest-retry-loop.md, ../../../../AGENTS.md, ../../../../docs/libraries.md, ../rules.md, model-step.md, durable-answering.md, route-ban-any-receiver.md, ../decisions/0011-the-agent-runs-in-the-browser.md, durable-browser-engine.md, model-endpoint.md, cloudflare-flow-host.md, flows-and-agent.md, app-wiring.md, sign-in.md, code-reviews.md, agent-root-browser-safe.md, prompt-flows-are-code-flows.md]
---

## What

Every action, every model call included, is a durable `@smthrs/flow` step on one of our hosts: the user's machine, Cloudflare or a sandbox. Apps never write retries, sweeps or background jobs, and never use Cloudflare Workflows, `waitUntil` jobs, Temporal, Inngest, the Vercel AI SDK or LangChain in their place. A missing host is SDK work.

## Why

Will: "This is important our entire application will be built on top of durable workflows. We are going to treat every action the agent does as a durable workflow ... Everything should be durable by default. There should be no thinking about retries and stuff". The lead had reached for Cloudflare Workflows; Will: "how can I make it so other agents don't make same mistake".

## State

- Root `AGENTS.md` opens with the rule, marked permanent: commit `59508f920aa1` (local).
- `apps/mvp/AGENTS.md` and `docs/libraries.md` point to it, and every brief repeats it.
- The substitute-runtime import ban is in the repo-wide boundary check (`packages/repo-targets/PACKAGE.ts`).
- Unverified: a ban on direct `Model.stream` calls outside the flow and agent packages.
- About 21:44 on 2026-10-19: [`ModelStep`](model-step.md) is done, so the SDK has a durable, sealed model call. The app has no consumer yet.
- About 21:52: `apps/mvp` lint bans `*.waitUntil` on any receiver; its one failure is `worker/ChatApi.ts:56`.
- 22:25: Will: "A syncronous change to storage is by default durable yea." 22:29: "If smithers doesn't work in browser yet that's a bug it should work in browser via platform-browser". 22:31: decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md) makes the browser a durable host: the agent and local flows run on `@smthrs/flow` with their step record in SQLite on OPFS ([durable browser engine](durable-browser-engine.md), B1). The rule's "user's machine" host now includes the browser tab.
- 23:01: [Codex checkpoint review 2](code-reviews.md) ranks the live answer path as a P1 violation of this rule: `worker/ChatApi.ts` still answers through `waitUntil` and a cron sweep and calls the model outside a flow. It is known, retained wiring; [durable answering](durable-answering.md) W5 (d) deletes it once the browser agent answers.

- 23:39: the [model endpoint](model-endpoint.md) is done: browser model calls go through the server, metered, each a `ModelStep` on the caller's engine. Remote flows run on the `FlowExecution` Durable Object ([Cloudflare flow host](cloudflare-flow-host.md)).
- About 23:41: **the browser is a durable host.** B1's real Chromium test kills the browser mid-run, and the run resumes without re-running a finished step ([durable browser engine](durable-browser-engine.md)). F5 started the browser agent; the app's `waitUntil` path and every-minute sweep go when it lands ([flows and the agent](flows-and-agent.md)).

- 00:21 on 2026-10-20: the Cloudflare host wakes children and parents through alarms and store records only, with no sweep or `waitUntil` ([Cloudflare flow host](cloudflare-flow-host.md)).
- 00:25: the integrations agent found the rule broken in the SDK: `@smthrs/integrations` retries inside steps with an Effect `Schedule`, on top of the engine's retry policy, and `OAuthToken` has a hand-rolled sleep-and-reread loop. Its own item: [durable integration retries](integrations-durable-retries.md).

- About 01:03 on 2026-10-20: **the SDK breach is fixed.** `@smthrs/integrations` makes one request per call and the flow engine is the only retry; one GitHub write makes at most 3 requests, not 12, and a `Retry-After` holds across a crash ([durable integration retries](integrations-durable-retries.md)). One unused hand-rolled loop is left, queued for deletion ([issue-sync retry loop](issue-sync-ingest-retry-loop.md)).

- About 01:16 on 2026-10-20: the browser agent answers as a durable flow on the device: `chat/Answer`, with every model call a sealed `ModelStep` ([flows and the agent](flows-and-agent.md)). About 01:17 the wiring agent started deleting the app's breach: server answering in `waitUntil`, with its cron, sweep and `attempts` ([durable answering](durable-answering.md)). By 01:43 `worker/Answer.ts` is gone; `worker/ChatApi.ts` still has `waitUntil` and the cron.
- By 01:19: the fix for Codex Astra review 3's finding 4 serializes token redemption through the flow layer, instead of a compare-and-swap after GitHub answers ([sign-in](sign-in.md)).

- 01:44 to 01:59 on 2026-10-20, on disk, unreported: **the app's breach is deleted in the working tree.** `worker/ChatApi.ts` and `worker/Chat.ts` (01:53) have no `waitUntil`, cron or sweep, and migration 0008 drops `attempts` ([durable answering](durable-answering.md)). New work follows the rule: `auth/RevokeGitHubToken` and `auth/KeepRole` are durable flows with engine retry policies ([sign-in](sign-in.md)). Not yet reported, and the app doesn't yet open in a real browser ([app wiring](app-wiring.md), [agent root in the browser](agent-root-browser-safe.md)).
- **14:26:24 on 2026-10-20, Will (queue):** "No everything is a flow this ruling is clear prompt flows are just a type of code flow". A personal flow drafted from a prompt becomes `Flow.make` source like any other flow ([prompt flows are code flows](prompt-flows-are-code-flows.md)).

## Next

The wiring agent's report: with server answering deleted, the app stops breaking the rule ([durable answering](durable-answering.md), [app wiring](app-wiring.md)). Then the unused [issue-sync retry loop](issue-sync-ingest-retry-loop.md) goes.

Until about 01:17 on 2026-10-20 the next step was: the app itself still breaks the rule until [durable answering](durable-answering.md) lands.

The browser host lands with B1 ([durable browser engine](durable-browser-engine.md)). Answering leaves `waitUntil` when the browser agent answers.

## Questions for Will

None.
