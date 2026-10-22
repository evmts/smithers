---
"@smthrs/flow": minor
"@smthrs/engine-store": patch
---

A step can wait on its work for as long as its drive allows. `FlowRuntime.DriveDeadline` tells a step when its drive stops starting steps (a hosted engine's `budgetMs`), and `ExternalJob`'s `run` waits no later than it, so a sandbox command that runs for minutes answers the step that asked it with no park and no replay (the command-latency benchmark: a 30 s command's overhead 36 s to 0.1 s at 25 ms round trips). Reads in the step are spaced from each read's start, so a read that waited is followed by the next at once.
