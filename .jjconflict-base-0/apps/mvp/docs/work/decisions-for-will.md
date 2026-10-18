---
title: Decisions for Will
status: blocked
area: process
owner: Will (decision)
updated: 2026-10-20
links: [repo-view-package-split.md, repo-follow-ups.md, app-wiring.md, sdk-test-reds.md, platform-cloudflare-edge-cache.md, integrations-durable-retries.md, design-questions.md, flows-and-agent.md, host-agnostic-flows.md, durable-answering.md, model-host-effect-boundary.md, repo-clone-and-view.md, infrastructure-as-code.md, code-storage-spend-caps.md, land-and-deploy-mvp.md, mvp-scope-cut.md, legacy-smithers-sh.md, move-effectscript-repos.md, vibelang-0-0-2-publish.md, electric-client-bug-report.md, sign-in.md, token-spend-alerts.md, deep-import-migration.md, import-rules-and-jev-lint.md, observability.md, cerebras-rate-limits.md, clone-token-scope-bug.md, effect-tanstack-db-and-effect-electric.md, local-first.md, ../decisions/0011-the-agent-runs-in-the-browser.md, model-endpoint.md, durable-browser-engine.md, pwa.md, agent-ui-rendering.md, sandboxes.md, sandbox-budgets.md, roles-and-labels.md, pr-review-and-merge.md, web-standard-globals-rule.md, code-reviews.md, flows-root-platform-neutral.md, b1-follow-ups.md, auth.md]
---

## What

Every open question for Will on the Work board, in one place, blocking ones first. Each row links to the note that holds the details; the answer goes back into that note and its decision record.

### Next for Will

As of 02:43 on 2026-10-20. Row 3 is new: the lead asked it at 02:35 and again at 02:36, recommending B. It replaces the 01:00 table's row 3 (the `adapters` exception, recommended yes) and holds `//apps/mvp:importRules` red until answered; the Markdown half of that old row stays under "Building proceeds on the recommended answer". No answer to rows 1 and 2 is on record by 02:43. At 01:12 Will set the review order (Codex Astra, then fixes, then Fable); that is an instruction, not a question, and is recorded in [code reviews](code-reviews.md).

| # | Ask | Your time | When | Unblocks | Note |
|---|---|---|---|---|---|
| 1 | **Security:** rotate the Grafana password, `TF_VAR_grafana_password` in `~/.zshrc`. The S1 agent printed it into its transcript while reading `~/.zshrc`. The transcript stays on this Mac but went through the model, so treat the password as exposed. | 2 to 5 min | now | closes the exposure | [sign-in](sign-in.md) |
| 2 | In the Smithers GitHub App's settings (client ID `GH_CLIENT_ID` in `~/.zshrc`), add `http://localhost:1337/api/auth/callback` as a callback URL. Today GitHub answers `redirect_uri_mismatch`. The production URL follows the first deploy. | 1 to 2 min | now | signing in locally, the live sign-in test, then testing the app signed in | [sign-in](sign-in.md) |
| 3 | The repo view imports `@smthrs/ui/adapters/repo-view`, a subpath. A: allow this one subpath as an exception. B: move the heavy renderers (Shiki, about 10 MB, and Milkdown) into their own package, such as `@smthrs/repo-view`, imported from its root. Recommended: B, no exception to your rule. | 10 s | now | `importRules` green for the app | [repo-view package split](repo-view-package-split.md), [repo clone and view](repo-clone-and-view.md) |
| 4 | Test the app: the agent flow and the repo view, signed in, offline, after a reload and in two tabs | 5 to 10 min | when the lead says it's ready; the app's engine worker doesn't load yet | catches client and agent problems before review | [app wiring](app-wiring.md), [local-first](local-first.md), [land and deploy](land-and-deploy-mvp.md) |
| 5 | Review the code, starting with `packages/effect-tanstack-db` and `packages/effect-electric` (`packages/effect-electric/src/ElectricCollection.ts`) | 20 min for the packages | after the feature list is finished (Will, 23:00) | landing on `main` and the first deploy | [the packages](effect-tanstack-db-and-effect-electric.md), [land and deploy](land-and-deploy-mvp.md) |

The 01:00 version, for history. Its intro: "As of 01:00 on 2026-10-20. Rows 1 and 2 are new and take minutes: S1 finished sign-in, and while reading `~/.zshrc` it printed `TF_VAR_grafana_password` into its transcript. The lead told Will both at 01:00. Rows 3 to 5 are the 23:47 table's rows 1, 3 and 4; its row 2, the callback URLs, is now row 2 with the exact URL. Rows 4 and 5 still wait for the lead's "ready to test"." Its table:

| # | Ask | Your time | When | Unblocks | Note |
|---|---|---|---|---|---|
| 1 | **Security:** rotate the Grafana password, `TF_VAR_grafana_password` in `~/.zshrc`. The S1 agent printed it into its transcript while reading `~/.zshrc`. The transcript stays on this Mac but went through the model, so treat the password as exposed. | 2 to 5 min | now | closes the exposure | [sign-in](sign-in.md) |
| 2 | In the Smithers GitHub App's settings (client ID `GH_CLIENT_ID` in `~/.zshrc`), add `http://localhost:1337/api/auth/callback` as a callback URL. Today GitHub answers `redirect_uri_mismatch`. The production URL follows the first deploy. | 1 to 2 min | now | signing in locally, the live sign-in test, then testing the app signed in | [sign-in](sign-in.md) |
| 3 | Two repo-view answers: may the app import `@smthrs/ui/adapters/*` as the one exception to root-only imports, and does Markdown stay read-only for now? Recommended: yes to both. Building proceeds on the recommendation; R3 to R5 started at 01:00. | 10 s | any time | the repo view's app integration | [repo clone and view](repo-clone-and-view.md), [deep-import migration](deep-import-migration.md) |
| 4 | Test the app: the agent flow and the repo view in chat, signed in, offline, after a reload and in two tabs | 5 to 10 min | when the lead says it's ready, after features 1 and 2 land in the app | catches client and agent problems before review | [app wiring](app-wiring.md), [local-first](local-first.md), [land and deploy](land-and-deploy-mvp.md) |
| 5 | Review the code, starting with `packages/effect-tanstack-db` and `packages/effect-electric` (`packages/effect-electric/src/ElectricCollection.ts`) | 20 min for the packages | after the feature list is finished (Will, 23:00) | landing on `main` and the first deploy | [the packages](effect-tanstack-db-and-effect-electric.md), [land and deploy](land-and-deploy-mvp.md) |

The 23:47 version, for history. Its intro: "As of 23:47 on 2026-10-19. Row 2 is new: S1 started sign-in at 23:39 and will report callback URLs for Will to register. The 23:15 table had today's rows 1, 3 and 4 as rows 1 to 3. At 22:16 Will asked for one question at a time, explained better; the lead explains each in plain words and waits for his answer. At 23:00 Will said to stop raising the MVP and build his feature list; when it is finished he tests the app and reviews the code. So rows 3 and 4 (rows 2 and 3 until 23:47) now wait for the lead's "ready to test"." Its table:

| # | Ask | Your time | When | Unblocks | Note |
|---|---|---|---|---|---|
| 1 | Two repo-view answers: may the app import `@smthrs/ui/adapters/*` as the one exception to root-only imports, and does Markdown stay read-only for now? Recommended: yes to both. Building proceeds on the recommendation. | 10 s | any time | the repo view's app integration | [repo clone and view](repo-clone-and-view.md), [deep-import migration](deep-import-migration.md) |
| 2 | Register the callback URLs S1 reports in the Smithers GitHub App's settings. 00:39 on 2026-10-20: `docs/features/sign-in.md` names `http://localhost:1337/api/auth/callback` for local dev and the deployed `url` plus `/api/auth/callback`; S1 hasn't reported | 1 to 2 min | when S1 reports | signing in with GitHub, then a deploy that lets signed-in people ask | [sign-in](sign-in.md) |
| 3 | Test the app: the agent flow and the repo view in chat, offline, after a reload and in two tabs | 5 to 10 min | when the lead says it's ready, after features 1 and 2 land in the app | catches client and agent problems before review | [local-first](local-first.md), [land and deploy](land-and-deploy-mvp.md) |
| 4 | Review the code, starting with `packages/effect-tanstack-db` and `packages/effect-electric` (`packages/effect-electric/src/ElectricCollection.ts`) | 20 min for the packages | after the feature list is finished (Will, 23:00) | landing on `main` and the first deploy | [the packages](effect-tanstack-db-and-effect-electric.md), [land and deploy](land-and-deploy-mvp.md) |

The 22:56 version's row 1, for history: "Is this the MVP?" (answered 23:00: "more or less right"; reference only). Its rows 2 to 4 were the repo-view answers, the package review and the app check, now rows 1 to 3.

The 22:49 version's row 1, for history: design question 11 of 14 (0007 Q3), 10 answered and 4 open.

The 22:43 version's row 1, for history: design question 8 of 14 (0005 Q3, sandbox budgets), 7 answered and 7 open.

The 22:41 version's row 1, for history: design question 7 of 14 (0005 Q2), 6 answered and 8 open.

The 22:36 version's row 1, for history: design question 6 of 14 (0005 Q1), 5 answered and 9 open.

The 22:24 version's row 1, for history: design question 2 of 14 (0003 Q2), 1 answered and 13 open, unblocking features 1 and 3, sandboxes, roles and notifications.

The 22:14 version of this table, for history: 1 restart W1 and the SDK defects agent (answered 22:16: accidental; restarted), 2 "accept all" on the 14 design questions (replaced at 22:16 by one at a time), 3 the package review, 4 the local-first app check. The lead's 22:15 ranking added the two repo-view answers as item 3.

The lead called the package review the most valuable code review: Will wants these to be generic, publishable libraries, and they set how every later feature reads and writes data.

The lead's 22:00 ranking, for history: 1 Code Storage organization name (answered 22:05), 2 Cloudflare token (answered 22:13), 3 the 14 design questions, 4 the package review, 5 the local-first app check.

### Blocking work now

| Question | Recommended | Blocks | Note |
|---|---|---|---|
| The repo view's `@smthrs/ui/adapters/repo-view` import: A, one exception to root-only imports, or B, the heavy renderers in their own package imported from its root? (Asked 02:35 and 02:36 on 2026-10-20.) | B | `//apps/mvp:importRules`, red on that one import | [repo-view package split](repo-view-package-split.md) |
| Review the new app's code so it can land on `main` and deploy | n/a | push and deploy | [land and deploy](land-and-deploy-mvp.md) |
| Say yes to the first `pnpm deploy` (stage `prod`)? The real plan passed at 22:13. | after the code review and sign-in | the live app | [infrastructure as code](infrastructure-as-code.md), [land and deploy](land-and-deploy-mvp.md) |
| Register `http://localhost:1337/api/auth/callback` in the Smithers GitHub App's settings; the production URL after the first deploy. (01:00 on 2026-10-20: S1 reported; GitHub answers `redirect_uri_mismatch` until then. Until 01:00 this row asked to register the callback URLs S1 reports. Until 23:39 this row asked: approve building decision 0008 phase 1 (sign-in) now? 23:02: the lead queued it after W5, since both edit `worker/ChatApi.ts`. 23:39: the lead started it as S1 on the recommendation.) | n/a | signing in, then a public deploy that lets signed-in people ask | [sign-in](sign-in.md) |
| Where should the token-spend alert and the Code Storage 50/80/100% budget alerts reach you: Telegram, email or other? | n/a | both alerts | [token-spend alerts](token-spend-alerts.md), [Code Storage spend caps](code-storage-spend-caps.md) |
| Does a Tuesday launch of the old stack still happen? Retire the old backend once the new app opens repos? | n/a | legacy cleanup, the clone-token bug | [legacy smithers.sh](legacy-smithers-sh.md), [clone token scope](clone-token-scope-bug.md) |
| Which repo did "effectscript-ts" mean? Then transfer the repos, or run `gh auth refresh -h github.com -s repo,admin:org` | n/a | the repo move | [move effectscript repos](move-effectscript-repos.md) |
| Publish VibeLang 0.0.2 now (`sh ~/effectscript/dist-npm/publish-0.0.2.sh`, your npm one-time password), or wait for the next release? | n/a | the publish | [vibelang 0.0.2](vibelang-0-0-2-publish.md) |

### Building proceeds on the recommended answer

| Question | Recommended | Note |
|---|---|---|
| Codex review 2, finding 4: may a library call the web-standard globals all four runtimes ship (`fetch`, `crypto.subtle`), or must WebCrypto come through an injected service? By 23:12 the lead ruled they aren't platform code and wrote it into `docs/libraries.md`; you may overrule | the ruling stands | [web-standard globals](web-standard-globals-rule.md) |
| Override any of the lead's three 0009 choices (22:56): a finished run disappears after `Done`; no toasts for someone else's run; built-in routing only. 22:58: Will overrode the second (see Answered); the first and third stand | keep them | [notifications](notifications-and-live-work.md) |
| The 4 open design questions, 0007 Q3 and 0009 Q1 to Q3; all closed at 22:56 (7 at 22:43 and 8 at 22:41; 0003 and 0004 answered by 22:35, 0005 Q1 at 22:41, 0005 Q2 at 22:42, 0005 Q3 deferred at 22:45, 0007 Q1 at 22:48, 0007 Q2 at 22:49; Will answers one at a time) | the recommended answer to each | [design questions](design-questions.md) |
| Does `ModelProxy` come back in `@smthrs/model` or only in the app's `worker/`? Since 22:59 the W5 agent restores it into `@smthrs/model`, on the recommendation (done 23:39) | `@smthrs/model` | [model endpoint](model-endpoint.md) |
| May `apps/mvp` import `@smthrs/ui/adapters/*` as the one exception to root-only imports? (Superseded at 02:35 on 2026-10-20: now the A or B row under "Blocking work now", recommended B.) | yes, until 02:35 | [deep-import migration](deep-import-migration.md), [repo clone and view](repo-clone-and-view.md) |
| Markdown in the repo view stays read-only for now? | yes | [repo clone and view](repo-clone-and-view.md) |
| `effect.boundary-only`: keep your narrow "where necessary" reading over `apps/mvp/AGENTS.md`'s broader one? | yes | [ImportRules and Jev](import-rules-and-jev-lint.md) |
| Which usage questions should metrics answer first? | daily askers, asks per person, time to first answer text | [observability](observability.md) |
| File the Electric client issues on Electric's GitHub? | don't file unless you say so | [Electric client bug report](electric-client-bug-report.md) |
| Ask Cerebras about Enterprise limits now or after a load test? | after | [Cerebras rate limits](cerebras-rate-limits.md) |
| Code Storage budgets: 3 GB stored, 40 GB read a month, 1 GB per repository, 100 repositories, $20 alert base? | yes (worst-case month about $17) | [Code Storage spend caps](code-storage-spend-caps.md) |

### Answered

| Question | Answer | Note |
|---|---|---|
| Create a Code Storage organization (Starter, $20/month minimum) and add its key? | 21:49 to 21:51: Will bought Starter and put the private key in `~/.zshrc` as `CODE_STORAGE_API_KEY`. | [repo clone and view](repo-clone-and-view.md) |
| What's the Code Storage organization name (the subdomain in `api.<org>.code.storage`)? | 22:05: "smithers is org name". 22:06: the live test passed 2 of 2. | [repo clone and view](repo-clone-and-view.md) |
| Restart W1 (engine) and the SDK defects agent, stopped at 22:08? Asked 22:09, 22:13, 22:14 and 22:16. | **Accidental; restarted.** 22:16: Will: "I never stopped any agents" and "If I stopped an agent it was unintentional". 22:17: the lead restarted both; fresh replacements started about 22:20 and continue from the work on disk. | [durable answering](durable-answering.md), [model-host Effect boundary](model-host-effect-boundary.md) |
| Design question 0003 Q1: does the agent loop run on Cloudflare, with the browser only asking? | 22:22: "sure let's do it on cloudflare but make sure our cloudflare code is decoupled from cloudflare via dependency injection because our native app version later will just run the cloudflare code locally". Recorded in decision 0003; new rule `sdk.host-agnostic-flows`. | [design questions](design-questions.md), [host-agnostic flows](host-agnostic-flows.md) |
| Add Secrets Store read and Hyperdrive edit to your Cloudflare API token, or run `! alchemy login`? | 22:11 to 22:13: Will added **Account → Secrets Store → Edit** and **Account → Hyperdrive → Edit** to the "baseapp" token, the one in `CLOUDFLARE_API_TOKEN`. 22:13: the real `alchemy plan --stage prod` passed. | [infrastructure as code](infrastructure-as-code.md) |
| Design question 0003 Q2: single-write browser flows on the in-memory engine until one has to wait? | 22:25: "A syncronous change to storage is by default durable yea. ... The agent should run on frontend and the frontend itself should be durable." 22:29: Smithers must run in the browser through `platform-browser`; model calls go through the server; the app is a PWA; "We prefer things to be local first actaully". Recorded as decision 0011, accepted 22:31. | [durable browser engine](durable-browser-engine.md), [flows and the agent](flows-and-agent.md) |
| Multiple tabs: run the engine in a service worker? | 22:29: "You can decide this". The lead chose a leader tab's dedicated worker, elected with Web Locks; the service worker only serves the PWA offline. | [durable browser engine](durable-browser-engine.md) |
| Design question 0004 Q1: generated views are pure layouts with declared events? | 22:32: "this makes sense go with your best judgement here I like yhow you are thinking". | [agent UI](agent-ui-rendering.md) |
| Design question 0004 Q2: the renderer stays on Qwen until evals show it fails? | 22:34: "Yea you got it same model but make it super easy to configure by us as admins". Named roles plus `admin/SetModel`. | [model endpoint](model-endpoint.md) |
| Design question 0004 Q3: views sync across devices? | 22:35: "Yes it syncs this is what enables multiplayer to work". Decision 0004 accepted. | [agent UI](agent-ui-rendering.md) |
| Design question 0005 Q1: is losing running processes on sleep acceptable, so sandboxes use Cloudflare? | 22:41: Cloudflare. "So it's durable so sleeping shouldn't cause issues also couldn't we manually kick the container on the backend to stop it from sleeping or something?" Sleep is our own durable decision (`sandbox/Keep`) after 15 idle minutes with no running job. | [sandboxes](sandboxes.md) |
| Design question 0005 Q3: sandbox limits as admin settings (20 awake per deployment, 2 per person, $100/month alert, 30-day snapshots)? | 22:45: deferred. "Add this as a TODO but we won't worry about this until we ship." In 0005 and `todo.md`. | [sandbox budgets](sandbox-budgets.md) |
| Design question 0007 Q1: should GitHub's five roles replace M-05's three? | 22:46 to 22:48: four roles. "Let's do admin, maintainer, trusted contributor, untrusted contributor but maybe name them better than that." Then "role names are good": Admin, Maintainer, Member, Guest. | [roles and labels](roles-and-labels.md) |
| Design question 0007 Q2: only Maintainers merge into main by default? | 22:49: "Merging into main is actually triggering a workflow and that workflow is configurable. By default maintainers and up obviously". | [PR review and merge](pr-review-and-merge.md) |
| Design question 0007 Q3: may event-started flows apply ordinary labels as Smithers? | 22:56: deferred. "question 11 I think is thinking too far ahead whatever asked the question is doing too much we haven't gottent hat far yet." | [roles and labels](roles-and-labels.md) |
| Design questions 0009 Q1 to Q3 | 22:56: settled by the lead with the simplest choice, recorded in 0009 §8: a finished run disappears after `Done` and a failed one stays; no toasts for someone else's run; built-in routing only. Will may override. | [notifications](notifications-and-live-work.md) |
| Is this the MVP? Items 1 TODOs, 2 review and merge, 3 GitHub as truth, 4+6 live work and notifications, each trimmed. Asked 22:56 and 22:59; earlier asked as "Approve MVP items 1, 2 and 3 as trimmed?" | 23:00: reference only. "Don't worry about the mvp I gave you a list of things we are building that's what we are building now and it's insufficient for mvp but once we finish everything we got so far I need to test the app review the code ... But yes it's more or less right". Work follows features 1 to 8. | [MVP scope cut](mvp-scope-cut.md) |
| The lead's 0009 Q2 settlement (22:56): no toasts for someone else's run | 22:58: **overridden.** "Some toasts you should see for other people's runs if they are on same branch as you for sure this goes back to what I said about feeds being tied to user, branch repository etc. Main changing is tied to repository for example or a new release tied to repositry." Toasts follow scope: person (your runs, anything that needs you), branch (every run on a branch you're on, including other people's and the agent's), repository (`main` changed, a new release). Recorded in 0009 §8. | [notifications](notifications-and-live-work.md) |
| Design question 0005 Q2: does the agent's loop stay in the browser, with only its tools in the sandbox? | 22:42: yes. "This is a great question! So we want the sandbox to only expose the sandbox and it's tool and the agent to be independent of that. We want as modular/durable an architecture as possible." A sandbox exposes only the machine and its tools as durable steps; the agent binds them from its own host. | [sandboxes](sandboxes.md), [connecting it all](connect-agents-sandboxes-forge.md) |
| Approve building decision 0008 phase 1 (sign-in) now? Asked 23:02 | 23:39: no answer needed. The lead started it as S1 on the recommendation once W5 freed `worker/ChatApi.ts`. Will registers S1's callback URLs next. | [sign-in](sign-in.md) |

## Why

Will asked at 21:31 on 2026-10-19 whether the design questions were in his maintainer app. Questions sit in about 20 notes; this card puts them in one column so one reply can settle them.

## State

- 2026-10-19, 21:39 and 21:43: the lead asked Will about the Code Storage organization. No answer yet.
- The 14 design questions were asked at 21:21, 21:23 and 21:29. No answer yet.
- 21:45: the lead asked Will to widen the Cloudflare token or run `alchemy login`. No answer yet.
- 21:49 to 21:51: Will bought Code Storage Starter and named the key variable; he also asked for graceful failure at capacity ([spend caps](code-storage-spend-caps.md)). 21:52: the lead asked for the organization name. No answer at 21:54.
- 21:54: the 14 design questions are still unanswered.
- About 22:00: Will asked what the highest-value way to help is. The lead ranked five asks, now the "Next for Will" table above, and asked again for the organization name. App check at 22:04: http://localhost:1337/app answers 200.
- 22:04: no answer yet to any of the five.
- 22:05: Will named the Code Storage organization `smithers`. 22:06: the live clone test passed 2 of 2 ([repo clone and view](repo-clone-and-view.md)).
- 22:06 to 22:09: the lead first asked Will to run `alchemy profile edit` in his own terminal; it isn't installed globally, and `pnpm exec` fails without an interactive terminal. Will asked why his Cloudflare token in env wasn't enough. The lead tested it: Workers and Containers answer; Hyperdrive and Secrets Store return "Authentication error".
- 22:08: two agents stopped, W1 and the SDK defects agent; the lead attributed it to Will, who said at 22:16 it was unintentional. 22:09, 22:13 and 22:14: the lead asked whether to restart them. No answer at 22:14.
- 22:11: Will added Secrets Store to the "baseapp" token; still failing without Hyperdrive. 22:13: Will added Hyperdrive; the real plan passed ([infrastructure as code](infrastructure-as-code.md)). Rows moved to Answered.
- 22:14: the 14 design questions are still unanswered.
- 22:15: Will: "Ok what is the next highest impact way I can help?" The lead ranked five asks: restart both agents, "accept all", the two repo-view answers, the package review, the app check.
- 22:16: Will: "Can you do one at a time and explain it better". The lead explained the restart question alone. Will: "I never stopped any agents"; "If I stopped an agent it was unintentional". 22:17: the lead restarted both; fresh replacements started about 22:20 and continue from the work on disk. Row moved to Answered.
- 22:17: the lead asked design question 1 of 14 on its own, with a diagram. 22:22: Will answered yes, with a dependency-injection condition ([host-agnostic flows](host-agnostic-flows.md)). Row moved to Answered.
- About 22:18: the lead saved `CLOUDFLARE_ACCOUNT_ID` and `NEON_ORG_ID` to `apps/mvp/.env` ([infrastructure as code](infrastructure-as-code.md)). Not a question for Will; it closes the tracker's last infrastructure gap.
- 22:22: the lead asked design question 2 of 14. No answer at 22:24.
- 22:25 to 22:31: Will answered design question 2 by moving the agent into the browser; the lead recorded decision 0011, accepted. Rows moved to Answered.
- 22:32 to 22:35: Will answered all three 0004 questions; 0004 is accepted. Rows moved to Answered.
- 22:35: the lead asked design question 6 (0005 Q1). No answer at 22:36.
- 22:38 to 22:41: Will asked whether the lead suggested Freestyle (no, Cloudflare) and why a sandbox would sleep mid-job (it doesn't). 22:41: he chose Cloudflare; row moved to Answered. The lead asked design question 7 (0005 Q2). No answer at 22:41.

- 22:42: Will answered design question 7 (0005 Q2): yes, the sandbox exposes only itself and its tools and the agent is independent of it. Row moved to Answered. 22:43: the lead asked design question 8 (0005 Q3, sandbox budgets). No answer at 22:46.
- 22:45: Will deferred design question 8 until we ship; it is a TODO ([sandbox budgets](sandbox-budgets.md)). 22:48: he answered question 9 with four roles named Admin, Maintainer, Member and Guest. 22:49: he answered question 10: merging runs a configurable merge flow, Maintainers and up by default. Rows moved to Answered. 22:49: the lead asked question 11 (0007 Q3). No answer at 22:53.
- 22:47: the model-host fixes agent finished; all three fixes pass ([model-host Effect boundary](model-host-effect-boundary.md)). Not a question for Will.
- 22:56: Will deferred question 11 as "thinking too far ahead". The lead settled 0009's three questions itself and closed all 14 design questions ([design questions](design-questions.md)). Then it asked Will to approve the MVP list: "Is this the MVP?" ([MVP scope cut](mvp-scope-cut.md)).
- 22:58: Will overrode the lead's second 0009 choice: toasts follow scope (person, branch, repository), so a teammate's run on your branch toasts for you. Recorded in 0009 §8 ([notifications](notifications-and-live-work.md)).
- 22:59: the lead asked the MVP question again. 23:00: **Will: reference only**, "Don't worry about the mvp"; build the feature list, then he tests the app and reviews the code. The MVP row left "Next for Will" and "Blocking work now" for Answered. 23:02: the lead started W5 (a)+(c), L1, V1+V2, the integrations root and the 0007 rewrite, and said it will tell Will when the agent flow and repo view are ready to test.
- By 23:12: the lead told Will that 0007 is rewritten and accepted with four roles, so no roles question is open ([roles and labels](roles-and-labels.md)). It also reported Codex review 2 and rejected finding 4 (ambient `crypto.subtle`), ruling that web-standard globals aren't platform code; Will may overrule, so the row is under "Building proceeds on the recommended answer" ([web-standard globals](web-standard-globals-rule.md)).

- 23:39 to 23:41: no question went to Will. The lead reported W5 (a)+(c) and B1 done and started S1 (sign-in), the [flows root](flows-root-platform-neutral.md) fix, F1 and F4+F5. It answered its own `1.0.0-rc.15` question: the webhook bug never shipped ([integrations root](integrations-browser-safe-root.md)). S1 will report callback URLs for Will to register, row 2 of "Next for Will" ([sign-in](sign-in.md)).

- About 00:55 to 01:03 on 2026-10-20: the [SDK test reds](sdk-test-reds.md), [sign-in](sign-in.md), the [edge cache](platform-cloudflare-edge-cache.md) and the [integrations retries](integrations-durable-retries.md) finished. None needs a decision from Will.
- **About 01:00: two asks.** The lead to Will: "Register the sign-in callback URL. In the Smithers GitHub App's settings (the one whose client ID is `GH_CLIENT_ID` in `~/.zshrc`), add `http://localhost:1337/api/auth/callback` as a callback URL." And: "Rotate your Grafana password. While reading `~/.zshrc`, the sign-in agent printed `TF_VAR_grafana_password` into its transcript. That transcript stays on this Mac but went through the model, so treat the password as exposed." Rows 1 and 2 of "Next for Will". No answer at 01:05.

- 01:12 on 2026-10-20: Will: "remember to have /codex astra review code and then once responding to it's reviews have fable review". An instruction, not a question: the lead started the Astra review and saved the order in `rules.md` ([code reviews](code-reviews.md)).
- About 02:16 to 02:27 on 2026-10-20: [model endpoint](model-endpoint.md) and [sign-in](sign-in.md) went back to done after their Astra fixes. None needs a decision from Will.
- **02:35 on 2026-10-20: a new ask.** With the repo view built, the lead asked: "One question about your root-imports-only rule: the repository view imports `@smthrs/ui/adapters/repo-view`, a subpath." A: allow it as an exception; B: move the heavy renderers into their own package, e.g. `@smthrs/repo-view`. "Should I split them into their own package (B)?" 02:36: asked again. Row 3 of "Next for Will" ([repo-view package split](repo-view-package-split.md)).
- By 02:43: no answer to rows 1 to 3.

## Next

On each answer: write it into the linked note and its decision record, then move the row off this list.

## Questions for Will

- **Now (asked 02:35 on 2026-10-20):** the repo view's deep import, A (one exception) or B (its own package, imported from its root)? Recommended: B ([repo-view package split](repo-view-package-split.md)).
- **Security, now:** rotate the Grafana password (`TF_VAR_grafana_password`), which the S1 agent printed into its transcript (asked 01:00 on 2026-10-20).
- **Now:** register `http://localhost:1337/api/auth/callback` in the Smithers GitHub App's settings (asked 01:00 on 2026-10-20) ([sign-in](sign-in.md)).
- When S1 reports: register its callback URLs in the Smithers GitHub App's settings ([sign-in](sign-in.md)). (S1 reported about 01:00 on 2026-10-20; now the row above.)
- Does the lead's ruling on Codex review 2 finding 4 stand: web-standard globals such as `crypto.subtle` aren't platform code? Recommended: yes ([web-standard globals](web-standard-globals-rule.md)).
- The two repo-view answers (row 1 of "Next for Will"). Then, when the lead says it's ready, test the app; after the feature list, review the code. (From 02:35 on 2026-10-20 the `adapters` half is the A or B question above; the Markdown half proceeds on its recommendation.)
- Is this the MVP? Items 1 TODOs, 2 review and merge, 3 GitHub as truth, and 4+6 live work and notifications, each trimmed ([MVP scope cut](mvp-scope-cut.md)). Then the "Next for Will" table in order. (Answered 23:00: reference only.)
- Design question 11 of 14 (0007 Q3): may event-started flows apply ordinary labels as Smithers, with guarded labels like `todo` reserved for people? Recommended: yes. Then 0009 Q1 to Q3, one at a time, and the "Next for Will" table in order. (Deferred 22:56; 0009 settled by the lead.)
- Design question 8 of 14 (0005 Q3): sandbox limits as admin settings changeable without a deploy (20 awake per deployment, 2 per person, $100/month alert, 30-day snapshots)? Recommended: yes. Then the remaining 6, one at a time, and the "Next for Will" table in order. (Answered 22:45: deferred until we ship. Questions 9 and 10 answered by 22:49.)
- Design question 7 of 14 (0005 Q2): the agent's loop stays in the browser, with only its tools in the sandbox? Recommended: yes. Then the remaining 7, one at a time, and the "Next for Will" table in order. (Answered 22:42: yes.)
- Design question 6 of 14 (0005 Q1): Cloudflare sandboxes that lose running processes on sleep, with files always safe? Recommended: yes. (Answered 22:41: Cloudflare.)
- Design question 2 of 14: do single-write browser flows use the in-memory engine until one has to wait? Recommended: yes. Then the remaining 12, one at a time, and the "Next for Will" table in order. (Answered 22:25 to 22:29: decision 0011. Questions 3 to 5 answered by 22:35.)
- Restart W1 and the SDK defects agent? (Answered 22:16: accidental; restarted.)
- Work down the "Next for Will" table in order: the Code Storage organization name unblocks the live clone test, and the Cloudflare token unblocks the real plan. (Both answered by 22:13.)
- Answer the "Blocking work now" table first: the Code Storage organization name unblocks the live clone test, and the Cloudflare token unblocks the real plan. (Superseded at 22:00 by the ordered table.)
