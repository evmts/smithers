# Test Coverage Gap: TUI Shared Components

## Source Files Missing Tests

| File | Lines | Complexity |
|------|-------|------------|
| `src/tui/components/shared/ScrollableList.tsx` | 70 | Medium |
| `src/tui/components/shared/XMLViewer.tsx` | - | Low-Medium |

## What Should Be Tested

### ScrollableList.tsx
- Rendering items with `renderItem` callback
- `j/k` key navigation updates selection
- `g` key jumps to first item
- `G` key jumps to last item
- `Enter` key triggers `onSelect` callback
- Scroll offset updates when selection moves out of view
- `focused` prop disables keyboard handling
- `height` prop limits visible items
- Empty items array handling

### XMLViewer.tsx
- XML content parsing and display
- Syntax highlighting (if any)
- Large content handling

## Priority

**MEDIUM** - Reusable components used across multiple views. Bugs propagate.

## Test Approach

```typescript
// Isolation test for ScrollableList
const items = ['a', 'b', 'c', 'd', 'e']
const onSelect = mock()
const { simulate } = render(
  <ScrollableList items={items} renderItem={(i) => <text>{i}</text>} onSelect={onSelect} />
)

simulate.keyPress('j') // down
simulate.keyPress('return')
expect(onSelect).toHaveBeenCalledWith('b', 1)
```

## Edge Cases Not Covered

- `clampedSelectedIndex` when items array shrinks
- Rapid key presses (debouncing?)
- Items array changes mid-selection
