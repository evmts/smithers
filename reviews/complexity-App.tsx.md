# Complexity Review: src/tui/App.tsx

## File Path
[src/tui/App.tsx#L45-L68](file:///Users/williamcory/smithers/src/tui/App.tsx#L45-L68)

## Current Code

```typescript
useKeyboard((key: KeyEvent) => {
  // Function key navigation
  if (key.name === 'f1') setActiveTab('timeline')
  else if (key.name === 'f2') setActiveTab('frames')
  else if (key.name === 'f3') setActiveTab('database')
  else if (key.name === 'f4') setActiveTab('chat')
  else if (key.name === 'f5') setActiveTab('human')
  else if (key.name === 'f6') setActiveTab('reports')

  // Tab key cycles through tabs
  else if (key.name === 'tab' && !key.shift) {
    const currentIndex = TABS.findIndex(t => t.key === activeTab)
    const nextIndex = (currentIndex + 1) % TABS.length
    setActiveTab(TABS[nextIndex]!.key)
  } else if (key.name === 'tab' && key.shift) {
    const currentIndex = TABS.findIndex(t => t.key === activeTab)
    const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length
    setActiveTab(TABS[prevIndex]!.key)
  }

  // Quit on 'q' or Ctrl+C
  else if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
    process.exit(0)
  }
})
```

## Suggested Simplification

Use a **lookup table** for function key mappings:

```typescript
const FKEY_TAB_MAP: Record<string, TabKey> = {
  f1: 'timeline',
  f2: 'frames',
  f3: 'database',
  f4: 'chat',
  f5: 'human',
  f6: 'reports',
}

useKeyboard((key: KeyEvent) => {
  // Function key navigation via lookup
  const mappedTab = FKEY_TAB_MAP[key.name]
  if (mappedTab) {
    setActiveTab(mappedTab)
    return
  }

  // Tab cycling
  if (key.name === 'tab') {
    const currentIndex = TABS.findIndex(t => t.key === activeTab)
    const delta = key.shift ? -1 : 1
    const nextIndex = (currentIndex + delta + TABS.length) % TABS.length
    setActiveTab(TABS[nextIndex]!.key)
    return
  }

  // Quit
  if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
    process.exit(0)
  }
})
```

## Benefits
- Lookup table eliminates 6 if/else branches
- Early returns flatten the structure
- Tab cycling logic consolidated (was duplicated)
- Easy to add new function key mappings
