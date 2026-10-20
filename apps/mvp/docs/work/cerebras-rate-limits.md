---
title: Cerebras rate-limit plan
status: idea
area: infra
owner: unassigned
updated: 2026-10-20
links: [../features/chat.md, ../benchmarks.md, agent-status.md, chat-message-controls.md, model-step.md, model-endpoint.md, dev-stack-hygiene.md]
---

## What

Raise the number of people who can chat at once on our Cerebras key, in this order:
1. Send less: cap history by tokens (about 8k) instead of 100,000 characters.
2. Get the prompt-prefix cache to hit; our usage line reports `cachedInputTokens: 0`.
3. On a 429, retry durably or fall back to a second model (`FastModelFallback` exists in the SDK).
4. Per-person quotas, after sign-in.
5. A higher tier, which only Will can negotiate with Cerebras.

## Why

Will: "Ok that cerebras problem is pretty major if it's getting rate limited now what's gonna happen when we have hundreds of users?"

## State

- Our Developer-tier key allows 150K uncached tokens and 450 requests per minute on `qwen-3.8-27b`: about 65 people asking once a minute. `gpt-oss-120b` gets 1M tokens a minute on the same tier.
- The key also reports hourly (9M) and daily (216M) caps that Cerebras says Developer lacks, so check the Cloud Console's project limits.
- `ModelStep` already fails a 429 unsealed so the flow retries it. The figures come from published caps, not a load test.
- **2026-10-20: the limit now fails our own end-to-end tests.** 12:57:25, the lead: the [agent status](agent-status.md) live-model e2e "passed once, then failed twice because Cerebras rate-limited it". 13:03: the [message controls](chat-message-controls.md) e2e's "Couldn't answer" failures (12:53 to 12:58) were being checked against the same limit. The scripted e2e suites don't call the model and pass. No load run on record.
- 12:52:41 on 2026-10-20, the lead: retries now happen in one place, "so a failing model call is sent 2 to 3 times instead of 6 to 18" ([model step](model-step.md)). That cuts how many requests one 429 multiplies into.
- **Correction, 13:08 to 13:13 on 2026-10-20: the "Couldn't answer" e2e failures were very likely our own dev budget, not Cerebras.** The flows builder found the local dev server answering 429 "Today's model budget is spent": `model_budget_days` held 1,022,891 committed tokens against the 1,000,000 daily cap, about half of it reservations from killed test runs, which stay charged at their worst case until midnight UTC ([model endpoint](model-endpoint.md)). 13:09:31, the lead: "This is also the likely cause of the 'Couldn't answer' errors in the message-controls test." 13:13: the lead raised the dev budget to 10,000,000 (`apps/mvp/.env`, not committed), restarted the dev server, and told the message controls and branch builders to rerun their live-model tests ([dev stack hygiene](dev-stack-hygiene.md)).
- **13:14:45 to 13:15:50: the [message controls](chat-message-controls.md) e2e passed** on the restarted server, both tests including the live-model answer (`test-results/.last-run.json`). That supports the budget as the cause. Whether [agent status](agent-status.md)'s two live-model failures (reported as Cerebras rate limits) were the same budget isn't confirmed.
- So no failure on record is a confirmed Cerebras 429. The capacity question for hundreds of people stands; it has no load run.

## Next

From 13:13 on 2026-10-20: rerun the live-model e2e suites on the raised budget; only a failure on a provider 429 reopens the test-key question. Then, as before, a `pnpm bench` load run and steps 1 and 2. A live-model e2e failure should name its cause (our budget, a provider 429, or a product error) so neither reads as a product bug.

Until 13:13 on 2026-10-20 the next step was, from 13:03 on 2026-10-20: as before, a `pnpm bench` load run, then steps 1 and 2. A live-model e2e failure should say whether it was a 429, so a rate limit doesn't read as a product bug.

Until 13:03 on 2026-10-20 the next step was: A `pnpm bench` load run to confirm the ceiling, then steps 1 and 2.

## Questions for Will

- On hold from 13:13 on 2026-10-20, not to be asked: the lead holds it until a rerun still fails on a provider 429, since the failures were very likely our dev budget. Added 13:06 on 2026-10-20: the live-model e2e runs share the Developer-tier key with development and now fail on its limit. Give tests their own key or model? Recommended: their own key, so a red live e2e means a product bug.
- Ask Cerebras about Enterprise limits now, or after a load test? Recommended: after.
