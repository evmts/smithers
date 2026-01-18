# Wire Plan Markers to Execution (Stop, Human, Persona, Constraints)

<metadata>
  <priority>medium</priority>
  <category>bugfix</category>
  <status>design-review-accounted</status>
  <dependencies>
    - src/components/Stop.tsx
    - src/components/Human.tsx
    - src/components/Claude.tsx
    - src/utils/mcp-config.ts
    - src/db/human.ts
    - src/hooks/useHuman.ts
  </dependencies>
</metadata>

---

<section name="design-review-addendum">

## Review Addendum (accounted)

Source: `reviews/plan-markers-not-wired.md`

Quick fixes:
- Stop component should call `requestStop` on mount.
- Human component should create a blocking task + db.human request.

Moderate:
- Persona/Constraints extraction into Claude prompt assembly.

</section>

---

## Problem Statement

Many components render plan XML only and never execute side effects:

```
Render -> XML captured
  -> No execution wiring
  -> Orchestration appears complete but does not act
```

Key gaps:
- `<smithers-stop>` does not trigger stop request.
- `<human>` does not create interaction or block orchestration.

---

## Requirements

1. Stop: call `requestStop(reason)` on mount.
2. Human: create db.human request and a blocking task; resolve on approval/reject.
3. Persona/Constraints: optional extraction into system prompt.
4. Explicitly document which markers are plan-only vs execution-capable.

---

## Implementation Notes

Stop:
- `useMount(() => requestStop(...))`.

Human:
- `db.tasks.start('human_interaction', ...)` to block.
- `db.human.request(...)`.
- Resolve via polling or reactive subscription (`useHuman`).
- Complete task when request resolved.

Persona/Constraints:
- Extract from children string similar to MCP config parsing.
- Merge into system prompt, strip markers from prompt.

Task/Subagent:
- Keep as plan-only unless semantics defined.

---

## Acceptance Criteria

- Stop component always triggers stop.
- Human component blocks orchestration until resolved.
- Persona/Constraints applied to Claude prompt when present.
- Docs clarify plan-only markers.

