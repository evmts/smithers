# Monitor Module Improvements

<metadata>
  <priority>P2</priority>
  <category>infrastructure</category>
  <status>implemented</status>
  <dependencies></dependencies>
  <blocked-by></blocked-by>
  <docs>[]</docs>
</metadata>

## Executive Summary

**What**: Fix code quality issues and add missing test coverage in src/monitor/

**Why**: Improve maintainability, fix incorrect imports, and ensure full test coverage

**Impact**: Better code quality, consistent with codebase conventions, full test coverage

## Problem Statement

The monitor module has several code quality issues:

1. Wrong file extension in import (`.jsx` instead of `.ts`)
2. Uses `node:fs` instead of `Bun.file` (per project conventions)
3. Missing radix parameter in `parseInt()`
4. Unused function parameter
5. Missing type exports from index
6. Incomplete test coverage for LogWriter methods

## Issues Found

### 1. Wrong Import Extension
**File**: `stream-formatter.ts` line 1
```ts
// Before
import type { ParsedEvent } from './output-parser.jsx'
// After  
import type { ParsedEvent } from './output-parser.js'
```

### 2. parseInt Missing Radix
**File**: `haiku-summarizer.ts` line 32
```ts
// Before
const threshold = options.threshold || parseInt(process.env['SMITHERS_SUMMARY_THRESHOLD'] || '50')
// After
const threshold = options.threshold || parseInt(process.env['SMITHERS_SUMMARY_THRESHOLD'] || '50', 10)
```

### 3. Unused Parameter
**File**: `stream-formatter.ts` line 129
```ts
// Before
private formatLog(_time: string, message: string): string {
// After - removed unused parameter
private formatLog(message: string): string {
```

### 4. Missing Type Exports
**File**: `index.ts`
```ts
// Missing exports for:
// - SummaryResult, SummaryType from haiku-summarizer
// - FormatterStats from stream-formatter  
// - ParsedEvent from output-parser
```

### 5. Missing Test Coverage
**File**: `log-writer.test.ts`
Missing tests for:
- `writeStreamSummary()` - from parts array
- `writeToolCall()`
- `writeAgentResult()`
- `writeError()`
- `closeStream()`
- `getSessionId()`

## Implementation

### Phase 1: Fix Import Extension
Fix `.jsx` → `.js` in stream-formatter.ts

### Phase 2: Fix parseInt Radix
Add radix 10 to parseInt call

### Phase 3: Fix Unused Parameter
Remove `_time` parameter from formatLog and update caller

### Phase 4: Add Type Exports
Export all public types from index.ts

### Phase 5: Add Missing Tests
Add comprehensive tests for untested LogWriter methods

## Files Summary

| Action | File Path | Description |
|--------|-----------|-------------|
| MODIFY | `src/monitor/stream-formatter.ts` | Fix import, remove unused param |
| MODIFY | `src/monitor/haiku-summarizer.ts` | Add radix to parseInt |
| MODIFY | `src/monitor/index.ts` | Add type exports |
| MODIFY | `src/monitor/log-writer.test.ts` | Add missing tests |

## Acceptance Criteria

- [x] All imports use correct extensions
- [x] No unused parameters
- [x] parseInt has radix parameter
- [x] All public types exported
- [x] Full test coverage for LogWriter
- [x] All tests pass
- [x] TypeScript compiles without errors
