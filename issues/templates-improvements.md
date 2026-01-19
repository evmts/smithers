# Templates Improvements

## Issues Found

### main.tsx.template

| Issue | Severity | Description |
|-------|----------|-------------|
| Incorrect DB reference | Medium | Comments say "PGlite" but codebase uses SQLite via `createSmithersDB` |
| `<Orchestration>` doesn't exist | High | References non-existent component - should use SmithersProvider props instead |
| Uses `<Review>` inside `<Ralph>` | Low | Review exists but usage pattern unclear |
| Missing simpler examples | Medium | Template is comprehensive but complex - need basic patterns |
| No component template | High | Missing template for creating new components |
| No hook template | High | Missing template for creating new hooks |

### Missing Templates

- **component.tsx.template** - Basic component following CLAUDE.md (no useState, use SQLite)
- **hook.tsx.template** - Custom hook using SQLite patterns
- **agent.tsx.template** - Simple agent with Claude

## Changes Made

1. **Fixed main.tsx.template**:
   - Removed `<Orchestration>` wrapper (functionality in SmithersProvider)
   - Fixed PGlite → SQLite references
   - Simplified structure to match actual component exports

2. **Added component.tsx.template**:
   - Shows proper SQLite state pattern
   - Uses `useQueryValue` instead of useState
   - Demonstrates db.tasks lifecycle

3. **Added hook.tsx.template**:
   - Pattern for hooks using reactive SQLite
   - Proper `useMount`/`useUnmount` from reconciler/hooks

4. **Added simple-agent.tsx.template**:
   - Minimal orchestration example
   - Single phase with Claude
