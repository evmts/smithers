---
title: Land and deploy the new app
status: blocked
area: process
owner: Will (code review)
updated: 2026-10-20
links: [app-wiring.md, ../infrastructure.md, ../../../../AGENTS.md, infrastructure-as-code.md, decisions-for-will.md, ../decisions/0011-the-agent-runs-in-the-browser.md, model-endpoint.md, durable-browser-engine.md, sign-in.md, integrations-browser-safe-root.md, gitremote-unicode-branches.md, integrations-effect-httpclient.md, flows-root-platform-neutral.md, flows-and-agent.md, cloudflare-flow-host.md, repo-checks-green.md, local-first.md, pwa.md, agent-ui-rendering.md, repo-clone-and-view.md, code-reviews.md]
---

## What

Push the new app's commits to `main` and deploy it with Alchemy, so Will can test it live.

## Why

Root `AGENTS.md`: development work lands on `main` and deploys through the existing workflow. Will reviews this app's code before it moves: "I will review the code before moving on."

## State

- About 20 commits sit locally above `main` (`sxvryvvl` through `202c3efc59`), plus uncommitted agent work. Nothing is pushed or deployed.
- Deploy needs [infrastructure as code](infrastructure-as-code.md) for Neon and Electric first.
- Asking Smithers needs sign-in (Will, 2026-10-19), so [sign-in](sign-in.md) must land before a public deploy, along with [token-spend alerts](token-spend-alerts.md).
- About 21:44 on 2026-10-19: [infrastructure as code](infrastructure-as-code.md) is done as code; the plan passes against empty state. The real `pnpm plan` waits on Will's Cloudflare token (Secrets Store read, Hyperdrive edit) or `alchemy login`, plus `CLOUDFLARE_ACCOUNT_ID` and `NEON_ORG_ID`.

- About 22:00: the lead's ranked asks to Will put a narrower review first: `packages/effect-tanstack-db` and `packages/effect-electric` (fourth of five on [decisions for Will](decisions-for-will.md)). Pushing still waits on Will's review of the app's code and on the Cloudflare token (second of five).
- 22:13: the Cloudflare token is fixed and the real `alchemy plan --stage prod` passed: 7 to create, 7 binding changes, 1 task (`ChatMigrations`). Nothing deployed. [Infrastructure as code](infrastructure-as-code.md) is done, so the deploy no longer waits on infrastructure.
- Still waiting: Will's code review, his explicit yes to deploy, [sign-in](sign-in.md) before a public deploy lets anyone ask, and [token-spend alerts](token-spend-alerts.md). Durable answering (W5) is stalled because Will stopped W1 at 22:08; until W5 lands, a deploy would ship ChatApi's interim every-minute answer sweep.
- 22:16: Will said the stop was unintentional; the lead restarted W1 at 22:17, and a fresh replacement started about 22:20 from the work on disk. W5 is no longer stalled on Will.
- About 22:18: `CLOUDFLARE_ACCOUNT_ID` and `NEON_ORG_ID` are saved in `apps/mvp/.env` (gitignored, mode 0600), so every `pnpm plan` and `pnpm deploy` reads them ([infrastructure as code](infrastructure-as-code.md)).
- 22:31: decision 0011 rescopes W5 to the [model endpoint](model-endpoint.md) and message writes; answering moves to the browser agent on the [durable browser engine](durable-browser-engine.md). A public deploy still needs [sign-in](sign-in.md), which the endpoint enforces.
- 23:00: **Will sets the order.** "once we finish everything we got so far I need to test the app review the code we are so far away from mvp right now". His review comes after the current feature list (features 1 to 3 first), not before each piece.
- 23:01: [Codex checkpoint review 2](code-reviews.md) found two P1s and two P2s in the uncommitted work; review findings run beside Will's own review.
- 23:02: the lead: "When the agent flow and repo view land in the app, I'll tell you it's ready to test, with what to try." Seven agents are building: B1, W5 (a)+(c), L1, V1+V2, the integrations root, the 0007 rewrite and the Codex review (done 23:01).

- 23:27: two pieces done: the [integrations root](integrations-browser-safe-root.md) (with a webhook security fix) and the [`GitRemote` fix](gitremote-unicode-branches.md). 23:33: still running: B1, W5 (a)+(c), L1, V1+V2, the Cloudflare child-flow fix and the integrations move to [Effect HttpClient](integrations-effect-httpclient.md).

- 23:39 to 23:41: done: W5 (a)+(c) ([model endpoint](model-endpoint.md), [Cloudflare flow host](cloudflare-flow-host.md)) and B1 ([durable browser engine](durable-browser-engine.md)). Started: S1 ([sign-in](sign-in.md)), the [flows root](flows-root-platform-neutral.md) fix, F1 and F4+F5 ([flows and the agent](flows-and-agent.md)). Still running: L1, V1+V2, the child-flow fix and the HttpClient move. The lead: "When F5 and local-first land, I wire them into the app, delete the old server-side answering, and tell you it's ready to test."


- 00:36 to 00:44 on 2026-10-20: done: V1+V2 ([agent UI rendering](agent-ui-rendering.md), the SDK half), the [flows root](flows-root-platform-neutral.md) and L1 ([local-first](local-first.md), [PWA](pwa.md)). Started about 00:40: [repo checks green](repo-checks-green.md), the repo-wide reds that block landing. At 00:44 the lead wrote the wiring checklist (scratchpad `final/WIRING.md`), which runs after F4+F5 and S1 report and turns the parts into an app Will can test. Still running at 00:47: F4+F5, S1, the SDK reds and B1 follow-ups, the integrations retries, the edge cache and the repo-checks pass.

- 00:53 on 2026-10-20: a plan (scratchpad `plan.log`, whose run and stage aren't on record) is ready in 5.7 s: 8 to create, 8 binding changes, 1 task (`ChatMigrations`). Against the 7 at 22:13 on 2026-10-19, the new resource is `SessionSecret` ([sign-in](sign-in.md)). It still creates `ChatApi/Cron(* * * * *)`, the sweep the [app wiring](app-wiring.md) step deletes, beside `ChatApi/FlowExecution`.
- After 00:47: the step that turns the parts into an app Will can test is its own note, [app wiring](app-wiring.md). Will's review and the deploy come after it.
- About 01:00 on 2026-10-20: [sign-in](sign-in.md) is built, the prerequisite for a deploy that lets people ask. Before the first deploy: the lead's wiring step closes its three policy gaps ([app wiring](app-wiring.md)), and Will registers the localhost callback URL; the production callback URL is registered after the deploy. The deploy also needs `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET` from `GH_CLIENT_ID` and `GH_CLIENT_SECRET`, and `CODE_STORAGE_KEY` once R3 lands ([repo clone and view](repo-clone-and-view.md)).

- About 01:17 on 2026-10-20: the wiring agent started. It ends by leaving the dev server on `:1337` for Will to test ([app wiring](app-wiring.md)). Deleting the cron changes the deploy plan: `ChatApi/Cron(* * * * *)` should leave it, and the cutover migration joins the migrations task.
- By 01:19: Codex Astra review 3's five findings are assigned, and a Fable review follows the fixes ([code reviews](code-reviews.md)). Both run beside Will's own review and don't block it.

- 03:07 on 2026-10-20, scratchpad `wiring/plan.log`: **a read-only production `alchemy plan` by the wiring agent**, with the deploy's credential mapping (the GitHub App's client ID and secret from `GH_CLIENT_ID` and `GH_CLIENT_SECRET`; Code Storage org `smithers` and its key). 8 to create, 7 binding changes, 1 task (`ChatMigrations`). `ChatApi/Cron` is gone from the list, as the [app wiring](app-wiring.md) step planned; `ChatApi/FlowExecution`, `SessionSecret`, Electric and `ElectricGateway` are in it. Nothing deployed.
- 03:12 to 03:16 on 2026-10-20: the first full real-browser e2e run of the wired app: 24 of 36 passed; the wiring agent is fixing the 12 reds. The agent-root SDK agent reported done at 03:15:18. Nothing is committed ([app wiring](app-wiring.md), [agent root in the browser](agent-root-browser-safe.md)).

## Next

After Will's review: commit the agents' work atomically, push to `main`, `alchemy deploy`, then run the e2e suite and `pnpm bench` against the live URL.

## Questions for Will

- Your review of the app's code. (Will, 23:00: after the current feature list is finished.)
- Deploy the production stack now, or after the review and sign-in? Recommended: after. Deploying waits on your explicit yes.
