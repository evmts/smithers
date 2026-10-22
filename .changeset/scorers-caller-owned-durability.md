---
"@smthrs/scorers": minor
"@smthrs/evals": minor
"@smthrs/cli": patch
---

Remove Runner and RunnerLive, including non-durable submit and its worker queue.
Await Scoring.runBatch or Scoring.runBatchCorrelated inside a caller-owned flow
action instead, providing ScoreStore directly. Stable job keys deduplicate
observations across interrupted attempts. Update evaluation consumers to the
blocking scoring helpers.

Project CLI evaluations now persist their inputs and score inside a durable
action. Resumption uses the engine's original request, including its timestamp.
Suite.encodeData/decodeData preserve cloneable input graphs in a versioned
portable envelope; the pinned decoder remains part of the durable contract.
