# 0022: An answer's turn follows its host lease

Status: implemented (2026-10-21), fixing review finding 4. Builds on [0011](0011-the-agent-runs-in-the-browser.md) and [0002](0002-local-first.md).

A model reasoning for more than thirty seconds produced no visible answer progress. The earlier implementation treated that silence as a disconnected device and admitted the next question with history missing the preceding exchange.

Answer ordering now follows confirmed durable-engine ownership pulses, independently of text, reasoning and tool events. The library catalog entries used are `@smthrs/flow` for declarations and interpreter registration, `@smthrs/engine-store` for durable execution and host leases, and `@smthrs/platform-browser` for the existing worker host. The SDK's public `Interpreter.ExecutionOptions.onHeartbeat` wraps every interpretation, including resumes that replay a sealed turn read. The engine dispatches bounded nonoverlapping receipts separately from its lease writer. The app owns no heartbeat timer, retry loop or job.

The authenticated `PATCH /api/answers/<id>` renews the answer timestamp at most once a third of the configured lease window. The default remains thirty seconds; configuration below five seconds is refused because ownership pulses occur every second. The receipt carries no user text, model reasoning, credentials or tool payloads. Existing telemetry records each route result and the SDK counts receipt outcomes.

Admission, heartbeat, terminal writes and durable expiry share a conversation lock. Granting a later turn first settles expired predecessors as `failed`, `abandoned`, updates their run status and folds notifications in the same transaction. A resumed stale host cannot reanimate a predecessor after a successor starts. Different conversations retain independent locks. A suspended or disconnected host emits no receipts, and its lease eventually releases the queue; `chat/Expire` remains the fallback when nobody asks a later question.

No persisted schema or device migration is needed. The change reuses `messages.updated_at` and the existing `abandoned` failure. This changes the old behavior that left expired predecessors streaming alongside their successors.

Verification lives in the real Postgres answer-route and durable-agent suites, the SDK's real SQLite ownership/receipt suites, and the browser's `e2e/answer-ordering.spec.ts`. The browser regression holds a dev-only faulty model in private reasoning for forty seconds, then checks the follow-up's real turn response and rendered answer. Recovery tests require renewed liveness after a sealed turn read replays, and cancellation tests require blocked receipts to end without blocking the engine's lease.
