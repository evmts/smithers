---
"@smthrs/engine-store": minor
---

`EngineStore.drive` takes an optional `budgetMs`, so a host whose invocations
have a hard limit, such as a Cloudflare Durable Object alarm at 15 minutes,
ends each drive in time. A step that starts within the budget runs to the end
and records its result. Once the budget is spent the drive holds the next step
before it writes an attempt, waits for the running steps, releases the run and
reports the new `Driven` variant `Yielded`: drive it again at once. The release
records cause `{ kind: "yielded" }`, and the run is left `suspended` and
unowned, so the next drive claims it without judging it dead and runs every
step exactly once. An action a running step calls is part of that step, and the
first step of a drive always starts, so even a budget shorter than one step
moves the run forward. Each yield counts on `EngineStoreMetrics.driveYields`
(`flows_engine_drive_yields`). Without `budgetMs`, `drive` is unchanged.
