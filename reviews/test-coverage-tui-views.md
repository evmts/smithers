# Test Coverage Gap: TUI Views

## Source Files Missing Tests

| File | Lines | Complexity |
|------|-------|------------|
| `src/tui/components/views/ChatInterface.tsx` | 131 | Medium-High |
| `src/tui/components/views/DatabaseExplorer.tsx` | 166 | Medium |
| `src/tui/components/views/ExecutionTimeline.tsx` | - | Medium |
| `src/tui/components/views/HumanInteractionHandler.tsx` | - | Medium |
| `src/tui/components/views/RenderFrameInspector.tsx` | - | Medium |
| `src/tui/components/views/ReportViewer.tsx` | - | Medium |

## What Should Be Tested

### ChatInterface.tsx
- Message rendering with different roles (user/assistant)
- Input handling and submit behavior
- API unavailable state rendering
- `Ctrl+L` clear history functionality
- Tab focus switching between input and message area
- Loading state display

### DatabaseExplorer.tsx
- Table list navigation (j/k keys)
- Table selection and data loading
- Column truncation logic
- Value formatting (`formatValue` function)
- Empty table state
- Tab focus switching between panels

### All Views
- Keyboard event handling
- Integration with hooks (`usePollTableData`, `useClaudeChat`, etc.)
- Error state rendering

## Priority

**HIGH** - These are user-facing components with complex interaction logic. Bugs here directly impact user experience.

## Notes

- Views depend on OpenTUI components (`scrollbox`, `input`, `text`)
- May require mock TUI renderer or component isolation testing
- `truncate` and `formatValue` are pure functions - easy unit test targets
