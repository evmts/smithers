# Align Orchestration Completion with Provider (onComplete + ci_failure)

<metadata>
  <priority>high</priority>
  <category>bugfix</category>
  <status>design-review-accounted</status>
  <dependencies>
    - src/components/Orchestration.tsx
    - src/components/SmithersProvider.tsx
    - templates/main.tsx.template
    - src/components/agents/SmithersCLI.ts
    - docs/examples/*.mdx
    - docs/components/smithers-provider.mdx
  </dependencies>
</metadata>

---

<section name="design-review-addendum">

## Review Addendum (accounted)

Source: `reviews/orchestration-completion-misaligned.md`

P1 issues:
- Orchestration completion is signaled by SmithersProvider but tree is not unmounted.
- `Orchestration.onComplete` + `cleanupOnComplete` are tied to unmount and may never fire.
- `GlobalStopCondition` includes `ci_failure` but switch case is missing.

</section>

---

## Problem Statement

```
SmithersProvider signals completion
  -> root promise resolves
  -> tree remains mounted
  -> Orchestration.useUnmount never runs
  -> onComplete/cleanup not executed
```

Also: stop-condition `ci_failure` is defined but unhandled.

---

## Requirements

1. Completion signal must reliably trigger Orchestration onComplete.
2. cleanupOnComplete must run deterministically.
3. `ci_failure` stop condition must be implemented.
4. Docs/examples must match actual lifecycle (root.dispose behavior).

---

## Implementation Notes

Pick one primary fix path:

Option A (provider-owned completion):
- SmithersProvider invokes registered completion callbacks before resolving.

Option B (component watches provider state):
- Orchestration reacts to `isComplete` from context and runs callbacks.

Option C (explicit disposal):
- After root mount resolves, call `root.dispose()` to unmount.
- Ensure templates/examples use this pattern.

Also add `ci_failure` case in Orchestration stop-condition switch.

---

## Acceptance Criteria

- `onComplete` fires without requiring manual unmount by callers.
- `cleanupOnComplete` runs once after completion.
- `ci_failure` stop condition works via state table signal.
- Docs/templates/SmithersCLI show the correct completion + dispose flow.

