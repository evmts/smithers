---
title: Cerebras rate-limit plan
status: blocked
area: infra
owner: codex-fast-inference-20261021; capacity campaign #4429
updated: 2026-10-21 12:56 PDT
links: [cerebras-load.md, h2-model-transport.md, ../features/chat.md, ../benchmarks.md, agent-status.md, chat-message-controls.md, model-step.md, model-endpoint.md, dev-stack-hygiene.md]
---

## Capacity ownership receipt — 2026-10-21 12:56 PDT

**Current state:** The approved Cerebras capacity request **was sent** on 2026-10-21 as a reply to the existing June sales conversation. Sending is no longer blocked on Arc. The sender holds the Gmail SENT receipt privately. A capacity increase has not been granted. Track execution in [#4429](https://github.com/smithersai/smithers/issues/4429).

Will delegated channel choice, provider selection, standard signup/terms and small charges to this operator; commitments that could reach thousands return to him. He explicitly expects more than one provider for regular fast inference capacity, not only emergency fallback. The usage cap remains **$5 per candidate / $15 total**, including load, real evals and role/e2e proof. A provider minimum prepaid top-up up to $25 may be needed; record cash deposits separately and leave automatic top-up off. Estimated new list-price usage is **$0.0066352**, all Groq smoke calls; actual billing may be $0 under its free tier. No production model role changed.

**Transport correction:** The owner brief predates the completed HTTP/1.1 repair and rerun. Existing receipt `bench/cerebras-load/results/2026-10-21T02-34-41.059Z`: 60.45 s at concurrency 10, 542 requests, 199 successes, 343 HTTP 429, zero other errors; successful-call p95 TTFT 1294.6 ms / total 1605.3 ms; 371,265 charged tokens / $0.39302 estimated. No 25/50 escalation. This is shared-account, one-Mac evidence on synthetic 1.5k/7k prompts, not proof of our 9–10k-token agent workload or production capacity. Do not rerun merely to rediscover the transport fix.

**Cerebras request:** Quotes for 100/300/1,000 DAU planning scenarios: 42/125/417 RPM and 0.42/1.26/4.18M peak tokens/minute; confirm uncached/total limits, 100–200-stream bursts, latency/throughput commitments, regions, caching, pricing, minimum contract and onboarding. Those DAU figures are assumptions, not current customers. Next follow-up is due 2026-10-26 if unanswered. This date is recorded, **not an active scheduled monitor**: no native scheduler is exposed in the operator session, and the installed Smithers CLI requires a browser session. The attempted read-only dispatch returned no start receipt and was cancelled; no worker completion is claimed.

### Backup decision, from primary sources checked 2026-10-21

Recommendation: **DeepInfra first, Groq second**. Confidence **70% in the test order**, a judgment based on model match, documented limits, caching and price; no provider is production-qualified yet. Keep Fireworks as reserve until account suspension is resolved.

- **DeepInfra:** same `Qwen/Qwen3.8-27B`, tools/JSON and 256k context. [Current model price](https://deepinfra.com/Qwen/Qwen3.8-27B), USD/M input/cached/output: promotional $0.15/$0.038/$1.875, list $0.20/$0.05/$2.50. [Default 200 concurrent requests per model](https://docs.deepinfra.com/account/rate-limits), with possible 429 under shared load even below that ceiling; increases through dashboard. [Open-model data policy](https://docs.deepinfra.com/account/data-privacy): no content disk storage/training; metadata retained. No comparable measured speed yet. Business signup completed. A $5 monthly provider usage limit is saved; inference requires billing address/payment and credit. No usable key captured yet.
- **Groq:** [same Qwen model is preview](https://console.groq.com/docs/models), advertised 450 tok/s; Developer 250k TPM / 1k RPM, $0.80 input / $4 output per M. These are provider claims, not our workload measurements. Qwen is absent from the [supported prompt-cache list](https://console.groq.com/docs/prompt-caching); do not assume cache discounts. [ZDR can be enabled](https://console.groq.com/docs/your-data); otherwise reliability/abuse exceptions permit up to 30-day content retention. Signed in, evaluation key saved privately with a 2026-11-20 expiry, and global ZDR enabled. The Developer checkout needs billing address/payment details.
- **Fireworks:** [Qwen3.8 27B supports dedicated deployment, not serverless](https://fireworks.ai/models/fireworks/qwen3p8-27b). [H100/H200 $8 per GPU-hour](https://fireworks.ai/pricing). Serverless alternatives have [adaptive limits](https://docs.fireworks.ai/serverless/rate-limits), not a capacity guarantee. [Open-model ZDR by default](https://docs.fireworks.ai/guides/security_compliance/data_handling); Responses API storage differs. Existing configured key returned HTTP 412 on read-only metadata endpoints: account suspended, possibly billing or monthly spend limit. Actual cause remains unconfirmed; no billing change or inference call.
- **Together:** same 27B not in the [current serverless catalog](https://docs.together.ai/docs/serverless/models). GPT-OSS-120B alternative $0.15 input / $0.60 output per M; Qwen3.8 Flash and 2.4T are different models. [Best-effort serverless](https://docs.together.ai/docs/serverless/rate-limits); negotiated provisioned throughput for guarantees. [Prompt storage defaults on; organization ZDR is opt-in](https://docs.together.ai/docs/zero-data-retention). No configured key.
- **SambaNova:** [no same Qwen in current catalog](https://docs.sambanova.ai/docs/en/models/sambacloud-models); GPT-OSS-120B alternative [costs $0.22/$0.59 per M input/output](https://cloud.sambanova.ai/plans/pricing). [Developer 60 RPM / 12k RPD for that model, 20M tokens/day across models](https://docs.sambanova.ai/docs/en/models/rate-limits). [Official support says no prompt retention/training by default](https://community.sambanova.ai/t/data-handling-and-retention/1314/2), but verify current contract before customer traffic. No comparable Qwen speed or configured key.
- **Baseten:** [same model on a single H100 dedicated deployment](https://www.baseten.co/library/qwen38-27b/), not a verified shared token-priced endpoint. [H100 $0.10833/min, approximately $6.50/hour](https://www.baseten.co/pricing/); scaling/deployment compute billable. [Synchronous inference ZDR](https://docs.baseten.co/observability/security); KV retention engine-dependent. No configured key, capacity or measured speed.
- **GPU self-hosting:** [official Apache-2.0 Qwen weights support vLLM/SGLang](https://huggingface.co/Qwen/Qwen3.8-27B). [Latitude H100 starts at $1.68/hour](https://www.latitude.sh/pricing), subject to location/quote; [Runpod H100 PCIe lists $2.89/hour](https://www.runpod.io/pricing). Storage, idle capacity and operations are extra. We own serving logs and cache retention; infrastructure terms still apply. No rental, GPU availability check or performance proof. Fitting weights on one GPU does not establish 100–200-stream capacity.

Standard API signup is expected to have less sales friction than negotiated enterprise capacity; this is an inference from self-service offerings, not an approval promise. Cerebras higher-capacity approval is uncertain given its earlier rejection. Dedicated GPU options add quota, availability and operations work.

### Test preparation and remaining proof

The existing harness now selects reviewed provider routes and list prices through `INFERENCE_PROVIDER`, uses a persistent $5 provider campaign ledger, and reserves before dispatch. It records unknown spend conservatively across restart and refuses conflicting writers/corrupt accounting. The load and eval phases each default to $2. SDK `RequestExecutor.Retries=0` makes each new probe one provider request; no handwritten retry is added. Catalog entries used: `@smthrs/model-host`, `@smthrs/model`, `@smthrs/flow`, `@smthrs/platform-node`, `@smthrs/agent`, `@smthrs/evals` and `@smthrs/scorers`. The experiment's strict admission guard is separate from the SDK soft-forecast budget because the latter does not promise a worst-case paid-test ceiling.

**Executed Groq evidence:** `bench/cerebras-load/results/2026-10-21T19-52-00.654Z`: 3/3 short-prompt requests succeeded, about 1.5k input tokens and 256 output tokens each; p95 TTFT 332.47 ms, total 839.95 ms, median decode 503.83 tokens/s; estimated list-price usage $0.0066352. This is a smoke test, not sustained capacity. An earlier agent-size probe (`19-50-07.614Z`) was refused HTTP 413 under the free account's 8k TPM ceiling. It made three refused SDK transport attempts before the harness disabled that policy. Refusals charged zero. No full-size load ramp has run.

**Executed eval refusal:** `evals/results/agent-2026-10-21T19-54-57-499Z.json` reached Groq through the real ChatApi model role and real agent/device runtime. Behavior, safety and no-answer judge scores were all 1; one refused model call charged zero. The gate nevertheless exits 5 (inconclusive): existing committed scorer identities predate `jev-sort`, a known baseline issue already documented in `docs/features/agent-evals.md`. Baseline and gates are unchanged. This verifies refusal/accounting, not successful candidate answer quality. The current Cerebras suite also has previously recorded unresolved `ask-*` behavior; it must be reconciled before a clean comparative quality qualification.

The provider-neutral refusal setup preserves the selected route and custom credential origin. Candidate evals use explicit provider prices and the same campaign ledger; unknown usage stays charged. Focused unit tests and type checking cover the guard and routing; full-app coverage is not claimed by focused runs.

Next: finish both providers' billing details (forms are open in Arc), run matched sustained cold/warm 9–10k contexts, then the full real agent evals without rewriting the baseline for a candidate. Preserve every unresolved/infrastructure failure. Prove the best candidate as a configured **dev** role through `/api/model/<role>` and real browser agent/chat e2e. Judge, renderer and summary need explicit checks; an agent-suite pass does not prove all roles. No production role change follows from smoke data.

### Multiple-provider routing and failover proposal — not implemented

For regular capacity, assign new conversations or roles to a qualified provider at admission and keep healthy conversations there for cache reuse. Maintain explicit per-provider capacity and spend allocations. Do not send duplicate speculative calls. Rebalancing affects new admissions, while in-flight calls retain their recorded provider. Provider health comes from durable call receipts, with recovery checks executed as flows.

Extend `@smthrs/agent`'s existing `ModelStep`; `@smthrs/model-host` resolves routes/secrets and `@smthrs/flow` owns attempts, waits, recovery and deadlines. Snapshot an approved role policy and ordered candidates at logical-call admission. Persist the selected route per attempt, while retaining the canonical actual provider/model/body identity for each attempt. Credentials resolve after preparation and never enter keys or logs. A role edit affects new calls, not a replay.

Only provider-origin capacity refusals and eligible transient outage errors advance the chain. Local budget refusals, permission failures, invalid requests and safety failures do not. Honor Retry-After within the deadline through engine retry policy. Reserve every attempt; unknown billed work retains its reservation. No speculative parallel provider call or handwritten retry loop.

Preserve exact provider-specific prompt prefixes, stable tool ordering, history, settings and cache keys; keep conversations on a healthy provider. **KV caches do not transfer between providers**: the first backup request may be cold. Explicit cache-retention writes are separately priced. Partial output resets with the existing retry event; never concatenate two providers' answers or execute partial tool calls. Sealed replay makes no HTTP request; unsealed recovery remains at-least-once and can rebill.

Required regressions: provider 429 switches but local budget 429 and 401 do not; Retry-After survives restart; partial output resets; cancellation stops transport; sealed replay makes zero provider calls; crashes preserve spend and selected route; role edits cannot alter replay; cache-prefix equality and provider isolation; no duplicate tool side effect; all providers exhausted produces one honest failure. Diagnostics contain correlation/attempt/role/policy/provider/model/error-origin, latency/cache/cost and switch reason only.

**No provider-choice or small-spend approval remains.** The owner needs to enter billing address/payment details that are absent from both new accounts. Groq's Developer checkout and DeepInfra's Stripe billing form are open in Arc. The operator continues tests after those details are entered. No card data belongs in chat or receipts.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 12:28 PDT
**What:** Send the already approved capacity request when Arc is free.
**Why:** Measured capacity is inadequate for expected traffic.
**Current state:** Will asked again at 12:25 whether the email was sent. At 12:27 the lead confirms it remains unsent and waits on Arc availability; the authorized draft has no send receipt.
**Next step:** Lead resumes the previously authorized send when Arc is available, then records send evidence and the provider response. This tracker sends no messages.
**Open questions for Will:** When is Arc free, or what time should the authorized sender use?
Evidence: script-filtered user-typed text and lead replies, approximately 10:28–12:28 PDT, session 6253ecf2; rulings and queue answers govern over historical briefs, designs, decisions, proposals, TODOs and rules. Product results are lead-reported. Existing engineering ownership is retained; Codex curates tracker documentation and validates the site build.
## Tracker reconciliation — 2026-10-20 23:44 PDT

**What:** Send the approved measured-capacity request, then obtain a provider response.

**Why:** Measured rate limits do not support the expected user traffic.

**Current state:** At 23:35 Will authorized a Codex computer-use agent to send the draft through Arc. At 23:36 the lead reports it stopped because Arc and the Mac were in active use. The email was not sent. This supersedes the old requirement that Will send it himself.

**Next step:** Lead reruns the authorized send when Arc is free; retain send evidence and provider response. This tracker sends no message.

**Open questions for Will:** When is Arc free? Existing authorization covers the drafted message; do not ask for approval again.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2, approximately 21:44–23:44 PDT; queue answers through 23:38:44, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Synthetic notifications and tool content excluded. Later rulings supersede retained history. Product receipts are lead-reported; this tracker validates the maintainer-site build. Execution ownership retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 21:04 PDT

**What:** Resolve provider capacity for expected traffic using the completed load-test evidence.

**Why:** Will asked what happens at hundreds of users and chose measurement before a capacity request.

**Current state:** The 20:59 lead reports the transport fixed and sustained provider rate limits measured: 343 of 542 requests at concurrency 10 returned HTTP 429. Headers report 150k TPM and 450 RPM. The unsent capacity request is queued at priority 960. This supersedes the earlier “no confirmed provider 429” and “no load run” statements retained below. Neither the test nor a proposed tier proves support for hundreds of users.

**Next step:** Review the draft’s measured limits and user-count assumptions, then follow up on the provider’s actual offered capacity. Retain durable retry and budget distinctions. Older proposals for quotas, token-history limits or fallback are ideas, not newly authorized implementation.

**Open questions for Will:** Review and send the queued capacity request; no message is sent by this tracker.

Evidence: script-filtered lead updates through 21:04 PDT, queue answers and cerebras-load.md. Existing experiment receipts are reported evidence; this tracker runs only the site build.

## Earlier tracker history (retained)


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
