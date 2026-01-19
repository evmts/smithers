# Documentation Improvements Plan

## Summary

This document outlines issues found in `/Users/williamcory/smithers/docs/` and provides a prioritized implementation plan.

---

## Issues Found

### Priority 1: Critical - Missing from Navigation (mint.json)

| File | Issue |
|------|-------|
| `examples/kitchen-sink.mdx` | Not in mint.json navigation, orphaned doc |
| `api-reference/use-command.mdx` | Not in mint.json navigation, orphaned doc |
| `guides/claude-log-format.mdx` | Not in mint.json navigation, orphaned doc |

**Fix:** Add these files to mint.json navigation or remove if deprecated.

### Priority 2: High - Broken/Invalid Internal Links

| File:Line | Issue |
|-----------|-------|
| `api-reference/state.mdx:199-204` | Duplicate Card links - both link to "Database Persistence" |
| `examples/multi-phase-review.mdx:213` | Links to `/concepts/state-management` which doesn't exist |
| `components/codex.mdx:486,494` | Links to `/components/fallback-agent.mdx` (should be `/components/fallback-agent`) |
| `components/gemini.mdx:539,545` | Links to `/components/fallback-agent.mdx` (should be `/components/fallback-agent`) |
| `api-reference/use-command.mdx:580,586,592` | Links to `.mdx` extension (should omit extension) |

**Fix:** Correct link paths.

### Priority 3: High - Import Path Inconsistencies

| File:Line | Issue |
|-----------|-------|
| `concepts/database-persistence.mdx:18` | Uses `import from "smithers-orchestrator/db"` |
| `quickstart.mdx` | Uses `import from "smithers-orchestrator"` |
| Various API docs | Mixed usage of `/db` and `/reactive-sqlite` subpaths |

The actual exports show:
- `createSmithersDB` is exported from both `smithers-orchestrator` and `smithers-orchestrator/db`
- `useQuery`, `useQueryValue` are from `smithers-orchestrator/reactive-sqlite`

**Fix:** Standardize import examples to match actual package exports. Use main package for common imports, subpaths only when necessary.

### Priority 4: Medium - Outdated/Deprecated Pattern Usage

| File:Line | Pattern Issue |
|-----------|---------------|
| `examples/multi-phase-review.mdx:15-50` | Uses `useState` instead of SQLite + `useQueryValue` |
| `examples/mcp-database.mdx:112-148` | Uses `useState` instead of SQLite + `useQueryValue` |
| `guides/error-handling.mdx:27-53` | Uses `useState` instead of SQLite + `useQueryValue` |
| `guides/mcp-integration.mdx:83-118` | Uses `useState` for phase management |
| `guides/vcs-integration.mdx:73-113` | Uses `useState` for phase management |
| `components/if.mdx:93-102` | Duplicate example section |
| Multiple docs | Show `<Ralph maxIterations={...}>` but Ralph is deprecated; should use SmithersProvider |

Per CLAUDE.md: "NEVER use useState. All state must be in SQLite."

**Fix:** Update examples to use SQLite state with `useQueryValue` + `db.state.set()`.

### Priority 5: Medium - Missing Documentation

| Topic | Description |
|-------|-------------|
| `Each` component | Exported but no docs in `components/` |
| `End` component | Exported but no docs in `components/` |
| `Switch` component | Listed in mint.json but needs verification |
| `While` component | Listed in mint.json but needs verification |
| `FallbackAgent` component | Listed in mint.json but needs verification |
| `useMount`, `useUnmount`, `useMountedState` hooks | Core hooks per CLAUDE.md, need docs |
| `buildState` module | New db module not documented |
| `renderFrames` module | New db module not documented |
| `vcsQueue` module | New db module not documented |

**Fix:** Create documentation for missing exported components/hooks.

### Priority 6: Low - Inconsistent Terminology

| Issue | Location |
|-------|----------|
| "signals" terminology | Some docs mention "signals" but Smithers uses React state/SQLite |
| "reactive queries" vs "useQueryValue" | Inconsistent hook naming in examples |
| `db.state.set("phase", x)` vs `setPhase(x)` pattern | Mixed usage patterns |

**Fix:** Standardize terminology throughout docs.

### Priority 7: Low - MDX Formatting Issues

| File:Line | Issue |
|-----------|-------|
| `components/codex.mdx:250-303` | Long file truncated in read, verify completeness |
| `components/gemini.mdx:250-349` | Long file truncated in read, verify completeness |

---

## Implementation Plan

### Phase 1: Fix Navigation (mint.json)

Add missing files to mint.json:

```json
// In navigation -> Examples group
"examples/kitchen-sink"

// Create new "Advanced" group under Guides
{
  "group": "Advanced",
  "pages": [
    "guides/claude-log-format"
  ]
}
```

Note: `use-command.mdx` is marked as "Planned Feature" - either add to "Planned" section or keep orphaned.

### Phase 2: Fix Broken Links

1. `api-reference/state.mdx` - Remove duplicate Card
2. `examples/multi-phase-review.mdx` - Change `/concepts/state-management` to `/concepts/database-persistence`
3. All `.mdx` links - Remove `.mdx` extension from hrefs

### Phase 3: Standardize Import Paths

Create consistent import patterns:
- Main package: `import { Claude, SmithersProvider, createSmithersDB } from "smithers-orchestrator"`
- Reactive hooks: `import { useQueryValue } from "smithers-orchestrator/reactive-sqlite"`

### Phase 4: Update Examples to Use SQLite State

Update all examples that use `useState` for phase/workflow state to use:

```tsx
// Replace this pattern:
const [phase, setPhase] = useState("start");

// With this pattern:
const { db, reactiveDb } = useSmithers();
const phase = useQueryValue<string>(
  reactiveDb,
  "SELECT value FROM state WHERE key = 'phase'"
) ?? "start";
const setPhase = (p: string) => db.state.set('phase', p);
```

Files to update:
1. `examples/multi-phase-review.mdx`
2. `examples/mcp-database.mdx` (DataWorkflow function)
3. `guides/error-handling.mdx` (RetryWorkflow, ResilientWorkflow, RobustWorkflow)
4. `guides/mcp-integration.mdx` (DataPipeline)
5. `guides/vcs-integration.mdx` (ReviewAndCommit, FeatureWorkflow)

### Phase 5: Update Ralph to SmithersProvider

Many examples show `<Ralph>` as a wrapper when `<SmithersProvider>` should be the canonical approach. Update examples to:

1. Use `<SmithersProvider maxIterations={...}>` instead of nested `<Ralph>`
2. Keep `<Ralph>` examples only where demonstrating legacy/specific Ralph behavior

### Phase 6: Create Missing Component Docs

Create documentation for:
1. `components/each.mdx` - For `<Each>` iteration component
2. `components/end.mdx` - For `<End>` workflow completion component

### Phase 7: Create Missing Hook Docs

Add section to `api-reference/hooks.mdx` or create separate docs for:
1. `useMount` - Execute on component mount
2. `useUnmount` - Cleanup with latest props/state
3. `useMountedState` - Safe async setState

### Phase 8: Document New DB Modules

Add documentation for:
1. `api-reference/build-state.mdx` - Build state coordination
2. `api-reference/render-frames.mdx` - Time-travel debugging frames
3. `api-reference/vcs-queue.mdx` - VCS operation serialization

---

## Files Changed Summary

### Modified Files
- `docs/mint.json` - Add missing navigation entries
- `docs/api-reference/state.mdx` - Fix duplicate link
- `docs/examples/multi-phase-review.mdx` - Fix link, update to SQLite state
- `docs/examples/mcp-database.mdx` - Update DataWorkflow to SQLite state
- `docs/guides/error-handling.mdx` - Update examples to SQLite state
- `docs/guides/mcp-integration.mdx` - Update DataPipeline to SQLite state
- `docs/guides/vcs-integration.mdx` - Update examples to SQLite state
- `docs/components/codex.mdx` - Fix link extension
- `docs/components/gemini.mdx` - Fix link extension
- `docs/api-reference/use-command.mdx` - Fix link extensions
- `docs/components/if.mdx` - Remove duplicate example

### New Files
- `docs/components/each.mdx`
- `docs/components/end.mdx`
- `docs/api-reference/lifecycle-hooks.mdx` (useMount, useUnmount, useMountedState)

---

## Verification Checklist

After implementation:
- [ ] All MDX files have valid frontmatter
- [ ] All internal links resolve (no 404s)
- [ ] Import paths match actual package exports
- [ ] Examples follow SQLite state pattern (no useState for workflow state)
- [ ] Ralph usage is documented as deprecated with SmithersProvider as alternative
- [ ] All exported components have corresponding docs
