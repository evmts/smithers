# Scoring runs inside the caller's durable action

2026-10-22 · DUR-2 · library implementation decision

The scorer Runner accepted Effect closures into a scoped in-memory queue.
Shutdown discarded accepted jobs, and replaying a completed submit action did
not restore them. No production consumer used submit; evaluation consumers
used only blocking batches.

A durable Runner would need serializable scorer declarations and a durable
admission/dispatch protocol, duplicating the caller's flow boundary. Instead,
remove Runner and RunnerLive. Scoring exposes blocking batch helpers and the
existing job-key and failure conversion functions. Consumers await those
helpers inside their own durable actions and provide ScoreStore directly.
The CLI project evaluation caller now persists cases, run options and scorer
identities in its own evaluation action, creating a journal even for a new
project. Rootless evaluation remains a synchronous helper for an owning caller.

The engine owns admission, retries, deadlines and resumption. recordOnce owns
observation idempotency. External scorer effects still require idempotency at
the external boundary. No private queue, background loop or re-dispatch remains.

The regression disposes the real Node runtime over an on-disk journal while a
score is executing, reconstructs it, resumes, and replays the completed run.
The old implementation left zero observations; the replacement records one.

The host driver resumes the admitted request, so a fresh CLI timestamp does
not conflict with an interrupted run. Suite data uses the eval library's
versioned devalue 5.9.2 envelope, preserving the existing cloneable graph
contract without placing executable values in the journal. Persisted binding
positions retain distinct target references even when display names match;
scorer keys and target names validate that the implementation is still present.

A correlated batch's explicit failed-write outcome fails the evaluation action
with scorer_unavailable. The action uses the flow SDK's bounded transient
retry policy for that error only, preserving its deadline and attempts across
resumption. It must never become a journaled success without its
score-store observation. The real SQL-trigger regression covers that failure.
