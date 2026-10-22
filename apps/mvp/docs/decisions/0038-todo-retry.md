# Retry a failed TODO in place

2026-10-22. Will requested recovery for the failed implement on TODO 1 of #4430.

Use `todo/Retry` through the existing durable browser engine, outbox and stack
writer. Preserve identity, issue, prompt revision, stack position and immutable
attempts; reset the latest branch/publication projection before a new attempt.
Each press has its own durable operation key. Replays recover the same start
receipt, including a lost admission acknowledgment.

The least role is Member for one's own TODO, Maintainer for anyone's; an agent
acts with the same authorization. Only an engine-confirmed cancelled current
attempt may be treated as stopped. Running, merged and dropped TODOs refuse.

The system TODO itself remains non-model-invocable: retrying its stale payload
would bypass attempt allocation. Publication uses the existing stack report
and successor admission path, composing with the separate failed-predecessor
hold change.

Before clearing the current projection, retry archives the attempt's branch and PR
number under the stack lock. Published descendants resolve that original base even
after a replacement publishes: a failed base closes them, while GitHub's confirmed
merge still takes precedence and permits restacking. These server-only attempt
fields do not change a device schema.
