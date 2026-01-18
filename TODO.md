# TODO

Incomplete work, stubs, and placeholders in the codebase.

---

## High - Fix Skipped Tests (48 total)

**Goal: Achieve 0 skipped tests before MVP**

The test suite currently skips 48 tests. These must be fixed, not ignored.

### Root Causes & Fixes

1. **Tests Using Wrong Testing Approach** (7 tests)
   - [ ] Migrate from DOM-based testing to SmithersNode/XML serialization
   - [ ] Use `SmithersRoot.toXML()` for assertions instead of DOM queries
   - [ ] Do NOT add happy-dom/jsdom - this project uses a custom React reconciler that renders to SmithersNode, not DOM
   - [ ] Files affected: `src/reactive-sqlite/hooks/context.test.tsx`

2. **Solid JSX Transform Mismatch** (30+ tests)
   - [ ] Remove outdated skip comments - components are now React
   - [ ] Update test patterns from Solid to SmithersNode/XML testing
   - [ ] Files affected:
     - `src/components/Claude.test.tsx`
     - `src/components/Review.test.tsx`
     - `src/components/Ralph.test.tsx`
     - `src/components/Git/*.test.tsx`
     - `src/components/JJ/*.test.tsx`
     - `src/components/Hooks/*.test.tsx`
     - `evals/*.test.tsx`

3. **Integration Test Import Issues** (10+ tests)
   - [ ] Fix `react-reconciler` package resolution in test environment
   - [ ] Check for circular imports
   - [ ] Files affected: `src/orchestrator/integration.test.ts`

4. **SmithersCLI Bun Execution** (2 tests)
   - [ ] Fix "script execution with bun works" test
   - [ ] Files affected:
     - `src/orchestrator/components/agents/SmithersCLI.test.ts`
     - `src/components/agents/SmithersCLI.test.ts`

---

## High - Fix Failing Tests (37 total)

### Zod Schema Converter (18+ failures)
- [ ] **`src/utils/structured-output/zod-converter.ts`** - `zodToJsonSchema()` returns objects with missing `type` property
- [ ] Consider using existing library `zod-to-json-schema` if custom implementation is complex
- [ ] See: `reviews/zod-schema-converter-broken.md`

### React Hooks (7 failures)
- [ ] Migrate to SmithersNode/XML testing (same fix as skipped tests above)
- [ ] Use `SmithersRoot.mount()` and `toXML()` for assertions
- [ ] See: `reviews/react-hook-tests-need-dom.md`

---

## Medium - SDK Integration

### Claude SDK Integration (`src/components/Claude.tsx`)
- [ ] **`executeWithClaudeSDK(config)`** (lines 9-31) - Integrate with `@anthropic-ai/claude-agent-sdk`. Currently throws `'Claude SDK integration not yet implemented'` in production, returns mock in test mode.

---

## Medium - Solid.js Migration Cleanup

The source code has been migrated to React, but remnants of Solid.js remain in config/docs.

### Build Configuration
- [ ] **`vite.config.ts`** - Remove `vite-plugin-solid` and solid-js externals (lines 50-53)
- [ ] **`vitest.config.ts`** - Remove `vite-plugin-solid` and alias to non-existent `src/solid/renderer.js` (line 19)
- [ ] **`bunfig.toml`** - Remove `jsx = "solid"` if present

### Documentation
- [ ] **`docs/concepts/state-management.mdx`** - Rewrite from Solid signals to React hooks
- [ ] **`docs/concepts/ralph-wiggum-loop.mdx`** - Update Solid references to React
- [ ] **`docs/installation.mdx`** - Remove Solid JSX setup instructions
- [ ] **`docs/introduction.mdx`** - Update framework description
- [ ] **`docs/components/*.mdx`** - Update all `createSignal` examples to `useState`
- [ ] **`docs/examples/*.mdx`** - Update Solid patterns to React
- [ ] **`docs/guides/*.mdx`** - Update Solid patterns to React

### Plugin Files
- [ ] **`plugins/smithers/plugin.json`** - Remove "solid-js" from dependencies (line 22)
- [ ] **`plugins/smithers/skills/smithers/SKILL.md`** - Remove Solid JSX references
- [ ] **`plugins/smithers/skills/smithers/REFERENCE.md`** - Update to React patterns
- [ ] **`plugins/smithers/skills/smithers/EXAMPLES.md`** - Update Solid patterns to React

### Root Files
- [ ] **`README.md`** - Update Solid.js mentions (lines 46, 401)
- [ ] **`CONTRIBUTING.md`** - Remove reference to `src/solid/` directory (line 44)
- [ ] **`.claude-plugin/marketplace.json`** - Update description (line 12)

---

## Low - Test Infrastructure

### Skipped Tests (`src/components/Ralph.test.tsx`)
- [ ] **Lines 17-29** - Tests skipped due to "Solid JSX transform mismatch" but Ralph.tsx is now React. Re-enable tests.
- [ ] **Lines 9-10** - Extract `createOrchestrationPromise`, `signalOrchestrationComplete`, `signalOrchestrationError` to separate utility file for testability.

### Other Skipped Tests
- [ ] **`evals/hello-world.test.tsx`** - Re-enable tests (components are now React)
- [ ] **`evals/renderer.test.tsx`** - Re-enable tests
- [ ] **`evals/execute-helpers.test.ts`** - Re-enable tests
- [ ] **`evals/components.test.tsx`** - Re-enable tests

### Component Tests with "Solid JSX transform mismatch" comments
- [ ] `src/components/Claude.test.tsx` (line 86)
- [ ] `src/components/Review.test.tsx` (line 221)
- [ ] `src/components/Git/Notes.test.tsx` (line 82)
- [ ] `src/components/Git/Commit.test.tsx` (line 99)
- [ ] `src/components/JJ/Commit.test.tsx` (line 46)
- [ ] `src/components/JJ/Describe.test.tsx` (line 39)
- [ ] `src/components/JJ/Status.test.tsx` (line 46)
- [ ] `src/components/JJ/Snapshot.test.tsx` (line 32)
- [ ] `src/components/JJ/Rebase.test.tsx` (line 57)
- [ ] `src/components/Hooks/PostCommit.test.tsx` (line 65)
- [ ] `src/components/Hooks/OnCIFailure.test.tsx` (line 100)

### Integration Tests (`src/orchestrator/integration.test.ts`)
- [ ] **Lines 226-230** - Skipped component export tests (SmithersProvider, Orchestration, Phase, Step, Claude)
- [ ] **Line 254** - Skipped VCS Component Imports test suite

### SmithersCLI Tests
- [ ] **`src/orchestrator/components/agents/SmithersCLI.test.ts`** (line 44) - Skipped "script execution with bun works" test
- [ ] **`src/components/agents/SmithersCLI.test.ts`** (line 44) - Skipped "script execution with bun works" test

### Failing Tests (`src/reactive-sqlite/hooks/context.test.tsx`)
- [ ] **7 failing tests** - React hooks tests need migration to SmithersNode/XML testing pattern. This project uses a custom React reconciler that renders to SmithersNode trees, not DOM. Use `SmithersRoot.mount()` and `toXML()` for testing instead of DOM-based testing libraries.

---

## Low - Feature Gaps

### MCP Server Types (`src/orchestrator/utils/mcp-config.ts`)
- [ ] **Lines 86-91** - Implement additional MCP server types. Currently only `sqlite` is implemented. Placeholder exists for:
  - `filesystem` - File system MCP server
  - `github` - GitHub MCP server
  - `custom` - Custom MCP server configurations

---

## Low - Code Quality (from reviews)

### React Lifecycle Testing Gap
- [ ] No tests verify that `<Claude>` actually runs its `useEffect`. Current tests verify DOM structure but not behavior. (See `reviews/code_review.md:64`)

### Backpressure Handling (`src/reactive-sqlite/database.ts`)
- [ ] **Lines 164-181** - No backpressure handling for rapid mutations. Multiple mutations in quick succession trigger separate invalidations/re-queries instead of being batched. (See `reviews/reactive-sqlite-code-review.md:252`)

---

## Low - Documentation

### README Demo
- [ ] **`README.md`** (line 12) - Add GIF demo (currently placeholder image)
