# Complexity Review: src/tui/components/views/ExecutionTimeline.tsx

## File Path
[src/tui/components/views/ExecutionTimeline.tsx#L101-L125](file:///Users/williamcory/smithers/src/tui/components/views/ExecutionTimeline.tsx#L101-L125)

## Current Code

```typescript
function getTypeIcon(type: 'phase' | 'agent' | 'tool'): string {
  switch (type) {
    case 'phase': return '>'
    case 'agent': return '@'
    case 'tool': return '#'
  }
}

function getTypeColor(type: 'phase' | 'agent' | 'tool'): string {
  switch (type) {
    case 'phase': return '#bb9af7'
    case 'agent': return '#7aa2f7'
    case 'tool': return '#7dcfff'
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'running': return '#9ece6a'
    case 'completed': return '#73daca'
    case 'failed': return '#f7768e'
    case 'pending': return '#e0af68'
    default: return '#565f89'
  }
}
```

## Suggested Simplification

Use **lookup maps** (const objects):

```typescript
const TYPE_ICONS: Record<'phase' | 'agent' | 'tool', string> = {
  phase: '>',
  agent: '@',
  tool: '#',
}

const TYPE_COLORS: Record<'phase' | 'agent' | 'tool', string> = {
  phase: '#bb9af7',
  agent: '#7aa2f7',
  tool: '#7dcfff',
}

const STATUS_COLORS: Record<string, string> = {
  running: '#9ece6a',
  completed: '#73daca',
  failed: '#f7768e',
  pending: '#e0af68',
}
const DEFAULT_STATUS_COLOR = '#565f89'

// Usage:
const icon = TYPE_ICONS[type]
const typeColor = TYPE_COLORS[type]
const statusColor = STATUS_COLORS[status] ?? DEFAULT_STATUS_COLOR
```

## Benefits
- Eliminates 3 switch statements
- Lookup is O(1) and more idiomatic
- Easier to extend and maintain
- Can be co-located or shared across components
- Type-safe with Record types
