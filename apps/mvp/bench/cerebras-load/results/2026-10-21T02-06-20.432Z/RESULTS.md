# Cerebras load test

apps/mvp/bench/cerebras-load/results/2026-10-21T02-06-20.432Z

HTTP/2 client transport failed: 58 attempts reported ERR_HTTP2_INVALID_SESSION. Other failures may have occurred mid-stream; see raw timing. These failures do not establish provider saturation. Stopped: hard_budget_reservation. Charged token upper bound: 993710; estimated USD 1.01421.

| Concurrent | Requests/s | OK / 429 / other | TTFT p50/p95/p99 ms | Total p50/p95/p99 ms | Output tok/s | Est. USD |
|---:|---:|---:|---|---|---:|---:|
| 1 | 1.3 | 81 / 0 / 0 | 291.2/863.6/1605.2 | 530.1/1138.1/1977.3 | 342.2 | 0.1679 |
| 10 | 4.3 | 94 / 0 / 63 | 468.0/1366.0/3042.8 | 760.8/1748.5/3558.6 | 656.7 | 0.8463 |

```text
  1  p95 ############ 1138.1ms  errors  0.0%
 10  p95 ################## 1748.5ms  errors !!!!!!!!!!!!!!!!! 40.1%
# = 100ms p95 total latency; ! = 2.5 percentage points errors
```

## Method and limits

Run from the repository root: `zsh -lc 'source ~/.zshrc >/dev/null 2>&1; node apps/mvp/bench/cerebras-load/run.ts'`. Offline checks: `node --test apps/mvp/bench/cerebras-load/stats.test.ts`. Each run writes raw.json, append-only requests.jsonl and journal.sqlite in a unique results directory. SDK route: HostModel.layerConfig(CHAT_MODEL, the endpoint default), openai-chat through @smthrs/model; every probe is an @smthrs/flow action recorded by the Node SQLite engine. No HTTP request is hand-written. Fetch only observes an allowlist of rate-limit headers. Provider error bodies, prompts, output and credentials are never recorded.

Closed-loop workers, concurrency 1/10/25/50/100/200, 60 seconds admitting requests at each level, then drain (45-second request deadline). Immediately replace each completed request; no retry. Stop escalating when combined errors exceed 20%. 95% synthetic chat context ~1.5k input tokens, 5% ~7k; actual provider usage retained; maxTokens 256. The measured final ramp sets reasoningEffort none through the SDK so the 256-token cap produces chat text; TTFT is first text (or thinking, if emitted) delta. Initial default-reasoning calibrations had no decoded token deltas and are excluded from the final ramp. Total latency and TTFT are successful calls only; failures retain their individual latency in raw evidence. Aggregate output tok/s includes reasoning, over the full step including drain. Decode tok/s p50 is separately retained; a short output and client buffering limit its accuracy.

A lower CEREBRAS_LOAD_TOKEN_CAP is permitted (this run: 1000000 tokens); it never raises the 2M hard ceiling. Before every dispatch reserve UTF-8 prompt bytes + 128 input tokens and 256 output tokens at $0.99/$1.49 per million input/output. Admission refuses any reservation crossing 2M tokens or $5, including in-flight requests. Complete usage settles reservations; clean 4xx refusals charge zero; unknown usage retains the upper bound. This is an estimated API cost cap, not a billing guarantee. Source: [SDK pricing table](../../../../../../packages/smithers/agent/model/src/internal/prices.generated.ts), [Cerebras pricing](https://www.cerebras.ai/pricing).

One Mac client, one outbound network region (not independently geolocated), one evening in America/Los_Angeles on 2026-10-20. Shared organization limits and concurrent eval traffic can affect results; no isolated account or cooldown between steps. The sustained repeat began after a refill pause following earlier diagnostic traffic. This measures the provider route, not deployment auth, database, app latency or hundreds of people. Closed-loop offered load, shared prompt caching, short outputs, and SQLite overhead limit extrapolation. Unreached levels are unmeasured.

## Capacity scenarios and draft for Will

DAU alone does not imply throughput. Assume 10 agent calls/DAU/day (an ask may need multiple calls), an 8-hour active window, peak 10x that window's average, no cache credit, and 2x capacity headroom. At 8k tokens/call, 100/300/1,000 DAU imply 8/24/80M tokens/day; peak 21/63/209 RPM and 167k/500k/1.67M TPM; request provisioned limits of 42/125/417 RPM and 334k/1M/3.34M uncached TPM.

Today's latest saved passing eval (evals/results/agent-2026-10-21T01-25-16-080Z.json) reports 31 agent calls, 291,989 input + 18,610 output = 10,019 tokens/call. Using that more conservative observed average: 10.02/30.06/100.19M tokens/day; headroom targets 0.42/1.26/4.18M uncached TPM with the same RPM targets. The baseline.json contains scores, not usage; this usage receipt is the evidence. Costs and DAU assumptions are planning scenarios, not observed product usage.

[Published tier limits](https://inference-docs.cerebras.ai/support/rate-limits), checked 2026-10-20: Developer Qwen 150k uncached TPM, temporarily 750k total TPM and 300 RPM; Enterprise custom. Under these uncached peak/headroom assumptions all three scenarios need custom Enterprise limits; Developer can serve lower peaks or effective caching, which this run cannot guarantee. Our observed account headers may differ from published defaults.

Draft (Will sends): “We load-tested qwen-3.8-27b through our Smithers SDK from one Mac client on Oct 20. At concurrency 1: 81 requests, 0 HTTP 429s, 0 other failures, p95 TTFT 863.6ms and total 1138.1ms; At concurrency 10: 157 requests, 0 HTTP 429s, 63 other failures, p95 TTFT 1366.0ms and total 1748.5ms. We stopped at hard_budget_reservation, spending approximately $1.0142 and 993710 tokens. We also observed HTTP/2 invalid-session failures in the client, so we are not presenting those as capacity failures. Please confirm our organization/project limits, whether 429s were uncached-token, total-token or request limits, and the recommended shared Enterprise or dedicated option. For staged 100/300/1,000 DAU, at 10 calls/day, ~8–10k tokens/call, peak 10x active-hour average and 2x headroom, please quote 42/125/417 RPM with 0.42/1.26/4.18M uncached TPM, corresponding total-token capacity, and burst/concurrency allowances. We want to validate 100–200 simultaneous streams with stable p95 latency. What throughput/latency commitments, region options and pricing can you offer?”


## Campaign evidence

The 60-second default-reasoning calibration and early corrected ramp are retained, but excluded from the final sustained table. The early corrected ramp stopped after 19 successes and 27 transport failures at concurrency 1; no HTTP status reached the observer for those failures. Two exploratory calibrations were interrupted to correct input size and missing reasoning-token latency; their incomplete observations remain in JSONL/raw.json.

A diagnostic with **1-second admission windows** (not sustained 60-second steps), plus complete drain, yielded:

| Concurrency | Requests | OK / 429 / other | TTFT p95 ms | Total p95 ms |
|---:|---:|---:|---:|---:|
| 1 | 1 | 1 / 0 / 0 | 681.3 | 1011.1 |
| 10 | 11 | 11 / 0 / 0 | 2192.5 | 2614.1 |
| 25 | 27 | 27 / 0 / 0 | 1206.7 | 1475.0 |
| 50 | 52 | 52 / 0 / 0 | 4315.4 | 4613.5 |
| 100 | 102 | 31 / 71 / 0 | 1692.1 | 2183.6 |

```text
Burst concurrency    p95 total (# ~= 250ms)       errors (! ~= 5%)
  1                  ####                        0%
 10                  ##########                  0%
 25                  ######                      0%
 50                  ##################          0%
100                  #########                   !!!!!!!!!!!!!! 69.6%
```

Raw burst receipt: `results/2026-10-21T02-04-32.000Z/raw.json`. It stopped before 200. The 429s are real, but their exact limiting bucket is not identified by the SDK's normalized `quota_exceeded` code. Headers reported **450 RPM, 150k TPM, 27k requests/hour, 9M tokens/hour, 648k requests/day and 216M tokens/day**. Provider-reported remaining counters varied between calls; do not infer the organization's exact quota implementation from them.

After a refill pause, the sustained repeat completed concurrency 1 for 60.5 seconds (81/81 success), then reached concurrency 10. Of 157 attempts there, 94 succeeded and 63 failed; 58 explicitly reported `ERR_HTTP2_INVALID_SESSION`, five failed while reading streams. The lower 1M-token allowance stopped admission after 36.6 seconds including drain, before the full minute. Thus **the SDK transport broke at 10; a separate short burst hit provider 429s at 100**. Sustained 25–200 capacity remains unmeasured. Fix the HTTP/2 session lifecycle in the host's fetch transport and repeat with an isolated account before asserting a capacity ceiling. This workstream does not alter the SDK transport or silently substitute a different HTTP client.

Campaign totals across all retained JSONL receipts: **902,423 provider-reported tokens; 1,857,551 tokens conservatively charged including unknown usage; $1.91076 estimated upper charge**. Allow a further **100,000 tokens / $0.11** for at most eleven interrupted calibration attempts with missing receipts: campaign upper bound **1,957,551 tokens / $2.02076**, below 2M / $5. This interrupted-attempt allowance derives from one sequential short request and up to ten short requests in flight at the two interrupts. Unknown usage is not proof of billed spend. No more live calls were made after the reduced budget stop.

Draft addendum for Will: “A separate short diagnostic burst produced 71 HTTP 429s out of 102 attempts at concurrency 100 (69.6%), while 52/52 at concurrency 50 succeeded; those are burst observations, not sustained capacity guarantees. Our account advertised 450 RPM and 150k TPM. We also hit Node HTTP/2 invalid-session failures in a sustained repeat at concurrency 10 and are treating that as a client transport problem pending investigation. Please help verify the 429 bucket and recommend the staged limits above. We will repeat a sustained run after fixing the transport.”

Validation: three offline behavioral checks passed (token and dollar admission boundaries, lowered campaign cap, quantiles and error classification). The final runner and flow were exercised live. A broad source-import typecheck was stopped after several minutes without a result; no full typecheck or production-app E2E claim is made. No commits, pushes or outbound messages were made.
