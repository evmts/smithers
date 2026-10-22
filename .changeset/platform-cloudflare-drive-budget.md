---
"@smthrs/platform-cloudflare": minor
---

`ExecutionObject.alarm` drives its execution within a budget, so no alarm
reaches Cloudflare's 15-minute wall-clock limit. Past `driveBudgetMs` (600
seconds unless given; `ExecutionObject.driveBudget` reads it from
`EXECUTION_DRIVE_BUDGET_SECONDS`, whole seconds from 1 to 899) the drive starts
no new step, lets the running ones finish and record their results, and yields:
the alarm answers the new `Outcome` `Yielded` and is armed for now, so the next
alarm goes on at once and runs every step exactly once. Before, a run with more
work than one alarm could hold was killed mid-step, and the next alarm took it
from the dead incarnation and ran that step again. Every drive's duration is
recorded by outcome in `ExecutionObject.driveDuration`
(`smithers_cloudflare_execution_drive_duration`, buckets to 900 seconds) and
logged on the alarm's line as `smithers.execution.drive_ms`.
