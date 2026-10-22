---
"@smthrs/registry": patch
---

`MarkdownFlow.toCoreFrontmatter` no longer drops a Markdown flow's `disable-model-invocation`, `budget`, `deadline` or `sandbox`, so the flow `Executable` lowers keeps the limits its author declared. `Descriptor`'s budget and sandbox schemas are now `@smthrs/core`'s `Markdown` schemas, re-exported; `SandboxSelection` now refuses a non-positive `cpus` and a non-integer or non-positive `memoryMib` or `timeoutSecs`, which discovery already refused.
