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

## Separately authorized transport-fix repeat — 19:34 PDT

The lead authorized a fresh, independent 2M-token/$5 cap on October 20 at 19:30. The Node host now uses the shared HTTP/1.1 provider transport; the repeat targets 60-second steps at concurrency 10/25/50, stopping escalation above 20% errors. Receipt: `results/2026-10-21T02-34-41.059Z/`.

Concurrency 10 ran for 60.45 seconds including drain: 542 attempts, 199 successes, 343 HTTP 429s, zero other failures; all 343 normalized refusals show one executor attempt. Successful p95 TTFT/total: 1294.6/1605.3 ms. Output throughput: 842.7 tokens/s. The 63.3% error fraction stopped escalation; 25 and 50 are unmeasured. Account headers again advertised 150k TPM and 450 RPM. Charged usage: 371,265 tokens, estimated $0.39302, within this repeat's separate cap. This is a real provider refusal boundary for one shared account and workload; the exact limiting bucket remains unknown. The transport mitigation is validated against this run. A subsequent local TLS record-corruption fixture reproduces the persistent HTTP/2 wedge independently: a fatal bad-record-MAC error leaves Node 26.5/26.10 dispatching against a destroyed session; the shared HTTP/1.1 transport repairs the damaged pre-header request and stays healthy. Ordinary GOAWAY/teardown controls alone recover.
