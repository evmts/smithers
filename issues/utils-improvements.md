# Utils Improvements Plan

## Summary

Analysis of `src/utils/` identified several improvement opportunities. All 356 tests originally passed. TypeScript and linting pass with no errors.

## Results

**Changes Made:**
- Created `src/utils/extract-text.test.ts` (24 new tests)
- Created `src/utils/scope.test.ts` (28 new tests)
- Fixed CRLF handling in `parseJJStatus` for cross-platform consistency
- Migrated `mcp-config.ts` from `fs.writeFile` to `Bun.write`
- Updated `mcp-config.test.ts` to use `Bun.file().text()` instead of `fs.readFile`

**Test Results:**
- Before: 356 tests passing
- After: 408 tests passing (+52 new tests)
- All tests pass, no errors

## Issues Found (Prioritized)

### High Priority

1. **Missing tests for `extract-text.ts`**
   - File: `src/utils/extract-text.ts`
   - Issue: No test file exists for `extractText()` function
   - Action: Create `src/utils/extract-text.test.ts`

2. **Missing tests for `scope.ts`**
   - File: `src/utils/scope.ts`
   - Issue: No test file exists for `encodeScopeSegment()`, `makeScopeId()`, `makeStateKey()`
   - Action: Create `src/utils/scope.test.ts`

3. **MCP config uses legacy node:fs/promises**
   - File: `src/utils/mcp-config.ts:1-3`
   - Issue: Uses `import * as fs from 'fs/promises'` instead of Bun.file per CLAUDE.md
   - Action: Replace with `Bun.file().text()` and `Bun.write()`

### Medium Priority

4. **MCP config unimplemented tool types**
   - File: `src/utils/mcp-config.ts:89-95`
   - Issue: `filesystem`, `github`, `custom` types are placeholders
   - Action: Document as unimplemented or remove from type if not planned

5. **Unused import in mcp-config.ts**
   - File: `src/utils/mcp-config.ts:3`
   - Issue: `os` module imported but only used once; could use Bun alternative
   - Action: Keep as-is since `os.tmpdir()` has no direct Bun equivalent

6. **parseJJStatus doesn't handle CRLF consistently**
   - File: `src/utils/vcs/parsers.ts:38`
   - Issue: Uses `split('\n')` instead of `/\r?\n/` like parseGitStatus
   - Action: Update to use `/\r?\n/` for cross-platform consistency

### Low Priority

7. **capture.ts: generateTodoItem return type mismatch**
   - File: `src/utils/capture.ts:316-333`
   - Issue: Function signature says `string` but implementation returns an object-keyed expression
   - Action: Verify the return is actually a string (it is, just unusual pattern)

8. **zod-converter.ts: Heavy use of `any` types**
   - File: `src/utils/structured-output/zod-converter.ts`
   - Issue: Uses `Record<string, any>` and `(schema as any)` extensively
   - Action: Accept as necessary for Zod internals introspection

9. **jj.ts: Cache TTL constant is very short (100ms)**
   - File: `src/utils/vcs/jj.ts:111`
   - Issue: `CACHE_TTL_MS = 100` may be too aggressive; consider making configurable
   - Action: Leave as-is; short TTL is intentional for near-real-time status

## New Tests Needed

### 1. extract-text.test.ts
```typescript
// Test cases:
- extractText with null returns empty string
- extractText with string returns that string
- extractText with number returns string representation
- extractText with boolean returns empty string
- extractText with array returns joined strings
- extractText with React element extracts children text
- extractText with nested React elements extracts all text
```

### 2. scope.test.ts
```typescript
// Test cases for encodeScopeSegment:
- encodes special characters
- leaves alphanumeric unchanged
- handles empty string
- handles unicode

// Test cases for makeScopeId:
- creates id from parent, type, id
- handles suffix when provided
- handles suffix when not provided
- encodes all segments

// Test cases for makeStateKey:
- creates key from scopeId and domain
- includes localId when provided
- includes suffix when provided
- encodes localId and suffix
```

## Refactoring Opportunities

1. **Consolidate CRLF handling** in parsers.ts - use consistent regex across all parse functions

2. **Consider extracting constants** from capture.ts PATTERNS into a separate patterns config file for easier maintenance

3. **Add JSDoc to scope.ts functions** - currently undocumented

## Implementation Order

1. Create `src/utils/extract-text.test.ts`
2. Create `src/utils/scope.test.ts`
3. Fix CRLF handling in `parseJJStatus`
4. Migrate mcp-config.ts to use Bun.file API
5. Run all tests to verify

## Verification Commands

```bash
bun test src/utils/
bun run check
```
