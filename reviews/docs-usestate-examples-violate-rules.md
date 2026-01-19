# Inconsistency: useState in Examples Violates CLAUDE.md Rules

## Files
- `docs/components/claude.mdx` (lines 326-350)
- `docs/components/review.mdx` (lines 117-153)
- `docs/components/smithers-provider.mdx` (lines 358-385)

## Issue
Multiple docs show `useState` in orchestration component examples, but CLAUDE.md explicitly states:
> **NEVER use useState.** All state must be in SQLite (`db.state`), `useRef`, or derived/computed.

The `ralph-wiggum-loop.mdx` correctly shows SQLite-based state, but other component docs don't follow this pattern.

## Suggested Fix
Update examples to use SQLite state pattern:

```tsx
// Instead of:
const [phase, setPhase] = useState("implement");

// Use:
const phase = useQueryValue<string>(db.db, 
  "SELECT value FROM state WHERE key = 'phase'") ?? "implement";
const setPhase = (p: string) => 
  db.state.set('phase', p);
```

Affected examples:
- `claude.mdx` ConditionalClaude and ResilientClaude examples
- `review.mdx` ReviewWorkflow example
- `smithers-provider.mdx` WorkflowContent example
