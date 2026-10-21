# Cerebras load test

apps/mvp/bench/cerebras-load/results/2026-10-21T02-03-06.102Z

Stopped: errors_above_20_percent. Charged token upper bound: 334485; estimated USD 0.33703.

| Concurrent | Requests/s | OK / 429 / other | TTFT p50/p95/p99 ms | Total p50/p95/p99 ms | Output tok/s | Est. USD |
|---:|---:|---:|---|---|---:|---:|
| 1 | 0.8 | 19 / 0 / 27 | 342.7/1314.8/1777.0 | 616.7/1621.1/2002.0 | 79.4 | 0.3370 |

```text
  1  p95 ################# 1621.1ms  errors !!!!!!!!!!!!!!!!!!!!!!!! 58.7%
# = 100ms p95 total latency; ! = 2.5 percentage points errors
```

## Method and limits

Run from the repository root: `zsh -lc 'source ~/.zshrc >/dev/null 2>&1; node apps/mvp/bench/cerebras-load/run.ts'`. Offline checks: `node --test apps/mvp/bench/cerebras-load/stats.test.ts`. Each run writes raw.json, append-only requests.jsonl and journal.sqlite in a unique results directory. SDK route: HostModel.layerConfig(CHAT_MODEL, the endpoint default), openai-chat through @smthrs/model; every probe is an @smthrs/flow action recorded by the Node SQLite engine. No HTTP request is hand-written. Fetch only observes an allowlist of rate-limit headers. Provider error bodies, prompts, output and credentials are never recorded.

Closed-loop workers, concurrency 1/10/25/50/100/200, 60 seconds admitting requests at each level, then drain (45-second request deadline). Immediately replace each completed request; no retry. Stop escalating when combined errors exceed 20%. 95% synthetic chat context ~1.5k input tokens, 5% ~7k; actual provider usage retained; maxTokens 256. The measured final ramp sets reasoningEffort none through the SDK so the 256-token cap produces chat text; TTFT is first text (or thinking, if emitted) delta. Initial default-reasoning calibrations had no decoded token deltas and are excluded from the final ramp. Total latency and TTFT are successful calls only; failures retain their individual latency in raw evidence. Aggregate output tok/s includes reasoning, over the full step including drain. Decode tok/s p50 is separately retained; a short output and client buffering limit its accuracy.

Before every dispatch reserve UTF-8 prompt bytes + 128 input tokens and 256 output tokens at $0.99/$1.49 per million input/output. Admission refuses any reservation crossing 2M tokens or $5, including in-flight requests. Complete usage settles reservations; clean 4xx refusals charge zero; unknown usage retains the upper bound. This is an estimated API cost cap, not a billing guarantee. Source: [SDK pricing table](../../../../../../packages/smithers/agent/model/src/internal/prices.generated.ts), [Cerebras pricing](https://www.cerebras.ai/pricing).

One Mac client, one outbound network region (not independently geolocated), one evening in America/Los_Angeles on 2026-10-20. Shared organization limits and concurrent eval traffic can affect results; no isolated account or cooldown between steps. This measures the provider route, not deployment auth, database, app latency or hundreds of people. Closed-loop offered load, shared prompt caching, short outputs, and SQLite overhead limit extrapolation. Unreached levels are unmeasured.

## Capacity scenarios and draft for Will

DAU alone does not imply throughput. Assume 10 agent calls/DAU/day (an ask may need multiple calls), an 8-hour active window, peak 10x that window's average, no cache credit, and 2x capacity headroom. At 8k tokens/call, 100/300/1,000 DAU imply 8/24/80M tokens/day; peak 21/63/209 RPM and 167k/500k/1.67M TPM; request provisioned limits of 42/125/417 RPM and 334k/1M/3.34M uncached TPM.

Today's latest saved passing eval (evals/results/agent-2026-10-21T01-25-16-080Z.json) reports 31 agent calls, 291,989 input + 18,610 output = 10,019 tokens/call. Using that more conservative observed average: 10.02/30.06/100.19M tokens/day; headroom targets 0.42/1.26/4.18M uncached TPM with the same RPM targets. The baseline.json contains scores, not usage; this usage receipt is the evidence. Costs and DAU assumptions are planning scenarios, not observed product usage.

[Published tier limits](https://inference-docs.cerebras.ai/support/rate-limits), checked 2026-10-20: Developer Qwen 150k uncached TPM, temporarily 750k total TPM and 300 RPM; Enterprise custom. Under these uncached peak/headroom assumptions all three scenarios need custom Enterprise limits; Developer can serve lower peaks or effective caching, which this run cannot guarantee. Our observed account headers may differ from published defaults.

Draft (Will sends): “We load-tested qwen-3.8-27b through our Smithers SDK from one Mac client on Oct 20. At concurrency 1: 46 requests, 0 HTTP 429s, 27 other failures, p95 TTFT 1314.8ms and total 1621.1ms. We stopped at errors_above_20_percent, spending approximately $0.3370 and 334485 tokens. Please confirm our organization/project limits, whether 429s were uncached-token, total-token or request limits, and the recommended shared Enterprise or dedicated option. For staged 100/300/1,000 DAU, at 10 calls/day, ~8–10k tokens/call, peak 10x active-hour average and 2x headroom, please quote 42/125/417 RPM with 0.42/1.26/4.18M uncached TPM, corresponding total-token capacity, and burst/concurrency allowances. We want to validate 100–200 simultaneous streams with stable p95 latency. What throughput/latency commitments, region options and pricing can you offer?”
