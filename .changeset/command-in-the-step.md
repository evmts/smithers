---
"@smthrs/flow": minor
"@smthrs/sandbox": minor
"@smthrs/engine-store": patch
"@smthrs/platform-cloudflare": patch
---

A sandbox command that exits at once answers the step that called it in 0.1 s rather than 47 s (`@smthrs/platform-cloudflare`'s command-latency benchmark, Postgres at a 25 ms round trip). `ExternalJob`'s `run` does work that ends within its wait (`probe.max` unless set) in the step that asks, under the job's first key, so the run never parks and no job execution is made; longer work goes on as the job under the same key. A status read gets `{ waitMs }` until the next probe is due, and `SandboxTools.observe` waits for the exit (`waitMs`, at most `limits.maxObserveWaitSeconds`), so an exit is seen when it happens. `SandboxTools.checkpoint` stages from the checkout's own index, reading only the files that changed. `EngineStore.drive` drives a run again itself when it parked on a wake due within `holdMs` (5 s unless set), rather than leaving it `Unfinished` for a new invocation; Cloudflare routing reads what a drive left as one read transaction; and each alarm logs `smithers.execution.build_ms` and `route_ms`. Uses the library catalog's `@smthrs/flow` durable engine and `@smthrs/sandbox` entries.
