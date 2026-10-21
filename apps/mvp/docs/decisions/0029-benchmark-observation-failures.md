# Benchmark observation failures

2026-10-21 · benchmark correctness fixes

A follower transport failure ends observation and fails the benchmark. It does not retry: a gap makes latency samples unreliable. Electric's explicit 409 refetch remains a successful protocol transition only after its response and cursor validate, and its messages are applied. Startup requests have a 30-second deadline; live polls have 90 seconds, including response bodies. The benchmark HTTP service exposes fault injection for these failure paths.

Effect scopes own the follower, browser, and groups of contexts, including partial acquisition and cancellation. Concurrent success requires browser completion even for rate-limited responses. Repository replay shares the messages projection's insert/update/delete semantics. Partial baseline updates retain omitted metrics and each metric's original source and environment.

Library catalog: existing Effect services and resource scopes at the Node benchmark boundary; the existing shared shape replay is reused. No new dependency or retry runtime is introduced. Resource acquisitions/releases and follower requests have counters and spans; terminal follower errors also become failed run checks.

Validation: regression tests run on Latitude, using pure projections, real file handles, and faulty Effect HTTP/acquisition services. App-suite results are compared before and after because the farm's shared services are noisy. This change makes no timing or performance claim.
