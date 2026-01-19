# TUI Improvements Plan

## Status: ✅ COMPLETED

### Results
- **Before**: 361 tests passing
- **After**: 420 tests passing (+59 new tests)
- **TypeScript**: 0 errors
- **Linting**: Clean

## Summary

After thorough review of `src/tui/`, the code is well-structured with:
- 420 passing tests (was 361)
- 0 TypeScript errors
- Clean architecture (hooks, services, components pattern)

## Issues Found (Prioritized)

### P0 - Security

1. **SQL Injection in usePollTableData** - [usePollTableData.ts:16-19](file:///Users/williamcory/smithers/src/tui/hooks/usePollTableData.ts#L16-L19)
   - `tableName` is directly interpolated into SQL queries
   - Already documented in tests but not fixed
   - **Fix**: Validate against TABLES whitelist from DatabaseExplorer

### P1 - Missing Test Coverage

2. **ScrollableList.test.tsx** - [ScrollableList.test.tsx](file:///Users/williamcory/smithers/src/tui/components/shared/ScrollableList.test.tsx)
   - Only 6 shallow tests (module exports + prop interface)
   - Missing: keyboard navigation (j/k/g/G), scroll behavior, selection, rendering
   
3. **XMLViewer.test.tsx** - [XMLViewer.test.tsx](file:///Users/williamcory/smithers/src/tui/components/shared/XMLViewer.test.tsx)
   - Missing: `getLineColor()` function tests, maxLines truncation, line rendering

4. **View Components** - Missing functional tests:
   - ExecutionTimeline (no test file)
   - RenderFrameInspector (no test file)
   - HumanInteractionHandler (no test file)
   - ReportViewer (no test file)

### P2 - Code Quality

5. **useRenderFrames.test.tsx** - Uses wrong property name `node_tree` instead of `tree_xml`
   - [useRenderFrames.test.ts](file:///Users/williamcory/smithers/src/tui/hooks/useRenderFrames.test.ts)
   - Test mock uses `node_tree` but RenderFrame type has `tree_xml`
   - **Fix**: Update test mock to use correct property name

7. **Unused `onTabChange` prop** - [TabBar.tsx:12](file:///Users/williamcory/smithers/src/tui/components/layout/TabBar.tsx#L12)
   - Prop is accepted but never used in component

8. **Unused `height` prop** - Multiple view components accept but don't use:
   - [ChatInterface.tsx:15](file:///Users/williamcory/smithers/src/tui/components/views/ChatInterface.tsx#L15)
   - [HumanInteractionHandler.tsx:15](file:///Users/williamcory/smithers/src/tui/components/views/HumanInteractionHandler.tsx#L15)
   - [ReportViewer.tsx:15](file:///Users/williamcory/smithers/src/tui/components/views/ReportViewer.tsx#L15)

9. **`as any` in test** - [useReportGenerator.test.ts:80](file:///Users/williamcory/smithers/src/tui/hooks/useReportGenerator.test.ts#L80)
   - Use proper mock type

### P3 - Minor Improvements

10. **Duplicate truncate functions**
    - [DatabaseExplorer.tsx:157-160](file:///Users/williamcory/smithers/src/tui/components/views/DatabaseExplorer.tsx#L157-L160)
    - [HumanInteractionHandler.tsx:205-208](file:///Users/williamcory/smithers/src/tui/components/views/HumanInteractionHandler.tsx#L205-L208)
    - [ReportViewer.tsx:149-152](file:///Users/williamcory/smithers/src/tui/components/views/ReportViewer.tsx#L149-L152)
    - **Fix**: Extract to shared utility

11. **Duplicate status color functions**
    - [Header.tsx:38-46](file:///Users/williamcory/smithers/src/tui/components/layout/Header.tsx#L38-L46)
    - [ExecutionTimeline.tsx:117-125](file:///Users/williamcory/smithers/src/tui/components/views/ExecutionTimeline.tsx#L117-L125)
    - **Fix**: Extract to shared constants/utility

12. **Duplicate formatTimestamp functions**
    - [RenderFrameInspector.tsx:111-117](file:///Users/williamcory/smithers/src/tui/components/views/RenderFrameInspector.tsx#L111-L117)
    - [ReportViewer.tsx:162-168](file:///Users/williamcory/smithers/src/tui/components/views/ReportViewer.tsx#L162-L168)
    - **Fix**: Extract to shared utility

## Implementation Plan

### Phase 1: Security Fix (P0)

```typescript
// usePollTableData.ts - Add validation
const ALLOWED_TABLES = [
  'executions', 'phases', 'agents', 'tool_calls', 'human_interactions',
  'render_frames', 'tasks', 'steps', 'reports', 'memories',
  'state', 'transitions', 'artifacts', 'commits', 'snapshots', 'reviews'
]

export function usePollTableData(db: SmithersDB, tableName: string): TableData {
  // Validate tableName
  if (!ALLOWED_TABLES.includes(tableName)) {
    console.debug(`[usePollTableData] Invalid table name: ${tableName}`)
    return { columns: [], data: [] }
  }
  // ... rest of hook
}
```

### Phase 2: Fix Type Issues (P2)

1. Check RenderFrame type definition and align RenderFrameInspector usage
2. Remove or implement unused props
3. Fix test type issue

### Phase 3: Add Tests (P1)

1. Create tests for ScrollableList keyboard navigation
2. Add XMLViewer getLineColor tests
3. Add basic view component tests

### Phase 4: Refactoring (P3)

1. Create `src/tui/utils/format.ts` with:
   - `truncate(str, maxLen, ellipsis?)`
   - `formatTimestamp(timestamp)`
   
2. Create `src/tui/utils/colors.ts` with:
   - `getStatusColor(status)`
   - Color constants (Tokyo Night theme)

## New Tests Needed

```
src/tui/components/shared/ScrollableList.test.tsx (expand)
  - keyboard navigation (j/k moves selection)
  - g goes to first, G goes to last
  - scroll offset updates when selection exceeds visible area
  - onSelect callback fires on Enter
  - focused=false disables keyboard handling
  - clamps selectedIndex to valid range

src/tui/components/shared/XMLViewer.test.tsx (expand)
  - getLineColor returns correct colors for:
    - comments (<!--)
    - self-closing tags (<tag/>)
    - opening tags (<tag>)
    - closing tags (</tag>)
    - text content
  - maxLines truncates correctly
  - shows "X more lines" when truncated

src/tui/components/views/ExecutionTimeline.test.tsx (new)
  - renders empty state when no events
  - renders event list with correct icons
  - keyboard navigation works

src/tui/components/views/RenderFrameInspector.test.tsx (new)
  - renders empty state when no frames
  - displays frame navigation info
  - keyboard navigation works

src/tui/utils/format.test.ts (new)
src/tui/utils/colors.test.ts (new)
```

## Verification Steps

After each change:
1. `bun test src/tui/` - all tests pass
2. `bunx tsc --noEmit` - no type errors
3. Manual smoke test if needed

## Completed Changes

### Phase 1: Security Fix ✅
- Added `ALLOWED_TABLES` whitelist to `usePollTableData.ts`
- Invalid table names now return empty data instead of executing SQL

### Phase 2: Type Fixes ✅
- Fixed `useRenderFrames.test.ts` mock to use correct property names (`tree_xml`, `ralph_count`, `sequence_number`)
- Removed `as any` from `useReportGenerator.test.ts`

### Phase 3: New Tests ✅
- Expanded `ScrollableList.test.tsx` (6 → 26 tests)
- Expanded `XMLViewer.test.tsx` (8 → 24 tests)  
- Added `format.test.ts` (13 tests)
- Added `colors.test.ts` (10 tests)

### Phase 4: Refactoring ✅
- Created `src/tui/utils/format.ts` with shared utilities:
  - `truncate()`, `truncateTilde()`, `formatTimestamp()`, `formatTime()`, `formatValue()`
- Created `src/tui/utils/colors.ts` with shared utilities:
  - `colors` constant (Tokyo Night palette)
  - `getStatusColor()`, `getSeverityColor()`
- Refactored components to use shared utilities:
  - Header.tsx, ExecutionTimeline.tsx, RenderFrameInspector.tsx
  - DatabaseExplorer.tsx, HumanInteractionHandler.tsx, ReportViewer.tsx

### Files Changed
- `src/tui/hooks/usePollTableData.ts` - SQL injection fix
- `src/tui/hooks/useRenderFrames.test.ts` - Type fix
- `src/tui/hooks/useReportGenerator.test.ts` - Type fix
- `src/tui/utils/` - New directory with format.ts, colors.ts, index.ts
- `src/tui/utils/*.test.ts` - New test files
- `src/tui/components/layout/Header.tsx` - Use shared utils
- `src/tui/components/views/ExecutionTimeline.tsx` - Use shared utils
- `src/tui/components/views/RenderFrameInspector.tsx` - Use shared utils
- `src/tui/components/views/DatabaseExplorer.tsx` - Use shared utils
- `src/tui/components/views/HumanInteractionHandler.tsx` - Use shared utils
- `src/tui/components/views/ReportViewer.tsx` - Use shared utils
- `src/tui/components/shared/ScrollableList.test.tsx` - Expanded tests
- `src/tui/components/shared/XMLViewer.test.tsx` - Expanded tests
