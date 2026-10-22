---
"@smthrs/core": minor
---

`Markdown.lowerMarkdown` keeps a flow's declared limits. `MarkdownFrontmatter` gains `modelInvocable`, `budget`, `deadline` and `sandbox`: `modelInvocable` and `deadline` go to `@smthrs/flow`'s `Flow.make`, so the native flow carries `Flow.ModelInvocable` and enforces the deadline, and `budget` and `sandbox` are read back from the signature's new `budget` and `sandbox` fields. A sandbox selection places the flow in a sandbox. `within`, `annotate` and `withFlows` keep all four. An invalid limit, a budget with no ceiling, or a sandbox selection beside another placement throws a `RangeError` naming the flow and the field. The schemas are published as `Markdown.Budget`, `BudgetCeiling`, `UsdCeiling`, `BudgetOnExceeded`, `SandboxProvider` and `SandboxSelection`.
