# Testing Infrastructure

## Overview

Smithers uses Vitest for testing with a **two-phase approach** to avoid getting stuck on JSX transpilation configuration.

## Two-Phase Testing Strategy

### Phase 1: Core Renderer Tests (✅ COMPLETE)

Test the renderer methods directly WITHOUT JSX. This proves the architecture is sound.

**Why Phase 1 First:**
- No JSX transpilation complexity
- Tests fundamental renderer behavior
- Validates architecture before tackling configuration
- Provides confidence to debug Phase 2 issues

**Implementation:**
- Export `rendererMethods` object from renderer.ts
- Import and test these methods directly
- Verify all core functionality: createElement, setProperty, insertNode, removeNode, replaceText

**Key Files:**
- `src/solid/renderer-core.test.ts` - All 16 tests passing ✅
- Tests replaceText() which is CRITICAL for signal updates

### Phase 2: JSX Tests (🔧 TODO)

Once core tests pass, configure vite-plugin-solid for JSX transpilation.

**The Trick:**
- vite-plugin-solid imports the renderer at BUILD TIME
- Needs a `.js` file (not `.ts`) that Vite can import
- Use alias resolution to map module name to actual file

**Planned Tests:**
- Signal updates trigger in-place mutations (CRITICAL)
- JSX creates proper SmithersNode trees
- XML serialization for plan display
- Ralph Wiggum loop (key changes → remount)

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/solid/renderer-core.test.ts

# Run tests in watch mode
bun test --watch

# Generate coverage report
bun test --coverage
```

## Test Structure

### Core Renderer Tests (✅ Passing)

Location: `src/solid/renderer-core.test.ts`

Tests the fundamental renderer methods without JSX:
- Node creation and manipulation
- Property setting (including special handling of `key`)
- Tree insertion/removal
- Text node updates (critical for fine-grained reactivity)

These tests prove that the SmithersNode renderer architecture is sound.

## Success Criteria - Phase 1

- ✅ All 16 core renderer tests pass
- ✅ createElement creates proper node structure
- ✅ setProperty handles key specially (Ralph Wiggum loop)
- ✅ setProperty ignores children prop
- ✅ insertNode adds children and sets parent reference
- ✅ insertNode supports anchor for insertion before sibling
- ✅ removeNode cleans up parent reference
- ✅ replaceText mutates TEXT nodes in-place (CRITICAL!)
- ✅ Tree traversal methods work correctly

## Next Steps

1. ⏭️ Implement XML serialization (serialize.ts)
2. ⏭️ Add serialization tests
3. ⏭️ Configure vite-plugin-solid for Phase 2
4. ⏭️ Add JSX tests
5. ⏭️ Add component tests

## TDD Approach

Following Test-Driven Development:
1. ✅ Write tests first
2. ✅ Verify core functionality (renderer tests passing)
3. ⏭️ Implement features to make tests pass
4. ⏭️ Refactor with confidence

The critical test (signal updates → in-place mutations) will be added in Phase 2. Once JSX transpilation works, running this test will immediately catch any bugs in the reactivity system.
