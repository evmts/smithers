# groq load test

apps/mvp/bench/cerebras-load/results/2026-10-21T19-50-07.614Z

Stopped: request_ceiling. Charged token upper bound: 0; estimated USD 0.00000. Campaign estimate (including outstanding reservations): $0.

| Concurrent | Requests/s | OK / 429 / other | TTFT p50/p95/p99 ms | Total p50/p95/p99 ms | Output tok/s | Est. USD |
|---:|---:|---:|---|---|---:|---:|
| 1 | 0.0 | 0 / 0 / 1 | n/a/n/a/n/a | n/a/n/a/n/a | 0.0 | 0.0000 |

## Method and limits

Route: {"protocol":"openai-chat","baseUrl":"https://api.groq.com","path":"/openai/v1/chat/completions","modelId":"qwen/qwen3.8-27b","credential":"GROQ"}. Closed-loop workers; 1s admission per level, then drain, 45s request deadline. Actual levels appear above. Context: agent; cache condition: cold. The synthetic agent-size context repeats a project description 130 times; actual tokens are in requests.jsonl. This does not substitute for agent evals. Warm means a repeated prefix, not a guaranteed cache hit; cachedInputTokens records provider usage when available. Cold varies a nonce at the start. Max output 256, reasoning effort none; TTFT includes the first text or thinking delta.

Every probe is a recorded @smthrs/flow action using HostModel and the shared Node provider HTTP/1.1 transport. This initial diagnostic used the SDK default retry policy: the single logical probe made three HTTP 413 requests, 15 seconds apart. The later harness disables SDK transport retries. Stop escalation above 20% errors. Successful-call latency excludes refusals; raw rows retain all outcomes and allowlisted rate-limit headers. No prompts, outputs, keys or provider error bodies are logged.

The persistent provider campaign ledger reserves prompt UTF-8 bytes plus 4096 input tokens and 256 output tokens at reviewed list prices before dispatch. Its $5/provider ceiling includes outstanding reservations across restarts; the load phase defaults to $2. An exclusive lock refuses competing processes. Known usage settles; clean pre-output 4xx refunds; unknown usage retains the upper bound. See providers.ts for price sources and README.md for reproduction. This estimated cap is not an invoice guarantee.

One Mac, one network region and one time window. Closed-loop scheduling, SQLite/ledger overhead, shared account traffic and short outputs limit extrapolation. Unreached levels are unmeasured. No production-capacity or quality claim follows from this test alone.
