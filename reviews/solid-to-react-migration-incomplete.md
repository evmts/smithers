**SCOPE: EASY**

# Solid to React Migration Incomplete

## Status: TECHNICAL DEBT

## Summary
The codebase successfully migrated from Solid.js to React (commit b180707), but outdated skip comments remain in test files. All tests reference "Solid JSX transform mismatch" or similar outdated reasons, confusing contributors about current state.

## Current State (2026-01-18 Audit)

### ✅ Successfully Migrated
- JSX runtime delegates to React (`src/reconciler/jsx-runtime.ts`)
- No Solid dependencies in `package.json` (uses React 19 + react-reconciler)
- No Solid config in tsconfig/bunfig
- Reconciler README documents React-based architecture
- SmithersProvider consolidates all context providers

### ❌ Outdated Artifacts Remain
**30+ skipped tests with misleading comments:**
- `/Users/williamcory/smithers/evals/renderer.test.tsx` (lines 16-17, 113-114): "JSX transform mismatch"
- `/Users/williamcory/smithers/evals/components.test.tsx` (lines 15-17): "requires React reconciler test environment setup"
- `/Users/williamcory/smithers/evals/hello-world.test.tsx` (line 10): same outdated comment
- `/Users/williamcory/smithers/src/components/Ralph.test.tsx` (lines 4-10): blames JSX but real issue is module loading pattern

## Impact
- Contributors assume Solid still in codebase (it's not)
- Skip comments blame non-existent "transform mismatch"
- Real test issues obscured by misleading comments
- `TODO.md` line 20 perpetuates myth: "Solid JSX Transform Mismatch"

## Root Cause Analysis
Tests don't actually fail due to "Solid JSX transform" - migration is complete. Real issues:
1. Tests need `SmithersRoot.mount()` + `toXML()` pattern (not DOM testing)
2. Some tests need utility extraction (Ralph.test.tsx)
3. Integration tests may have import resolution issues

## Suggested Fix (2-3 hours)

### Phase 1: Update Comments (30min)
Replace all "Solid JSX transform mismatch" with accurate reasons:
- `evals/renderer.test.tsx`: "requires SmithersRoot test harness setup"
- `evals/components.test.tsx`: "requires SmithersRoot.mount() + toXML() assertions"
- `src/components/Ralph.test.tsx`: "module contains JSX, needs utility extraction"

### Phase 2: Update Documentation (30min)
- `TODO.md` line 20: Change "Solid JSX Transform Mismatch" → "Reconciler Test Setup Required"
- Update description to reference SmithersNode/XML testing pattern

### Phase 3: Remove Solid References (1-2 hours)
Grep for case-insensitive "solid" in:
- `/Users/williamcory/smithers/reviews/` - update/delete related reviews
- `/Users/williamcory/smithers/docs/` - verify no Solid references (already clean)
- `.claude/prompts/` - update any prompts mentioning Solid

**Files to check:**
```bash
grep -ri "solid" reviews/ docs/ .claude/ src_for_llm.md | grep -v reference/
```

## Testing Strategy
After comment updates, no new tests needed - comments describe actual blockers accurately.
When ready to fix skipped tests, use pattern from working tests:
```tsx
const root = createSmithersRoot()
await root.mount(() => <MyComponent />)
expect(root.toXML()).toContain('<expected-output>')
```

## Priority
**P3** - Technical debt cleanup (misleading but not blocking)

## Estimated Effort
2-3 hours (down from 2-4 after audit clarifications)
