---
title: Cerebras rate-limit plan
status: idea
area: infra
owner: unassigned
updated: 2026-10-19
links: [../features/chat.md, ../benchmarks.md]
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

## Next

A `pnpm bench` load run to confirm the ceiling, then steps 1 and 2.

## Questions for Will

- Ask Cerebras about Enterprise limits now, or after a load test? Recommended: after.
