---
"@smthrs/plan": patch
"@smthrs/engine-store": patch
---

A writer appended in a later plan generation no longer runs while an earlier generation's reader of the same path is unfinished. `Plan.writerFences` lists the earlier readers each writer waits for, and the plan scheduler holds the writer until each one settles, whatever its outcome. The fence is ordering only: it is not recorded in `dependsOn`, so a failed or skipped reader never skips the writer and recorded plans keep their digests. Uses the library catalog's `@smthrs/flow` durable engine entry.
