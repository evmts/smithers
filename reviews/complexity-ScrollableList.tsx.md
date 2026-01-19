# Complexity Review: src/tui/components/shared/ScrollableList.tsx

## File Path
[src/tui/components/shared/ScrollableList.tsx#L30-L53](file:///Users/williamcory/smithers/src/tui/components/shared/ScrollableList.tsx#L30-L53)

## Current Code

```typescript
if (key.name === 'j' || key.name === 'down') {
  const newIndex = Math.min(clampedSelectedIndex + 1, items.length - 1)
  setSelectedIndex(newIndex)
  if (newIndex >= scrollOffset + height) {
    setScrollOffset(newIndex - height + 1)
  }
} else if (key.name === 'k' || key.name === 'up') {
  const newIndex = Math.max(clampedSelectedIndex - 1, 0)
  setSelectedIndex(newIndex)
  if (newIndex < scrollOffset) {
    setScrollOffset(newIndex)
  }
} else if (key.name === 'g') {
  setSelectedIndex(0)
  setScrollOffset(0)
} else if (key.name === 'G' || (key.shift && key.name === 'g')) {
  setSelectedIndex(items.length - 1)
  setScrollOffset(Math.max(0, items.length - height))
} else if (key.name === 'return') {
  const item = items[clampedSelectedIndex]
  if (item && onSelect) {
    onSelect(item, clampedSelectedIndex)
  }
}
```

## Suggested Simplification

Use **early returns** with action handlers:

```typescript
const handleKey = (key: KeyEvent) => {
  // Navigate down
  if (key.name === 'j' || key.name === 'down') {
    const newIndex = Math.min(clampedSelectedIndex + 1, items.length - 1)
    setSelectedIndex(newIndex)
    if (newIndex >= scrollOffset + height) setScrollOffset(newIndex - height + 1)
    return
  }

  // Navigate up
  if (key.name === 'k' || key.name === 'up') {
    const newIndex = Math.max(clampedSelectedIndex - 1, 0)
    setSelectedIndex(newIndex)
    if (newIndex < scrollOffset) setScrollOffset(newIndex)
    return
  }

  // Jump to top
  if (key.name === 'g') {
    setSelectedIndex(0)
    setScrollOffset(0)
    return
  }

  // Jump to bottom
  if (key.name === 'G' || (key.shift && key.name === 'g')) {
    setSelectedIndex(items.length - 1)
    setScrollOffset(Math.max(0, items.length - height))
    return
  }

  // Select
  if (key.name === 'return') {
    const item = items[clampedSelectedIndex]
    if (item && onSelect) onSelect(item, clampedSelectedIndex)
  }
}
```

## Alternative: Key Action Map

```typescript
type KeyAction = () => void

const getKeyActions = (): Record<string, KeyAction> => ({
  j: moveDown, down: moveDown,
  k: moveUp, up: moveUp,
  g: jumpToTop,
  G: jumpToBottom,
  return: selectCurrent,
})

const action = getKeyActions()[key.name]
if (action) action()
else if (key.shift && key.name === 'g') jumpToBottom()
```

## Benefits
- Early returns eliminate else-if chain
- Each action is self-contained
- Clearer intent per branch
